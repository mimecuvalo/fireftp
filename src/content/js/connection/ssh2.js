function ssh2Mozilla(observer) {
  inherit(this, new baseProtocol());
  this.observer = observer;
  this.observer.version = this.version;

  this.transferProgress = {
    id : '',
    timeStart : 0,
    bytesPartial : 0,
    bytesTransferred : 0,
    bytesTotal : 0
  };

  setTimeout(this.keepAlive.bind(this), 60000);
}

ssh2Mozilla.prototype = {
  // override base class variables
  protocol      : 'ssh2',

  transport     : null,
  client        : null,
  refreshRate   : 10,
  sftp_client   : null,
  privatekey    : "",                                                            // private key for sftp connections
  customSession : null,
  customBuffer  : "",

  connect : function(reconnect) {
    this.setupConnect(reconnect);

    try {                                                                        // create a control socket
      var proxyInfo = null;
      var self      = this;

      if (this.proxyType != "") {                                                // use a proxy
        proxyInfo = this.proxyService.newProxyInfo(this.proxyType, this.proxyHost, this.proxyPort,
                      Components.interfaces.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST, 30, null);
      }

      this.controlTransport = this.transportService.createTransport(null, 0, this.host, parseInt(this.port), proxyInfo);

      this.controlOutstream = this.controlTransport.openOutputStream(0, 0, 0);
      var controlStream     = this.controlTransport.openInputStream(0, 0, 0);
      this.controlInstream  = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
      this.controlInstream.setInputStream(controlStream);

      var dataListener = {                                                       // async data listener for the control socket
        onStartRequest  : function(request, context) { },

        onStopRequest   : function(request, context, status) {
          self.legitClose = self.client.legitClose;
          self.onDisconnect();
        },

        onDataAvailable : function(request, context, inputStream, offset, count) {
          try {
            self.transport.fullBuffer += self.controlInstream.readBytes(count);  // read data

            if (!self.gotWelcomeMessage && self.transport.fullBuffer.indexOf('\n') == self.transport.fullBuffer.length - 1) {
              self.onConnected();
            }

            self.transport.run();
          } catch(ex) {
            self.observer.onDebug(ex);

            if (ex instanceof paramikojs.ssh_exception.AuthenticationException) {
              self.client.legitClose = true;
              self.loginDenied(ex.message);
              return;
            }

            self.onDisconnect();
          }
        }
      };

      var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].createInstance(Components.interfaces.nsIInputStreamPump);
      pump.init(controlStream, -1, -1, 0, 0, false);
      pump.asyncRead(dataListener, null);

      var sftp_success = function(sftp_client) {
        self.sftp_client = sftp_client;
        self.eventQueue.shift();                                                 // remove welcome item from queue

        if (self.loginAccepted()) {
          var current_directory_callback = function(results) {
            self.currentWorkingDir = results;

            self.observer.onChangeDir(results != '/' && self.initialPath == '' ? results : '', false, results != '/' || self.initialPath != '');

            self.trashQueue = new Array();

            self.nextCommand();                                                  // load up the working directory
          };
          self.sftp_client.normalize('.', current_directory_callback);           // get current working directory
        }
      };

      this.client = new paramikojs.SSHClient();
      this.client.set_missing_host_key_policy(new paramikojs.AskPolicy());
      var file = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                                     .get("ProfD", Components.interfaces.nsILocalFile);
      file.append("known_hosts");
      var host_keys = !localFile.init('~/.ssh/known_hosts') && sys.platform == 'win32' ? file.path : '~/.ssh/known_hosts';
      if (sys.platform != 'win32' && !localFile.init('~/.ssh').exists()) {
        var dir  = localFile.init('~/.ssh');

        try {
          dir.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0700);
          localFile.overrideOSXQuarantine(dir.path);
        } catch(ex) {
          debug(ex);
          error(gStrbundle.getString("dirFail"));
        }
      }
      this.client.load_host_keys(host_keys);

      var auth_success = function() {
        self.client.open_sftp(sftp_success);
      };

      var write = function(out) {
        try {
          self.controlOutstream.write(out, out.length);
        } catch(ex) {
          self.observer.onDebug(ex);
          self.observer.onError(self.errorConnectStr);
        }
      };

      this.transport = this.client.connect(this.observer, write, auth_success,
                                      this.host, parseInt(this.port), this.login, this.password, null, this.privatekey);

    } catch(ex) {
      this.observer.onDebug(ex);
      this.onDisconnect();
    }
  },

  cleanup : function(isAbort) {
    this._cleanup();

    if (this.customSession) {
      try {
        this.customSession.close();
      } catch(ex) {
        this.observer.onDebug("Error closing custom session: " + ex);
      }
      this.customSession = null;
      this.customBuffer = "";
    }
  },

  sendQuitCommand : function(legitClose) {                                       // called when shutting down the connection
    this.client.close(legitClose);
    this.kill();
  },

  sendAbortCommand : function() {                                                // called when aborting
    if (!this.sftp_client) {
      return;
    }

    this.sftp_client.close();
    this.sftp_client = null;

    var self = this;
    var sftp_success = function(sftp_client) {
      self.sftp_client = sftp_client;
      self.currentWorkingDir = "";
      self.nextCommand();
    };
    this.client.open_sftp(sftp_success);
  },

  keepAlive              : function() {
    if (this.isConnected && this.keepAliveMode && this.eventQueue.length == 0) {
      var self = this;
      var exec = function() {
        self.sftp_client.normalize('.', self.readControl.bind(self));
      };
      this.addEventQueue("noop", null, null, null, exec);
      this.writeControl();
    }

    setTimeout(this.keepAlive.bind(this), 60000);
  },

  isWriteUnnecessary     : function(cmd, parameter) {
    return (cmd == "cd" && this.currentWorkingDir == parameter);
  },

  processWriteCommand    : function(cmd, parameter) {
    if (cmd == "ls") {
      parameter = "";
    }

    if (cmd == "put" || cmd == "reput") {
      this.toggleClamping(false);
    }

    return { 'cmd': cmd, 'parameter': parameter };
  },

  isValidTimeoutCommand  : function(cmd) {
    return ["get", "reget", "put", "reput"].indexOf(cmd) == -1;
  },

  getCommandInfo         : function(cmd) {
    var isTransferCmd = ["get", "reget", "put", "reput"].indexOf(cmd) != -1;
    return { 'isTransferCmd': isTransferCmd, 'isDownload': cmd == "get" || cmd == "reget", 'skipLog': false, 'isPrivate': false };
  },

  // XXX, clamping in latest firefox ( https://bugzilla.mozilla.org/show_bug.cgi?id=633421 )
  // greatly reduces uploads, see the code in _read_response in sftp_client.js
  //
  // not going to enable this disabling code right now as it really only affects very high speed connections (i.e. local network)
  toggleClamping : function(enable) {
    //var domPrefs = gPrefsService.getBranch("dom.");
    //domPrefs.setIntPref("min_background_timeout_value", enable ? 1000 : 4);
  },

  readControl : function(buffer) {
    var cmd;  var parameter;    var callback;   var options;   var exec;

    if (this.eventQueue.length) {
      cmd        = this.eventQueue[0].cmd;
      parameter  = this.eventQueue[0].parameter;
      callback   = this.eventQueue[0].callback;
      options    = this.eventQueue[0].options;
      exec       = this.eventQueue[0].exec;

      if (cmd != "ls" && cmd != "get" && cmd != "reget" && cmd != "put" && cmd != "reput") {   // used if we have a loss in connection
        var throwAway = this.eventQueue.shift();

        if (throwAway.cmd != "welcome" && throwAway.cmd != "goodbye" && throwAway.cmd != "aborted" && throwAway.cmd != "noop") {
          this.trashQueue.push(throwAway);
        }
      }
    } else {
      cmd = "default";                                                           // an unexpected reply - perhaps a 421 timeout message
    }

    var success = !(buffer instanceof paramikojs.ssh_exception.IOError)
               && !(buffer instanceof paramikojs.ssh_exception.SFTPError)
               && buffer;

    switch (cmd) {
      case "ls":
        ++this.transferID;

        this.eventQueue.shift();
        this.trashQueue = new Array();                                           // clear the trash array, completed an 'atomic' set of operations

        var results = "";
        for (var x = 0; x < buffer.length; ++x) {
          results += buffer[x].longname + "\n";
        }

        this.listData = this.parseListData(results, parameter, true);

        if (callback) {
          callback();                                                            // send off list data to whoever wanted it
        }

        break;

      case "get":
      case "reget":
      case "put":
      case "reput":
        ++this.transferID;
        this.transferProgress.bytesTotal = 0;
        this.transferProgress.id = '';
        this.toggleClamping(true);

        if (!success) {
          var errorReason = (buffer instanceof paramikojs.ssh_exception.IOError ||
                             buffer instanceof paramikojs.ssh_exception.SFTPError) ? buffer.message : "";
          this.observer.onError(errorReason + ": " + this.constructPath(this.currentWorkingDir, parameter));

          if (options.errorCallback) {
            options.errorCallback();
          }

          this.eventQueue.shift();
          while (this.eventQueue.length && (this.eventQueue[0].cmd == "utime" || this.eventQueue[0].cmd == "transferEnd")) {
            if (this.eventQueue[0].cmd == "transferEnd") {
              this.observer.onRemoveQueue(this.eventQueue[0].options.id);
              this.observer.onTransferFail(this.eventQueue[0].options, errorReason);
            }

            this.eventQueue.shift();
          }

          this.trashQueue = new Array();

          break;
        }

        if (this.timestampsMode && (cmd == "get" || cmd == "reget")) {
          try {
            var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
            file.initWithPath(options.localPath);
            file.lastModifiedTime = options.remoteTime;
          } catch (ex) {
            this.observer.onDebug(ex);
          }
        }

        this.eventQueue.shift();
        if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
          this.observer.onRemoveQueue(this.eventQueue[0].options.id);
          this.eventQueue.shift();
        }
        this.trashQueue = new Array();                                       // clear the trash array, completed an 'atomic' set of operations

        if (options.remoteEditCallback) {                                    // for transfers
          options.remoteEditCallback();
        }

        break;

      case "mkdir":
      case "rm":
      case "rmdir":
        if (buffer instanceof paramikojs.ssh_exception.IOError || buffer instanceof paramikojs.ssh_exception.SFTPError) {
          // for making a directory, we only show the error when user explicitly creates a directory
          // otherwise, we (probably) already created this directory programatically on a transfer connection
          if (!(cmd == "mkdir" && this.eventQueue.length)) {
            this.observer.onError(buffer.message + ": " + this.constructPath(this.currentWorkingDir, parameter));
          } else {
            this.observer.onDebug(buffer.message);
          }

          if (options.errorCallback) {
            options.errorCallback();
          }
        } else {
          if (cmd == "rmdir") {                                                  // clear out of cache if it's a remove directory
            this.removeCacheEntry(this.constructPath(this.currentWorkingDir, parameter));
          }

          if (callback) {
            callback();
          }
        }

        if (cmd == "rm" || cmd == "rmdir") {
          this.observer.onRemoveQueue(options.id);
        }

        this.trashQueue = new Array();
        break;

      case "mv":
        if (buffer instanceof paramikojs.ssh_exception.IOError || buffer instanceof paramikojs.ssh_exception.SFTPError) {
          this.observer.onError(buffer.message + ": " + parameter);

          if (options.errorCallback) {
            options.errorCallback();
          }
        } else {
          if (callback) {
            callback();
          }
        }

        this.trashQueue = new Array();
        break;

      case "chmod":
        if (callback) {
          callback();
        }

        this.trashQueue = new Array();
        break;

      case "ln":
        if (buffer instanceof paramikojs.ssh_exception.IOError || buffer instanceof paramikojs.ssh_exception.SFTPError) {
          this.observer.onError(buffer.message + ": " + parameter);
        } else {
          if (callback) {
            callback();
          }
        }

        break;
      case "utime":
        if (buffer instanceof paramikojs.ssh_exception.IOError || buffer instanceof paramikojs.ssh_exception.SFTPError) {
          this.observer.onDebug(buffer.message + ": " + parameter);
        }

        if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
          this.observer.onRemoveQueue(this.eventQueue[0].options.id);
          this.eventQueue.shift();
          this.trashQueue = new Array();                                         // clear the trash array, completed an 'atomic' set of operations
        }
        break;

      case "cd":
        var message = (buffer instanceof paramikojs.ssh_exception.IOError
                    || buffer instanceof paramikojs.ssh_exception.SFTPError) ? buffer.message : "";
        this.handleCWDResponse(success, cmd, parameter, callback, options, exec, message);
        break;

      case "stat":
        if (buffer instanceof paramikojs.ssh_exception.IOError || buffer instanceof paramikojs.ssh_exception.SFTPError) {
          this.observer.onError(buffer.message + ": " + parameter);
        } else {
          for (var x = 0; x < this.eventQueue.length; ++x) {
            if (options.commandToLookFor == this.eventQueue[x].cmd) {
              if (options.commandToLookFor == "reput") {
                this.eventQueue[x].options.remoteSize = buffer.st_size.intValue();  // 64-bit number
              }

              break;
            }
          }
        }

        break;

      case "aborted":
      case "custom":
        break;

      case "noop":
      case "goodbye":                                                            // you say yes, i say no, you stay stop...
      default:
        break;
    }

    if (success) {
      this.observer.onAppendLog("ok", 'input', "info");  // todo
    }

    if (this.sftp_client) {
      this.nextCommand();
    }
  },

  doExec : function(exec, options) {
    if (this.sftp_client && this.sftp_client.sock.closed) {                      // check if we've been disconnected
      this.resetConnection();
      return false;
    }

    try {
      exec(options);
    } catch(ex if ex instanceof paramikojs.ssh_exception.SSHException) {
      this.onDisconnect();
      return false;
    } catch(ex if ex instanceof paramikojs.ssh_exception.EOFError) {
      this.onDisconnect();
      return false;
    }

    return true;
  },

  changeWorkingDirectory : function(path, callback) {
    var self = this;
    var cd_exec = function() {
      self.sftp_client.chdir(path, self.readControl.bind(self));
    };
    this.addEventQueue("cd", path, callback, null, cd_exec);
    this.writeControlWrapper();
  },

  makeSymlink          : function(source, dest, callback, errorCallback) {
    var dest_path = dest.substring(dest.lastIndexOf('/') + 1);
    var cd_path = dest.substring(0, dest.lastIndexOf('/') ? dest.lastIndexOf('/') : 1);

    var self = this;
    var symlink_exec = function() {
      self.sftp_client.symlink(source, dest_path, self.readControl.bind(self));
    };
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    this.addEventQueue("cd", cd_path, null, { 'dontUpdateView': true }, cd_exec);
    this.addEventQueue("ln", dest_path, callback, { errorCallback: errorCallback }, symlink_exec);

    this.writeControlWrapper();
  },

  makeDirectory          : function(path, callback, recursive, errorCallback) {
    var mkdir_path = path.substring(path.lastIndexOf('/') + 1);
    var cd_path = path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1);

    var self = this;
    var mkdir_exec = function() {
      self.sftp_client.mkdir(mkdir_path, 0777, self.readControl.bind(self));
    };
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    if (recursive) {
      this.unshiftEventQueue("mkdir", mkdir_path, callback, { errorCallback: errorCallback}, mkdir_exec);
      this.unshiftEventQueue("cd", cd_path, null, { 'dontUpdateView': true }, cd_exec);
    } else {
      this.addEventQueue("cd", cd_path, null, { 'dontUpdateView': true }, cd_exec);
      this.addEventQueue("mkdir", mkdir_path, callback, { errorCallback: errorCallback }, mkdir_exec);
    }

    this.writeControlWrapper();
  },

  makeBlankFile          : function(path, callback, errorCallback) {
    var self = this;
    var cd_path = path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1);
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    this.addEventQueue("cd", cd_path, null, { 'dontUpdateView': true }, cd_exec);

    try {
      var count = 0;
      let tmpFile = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsILocalFile);
      tmpFile.append(count + '-blankFile');
      while (tmpFile.exists()) {
        ++count;
        tmpFile.leafName = count + '-blankFile';
      }
      var foutstream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
      foutstream.init(tmpFile, 0x04 | 0x08 | 0x20, 0644, 0);
      foutstream.write("", 0);
      foutstream.close();

      this.upload(tmpFile.path, path, false, 0, 0, callback, true, errorCallback, tmpFile);
    } catch (ex) {
      this.observer.onDebug(ex);
    }
  },

  remove                 : function(isDirectory, path, callback) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;

    this.observer.onAddQueue(id, "delete", null, 0);

    var rm_path = path.substring(path.lastIndexOf('/') + 1);
    var cd_path = path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1);

    var self = this;
    var rmdir_exec = function() {
      self.sftp_client.rmdir(rm_path, self.readControl.bind(self));
    };
    var rm_exec = function() {
      self.sftp_client.remove(rm_path, self.readControl.bind(self));
    };
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    if (isDirectory) {
      this.unshiftEventQueue("rmdir", rm_path, callback, { 'id': id }, rmdir_exec);
      this.unshiftEventQueue("cd",    cd_path, null, { 'dontUpdateView': true }, cd_exec);

      var self         = this;
      var listCallback = function() { self.removeRecursive(path); };
      this.list(path, listCallback, true, true);
    } else {
      this.unshiftEventQueue("rm",    rm_path, callback, { 'id': id }, rm_exec);
      this.unshiftEventQueue("cd",    cd_path, null, { 'dontUpdateView': true }, cd_exec);
    }

    this.writeControlWrapper();
  },

  removeRecursive : function(parent) {                                           // delete subdirectories and files
    var files = this.listData;

    for (var x = 0; x < files.length; ++x) {
      ++this.queueID;
      let id = this.connNo + "-" + this.queueID;
      this.observer.onAddQueue(id, "delete", null, 0);

      let remotePath = this.constructPath(parent, files[x].leafName);

      let rm_path = remotePath.substring(remotePath.lastIndexOf('/') + 1);
      let cd_path = parent;

      var self = this;
      var rmdir_exec = function() {
        self.sftp_client.rmdir(rm_path, self.readControl.bind(self));
      };
      var rm_exec = function() {
        self.sftp_client.remove(rm_path, self.readControl.bind(self));
      };
      var cd_exec = function() {
        self.sftp_client.chdir(cd_path, self.readControl.bind(self));
      };

      if (files[x].isDirectory()) {                                              // delete a subdirectory recursively
        this.unshiftEventQueue("rmdir",  rm_path, null, { 'id': id }, rmdir_exec);
        this.unshiftEventQueue("cd",     cd_path, null, { 'dontUpdateView': true }, cd_exec);
        this.removeRecursiveHelper(remotePath);
      } else {                                                                   // delete a file
        this.unshiftEventQueue("rm",     rm_path, null, { 'id': id }, rm_exec);
        this.unshiftEventQueue("cd",     cd_path, null, { 'dontUpdateView': true }, cd_exec);
      }
    }
  },

  removeRecursiveHelper : function(remotePath) {
    var self           = this;
    var listCallback   = function() { self.removeRecursive(remotePath); };
    this.list(remotePath, listCallback, true, true);
  },

  rename                 : function(oldName, newName, callback, isDir, errorCallback) {
    if (isDir) {
      this.removeCacheEntry(oldName);
    }

    var self = this;
    var mv_exec = function() {
      self.sftp_client.rename(oldName, newName, self.readControl.bind(self));
    };

    this.addEventQueue("mv", '"' + oldName + '" "' + newName + '"', callback, { errorCallback: errorCallback }, mv_exec);  // rename the file
    this.writeControlWrapper();
  },

  changePermissions      : function(permissions, path, callback) {
    var chmod_path = path.substring(path.lastIndexOf('/') + 1);
    var cd_path = path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1);

    var self = this;
    var chmod_exec = function() {
      self.sftp_client.chmod(chmod_path, parseInt("0" + permissions, 8), self.readControl.bind(self));
    };
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    this.addEventQueue("cd",    cd_path, null, { 'dontUpdateView': true }, cd_exec);
    this.addEventQueue("chmod", permissions + ' "' + chmod_path + '"', callback, {}, chmod_exec);
    this.writeControlWrapper();
  },

  startCustomShell : function(callback) {
    if (!this.customSession || this.customSession.closed) {
      try {
        var self = this;
        var on_success = function(chan) {
          self.observer.onDebug('Connected! Shell open.');
          chan.invoke_shell();
          self.customSession = chan;
          self.customInput();
          self.custom('cd ' + self.currentWorkingDir);
          self.custom('pwd');

          if (callback) {
            callback();
          }
        };
        var chan = this.transport.open_session(on_success);
      } catch (ex) {
        this.observer.onDebug(ex);
        this.observer.onError(gStrbundle.getString("errorConn"));
      }
    } else {
      this.custom('cd ' + this.currentWorkingDir);
      this.custom('pwd');
    }
  },

  customInput : function() {
    try {
      if (!this.customSession || this.customSession.closed) {
        return;
      }
      var stdin = this.customSession.recv(65536);
    } catch(ex if ex instanceof paramikojs.ssh_exception.WaitException) {
      this.customCheckStderr();
      return;
    }
    if (stdin) {
      this.observer.onAppendLog(stdin, 'input custom', 'info');
    }
    this.customCheckStderr();
  },

  customCheckStderr : function() {
    try {
      var stderr = this.customSession.recv_stderr(65536);
    } catch(ex if ex instanceof paramikojs.ssh_exception.WaitException) {
      setTimeout(this.customInput.bind(this), this.refreshRate);
      return;
    }
    if (stderr) {
      this.observer.onError(stderr, 'error custom', 'error');
    }

    setTimeout(this.customInput.bind(this), this.refreshRate);
  },

  custom : function(out) {
    if (!this.customSession || this.customSession.closed) {
      var self = this;
      var callback = function() {
        self.custom(out);
      };
      this.startCustomShell(callback);
      return;
    }

    this.observer.onAppendLog("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" + out, 'output custom', 'info');
    this.customBuffer += out + '\n';
    this.sendCustomOutput();
  },

  sendCustomOutput : function() {
    while (this.customBuffer.length > 0) {
      if (!this.customSession || this.customSession.closed) {
        return;
      }

      try {
        var n = this.customSession.send(this.customBuffer);
      } catch(ex if ex instanceof paramikojs.ssh_exception.WaitException) {
        var self = this;
        var wait_callback = function() {
          self.sendCustomOutput();
        }
        setTimeout(wait_callback, this.refreshRate);
        return;
      }
      if (n <= 0) { // eof
        break;
      }
      this.customBuffer = this.customBuffer.substring(n);
    }
    //setTimeout(this.sendCustomOutput.bind(this), this.refreshRate);
  },

  list                   : function(path, callback, skipCache, recursive, fxp, eventualGoalPath) {
    if (!this.sftp_client) {                                                     // did abort, waiting for reboot of channel
      var self = this;
      var wait_callback = function() {
        self.list(path, callback, skipCache, recursive, fxp, eventualGoalPath);
      };
      setTimeout(wait_callback, 1000);
      return;
    }

    var self = this;
    var cacheCallback = function(cacheSuccess) {
      if (cacheSuccess) {
        if (callback) {
          callback();
        }
        return;
      }

      var cd_exec = function() {
        self.sftp_client.chdir(path, self.readControl.bind(self));
      };
      var ls_exec = function() {
        self.sftp_client.listdir(path, self.readControl.bind(self));
      };

      var options = { };
      var listOptions = { 'eventualGoalPath': eventualGoalPath };

      if (recursive) {
        self.unshiftEventQueue("ls", path, callback, listOptions, ls_exec);
        self.unshiftEventQueue("cd", path, null,     null, cd_exec);
      } else {
        self.addEventQueue(    "cd", path, null,     null, cd_exec);
        self.addEventQueue(    "ls", path, callback, options, ls_exec);
      }

      self.writeControlWrapper();
    };

    if (!skipCache && this.sessionsMode) {
      this.cacheHit(path, cacheCallback);
    } else {
      cacheCallback(false);
    }
  },

  download               : function(remotePath, localPath, remoteSize, resume, localSize, isSymlink, callback, remoteFile) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;
    var leafName = remotePath.substring(remotePath.lastIndexOf('/') + 1);

    var cd_path = remotePath.substring(0, remotePath.lastIndexOf('/') ? remotePath.lastIndexOf('/') : 1);
    var get_remotepath = leafName;
    var get_localpath = localPath;

    var self = this;
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };
    var get_exec = function(options) {
      self.transferProgress.id = id;
      self.transferProgress.timeStart = new Date();
      self.transferProgress.bytesPartial = options.localSize == -1 ? 0 : options.localSize;
      self.transferProgress.bytesTransferred = options.localSize == -1 ? 0 : options.localSize;
      self.transferProgress.bytesTotal = remoteSize;
      self.sftp_client.get(get_remotepath, get_localpath, options.localSize, self.readControl.bind(self), self.transferProgressCallback.bind(self));
    };

    this.addEventQueue("transferBegin", "", null, { 'id': id });

    this.addEventQueue(  "cd",  cd_path, null, { 'dontUpdateView': true }, cd_exec);

    this.addEventQueue(resume ? "reget" : "get", '"' + get_remotepath + '" "' + get_localpath + '"', null, { localPath: localPath, localSize: localSize, remoteEditCallback: callback, remoteTime: remoteFile.lastModifiedTime }, get_exec);

    var transferInfo = { localPath: localPath, remotePath: remotePath, size: remoteSize, file: remoteFile, transport: 'sftp', type: 'download', ascii: "I", id: id };
    this.addEventQueue("transferEnd", "", null, transferInfo);

    this.observer.onAddQueue(id, "download", transferInfo, remoteSize);

    this.writeControlWrapper();
  },

  upload                 : function(localPath, remotePath, resume, localSize, remoteSize, callback, disableTimestampSync, errorCallback, file) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;
    var leafName = remotePath.substring(remotePath.lastIndexOf('/') + 1);

    var cd_path = remotePath.substring(0, remotePath.lastIndexOf('/') ? remotePath.lastIndexOf('/') : 1);
    var put_localpath = localPath;
    var put_remotepath = leafName;

    var self = this;
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };
    var put_exec = function(options) {
      self.transferProgress.id = id;
      self.transferProgress.timeStart = new Date();
      self.transferProgress.bytesPartial = options.remoteSize == -1 ? 0 : options.remoteSize;
      self.transferProgress.bytesTransferred = options.remoteSize == -1 ? 0 : options.remoteSize;
      self.transferProgress.bytesTotal = localSize;
      self.sftp_client.put(put_localpath, put_remotepath, options.remoteSize, self.readControl.bind(self), null, self.transferProgressCallback.bind(self));
    };

    this.addEventQueue("transferBegin", "", null, { id: id });

    this.addEventQueue(  "cd",  cd_path, null, { 'dontUpdateView': true, isUploading: file != null }, cd_exec);

    this.addEventQueue(resume ? "reput" : "put", '"' + put_localpath + '" "' + put_remotepath + '"', null, { localPath: localPath, remotePath: put_remotepath, remoteSize: remoteSize, remoteEditCallback: callback, errorCallback: errorCallback }, put_exec);

    if (this.timestampsMode && !disableTimestampSync) {
      var utime_exec = function() {
        self.sftp_client.utime(put_remotepath, [file.lastModifiedTime / 1000, file.lastModifiedTime / 1000], self.readControl.bind(self));
      };
      this.addEventQueue("utime", '"' + put_remotepath + '"', null, { }, utime_exec);
    }

    var transferInfo = { localPath: localPath, remotePath: remotePath, size: localSize, file: file, transport: 'sftp', type: 'upload', ascii: "I", id: id };
    this.addEventQueue("transferEnd", "", null, transferInfo);

    this.observer.onAddQueue(id, "upload", transferInfo, localSize);

    this.writeControlWrapper();

    return id;
  },

  transferProgressCallback : function(size) {
    this.transferProgress.bytesTransferred += size;
  },

  checkDataTimeout : function(isDownload, id, bytes) {
    if (this.isConnected && this.transferID == id) {
      if (bytes == this.transferProgress.bytesTransferred) {
        this.resetConnection();
        return;
      }

      var self      = this;
      var nextBytes = this.transferProgress.bytesTransferred;
      var func = function() { self.checkDataTimeout(isDownload, id, nextBytes); };
      setTimeout(func, this.networkTimeout * 1000);
    }
  },

  isListing              : function() {
    for (var x = 0; x < this.eventQueue.length; ++x) {
      if (this.eventQueue[x].cmd == "ls") {
        return true;
      }
    }

    return false;
  },

  recoverFromDisaster    : function() {
    if (this.eventQueue.length && this.eventQueue[0].cmd == "goodbye") {
      this.eventQueue.shift();
    }

    if (this.eventQueue.cmd) {
      this.eventQueue = new Array(this.eventQueue);
    }

    var self = this;

    if (this.eventQueue.length && (this.eventQueue[0].cmd == "ls"
                               ||  this.eventQueue[0].cmd == "get"
                               ||  this.eventQueue[0].cmd == "reget"
                               ||  this.eventQueue[0].cmd == "put"
                               ||  this.eventQueue[0].cmd == "reput")) {
      var cmd       = this.eventQueue[0].cmd;
      var parameter = this.eventQueue[0].parameter;

      cmd = this.eventQueue[0].cmd;

      if (cmd == "put" || cmd == "reput") {                                      // set up resuming for these poor interrupted transfers
        this.eventQueue[0].cmd = "reput";
        var transfer_path = this.eventQueue[0].options.remotePath;
        var stat_exec = function() {
          self.sftp_client.stat(transfer_path, self.readControl.bind(self));
        };
        this.unshiftEventQueue("stat", '"' + transfer_path + '"', null, { 'commandToLookFor': "reput" }, stat_exec);
      } else if (cmd == "get" || cmd == "reget") {
        this.eventQueue[0].cmd = "reget";

        try {
          var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
          file.initWithPath(this.eventQueue[0].options.localPath);

          this.eventQueue[0].options.localSize = file.fileSize;
        } catch (ex) {
          this.observer.onDebug(ex);
        }
      }
    }

    var cd_path = this.currentWorkingDir;
    var cd_exec = function() {
      self.sftp_client.chdir(cd_path, self.readControl.bind(self));
    };

    if (this.currentWorkingDir) {
      this.unshiftEventQueue("cd", cd_path, null, { 'dontUpdateView': true }, cd_exec);
      this.currentWorkingDir = "";
    }

    this.trashQueue = new Array();

    this.nextCommand();
  }
}
