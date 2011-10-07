function fxp(account) {
  gFxp      = new ftpMozilla(new fxpObserver());
  gFxpFiles = new Array();

  for (var x = 0; x < gSiteManager.length; ++x) {
    if (gSiteManager[x].account == account) {
      var site            = gSiteManager[x];
      gFxp.type           = 'fxp';
      gFxp.host           = site.host;
      gFxp.port           = site.port;
      gFxp.security       = site.security;
      gFxp.login          = site.login;
      gFxp.password       = site.password;
      gFxp.setEncoding    (site.encoding || "UTF-8");
      gFxp.initialPath    = site.remotedir ? site.remotedir : '';
      gFxp.hiddenMode     = gPrefs.getBoolPref("hiddenmode");
      gFxp.proxyHost      = gPrefs.getComplexValue("proxyhost", Components.interfaces.nsISupportsString).data;
      gFxp.proxyPort      = gPrefs.getIntPref ("proxyport");
      gFxp.proxyType      = gPrefs.getCharPref("proxytype");
      gFxp.reconnectMode  = false;
      gFxp.keepAliveMode  = false;
      gFxp.sessionsMode   = gPrefs.getBoolPref("sessionsmode");

      gFxp.errorConnectStr = gStrbundle.getString("errorConn");
      gFxp.errorXCheckFail = gStrbundle.getString("errorXCheckFail");
      gFxp.passNotShown    = gStrbundle.getString("passNotShown");
      gFxp.l10nMonths      = gStrbundle.getString("months").split("|");

      gFxp.fxpHost        = gConnection;
      gFxp.ipType         = site.ipmode ? "IPv6" : "IPv4";
      gFxp.fileMode       = gPrefs.getIntPref ("filemode");
      gFxp.activePortMode = gPrefs.getBoolPref("activeportmode");
      gFxp.activeLow      = gPrefs.getIntPref ("activelow");
      gFxp.activeHigh     = gPrefs.getIntPref ("activehigh");
      gFxp.useCompression = gPrefs.getBoolPref("compressmode");

      var asciiList = gPrefs.getComplexValue("asciifiles", Components.interfaces.nsISupportsString).data;
      asciiList     = asciiList.split(",");
      for (var x = 0; x < asciiList.length; ++x) {
        gFxp.asciiFiles.push(asciiList[x]);
      }
      break;
    }
  }

  for (var x = 0; x < remoteTree.rowCount; ++x) {
    if (remoteTree.selection.isSelected(x)) {
      gFxpFiles.push(remoteTree.data[x]);
    }
  }

  fxpConnect();
}

