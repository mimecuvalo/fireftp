function transfer() {
  this.prompt             = true;
  this.skipAll            = false;
  this.cancel             = false;
  this.busy               = false;
  this.didRefreshLaterSet = false;
  this.remoteRefresh      = '';
  this.localRefresh       = '';
}

transfer.prototype = {
  start : function(download, aFile, aLocalParent, aRemoteParent, aListData) {
    if (!gConnection.isConnected || this.cancel || remoteTree.isLoading
      || ( download && !aFile && remoteTree.selection.count == 0 && !aLocalParent)
      || (!download && !aFile && localTree.selection.count  == 0 && !aLocalParent)) {
      return;
    }

    if (this.busy) {                                         // we're doing locking, sort of, see below
      var self = this;
      var currentListData = aListData ? aListData : gConnection.listData.slice(0);
      var func = function() { self.start(download, aFile, aLocalParent, aRemoteParent, currentListData); };
      setTimeout(func, 500);
      return;
    }

    var localParent  = aLocalParent  ? aLocalParent  : gLocalPath.value;
    var remoteParent = aRemoteParent ? aRemoteParent : gRemotePath.value;
    var files        = new Array();
    var resume;
    var listData     = aListData ? aListData : gConnection.listData;

    if (gNoPromptMode) {                                     // overwrite dialog is disabled, do overwrites
      this.prompt = false;
    }

    if (aFile) {                                             // populate the files variable with what we're transfering
      files.push(aFile);
    } else if (download) {                                   // download specific
      if (aRemoteParent) {                                   // if recursive
        files = listData;
      } else {                                               // if not recursive
        for (var x = 0; x < remoteTree.rowCount; ++x) {
          if (remoteTree.selection.isSelected(x)) {
            files.push(remoteTree.data[x]);
          }
        }
      }
    } else {                                                 // upload specific
      if (aLocalParent) {                                    // if recursive
        try {
          var dir     = localFile.init(localParent);
          var innerEx = gFireFTPUtils.getFileList(dir, new wrapperClass(files));

          if (innerEx) {
            throw innerEx;
          }
        } catch (ex) {
          debug(ex);
          return;                                            // skip this directory
        }
      } else {                                               // if not recursive
        for (var x = 0; x < localTree.rowCount; ++x) {
          if (localTree.selection.isSelected(x)) {
            if (!localFile.verifyExists(localTree.data[x])) {
              continue;
            }

            files.push(localTree.data[x]);
          }
        }
      }
    }

    if (download && aLocalParent) {
      localDirTree.addDirtyList(aLocalParent);
    } else if (!download && aRemoteParent) {
      remoteDirTree.addDirtyList(aRemoteParent);
    }

    for (var x = 0; x < files.length; ++x) {
      var fileName = files[x].leafName;

      if ((download && gDownloadCaseMode == 1) || (!download && gUploadCaseMode == 1)) {
        fileName = fileName.toLowerCase();                   // special request to change filename case
      } else if ((download && gDownloadCaseMode == 2) || (!download && gUploadCaseMode == 2)) {
        fileName = fileName.toUpperCase();                   // special request to change filename case
      }

      if (this.getPlatform() == "windows") {                  // scrub out illegal characters on windows / \ : * ? | " < >
        fileName = fileName.replace(/[/\\:*?|"<>]/g, '_');
      }

      var remotePath = !download ? gConnection.constructPath(remoteParent, fileName) : files[x].path;
      var localPath  =  download ? localTree.constructPath(localParent,  fileName) : files[x].path;
      var file;

      if (download) {                                        // check to see if file exists
        file           = localFile.init(localPath);
      } else {
        file           = { exists: function() { return false; } };
        var remoteList = aRemoteParent ? listData : remoteTree.data;

        for (var y = 0; y < remoteList.length; ++y) {
          if (remoteList[y].leafName == fileName) {
            file       = { fileSize: remoteList[y].fileSize, lastModifiedTime: remoteList[y].lastModifiedTime, leafName: fileName, exists: function() { return true; },
                           isDir: remoteList[y].isDirectory(), isDirectory: function() { return this.isDir }};
            break;
          }
        }
      }

      if (this.skipAll && file.exists() && !file.isDirectory()) {
        var maybeResume = file.fileSize < files[x].fileSize && (gConnection.protocol != 'ftp' || gConnection.detectAscii(remotePath) != 'A');
        if (!this.prompt || !maybeResume) {
          continue;
        }
      }

      resume = false;

      if (file.exists() && this.prompt && !files[x].isDirectory()) {
        resume = file.fileSize < files[x].fileSize && (gConnection.protocol != 'ftp' || gConnection.detectAscii(remotePath) != 'A');  // ask nicely if file exists

        var params = { response         : 0,
                       fileName         : download ? localPath : remotePath,
                       resume           : true,
                       replaceResume    : !resume,
                       existingSize     : file.fileSize,
                       existingDate     : file.lastModifiedTime,
                       newSize          : files[x].fileSize,
                       newDate          : files[x].lastModifiedTime,
                       timerEnable      : !gDisableDestructMode };

        this.busy = true;                                    // ooo, the fun of doing semi-multi-threaded stuff in firefox
                                                             // we're doing some 'locking' above

        for (var y = 0; y < gMaxCon; ++y) {
          gConnections[y].waitToRefresh = true;
        }

        window.openDialog("chrome://fireftp/content/confirmFile.xul", "confirmFile", "chrome,modal,dialog,resizable,centerscreen", params);

        for (var y = 0; y < gMaxCon; ++y) {
          gConnections[y].waitToRefresh = false;
        }

        this.busy = false;

        if (params.response == 1) {
          resume       = false;
        } else if (params.response == 2) {
          this.prompt  = false;
          resume       = false;
        } else if ((params.response == 3) || (params.response == 0)) {
          continue;
        } else if (resume && params.response == 4) {
          resume       = true;
        } else if (!resume && params.response == 4) {
          this.cancel  = true;

          for (var y = 0; y < gMaxCon; ++y) {
            if (gConnections[y].isConnected) {
              gConnections[y].abort();
            }
          }
          break;
        } else if (params.response == 5) {
          this.skipAll = true;
          continue;
        }
      }

      if (!this.didRefreshLaterSet) {
        this.didRefreshLaterSet = true;

        if ((download && !aLocalParent) || this.localRefresh) {
          gConnection.localRefreshLater  = this.localRefresh  ? this.localRefresh  : localParent;
        }

        if ((!download && !aRemoteParent) || this.remoteRefresh) {
          gConnection.remoteRefreshLater = this.remoteRefresh ? this.remoteRefresh : remoteParent;
        }
      }

      if (download) {
        if (files[x].isDirectory()) {                        // if the directory doesn't exist we create it
          if (!file.exists()) {
            try {
              file.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0755);
            } catch (ex) {
              debug(ex);
              error(gStrbundle.getFormattedString("failedDir", [remotePath]));
              continue;
            }
          }

          this.downloadHelper(localPath, remotePath);
        } else {                                             // download the file
          var connection = this.getConnection();
          connection.download(remotePath, localPath, files[x].fileSize, resume, resume ? file.fileSize : -1, files[x].isSymlink(), null, files[x]);
        }
      } else {
        if (files[x].isDirectory()) {                        // if the directory doesn't exist we create it
          if (!file.exists()) {
            gConnection.makeDirectory(remotePath);
            gConnection.listData = new Array();                     // we know the new directory is empty
            this.start(false, '', localPath, remotePath);
          } else {
            this.uploadHelper(localPath, remotePath);
          }
        } else {
          var connection = this.getConnection();
          connection.upload(localPath, remotePath, resume, files[x].fileSize, resume ? file.fileSize : -1, null, false, null, files[x]);
        }
      }
    }
  },

  downloadHelper : function(localPath, remotePath) {
    var self = this;
    var func = function() {                                  // we use downloadHelper b/c if we leave it inline the closures will apply
      self.start(true,  '', localPath, remotePath);
    };
    gConnection.list(remotePath, func, true);
  },

  uploadHelper   : function(localPath, remotePath) {
    var self = this;
    var func = function() {                                  // we use uploadHelper   b/c if we leave it inline the closures will apply
      gConnection.removeCacheEntry(remotePath);
      self.start(false, '', localPath, remotePath);
    };
    gConnection.list(remotePath, func, true);
  },

  getConnection : function(func) {
    if (gConcurrent == 1) {                                                 // short circuit
      return gConnection;
    }

    for (var x = 0; x < gConcurrent && x < gMaxCon; ++x) {
      if (gConnections[x].isConnected && gConnections[x].isReady) {         // pick the first ready connection
        return gConnections[x];
      }

      if (x && !gConnections[x].isConnected && gConnections[x].type != 'bad' && !gConnections[x].isReady && !gConnections[x].eventQueue.length) {
        if (gConnection.protocol == 'ftp') {
          gConnections[x].featMLSD   = gConnection.featMLSD;                // copy over feats b/c we add to the queue even b/f connecting
          gConnections[x].featMDTM   = gConnection.featMDTM;
          gConnections[x].featXMD5   = gConnection.featXMD5;
          gConnections[x].featXSHA1  = gConnection.featXSHA1;
          gConnections[x].featXCheck = gConnection.featXCheck;
          gConnections[x].featModeZ  = gConnection.featModeZ;
          gConnections[x].featStat   = gConnection.featStat;
        }

        gConnections[x].connect();                                          // turn on a connection
        return gConnections[x];
      }
    }

    var minConnection = gConnection;
    var minSize       = Number.MAX_VALUE;

    for (var x = 0; x < gConcurrent && x < gMaxCon; ++x) {                  // if all connections are busy add to the queue with the least bytes to be transferred
      if (gConnections[x].type == 'bad') {
        continue;
      }

      var size = 0;

      for (var y = 0; y < gConnections[x].eventQueue.length; ++y) {
        if (gConnections[x].eventQueue[y].cmd == "transferEnd") {
          size += gConnections[x].eventQueue[y].options.size;
        }
      }

      if (gConnections[x].dataSocket) {
        size += gConnections[x].dataSocket.progressEventSink.bytesTotal;
        size += gConnections[x].dataSocket.dataListener.bytesTotal;
      }

      if (size < minSize) {
        minConnection = gConnections[x];
        minSize       = size;
      }
    }

    return minConnection;
  },

  getPlatform : function() {
    var platform = navigator.platform.toLowerCase();

    if (platform.indexOf('linux') != -1) {
      return 'linux';
    }

    if (platform.indexOf('mac') != -1) {
      return 'mac';
    }

    if (platform.indexOf('win') != -1) {
      return 'windows';
    }

    return 'other';
  }
};
