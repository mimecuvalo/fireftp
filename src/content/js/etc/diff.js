function diff(recursive, localParent, remoteParent, last) {
  if (!gConnection.isConnected || (!localParent && !isReady())) {
    return;
  }

  if (!localParent) {
    gMissingRemoteFiles = new Array();
    gMissingLocalFiles  = new Array();
    gDifferentFiles     = new Array();
    gNewerFiles         = new Array();
    gOlderFiles         = new Array();
  }

  var localFiles      = new Array();
  var remoteFiles     = new Array();

  if (localParent) {
    try {
      var dir     = localFile.init(localParent);
      var innerEx = gFireFTPUtils.getFileList(dir, new wrapperClass(localFiles));

      if (innerEx) {
        throw innerEx;
      }
    } catch (ex) {
      debug(ex);
      return;                                            // skip this directory
    }

    for (var x = 0; x < gConnection.listData.length; ++x) {
      remoteFiles.push(gConnection.listData[x]);
    }
  } else {
    for (var x = 0; x < localTree.data.length; ++x) {
      if (!localFile.verifyExists(localTree.data[x])) {
        continue;
      }

      localFiles.push(localTree.data[x]);
    }
    for (var x = 0; x < remoteTree.data.length; ++x) {
      remoteFiles.push(remoteTree.data[x]);
    }
  }

  if (recursive) {
    localFiles.sort(compareName).reverse();
  }

  if (recursive && !localParent) {
    gConnection.beginCmdBatch();
  }

  var anyRecursion = false;
  var firstFolder  = true;

  for (var x = 0; x < localFiles.length; ++x) {
    var found = false;

    for (var y = 0; y < remoteFiles.length; ++y) {
      if (localFiles[x].leafName == remoteFiles[y].leafName) {
        found = true;
        var aLocalFile = localFiles[x];
        var remoteFile = remoteFiles[y];
        remoteFiles.splice(y, 1);

        if (aLocalFile.fileSize != remoteFile.fileSize && !aLocalFile.isDirectory() && !remoteFile.isDirectory()) {
          gDifferentFiles.push({ localFile: aLocalFile, remoteFile: remoteFile, action: "nothing",
                                 reason: aLocalFile.fileSize > remoteFile.fileSize
                                       ? gStrbundle.getString("diffBigger") : gStrbundle.getString("diffSmaller"),
                                 localParent: localParent, remoteParent: remoteParent,
                                 sortPath: aLocalFile.path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });
          break;
        }

        if (aLocalFile.isDirectory() != remoteFile.isDirectory()) {
          gDifferentFiles.push({ localFile: aLocalFile, remoteFile: remoteFile, reason: gStrbundle.getString("diffTypeMismatch"), action: "nothing",
                                 localParent: localParent, remoteParent: remoteParent,
                                 sortPath: aLocalFile.path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });
          break;
        }

        var remoteModifiedTime = remoteFile.lastModifiedTime;
        remoteModifiedTime -= gConnection.timezone * 60 * 1000;

        var timeDifference = 0;
        var remoteDate = new Date(remoteModifiedTime);
        var localDate = new Date(aLocalFile.lastModifiedTime);
        if (new Date() - remoteModifiedTime > 15600000000) {    // roughly, matches what's in baseProtocol.js
          remoteDate.setHours(0);
          localDate.setHours(0);
          remoteDate.setMinutes(0);
          localDate.setMinutes(0);
        }
        remoteDate.setSeconds(0);
        localDate.setSeconds(0);
        remoteDate.setMilliseconds(0);
        localDate.setMilliseconds(0);
        timeDifference = localDate - remoteDate;

        if (gConnection.timestampsMode && timeDifference > 0 && !aLocalFile.isDirectory() && !remoteFile.isDirectory()) {
          gNewerFiles.push({ localFile: aLocalFile, remoteFile: remoteFile, action: "upload",
                                 localParent: localParent, remoteParent: remoteParent,
                                 sortPath: aLocalFile.path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });
          break;
        }

        if (gConnection.timestampsMode && timeDifference < 0 && !aLocalFile.isDirectory() && !remoteFile.isDirectory()) {
          gOlderFiles.push({ localFile: aLocalFile, remoteFile: remoteFile, action: "download",
                                 localParent: localParent, remoteParent: remoteParent,
                                 sortPath: aLocalFile.path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });
          break;
        }

        if (recursive && aLocalFile.isDirectory() && remoteFile.isDirectory()) {
          makeDiffCallback(aLocalFile, remoteFile, (firstFolder && !localParent) || last);
          last         = false;
          anyRecursion = true;
          firstFolder  = false;
          break;
        }

        break;
      }
    }

    if (!found) {
      gMissingRemoteFiles.push({ file: localFiles[x], action: "upload", localParent: localParent, remoteParent: remoteParent,
                                 sortPath: localFiles[x].path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });
    }
  }

  if (recursive && !localParent) {
    gConnection.endCmdBatch();
  }

  for (var x = 0; x < remoteFiles.length; ++x) {
    gMissingLocalFiles.push({ file: remoteFiles[x], action: "download", localParent: localParent, remoteParent: remoteParent,
                              sortPath: remoteFiles[x].path.replace(/\x2f/g, "\x01").toLowerCase() });
  }

  if (!recursive || last || (!anyRecursion && !localParent)) {
    finalDiffCallback(recursive);
  }
}

