function loadPrograms() {
  try {
    var file = gProfileDir.clone();
    file.append("fireFTPprograms.dat");

    if (file.exists()) {
      var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
      var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].createInstance(Components.interfaces.nsIConverterInputStream);
      fstream.init(file, 1, 0, false);
      cstream.init(fstream, "UTF-8", 0, 0);

      var programData = "";
      {
        let str = {};
        let read = 0;
        do {
          read = cstream.readString(0xffffffff, str); // read as much as we can and put it in str.value
          programData += str.value;
        } while (read != 0);
      }
      cstream.close();

      gPrograms = jsonParseWithToSourceConversion(programData);
      cleanupPrograms();

    } else {
      gPrograms = new Array({ extension: "*.*", programs: new Array() });
      savePrograms();
    }
  } catch (ex) {
    debug(ex);
  }
}

function savePrograms() {
  try {
    cleanupPrograms();
    var file = gProfileDir.clone();
    file.append("fireFTPprograms.dat");
    var foutstream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
    foutstream.init(file, 0x04 | 0x08 | 0x20, 0644, 0);
    var data = JSON.stringify(gPrograms);
    var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(foutstream, "UTF-8", 0, 0);
    converter.writeString(data);
    converter.close();
  } catch (ex) {
    debug(ex);
  }
}

function cleanupPrograms() {  // fix for bug with nulls in the program list
  for (var x = gPrograms.length - 1; x >= 0; --x) {
    if (!gPrograms[x]) {
      gPrograms.splice(x, 1);
      continue;
    }
    for (var y = gPrograms[x].programs.length - 1; y >= 0; --y) {
      if (!gPrograms[x].programs[y]) {
        gPrograms[x].programs.splice(y, 1);
      }
    }
  }
}

function chooseProgram(remote) {
  var result       = { value: false };
  var extension    = remote ? remoteTree.getExtension(remoteTree.data[remoteTree.selection.currentIndex].leafName) : localTree.getExtension(localTree.data[localTree.selection.currentIndex].leafName);
  var tempPrograms = { value: new Array(), extension: extension };

  for (var x = 0; x < gPrograms.length; ++x) {
    tempPrograms.value.push(gPrograms[x]);
  }

  window.openDialog("chrome://fireftp/content/programs.xul", "programs", "chrome,modal,dialog,resizable,centerscreen", tempPrograms, result);

  if (result.value) {
    gPrograms = tempPrograms.value;
    savePrograms();
  }
}

function launchProgram(extensionIndex, programIndex, file, remoteFile) {
  try {
    if (file) {                                                                                   // do remote edit
      var path     = gRemotePath.value;
      var origFile = { lastModifiedTime: file.lastModifiedTime };
      var tmpDir   = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsILocalFile);
      var intervalId;
      var uploadId;
      var uploadCallback;

      var func = function () {
        if (!file.exists()) {
          //clearInterval(intervalId);
          return;
        }

        if (file.lastModifiedTime != origFile.lastModifiedTime) {
          origFile.lastModifiedTime = file.lastModifiedTime;
          gConnection.remoteRefreshLater = path;

          if (uploadId) {                                                                         // if we have an upload currently in progress/in queue cancel it
            queueTree.cancel([{ id: uploadId }]);
            if (uploadCallback) {
              uploadCallback();
            }
            uploadId       = null;
            uploadCallback = null;
          }

          var count   = 1;                                                                        // XXX createUnique doesn't seem to work for some reason, have to do what it does manually
          var tmpFile = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsILocalFile);
          tmpFile.append('temp-' + count + '-' + file.leafName);
          while (tmpFile.exists()) {
            ++count;
            tmpFile.leafName = 'temp-' + count + '-' + file.leafName;
          }

          var innerEx  = gFireFTPUtils.cutCopy(false, file, tmpFile, tmpDir, tmpFile.leafName);   // we copy the file over to avoid issues with locking

          if (innerEx) {
            //clearInterval(intervalId);
            return;
            //throw innerEx;
          }

          uploadCallback = function() {                                                           // get rid of tmp file when we're done
            try {
              uploadCallback = null;
              tmpFile.remove(true);
            } catch (ex) { }
          };

          uploadId = gConnection.upload(tmpFile.path, remoteFile.path, false, file.fileSize, 0, uploadCallback, true, null, tmpFile);
        }
      };

      intervalId = setInterval(func, 1000);
      gTempEditFiles.push({ file: file, id: intervalId });
    }

    for (var x = 0; file || x < localTree.rowCount; ++x) {
      if (file || localTree.selection.isSelected(x)) {
        if (!file && !localFile.verifyExists(localTree.data[x])) {
          continue;
        }

        if (remoteFile && gPlatform == 'mac') {
          localFile.overrideOSXQuarantine(file.path);
        }

        if (extensionIndex == null) {
          localFile.launch(file);
        } else {
          var program = localFile.init(gPrograms[extensionIndex].programs[programIndex].executable);
          var arguments = new Array();

          if (!gPrograms[extensionIndex].programs[programIndex].arguments) {
            arguments.push(file ? file.path : localTree.data[x].path);
          } else {
            var argumentString = gPrograms[extensionIndex].programs[programIndex].arguments;

            var quote = false;
            for (var y = 0; y < argumentString.length; ++y) {
              if (argumentString.charAt(y) == '"' || argumentString.charAt(y) == "'") {
                quote = !quote;
              } else if (argumentString.charAt(y) == ' ' && !quote) {
                argumentString = setCharAt(argumentString, y, "%%%space%%%");
              }
            }

            while (argumentString.indexOf("%file%") != -1) {
              argumentString = argumentString.substring(0, argumentString.indexOf("%file%"))
                             + (file ? file.path : localTree.data[x].path)
                             + argumentString.substring(argumentString.indexOf("%file%") + 6, argumentString.length);
            }

            argumentString = argumentString.replace(/\\"/g, "%%%quotes%%%");
            argumentString = argumentString.replace(/"/g, "");
            argumentString = argumentString.replace(/%%%quotes%%%/g, '"');
            arguments      = argumentString.split("%%%space%%%").filter(removeBlanks);
          }

          var process = Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess);
          process.init(program);
          process.run(false, arguments, arguments.length, {});
        }

        if (file) {
          break;
        }
      }
    }

  } catch (ex) {
    debug(ex);
  }
}

function remoteLaunchProgram(extensionIndex, programIndex, fileIndex) {
  if (!gConnection.isConnected || !isReady()) {
    return;
  }

  try {
    var count = 0;

    for (var x = 0; x < remoteTree.rowCount; ++x) {
      if (remoteTree.selection.isSelected(x)) {
        ++count;

        let tmpFile = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsILocalFile);
        tmpFile.append(count + '-' + remoteTree.data[x].leafName);
        while (tmpFile.exists()) {
          ++count;
          tmpFile.leafName = count + '-' + remoteTree.data[x].leafName;
        }

        count = 0;

        let remoteFile = remoteTree.data[x];

        var func = function() {
          var subFunc = function() { launchProgram(extensionIndex, programIndex, tmpFile, remoteFile); };
          setTimeout(subFunc, 0);                                                                     // let the queue finish up
        };

        gConnection.download(remoteFile.path, tmpFile.path, remoteFile.fileSize, false, 0, false, func, remoteFile);
      }
    }
  } catch (ex) {
    debug(ex);
  }
}