function fxpConnect(showPassDialog) {
  gFxp.host = gFxp.host.replace(/^ftp:\/*/, '');                            // error checking - get rid of 'ftp://'

  if (gFxp.host && gFxp.host.charAt(gFxp.host.length - 1) == '/') {
    gFxp.host = gFxp.host.substring(0, gFxp.host.length - 1);
  }

  if (!gFxp.host) {                                                         // need to fill in the host
    doAlert(gStrbundle.getString("alertFillHost"));
    return;
  }

  if (!gFxp.port || !parseInt(gFxp.port)) {                                 // need a valid port
    doAlert(gStrbundle.getString("alertFillPort"));
    return;
  }

  if (!gFxp.login || !gFxp.password || showPassDialog) {                    // get a password if needed
    var passwordObject       = new Object();
    passwordObject.login     = gFxp.login;
    passwordObject.password  = gFxp.password;
    passwordObject.returnVal = false;

    window.openDialog("chrome://fireftp/content/password.xul", "password", "chrome,modal,dialog,resizable,centerscreen", passwordObject);

    if (passwordObject.returnVal) {
      gFxp.login    = passwordObject.login;
      gFxp.password = passwordObject.password;
    } else {
      return;
    }
  }

  $('remoteFXP').disabled = true;

  gFxp.connect();
}

function fxpTransfer() {
  this.prompt  = true;
  this.skipAll = false;
  this.cancel  = false;
  this.busy    = false;
}

fxpTransfer.prototype = {
  start : function(aFile, aHostParent, aDestParent, aHostListData, aDestListData) {
    if (!gFxp.isConnected || !gConnection.isConnected || this.cancel) {
      return;
    }

    if (this.busy) {                                                        // we're doing locking, sort of, see below
      var self = this;
      var currentHostListData = aHostListData ? aHostListData : gConnection.listData.slice(0);
      var currentDestListData = aDestListData ? aDestListData : gFxp.listData.slice(0);
      var func = function() { self.start(aFile, aHostParent, aDestParent, currentHostListData, currentDestListData); };
      setTimeout(func, 250);
      return;
    }

    var hostParent   = aHostParent ? aHostParent : aFile.parent;
    var destParent   = aDestParent ? aDestParent : gFxp.currentWorkingDir;
    var files        = new Array();
    var resume;
    var hostListData = aHostListData ? aHostListData : gConnection.listData;
    var destListData = aDestListData ? aDestListData : gFxp.listData;

    if (gNoPromptMode) {                                                    // overwrite dialog is disabled, do overwrites
      this.prompt = false;
    }

    if (aFile) {                                                            // populate the files variable with what we're transfering
      files.push(aFile);
    } else {
      files = hostListData;                                                 // if recursive
    }

    for (var x = 0; x < files.length; ++x) {
      var fileName = files[x].leafName;
      var hostPath = files[x].path;
      var destPath = gFxp.constructPath(destParent, fileName);
      var file     = { exists: function() { return false; } };              // check to see if file exists

      for (var y = 0; y < destListData.length; ++y) {
        if (destListData[y].leafName == fileName) {
          file = { fileSize: destListData[y].fileSize, lastModifiedTime: destListData[y].lastModifiedTime, leafName: fileName, exists: function() { return true; },
                   isDir: destListData[y].isDirectory(), isDirectory: function() { return this.isDir } };
          break;
        }
      }

      if (this.skipAll && file.exists() && !file.isDirectory()) {
        var maybeResume = file.fileSize < files[x].fileSize && gFxp.detectAscii(remotePath) != 'A';
        if (!this.prompt || !maybeResume) {
          continue;
        }
      }

      resume = false;

      if (file.exists() && this.prompt && !files[x].isDirectory()) {
        resume = file.fileSize < files[x].fileSize && gFxp.detectAscii(hostPath) != 'A';  // ask nicely if file exists

        var params = { response         : 0,
                       fileName         : destPath,
                       resume           : true,
                       replaceResume    : !resume,
                       existingSize     : file.fileSize,
                       existingDate     : file.lastModifiedTime,
                       newSize          : files[x].fileSize,
                       newDate          : files[x].lastModifiedTime,
                       timerEnable      : !gDisableDestructMode };

        this.busy = true;                                                   // ooo, the fun of doing semi-multi-threaded stuff in firefox
                                                                            // we're doing some 'locking' above

        window.openDialog("chrome://fireftp/content/confirmFile.xul", "confirmFile", "chrome,modal,dialog,resizable,centerscreen", params);

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
          gFxp.abort();
          gConnection.abort();
          break;
        } else if (params.response == 5) {
          this.skipAll = true;
          continue;
        }
      }

      if (files[x].isDirectory()) {                                         // if the directory doesn't exist we create it
        if (!file.exists()) {
          gFxp.makeDirectory(destPath);
          var currentDestListData = new Array();
          gFxp.listData = currentDestListData;                              // we know the new directory is empty
          this.fxpHelper2(hostPath, destPath, currentDestListData);
        } else {
          this.fxpHelper(hostPath, destPath);
        }
      } else {
        gFxp.fxp(hostPath, destPath, resume, resume ? file.fileSize : -1, files[x].fileSize, files[x]);
      }
    }

    var self = this;
    var func = function() { self.doneCheck(); };
    setTimeout(func, 500);
  },

  fxpHelper : function(hostPath, destPath) {
    var self = this;
    var func = function() {                                                 // we use fxpHelper b/c if we leave it inline the closures will apply
      var currentDestListData = gFxp.listData.slice(0);
      gFxp.removeCacheEntry(destPath);
      self.fxpHelper2(hostPath, destPath, currentDestListData);
    };
    gFxp.list(destPath, func, true, false, true);
  },

  fxpHelper2 : function(hostPath, destPath, destListData) {
    var self = this;
    var func = function() {                                                 // we use fxpHelper b/c if we leave it inline the closures will apply
      var currentHostListData = gConnection.listData.slice(0);
      self.start('', hostPath, destPath, currentHostListData, destListData);
    };
    gConnection.list(hostPath, func, true, false, true);
  },

  doneCheck : function() {
    if (!gFxp.isConnected || !gFxp.fxpHost || this.busy) {
      return;
    }

    if ((!gFxp.eventQueue.length && !gFxp.fxpHost.eventQueue.length)
     || (!gFxp.eventQueue.length && !gFxp.fxpHost.eventQueue[0].options.isFxp && !gFxp.fxpHost.eventQueue[0].options.isFxpListing)) {
      gFxp.disconnect();
    }
  }
};