function makeDiffCallback(aLocalFile, remoteFile, last) {
  var func = function() {
    diff(true, aLocalFile.path, remoteFile.path, last);
  };

  gConnection.list(remoteFile.path, func, true, true);
}

function finalDiffCallback(recursive) {
  if (gMissingLocalFiles.length == 0 && gMissingRemoteFiles.length == 0 && gDifferentFiles.length == 0
   && gNewerFiles.length == 0 && gOlderFiles.length == 0) {
    doAlert(gStrbundle.getString("diffSame"));
    return;
  }

  if (recursive) {
    gMissingLocalFiles.sort(directorySort);
    gMissingRemoteFiles.sort(directorySort);
    gDifferentFiles.sort(directorySort);
    gNewerFiles.sort(directorySort);
    gOlderFiles.sort(directorySort);
  }

  var result = { value : false };
  var dialogCallback = function() {
    if (result.value) {
      gConnection.beginCmdBatch();

      var transferObj           = new transfer();
      transferObj.prompt        = false;
      transferObj.localRefresh  = gLocalPath.value;
      transferObj.remoteRefresh = gRemotePath.value;

      for (var x = 0; x < gMissingLocalFiles.length;  ++x) {
        if (gMissingLocalFiles[x].action  == "delete") {
          remoteDirTree.addDirtyList(gMissingLocalFiles[x].file.parent.path);
          gConnection.remove(gMissingLocalFiles[x].file.isDirectory(),
                      gMissingLocalFiles[x].file.path,
                      "");
          gConnection.remoteRefreshLater = gRemotePath.value;
        } else if (gMissingLocalFiles[x].action  != "nothing") {
          transferObj.start(gMissingLocalFiles[x].action  == "download", gMissingLocalFiles[x].file,
                            gMissingLocalFiles[x].localParent, gMissingLocalFiles[x].remoteParent);
        }

        if (transferObj.cancel) {
          return;
        }
      }

      for (var x = 0; x < gMissingRemoteFiles.length; ++x) {
        if (gMissingRemoteFiles[x].action  == "delete") {
          localDirTree.addDirtyList(gMissingRemoteFiles[x].file.parent.path);
          localFile.remove(gMissingRemoteFiles[x].file, false, 1);
          gConnection.localRefreshLater = gLocalPath.value;
        } else if (gMissingRemoteFiles[x].action != "nothing") {
          transferObj.start(gMissingRemoteFiles[x].action == "download", gMissingRemoteFiles[x].file,
                            gMissingRemoteFiles[x].localParent, gMissingRemoteFiles[x].remoteParent);
        }

        if (transferObj.cancel) {
          return;
        }
      }

      for (var x = 0; x < gDifferentFiles.length; ++x) {
        if (gDifferentFiles[x].action != "nothing") {
          transferObj.start(gDifferentFiles[x].action == "download",
                            gDifferentFiles[x].action == "download" ? gDifferentFiles[x].remoteFile : gDifferentFiles[x].localFile,
                            gDifferentFiles[x].localParent, gDifferentFiles[x].remoteParent);
        }

        if (transferObj.cancel) {
          return;
        }
      }

      for (var x = 0; x < gNewerFiles.length; ++x) {
        if (gNewerFiles[x].action != "nothing") {
          transferObj.start(gNewerFiles[x].action == "download",
                            gNewerFiles[x].action == "download" ? gNewerFiles[x].remoteFile : gNewerFiles[x].localFile,
                            gNewerFiles[x].localParent, gNewerFiles[x].remoteParent);
        }

        if (transferObj.cancel) {
          return;
        }
      }

      for (var x = 0; x < gOlderFiles.length; ++x) {
        if (gOlderFiles[x].action != "nothing") {
          transferObj.start(gOlderFiles[x].action == "download",
                            gOlderFiles[x].action == "download" ? gOlderFiles[x].remoteFile : gOlderFiles[x].localFile,
                            gOlderFiles[x].localParent, gOlderFiles[x].remoteParent);
        }

        if (transferObj.cancel) {
          return;
        }
      }

      gConnection.endCmdBatch();
    }
  };

  window.openDialog("chrome://fireftp/content/diff.xul", "diff", "chrome,dialog,resizable,centerscreen",
                    gMissingLocalFiles, gMissingRemoteFiles, gDifferentFiles, gNewerFiles, gOlderFiles, result, recursive, dialogCallback);
}
