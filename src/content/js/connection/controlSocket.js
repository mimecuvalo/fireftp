function ftpMozilla(observer) {
  inherit(this, new baseProtocol());
  this.observer = observer;

  setTimeout(this.keepAlive.bind(this), 60000);
}

ftpMozilla.prototype = {
  // override base class variables
  protocol             : 'ftp',

  // read/write variables
  passiveMode          : true,
  fxpHost              : null,           // the host of an FXP connection
  asciiFiles           : new Array(),    // set to the list of extensions we treat as ASCII files when transfering
  fileMode             : 0,              // 0 == auto, 1 == binary, 2 == ASCII
  ipType               : "IPv4",         // right now, either IPv4 or IPv6
  activePortMode       : false,          // in active mode, if you want to specify a range of ports
  activeLow            : 1,              // low  port
  activeHigh           : 65535,          // high port

  featMLSD             : false,          // is the MLSD command available?
  featMDTM             : false,          // is the MDTM command available?
  featXMD5             : false,          // is the XMD5 command available?
  featXSHA1            : false,          // is the XSHA1 command available?
  featXCheck           : null,           // are the XMD5 or XSHA1 commands available; if so, which one to use?
  featModeZ            : false,          // is the MODE Z command available?
  featStat             : false,          // is the STAT command available? (hidden from FEAT menu, lamesauce)

  welcomeMessage       : "",             // hello world
  fullBuffer           : "",             // full response of control socket
  transferMode         : "",             // either "A" or "I"
  securityMode         : "",             // either "P" or "C" or ""
  compressMode         : "S",            // either "S" or "Z"

  connect : function(reconnect) {
    this.setupConnect(reconnect);

    try {                                                                        // create a control socket
      var proxyInfo = null;
      var self      = this;

      if (this.proxyType != "") {                                                // use a proxy
        proxyInfo = this.proxyService.newProxyInfo(this.proxyType, this.proxyHost, this.proxyPort,
                      Components.interfaces.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST, 30, null);
      }

      if (this.security == "ssl") {                                              // thanks to Scott Bentley. he's a good man, Jeffrey. and thorough.
        this.controlTransport = this.transportService.createTransport(["ssl"],      1, this.host, parseInt(this.port), proxyInfo);
      } else if (!this.security) {
        this.controlTransport = this.transportService.createTransport(null,         0, this.host, parseInt(this.port), proxyInfo);
      } else {
        this.controlTransport = this.transportService.createTransport(["starttls"], 1, this.host, parseInt(this.port), proxyInfo);
      }

      if (this.observer.securityCallbacks) {
        this.observer.securityCallbacks.connection = this;
        this.controlTransport.securityCallbacks    = this.observer.securityCallbacks;
      }

      this.controlOutstream = this.controlTransport.openOutputStream(0, 0, 0);
      var controlStream     = this.controlTransport.openInputStream(0, 0, 0);
      this.controlInstream  = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
      this.controlInstream.init(controlStream);

      var dataListener = {                                                       // async data listener for the control socket
        data            : "",

        onStartRequest  : function(request, context) { },

        onStopRequest   : function(request, context, status) {
          self.onDisconnect();
        },

        onDataAvailable : function(request, context, inputStream, offset, count) {
          this.data = self.controlInstream.read(count);                          // read data
          self.readControl(this.data);
        }
      };

      var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].createInstance(Components.interfaces.nsIInputStreamPump);
      pump.init(controlStream, -1, -1, 0, 0, false);
      pump.asyncRead(dataListener, null);

    } catch(ex) {
      this.onDisconnect();
    }
  },

  cleanup : function(isAbort) {
    this._cleanup();

    this.transferMode       = "";
    this.securityMode       = "";
    this.compressMode       = "S";
    this.fxpHost            = null;

    if (!isAbort) {
      this.featMLSD         = false;
      this.featMDTM         = false;
      this.featXMD5         = false;
      this.featXSHA1        = false;
      this.featXCheck       = null;
      this.featModeZ        = false;
      this.featStat         = true;
    }
  },

  resetReconnectState : function() {
    this.transferMode = "";
    this.securityMode = "";
    this.compressMode = "S";
  },

  sendQuitCommand : function(legitClose) {
    try {
      this.controlOutstream.write("QUIT\r\n", 6);
      this.observer.onAppendLog("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" + "QUIT", 'output', "info");
    } catch(ex) { }
  },

  sendAbortCommand : function() {
    try {
      this.controlOutstream.write("ABOR\r\n", 6);
    } catch(ex) { }
  },

  keepAlive : function() {
    if (this.isConnected && this.keepAliveMode && this.eventQueue.length == 0) {
      this.addEventQueue("NOOP");
      this.writeControl();
    }

    setTimeout(this.keepAlive.bind(this), 60000);
  },

  isWriteUnnecessary : function(cmd, parameter) {
    return (cmd == "TYPE" && this.transferMode      == parameter)
        || (cmd == "PROT" && this.securityMode      == parameter)
        || (cmd == "MODE" && this.compressMode      == parameter)
        || (cmd == "CWD"  && this.currentWorkingDir == parameter);
  },

  processWriteCommand : function(cmd, parameter) {
    if (!this.passiveMode && cmd == "PASV") {                                  // active mode
      cmd                      = this.ipType == "IPv4" ? "PORT" : "EPRT";
      var security             = this.security && this.securityMode == "P";
      var proxy                = { proxyType: this.proxyType, proxyHost: this.proxyHost, proxyPort: this.proxyPort };
      var currentPort          = this.observer.getActivePort(this.activeLow, this.activeHigh);

      var qId;
      for (var x = 0; x < this.eventQueue.length; ++x) {
        if (this.eventQueue[x].cmd == "transferEnd") {
          qId = this.eventQueue[x].options.id;
          break;
        }
      }

      this.dataSocket          = new ftpDataSocketMozilla(this.host, this.port, security, proxy, "", this.activePortMode ? currentPort : -1,
                                                          this.compressMode == "Z", qId, this.observer, this.getCert(), this.fileMode == 2);

      var activeInfo           = {};
      activeInfo.cmd           = this.eventQueue[1].cmd;
      activeInfo.ipType        = this.ipType;

      if (this.eventQueue[1].cmd        == "RETR") {
        activeInfo.localPath    = this.eventQueue[1].options.localPath;
        activeInfo.totalBytes   = this.eventQueue[0].options.totalBytes;
      } else if (this.eventQueue[1].cmd == "REST") {
        activeInfo.localPath    = this.eventQueue[2].options.localPath;
        activeInfo.totalBytes   = this.eventQueue[0].options.totalBytes;
        activeInfo.partialBytes = this.eventQueue[1].parameter;
      } else if (this.eventQueue[1].cmd == "STOR") {
        activeInfo.localPath    = this.eventQueue[1].options.localPath;
      } else if (this.eventQueue[1].cmd == "APPE") {
        activeInfo.localPath    = this.eventQueue[1].options.localPath;
        activeInfo.partialBytes = this.eventQueue[1].options.remoteSize;
      }

      parameter = this.dataSocket.createServerSocket(activeInfo);

      if (!parameter) {
        cmd = "PASV";
        this.passiveMode = true;
      }
    }

    if (cmd == "PASV" && this.passiveMode && this.ipType != "IPv4") {
      cmd = "EPSV";
    }

    if (cmd == "LIST") {                                                       // don't include path in list command - breaks too many things
      parameter = this.hiddenMode && !this.featMLSD ? "-al" : "";

      if (this.featMLSD) {
        cmd = "MLSD";
      }
    }

    return { 'cmd': cmd, 'parameter': parameter };
  },

  isValidTimeoutCommand : function(cmd) {
    return true;
  },

  getCommandInfo : function(cmd) {
    var isCmd = (cmd == "RETR" || cmd == "STOR" || cmd == "APPE") && !this.eventQueue[0].options.isFxp;
    return { 'isTransferCmd': isCmd, 'isDownload': cmd == "RETR", 'skipLog': false, 'isPrivate': cmd == "PASS" };
  },

  readControl : function(buffer) {
    try {
      buffer = this.toUTF8.convertStringToUTF8(buffer, this.encoding, 1);
    } catch (ex) {
      this.observer.onDebug(ex);
    }

    if ((buffer == "2" && !this.isConnected) || buffer == "\r\n" || buffer == "\n") {
      return;
    }

    var lastLineOfBuffer = buffer.replace(/\r\n/g, "\n").split("\n");
    lastLineOfBuffer     = lastLineOfBuffer.filter(this.removeBlanks);

    if (buffer != "2") {                                                         // "2"s are self-generated fake messages
      for (var x = 0; x < lastLineOfBuffer.length; ++x) {                        // add response to log
        var message   = lastLineOfBuffer[x].charAt(lastLineOfBuffer[x].length - 1) == '\r'
                      ? lastLineOfBuffer[x].substring(0, lastLineOfBuffer[x].length - 1) : lastLineOfBuffer[x];
        var errorBlah = lastLineOfBuffer[x].charAt(0) == '4' || lastLineOfBuffer[x].charAt(0) == '5';
        if (this.eventQueue.length && this.eventQueue[0].cmd == "STAT" && x > 5) {
          this.observer.onAppendLog("...", 'input', "info");
          break;
        }
        if (!errorBlah) {
          this.observer.onAppendLog(message, 'input', "info");
        }
      }

      ++this.networkTimeoutID;
    }

    lastLineOfBuffer = lastLineOfBuffer[lastLineOfBuffer.length - 1];            // we are only interested in what the last line says
    var returnCode;

    if ((lastLineOfBuffer.length > 3 && lastLineOfBuffer.charAt(3) == '-')
        || lastLineOfBuffer.charAt(0) == ' '
        || (buffer != "2" && buffer[buffer.length - 1] != '\n')
        || (this.eventQueue.length && this.eventQueue[0].cmd == "STAT" && !(/^2\d\d /.test(lastLineOfBuffer)) && !(/^5\d\d /.test(lastLineOfBuffer)))) {
      if (this.eventQueue.length && (this.eventQueue[0].cmd == "USER" || this.eventQueue[0].cmd == "PASS")) {
        this.welcomeMessage += buffer;                                           // see if the message is finished or not
      }

      this.fullBuffer += buffer;

      return;
    } else {
      buffer          = this.fullBuffer + buffer;
      if (this.fullBuffer) {                                                     // we have a partial response from before
        lastLineOfBuffer = buffer.replace(/\r\n/g, "\n").split("\n");
        lastLineOfBuffer = lastLineOfBuffer.filter(this.removeBlanks);
        lastLineOfBuffer = lastLineOfBuffer[lastLineOfBuffer.length - 1];
      }
      this.fullBuffer = '';
      returnCode = parseInt(lastLineOfBuffer.charAt(0));                         // looks at first number of number code
    }

    var cmd;  var parameter;    var callback;   var options;

    if (this.eventQueue.length) {
      cmd        = this.eventQueue[0].cmd;
      parameter  = this.eventQueue[0].parameter;
      callback   = this.eventQueue[0].callback;
      options    = this.eventQueue[0].options;

      if (cmd != "LIST"  && cmd != "RETR"  && cmd != "STOR"  && cmd != "APPE"    // used if we have a loss in connection
       && cmd != "LIST2" && cmd != "RETR2" && cmd != "STOR2" && cmd != "APPE2") {
        var throwAway = this.eventQueue.shift();

        if (throwAway.cmd != "USER"    && throwAway.cmd != "PASS"    && throwAway.cmd != "PWD"     && throwAway.cmd != "FEAT"
         && throwAway.cmd != "welcome" && throwAway.cmd != "goodbye" && throwAway.cmd != "aborted" && throwAway.cmd != "NOOP"
         && throwAway.cmd != "REST"    && throwAway.cmd != "SIZE"    && throwAway.cmd != "PBSZ"    && throwAway.cmd != "AUTH" && throwAway.cmd != "PROT") {
          this.trashQueue.push(throwAway);
        }
      }
    } else {
      cmd = "default";                                                           // an unexpected reply - perhaps a 421 timeout message
    }

    switch (cmd) {
      case "welcome":
        this.welcomeMessage = buffer;

        if (returnCode != 2) {
          this.observer.onConnectionRefused();

          if (this.type == 'transfer') {
            this.type = 'bad';
          }

          this.cleanup();

          break;
        }

        this.onConnected();

        this.unshiftEventQueue(  "USER", this.login);

        if (this.security) {
          this.unshiftEventQueue("PBSZ", "0");
        }

        if (this.security == "authtls") {
          this.unshiftEventQueue("AUTH", "TLS");
        } else if (this.security == "authssl") {
          this.unshiftEventQueue("AUTH", "SSL");
        }
        break;

      case "AUTH":
        if (returnCode != 2) {
          this.observer.onError(buffer);

          this.isConnected = false;

          this.kill();

          return;
        } else {
          var si = this.controlTransport.securityInfo;
          si.QueryInterface(Components.interfaces.nsISSLSocketControl);
          si.StartTLS();
        }
        break;

      case "PBSZ":
        if (returnCode != 2) {
          this.observer.onError(buffer);

          this.isConnected = false;

          this.kill();
          return;
        }
        break;

      case "PROT":
        if (buffer.substring(0, 3) == "534" && parameter == "P") {
          this.observer.onAppendLog(buffer, 'error', "error");

          this.unshiftEventQueue("PROT", "C");
          break;
        }

        if (returnCode != 2) {
          this.observer.onError(buffer);
        } else {
          this.securityMode = parameter;
        }
        break;

      case "USER":
      case "PASS":
        if (returnCode == 2) {
          if (this.loginAccepted()) {
            this.unshiftEventQueue("PWD");
            this.unshiftEventQueue("FEAT");
          }
        } else if (cmd == "USER" && returnCode == 3) {
          this.unshiftEventQueue("PASS", this.password);
        } else {
          this.loginDenied(buffer);

          return;
        }
        break;

      case "PASV":
        if (returnCode != 2) {
          this.observer.onError(buffer + ": " + this.constructPath(this.currentWorkingDir, this.eventQueue[(this.eventQueue[0].cmd == "REST" ? 1 : 0)].parameter));

          if (this.eventQueue[0].cmd == "LIST") {
            this.eventQueue.shift();
          } else {
            while (this.eventQueue.length) {
              if (this.eventQueue[0].cmd == "transferEnd") {
                this.observer.onRemoveQueue(this.eventQueue[0].options.id);
                this.observer.onTransferFail(this.eventQueue[0].options, buffer);
                this.eventQueue.shift();
                break;
              }

              this.eventQueue.shift();
            }
          }

          break;
        }

        if (this.passiveMode) {
          var dataHost;
          var dataPort;

          if (options.isFxp) {
            callback(buffer.substring(buffer.indexOf("(") + 1, buffer.indexOf(")")));
            return;
          }

          if (this.ipType == "IPv4") {
            buffer           = buffer.substring(buffer.indexOf("(") + 1, buffer.indexOf(")"));
            var re           = /,/g;
            buffer           = buffer.replace(re, ".");                          // parsing the port to transfer to
            var lastDotIndex = buffer.lastIndexOf(".");
            dataPort         = parseInt(buffer.substring(lastDotIndex + 1));
            dataPort        += 256 * parseInt(buffer.substring(buffer.lastIndexOf(".", lastDotIndex - 1) + 1, lastDotIndex));
            dataHost         = buffer.substring(0, buffer.lastIndexOf(".", lastDotIndex - 1));
          } else {
            buffer           = buffer.substring(buffer.indexOf("(|||") + 4, buffer.indexOf("|)"));
            dataPort         = parseInt(buffer);
            dataHost         = this.host;
          }

          var isSecure       = this.security && this.securityMode == "P";
          var proxy          = { proxyType: this.proxyType, proxyHost: this.proxyHost, proxyPort: this.proxyPort };

          var qId;
          for (var x = 0; x < this.eventQueue.length; ++x) {
            if (this.eventQueue[x].cmd == "transferEnd") {
              qId = this.eventQueue[x].options.id;
              break;
            }
          }

          this.dataSocket          = new ftpDataSocketMozilla(this.host, this.port, isSecure, proxy, dataHost, dataPort,
                                                              this.compressMode == "Z", qId, this.observer, this.getCert(), this.fileMode == 2);

          if (this.eventQueue[0].cmd        == "LIST") {                         // do what's appropriate
            this.dataSocket.connect();
          } else if (this.eventQueue[0].cmd == "RETR") {
            this.dataSocket.connect(false, this.eventQueue[0].options.localPath, options.totalBytes);
          } else if (this.eventQueue[0].cmd == "REST") {
            this.dataSocket.connect(false, this.eventQueue[1].options.localPath, options.totalBytes, this.eventQueue[0].parameter);
          } else if (this.eventQueue[0].cmd == "STOR") {
            this.dataSocket.connect(true,  this.eventQueue[0].options.localPath, 0,        0);
          } else if (this.eventQueue[0].cmd == "APPE") {
            this.dataSocket.connect(true,  this.eventQueue[0].options.localPath, 0,        this.eventQueue[0].options.remoteSize);
          }
        }
        break;

      case "PORT":                                                               // only used with FXP
        if (returnCode != 2) {
          this.observer.onError(buffer + ": " + this.constructPath(this.currentWorkingDir, this.eventQueue[(this.eventQueue[0].cmd == "REST" ? 1 : 0)].parameter));

          break;
        }

        break;

      case "STAT":
        if (returnCode == 2) {
          var results = buffer.replace(/\r\n/g, "\n").split("\n");
          results.shift();                                                       // get rid of first and last lines
          results.pop();
          results.pop();

          if (!results.length) {                                                 // if buffer is empty, maybe the directory doesn't exist
            break;                                                               // carry on with a normal LIST
          }

          try {
            var oldFeatMLSD = this.featMLSD;
            if (/^2\d\d-/.test(results[0])) {                                    // if the server is sending back results as
              for (var x = 0; x < results.length; ++x) {                         // 211-drwxr-xr-x 3 blah nobody 43 Mar 8 14:44 .
                results[x] = results[x].substring(4);
              }
            }
            this.featMLSD = /type=/i.test(results[0]);
            this.listData = this.parseListData(results.join("\r\n"), parameter);
          } catch (ex) {
            this.observer.onAppendLog(buffer, 'error', "error");
            this.featMLSD = oldFeatMLSD;
            this.featStat = false;                                               // carry on with a normal LIST
            break;
          }

          while (this.eventQueue.length) {
            if (this.eventQueue[0].cmd == 'LIST') {
              this.eventQueue.shift();
              break;
            }
            this.eventQueue.shift();
          }

          if (callback) {
            callback();                                                          // send off list data to whoever wanted it
          }
        } else {
          this.observer.onAppendLog(buffer, 'error', "error");
          this.featStat = false;                                                 // carry on with a normal LIST
        }
        break;

      case "APPE":
      case "LIST":
      case "RETR":
      case "STOR":
        this.eventQueue[0].cmd = cmd + "2";

        if (options.isFxp) {
          if (returnCode == 2) {
            ++this.transferID;
            this.eventQueue.shift();
            if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
              this.observer.onRemoveQueue(this.eventQueue[0].options.id);
              this.eventQueue.shift();
            }
            this.trashQueue = new Array();                                       // clear the trash array, completed an 'atomic' set of operations

            if (options.isDest && (!this.fxpHost.eventQueue.length || (!this.fxpHost.eventQueue[0].options.isFxp && !this.fxpHost.eventQueue[0].options.isFxpListing))) {
              this.disconnect();
            }
            break;
          }

          if (this.fxpHost) {
            this.fxpHost.isReady = true;
            this.fxpHost.writeControlWrapper();
          }
          return;
        }

        if (this.dataSocket.emptyFile) {                                         // XXX empty files are (still) special cases
          this.dataSocket.kill(true);
          this.dataSocket = null;
          this.eventQueue[0].options['emptyFile'] = true;
        }

        if (returnCode == 2) {
          if (this.dataSocket.finished && !this.dataSocket.exception) {
            ++this.transferID;
            this.eventQueue.shift();
            if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
              this.observer.onRemoveQueue(this.eventQueue[0].options.id);
              this.eventQueue.shift();
            }
            this.trashQueue = new Array();                                       // clear the trash array, completed an 'atomic' set of operations

            if (cmd == "LIST") {
              this.listData = this.parseListData(this.dataSocket.listData, parameter);

              if (callback) {
                callback();                                                      // send off list data to whoever wanted it
              }
            }

            if (options.remoteEditCallback) {                                    // for transfers
              options.remoteEditCallback();
            }

            this.dataSocket = null;

            break;
          } else {
            var self = this;
            var func = function() { self.readControl("2"); };
            setTimeout(func, 500);                                               // give data stream some time to finish up
            return;
          }
        }

        if (returnCode != 1 || (this.dataSocket && this.dataSocket.finished && this.dataSocket.exception)) {
          var errorReason = (!this.dataSocket || !this.dataSocket.exception) ? buffer : "";
          this.observer.onError(errorReason + ": " + this.constructPath(this.currentWorkingDir, parameter));

          if (options.errorCallback) {
            options.errorCallback();
          }

          this.eventQueue.shift();
          while (this.eventQueue.length && (this.eventQueue[0].cmd == "MDTM" || this.eventQueue[0].cmd == "XMD5" || this.eventQueue[0].cmd == "XSHA1" || this.eventQueue[0].cmd == "transferEnd")) {
            if (this.eventQueue[0].cmd == "transferEnd") {
              this.observer.onRemoveQueue(this.eventQueue[0].options.id);
              this.observer.onTransferFail(this.eventQueue[0].options, errorReason);
            }

            this.eventQueue.shift();
          }
          this.trashQueue = new Array();

          if (this.dataSocket) {
            this.dataSocket.kill();
            this.dataSocket = null;
          }

          break;
        }
        return;

      case "APPE2":
      case "RETR2":
      case "STOR2":
      case "LIST2":
        if (options.isFxp) {
          if (returnCode != 2) {
            this.observer.onError(buffer + ": " + this.constructPath(this.currentWorkingDir, parameter));
          }

          ++this.transferID;
          this.eventQueue.shift();
          if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
            this.observer.onRemoveQueue(this.eventQueue[0].options.id);
            this.eventQueue.shift();
          }
          this.trashQueue = new Array();                                         // clear the trash array, completed an 'atomic' set of operations

          if (options.isDest && (!this.fxpHost.eventQueue.length || (!this.fxpHost.eventQueue[0].options.isFxp && !this.fxpHost.eventQueue[0].options.isFxpListing))) {
            this.disconnect();
          }
          break;
        }

        if (!options.emptyFile && (returnCode != 2 || (this.dataSocket && this.dataSocket.finished && this.dataSocket.exception))) {
          var errorReason = (!this.dataSocket || !this.dataSocket.exception) ? buffer : "";
          this.observer.onError(errorReason + ": " + this.constructPath(this.currentWorkingDir, parameter));

          if (options.errorCallback) {                                           // for transfers
            options.errorCallback();
          }

          this.eventQueue.shift();
          while (this.eventQueue.length && (this.eventQueue[0].cmd == "MDTM" || this.eventQueue[0].cmd == "XMD5" || this.eventQueue[0].cmd == "XSHA1" || this.eventQueue[0].cmd == "transferEnd")) {
            if (this.eventQueue[0].cmd == "transferEnd") {
              this.observer.onRemoveQueue(this.eventQueue[0].options.id);
              this.observer.onTransferFail(this.eventQueue[0].options, errorReason);
            }

            this.eventQueue.shift();
          }
          this.trashQueue = new Array();

          if (this.dataSocket) {
            this.dataSocket.kill();
            this.dataSocket = null;
          }
          break;
        }

        if (!this.dataSocket || this.dataSocket.finished) {
          ++this.transferID;
          this.eventQueue.shift();
          if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
            this.observer.onRemoveQueue(this.eventQueue[0].options.id);
            this.eventQueue.shift();
          }
          this.trashQueue = new Array();                                         // clear the trash array, completed an 'atomic' set of operations
        }

        if (cmd == "LIST2" && this.dataSocket.finished) {
          this.listData = this.parseListData(this.dataSocket.listData, parameter);
          this.dataSocket = null;

          if (callback) {
            callback();                                                           // send off list data to whoever wanted it
          }
        } else if ((!this.dataSocket || this.dataSocket.finished) && options.remoteEditCallback) { // for transfers
          this.dataSocket = null;
          if (options.remoteEditCallback) {
            options.remoteEditCallback();
          }
        } else if (this.dataSocket && !this.dataSocket.finished) {
          var self = this;
          var func = function() { self.readControl("2"); };
          setTimeout(func, 500);                                                 // give data stream some time to finish up
          return;
        } else if (this.dataSocket && this.dataSocket.finished) {
          this.dataSocket = null;
        }
        break;

      case "SIZE":
        if (returnCode == 2) {                                                   // used with APPE commands to see where to pick up from
          var size = buffer.split(" ").filter(this.removeBlanks);
          size     = parseInt(size[1]);

          for (var x = 0; x < this.eventQueue.length; ++x) {
            if (options.commandToLookFor == this.eventQueue[x].cmd) {
              if (options.commandToLookFor == "STOR") {
                this.eventQueue[x].cmd      = "APPE";
                let localPath = this.eventQueue[x].options.localPath;
                this.eventQueue[x].options.localPath = localPath;
                this.eventQueue[x].options.remoteSize = size;
              } else if (options.commandToLookFor == "APPE") {
                let localPath = this.eventQueue[x].options.localPath;
                this.eventQueue[x].options.localPath = localPath;
                this.eventQueue[x].options.remoteSize = size;
              } else if (options.commandToLookFor == "PASV") {
                this.eventQueue[x].options.totalBytes = size;
              }

              break;
            }
          }
        } else {                                                                 // our size command didn't work out, make sure we're not doing an APPE
          if (options.commandToLookFor != "PASV") {
            for (var x = 0; x < this.eventQueue.length; ++x) {
              if (this.eventQueue[x].cmd == "APPE") {
                this.eventQueue[x].cmd      = "STOR";
                break;
              }
            }
          }

          this.observer.onAppendLog(buffer, 'error', "error");
        }
        break;

      case "XMD5":
      case "XSHA1":
        if (returnCode == 2) {
          var zeHash = buffer.split(" ").filter(this.removeBlanks);
          zeHash     = zeHash[1].replace(/\n|\r/g, "").toLowerCase();

          if (callback) {
            callback(zeHash);
            break;
          }

          try {
            var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
            file.initWithPath(options.localPath);
            var cryptoHash = cmd == "XMD5" ? Components.interfaces.nsICryptoHash.MD5 : Components.interfaces.nsICryptoHash.SHA1;
            var fstream    = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
            fstream.init(file, 1, 0, false);
            var gHashComp  = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
            gHashComp.init(cryptoHash);
            gHashComp.updateFromStream(fstream, -1);
            var ourHash    = this.binaryToHex(gHashComp.finish(false)).toLowerCase();
            fstream.close();

            if (ourHash != zeHash) {
              this.observer.onError("'" + options.localPath + "' - " + this.errorXCheckFail);

              for (var x = 0; x < this.eventQueue.length; ++x) {
                if (this.eventQueue[x].cmd == "transferEnd") {
                  this.observer.onTransferFail(this.eventQueue[x].options, "checksum");
                  break;
                }
              }
            }
          } catch (ex) {
            this.observer.onDebug(ex);
          }
        } else {                                                                 // our size command didn't work out, make sure we're not doing an APPE
          this.observer.onAppendLog(buffer, 'error', "error");
        }

        if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
          this.observer.onRemoveQueue(this.eventQueue[0].options.id);
          this.eventQueue.shift();

          this.trashQueue = new Array();                                           // clear the trash array, completed an 'atomic' set of operations
        }
        break;

      case "MDTM":
        if (returnCode == 2) {
          var zeDate = buffer.split(" ").filter(this.removeBlanks);
          zeDate     = zeDate[1];

          try {
            var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
            file.initWithPath(options.localPath);
            file.lastModifiedTime = Date.parse(zeDate.substr(0, 4) + " " + zeDate.substr(4,  2) + " " + zeDate.substr(6,  2) + " "
                                             + zeDate.substr(8, 2) + ":" + zeDate.substr(10, 2) + ":" + zeDate.substr(12, 2) + " GMT");
          } catch (ex) {
            this.observer.onDebug(ex);
          }
        } else {                                                                 // our size command didn't work out, make sure we're not doing an APPE
          this.observer.onAppendLog(buffer, 'error', "error");
        }

        if (this.eventQueue.length && this.eventQueue[0].cmd == "transferEnd") {
          this.observer.onRemoveQueue(this.eventQueue[0].options.id);
          this.eventQueue.shift();
          this.trashQueue = new Array();                                         // clear the trash array, completed an 'atomic' set of operations
        }
        break;

      case "RNFR":
      case "REST":
        if (returnCode != 3) {
          if (cmd == "RNFR") {
            this.eventQueue = new Array();
            this.trashQueue = new Array();

            this.observer.onClearQueue();
          }

          if (cmd == "REST") {
            if (this.dataSocket) {                                               // reset file to not append
              this.dataSocket.dataListener.bytesDownloaded = 0;
              this.dataSocket.dataListener.bytesPartial = 0;
            }
          }

          this.observer.onError(buffer);                                       // should still be able to go on without this, just not with resuming

          break;
        }
        break;

      case "MKD":
      case "SITE CHMOD":
      case "RNTO":
      case "DELE":
      case "RMD":
        if (returnCode != 2) {
          // for making a directory, we only show the error when user explicitly creates a directory
          // otherwise, we (probably) already created this directory programatically on a transfer connection
          if (!(cmd == "MKD" && this.eventQueue.length)) {
            this.observer.onError(buffer + ": " + this.constructPath(this.currentWorkingDir, parameter));
          } else {
            this.observer.onDebug(buffer);
          }

          if (options.errorCallback) {
            options.errorCallback();
          }
        } else {
          if (cmd == "RMD") {                                                    // clear out of cache if it's a remove directory
            this.removeCacheEntry(this.constructPath(this.currentWorkingDir, parameter));
          }

          if (callback) {
            callback();
          }
        }

        if (cmd == "RMD" || cmd == "DELE") {
          this.observer.onRemoveQueue(options.id);
        }

        this.trashQueue = new Array();
        break;

      case "CWD":
        this.handleCWDResponse(returnCode == 2, cmd, parameter, callback, options, null, buffer);
        break;

      case "PWD":                                                                // gotta check for chrooted directories
        if (returnCode != 2) {
          this.observer.onError(buffer);
        } else {
          buffer = buffer.substring(buffer.indexOf("\"") + 1, buffer.lastIndexOf("\""));              // if buffer is not '/' we're chrooted
          this.currentWorkingDir = buffer;

          this.observer.onChangeDir(buffer != '/' && this.initialPath == '' ? buffer : '', false, buffer != '/' || this.initialPath != '');

          if (this.type == 'fxp') {
            this.list(this.initialPath ? this.initialPath : this.currentWorkingDir);
          }
        }

        this.trashQueue = new Array();
        break;

      case "FEAT":
        if (returnCode != 2) {
          this.observer.onAppendLog(buffer, 'error', "error");
        } else {
          buffer = buffer.replace(/\r\n/g, "\n").split("\n");
          var featUTF8 = false;
          var featCLNT = false;

          for (var x = 0; x < buffer.length; ++x) {
            if (buffer[x] && buffer[x][0] == ' ') {
              var feat = buffer[x].trim().toUpperCase();
              if (feat == "MDTM") {
                this.featMDTM   = true;
              } else if (feat == "MLSD") {
                this.featMLSD   = true;
              } else if (feat.indexOf("MODE Z") == 0) {
                this.featModeZ  = true;
              } else if (feat.indexOf("XSHA1") == 0) {
                this.featXCheck = "XSHA1";
                this.featXSHA1  = true;
              } else if (feat.indexOf("XMD5") == 0 && !this.featXCheck) {
                this.featXCheck = "XMD5";
              } else if (feat.indexOf("UTF8") == 0 && this.encoding == "UTF-8") {
                // no need to request this option if the server reports UTF-8 support
                //this.unshiftEventQueue("OPTS", "UTF8 ON");
                featUTF8 = true;
              } else if (feat.indexOf("CLNT") == 0) {
                featCLNT = true;
              }

              if (feat.indexOf("XMD5") == 0) {
                this.featXMD5  = true;
              }
            }
          }

          if (featCLNT && featUTF8) {
            this.unshiftEventQueue("CLNT", "FireFTP " + this.version);
          }
        }
        break;

      case "aborted":
        break;

      case "TYPE":
        if (returnCode != 2) {
          this.observer.onError(buffer);
        } else {
          this.transferMode = parameter;
        }
        break;
      case "MODE":
        if (returnCode != 2) {
          this.observer.onError(buffer);
        } else {
          this.compressMode = parameter;
        }
        break;
      case "OPTS":
      case "CLNT":
        // ignore errors from this
        // used with UTF8 currently, which if in the FEAT list should be turned on by default
        // and this command shouldn't be technically necessary
        if (returnCode != 2) {
          this.observer.onError(buffer, true);
        }
        break;
      case "goodbye":                                                            // you say yes, i say no, you stay stop...
      case "NOOP":
      default:
        if (buffer.substring(0, 3) != "421" && returnCode != 2) {
          this.observer.onError(buffer);
        }
        break;
    }

    this.nextCommand();
  },

  changeWorkingDirectory : function(path, callback) {
    this.addEventQueue("CWD", path, callback);
    this.writeControlWrapper();
  },

  makeDirectory : function(path, callback, recursive, errorCallback) {
    if (recursive) {
      this.unshiftEventQueue("MKD", path.substring(path.lastIndexOf('/') + 1), callback, { errorCallback: errorCallback });
      this.unshiftEventQueue("CWD", path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });
    } else {
      this.addEventQueue("CWD", path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });
      this.addEventQueue("MKD", path.substring(path.lastIndexOf('/') + 1), callback, { errorCallback: errorCallback });
    }

    this.writeControlWrapper();
  },

  makeBlankFile : function(path, callback, errorCallback) {
    this.addEventQueue("CWD", path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });

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

  remove : function(isDirectory, path, callback) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;

    this.observer.onAddQueue(id, "delete", null, 0);

    if (isDirectory) {
      this.unshiftEventQueue("RMD",    path.substring(path.lastIndexOf('/') + 1), callback, { 'id': id });
      this.unshiftEventQueue("CWD",    path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });

      var self         = this;
      var listCallback = function() { self.removeRecursive(path); };
      this.list(path, listCallback, true, true);
    } else {
      this.unshiftEventQueue("DELE",   path.substring(path.lastIndexOf('/') + 1), callback, { 'id': id });
      this.unshiftEventQueue("CWD",    path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });
    }

    this.writeControlWrapper();
  },

  removeRecursive : function(parent) {                                           // delete subdirectories and files
    var files = this.listData;

    for (var x = 0; x < files.length; ++x) {
      ++this.queueID;
      let id = this.connNo + "-" + this.queueID;
      this.observer.onAddQueue(id, "delete", null, 0);

      var remotePath = this.constructPath(parent, files[x].leafName);

      if (files[x].isDirectory()) {                                              // delete a subdirectory recursively
        this.unshiftEventQueue("RMD",  remotePath.substring(remotePath.lastIndexOf('/') + 1), null, { 'id': id });
        this.unshiftEventQueue("CWD",  parent, null, { 'dontUpdateView': true });
        this.removeRecursiveHelper(remotePath);
      } else {                                                                   // delete a file
        this.unshiftEventQueue("DELE", remotePath.substring(remotePath.lastIndexOf('/') + 1), null, { 'id': id });
        this.unshiftEventQueue("CWD",  parent, null, { 'dontUpdateView': true });
      }
    }
  },

  removeRecursiveHelper : function(remotePath) {
    var self           = this;
    var listCallback   = function() { self.removeRecursive(remotePath); };
    this.list(remotePath, listCallback, true, true);
  },

  rename : function(oldName, newName, callback, isDir, errorCallback) {
    if (isDir) {
      this.removeCacheEntry(oldName);
    }

    this.addEventQueue("RNFR", oldName);                                         // rename the file
    this.addEventQueue("RNTO", newName, callback, { errorCallback: errorCallback });
    this.writeControlWrapper();
  },

  changePermissions : function(permissions, path, callback) {
    this.addEventQueue("CWD",        path.substring(0, path.lastIndexOf('/') ? path.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });
    this.addEventQueue("SITE CHMOD", permissions + ' ' + path.substring(path.lastIndexOf('/') + 1), callback);
    this.writeControlWrapper();
  },

  custom : function(cmd) {
    this.addEventQueue(cmd);
    this.writeControlWrapper();
  },

  list : function(path, callback, skipCache, recursive, fxp, eventualGoalPath) {
    var self = this;
    var cacheCallback = function(cacheSuccess) {
      if (cacheSuccess) {
        if (callback) {
          callback();
        }
        return;
      }

      var options = { 'isFxpListing': fxp };
      var listOptions = { 'isFxpListing': fxp, 'eventualGoalPath': eventualGoalPath };

      if (recursive) {
        self.unshiftEventQueue(  "LIST", path, callback, listOptions);
        self.unshiftEventQueue(  "PASV",   "", null,     options);
        self.unshiftEventQueue(  "CWD",  path, null,     options);

        if (self.security) {
          self.unshiftEventQueue("PROT",  "P", null,     options);
        }

        self.unshiftEventQueue(  "MODE",  self.useCompression && self.featModeZ ? "Z" : "S", null, options);
        self.unshiftEventQueue(  "TYPE",  "A", null,      options);
        if (!self.security && self.featStat) {
          self.unshiftEventQueue("STAT",  path, callback, options);
        }
      } else {
        if (!self.security && self.featStat) {
          self.addEventQueue(    "STAT",  path, callback, options);
        }
        self.addEventQueue(      "TYPE",  "A", null,      options);
        self.addEventQueue(      "MODE",  self.useCompression && self.featModeZ ? "Z" : "S", null, options);

        if (self.security) {
          self.addEventQueue(    "PROT",  "P", null,      options);
        }

        self.addEventQueue(      "CWD",  path, null,      options);
        self.addEventQueue(      "PASV",   "", null,      options);
        self.addEventQueue(      "LIST", path, callback,  options);
      }

      self.writeControlWrapper();
    };

    if (!skipCache && this.sessionsMode) {
      this.cacheHit(path, cacheCallback);
    } else {
      cacheCallback(false);
    }
  },

  download : function(remotePath, localPath, remoteSize, resume, localSize, isSymlink, callback, remoteFile) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;

    this.addEventQueue("transferBegin", "", null, { id: id });

    this.addEventQueue(  "CWD",  remotePath.substring(0, remotePath.lastIndexOf('/') ? remotePath.lastIndexOf('/') : 1), null, { 'dontUpdateView': true });

    var leafName = remotePath.substring(remotePath.lastIndexOf('/') + 1);

    var ascii    = this.detectAscii(remotePath);

    this.addEventQueue(  "TYPE", ascii);

    this.addEventQueue(  "MODE", this.useCompression && this.featModeZ ? "Z" : "S");

    if (isSymlink) {
      this.addEventQueue("SIZE", leafName, null, { 'commandToLookFor' : "PASV" });  // need to do a size check
    }

    if (this.security) {
      this.addEventQueue("PROT", "P");
    }

    this.addEventQueue(  "PASV", "", null, { 'totalBytes' : remoteSize });

    if (resume && ascii != 'A') {
      this.addEventQueue("REST", localSize, null, { 'id': id });
    }

    this.addEventQueue(  "RETR", leafName, null, { 'localPath': localPath, 'remoteEditCallback': callback });

    if (this.integrityMode && this.featXCheck && ascii != 'A') {
      this.addEventQueue(this.featXCheck, '"' + leafName + '"', null, { 'localPath': localPath });
    }

    if (this.timestampsMode && this.featMDTM) {
      this.addEventQueue("MDTM", leafName, null, { 'localPath': localPath });
    }

    var transferInfo = { localPath: localPath, remotePath: remotePath, size: remoteSize, file: remoteFile, transport: 'ftp', type: 'download', ascii: ascii, id: id };
    this.addEventQueue("transferEnd", "", null, transferInfo);

    this.observer.onAddQueue(id, "download", transferInfo, remoteSize);

    this.writeControlWrapper();
  },

  upload : function(localPath, remotePath, resume, localSize, remoteSize, callback, disableTimestampSync, errorCallback, file) {
    ++this.queueID;
    var id = this.connNo + "-" + this.queueID;

    this.addEventQueue("transferBegin", "", null, { id: id });

    this.addEventQueue(  "CWD",  remotePath.substring(0, remotePath.lastIndexOf('/') ? remotePath.lastIndexOf('/') : 1), null, { 'dontUpdateView': true, isUploading: file != null });

    var leafName = remotePath.substring(remotePath.lastIndexOf('/') + 1);

    var ascii    = this.detectAscii(remotePath);

    this.addEventQueue(  "TYPE", ascii);

    this.addEventQueue(  "MODE", this.useCompression && this.featModeZ && ascii != 'A' ? "Z" : "S");  // XXX can't do compression with ascii mode in upload currently

    if (resume && ascii != 'A') {
      this.addEventQueue("SIZE", leafName, null, { 'commandToLookFor': "APPE" });                     // need to do a size check
    }

    if (this.security) {
      this.addEventQueue("PROT", "P");
    }

    this.addEventQueue(  "PASV", null, null, { 'totalBytes' : localSize });

    if (resume && ascii != 'A') {
      this.addEventQueue("APPE", leafName, null, { 'id': id, 'localPath': localPath, 'remoteSize': remoteSize, 'remoteEditCallback': callback, errorCallback: errorCallback });
    } else {
      this.addEventQueue("STOR", leafName, null, { 'localPath': localPath, 'remoteEditCallback': callback, errorCallback: errorCallback });
    }

    if (this.integrityMode && this.featXCheck && ascii != 'A') {
      this.addEventQueue(this.featXCheck, '"' + leafName + '"', null, { 'localPath': localPath });
    }

    if (this.timestampsMode && this.featMDTM && !disableTimestampSync) {
      this.addEventQueue("MDTM", leafName, null, { 'localPath': localPath });
    }

    var transferInfo = { localPath: localPath, remotePath: remotePath, size: localSize, file: file, transport: 'ftp', type: 'upload', ascii: ascii, id: id };
    this.addEventQueue("transferEnd", "", null, transferInfo);

    this.observer.onAddQueue(id, "upload", transferInfo, localSize);

    this.writeControlWrapper();

    return id;
  },

  isListing : function() {                                                       // check queue to see if we're listing
    for (var x = 0; x < this.eventQueue.length; ++x) {
      if (this.eventQueue[x].cmd.indexOf("LIST") != -1) {
        return true;
      }
    }

    return false;
  },

  recoverFromDisaster : function() {                                             // after connection lost, try to restart queue
    if (this.eventQueue.length && this.eventQueue[0].cmd == "goodbye") {
      this.eventQueue.shift();
    }

    if (this.eventQueue.cmd) {
      this.eventQueue = new Array(this.eventQueue);
    }

    while (this.eventQueue.length && (this.eventQueue[0].options.isFxp || this.eventQueue[0].options.isFxpListing)) {
      this.eventQueue.shift();
    }

    if (this.eventQueue.length && (this.eventQueue[0].cmd == "LIST" || this.eventQueue[0].cmd == "LIST2"
                               ||  this.eventQueue[0].cmd == "RETR" || this.eventQueue[0].cmd == "RETR2"
                               ||  this.eventQueue[0].cmd == "REST" || this.eventQueue[0].cmd == "APPE"
                               ||  this.eventQueue[0].cmd == "STOR" || this.eventQueue[0].cmd == "STOR2"
                               ||  this.eventQueue[0].cmd == "PASV" || this.eventQueue[0].cmd == "APPE2"
                               ||  this.eventQueue[0].cmd == "SIZE")) {
      var cmd       = this.eventQueue[0].cmd;
      var parameter = this.eventQueue[0].parameter;
      if (cmd == "LIST2" || cmd == "RETR2" || cmd == "STOR2" || cmd == "APPE2") {
        this.eventQueue[0].cmd = this.eventQueue[0].cmd.substring(0, 4);
      }

      cmd = this.eventQueue[0].cmd;

      if (cmd == "REST") {                                                       // set up resuming for these poor interrupted transfers
        try {
          var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
          file.initWithPath(this.eventQueue[1].options.localPath);

          if (file.fileSize) {
            this.eventQueue[0].parameter = file.fileSize;
          }
        } catch (ex) {
          this.observer.onDebug(ex);
        }
      } else if (cmd == "RETR") {
        try {
          var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
          file.initWithPath(this.eventQueue[0].options.localPath);

          if (file.fileSize) {
            this.unshiftEventQueue("REST", file.fileSize);
          }
        } catch (ex) {
          this.observer.onDebug(ex);
        }
      }

      for (var x = this.trashQueue.length - 1; x >= 0; --x) {                    // take cmds out of the trash and put them back in the eventQueue
        if (this.trashQueue[x].cmd == "TYPE" && (cmd == "STOR" || cmd == "APPE")) {   // more resuming fun - this time for the stor/appe commandds
          let cmdToLookFor = cmd;
          this.unshiftEventQueue("SIZE", parameter, null, { 'commandToLookFor': cmdToLookFor });
        }

        this.eventQueue.unshift(this.trashQueue[x]);
      }
    } else if (this.eventQueue.length && this.eventQueue[0].cmd == "RNTO" && this.trashQueue[this.trashQueue.length - 1].cmd == "RNFR") {
      this.unshiftEventQueue("RNFR", this.trashQueue[this.trashQueue.length - 1].parameter);
    }

    if (this.currentWorkingDir) {
      this.unshiftEventQueue("CWD", this.currentWorkingDir, null, { 'dontUpdateView': true });
      this.currentWorkingDir = "";
    }

    this.trashQueue = new Array();
  },

  // private functions, specific to ftp protocol
  fxp : function(hostPath, destPath, resume, destSize, hostSize, file) {
    ++this.fxpHost.queueID;
    var id = this.fxpHost.connNo + "-" + this.fxpHost.queueID;

    var leafName = hostPath.substring(hostPath.lastIndexOf('/') + 1);

    var self = this;
    var func = function(hostPort) { self.fxpCallback(hostPort, destPath, resume, destSize, id); };

    this.fxpHost.addEventQueue("transferBegin", "", null, { 'id': id, 'isFxp': true });

    this.fxpHost.addEventQueue(  "CWD",  hostPath.substring(0, hostPath.lastIndexOf('/') ? hostPath.lastIndexOf('/') : 1), null, { 'dontUpdateView': true, 'isFxp': true });

    var ascii = this.detectAscii(hostPath);

    this.fxpHost.addEventQueue(  "TYPE", ascii, null, { 'isFxp': true });

    this.fxpHost.addEventQueue(  "MODE", this.useCompression && this.fxpHost.featModeZ && this.featModeZ ? "Z" : "S", null, { 'isFxp': true });

    if (resume && ascii != 'A') {
      this.fxpHost.addEventQueue("REST", destSize, null, { 'isFxp': true });
    }

    this.fxpHost.addEventQueue(  "PASV", "", func, { 'isFxp': true });

    this.fxpHost.addEventQueue(  "RETR", leafName, null, { 'isFxp': true, 'isHost': true });

    var transferInfo = { localPath: hostPath, remotePath: destPath, size: hostSize, file: file, transport: 'fxp', type: 'fxp', ascii: ascii, id: id, isFxp: true };
    this.fxpHost.addEventQueue("transferEnd", "", null, transferInfo);

    this.fxpHost.observer.onAddQueue(id, "download", transferInfo, hostSize);

    this.fxpHost.writeControlWrapper();
  },

  fxpCallback : function(hostPort, destPath, resume, destSize, id) {
    var leafName = destPath.substring(destPath.lastIndexOf('/') + 1);

    this.fxpHost.addEventQueue("transferBegin", "", null, { 'id': id, 'isFxp': true });

    this.addEventQueue(   "CWD",  destPath.substring(0, destPath.lastIndexOf('/') ? destPath.lastIndexOf('/') : 1), null, { 'dontUpdateView': true, 'isFxp': true });

    this.addEventQueue(   "TYPE", this.detectAscii(leafName), null, { 'isFxp': true });

    this.addEventQueue(   "MODE", this.useCompression && this.fxpHost.featModeZ && this.featModeZ ? "Z" : "S", null, { 'isFxp': true });

    if (resume) {
      this.addEventQueue( "REST", destSize, null, { 'isFxp': true });
    }

    this.addEventQueue(   "PORT", hostPort, null, { 'isFxp': true });

    this.addEventQueue(   "STOR", leafName, null, { 'isFxp': true, 'isDest': true });

    this.fxpHost.addEventQueue("transferEnd", "",  null, { transport: 'fxp', type: 'fxp', id: id, isFxp: true });

    this.writeControlWrapper();
  },

  getCert : function() {
    try {
      if (this.security) {
        return this.controlTransport.securityInfo.QueryInterface(Components.interfaces.nsISSLStatusProvider)
                                    .SSLStatus.QueryInterface(Components.interfaces.nsISSLStatus)
                                    .serverCert;
      }
    } catch(ex) {
      this.observer.onDebug(ex);
    }

    return null;
  },

  checkDataTimeout : function(isDownload, id, bytes) {
    if (this.isConnected && this.transferID == id && this.dataSocket) {
      if ((isDownload && bytes == this.dataSocket.dataListener.bytesDownloaded)
      || (!isDownload && bytes == this.dataSocket.progressEventSink.bytesUploaded)) {
        this.resetConnection();
        return;
      }

      var self      = this;
      var nextBytes = isDownload ? self.dataSocket.dataListener.bytesDownloaded : self.dataSocket.progressEventSink.bytesUploaded;
      var func = function() { self.checkDataTimeout(isDownload, id, nextBytes); };
      setTimeout(func, this.networkTimeout * 1000);
    }
  },

  detectAscii : function(path) {                                                 // detect an ascii file - returns "A" or "I"
    if (this.fileMode == 1) {                                                    // binary
      return "I";
    }

    if (this.fileMode == 2) {                                                    // ASCII
      return "A";
    }

    path = path.substring(path.lastIndexOf('.') + 1);                            // manually detect

    for (var x = 0; x < this.asciiFiles.length; ++x) {
      if (this.asciiFiles[x].toLowerCase() == path.toLowerCase()) {
        return "A";
      }
    }

    return "I";
  }
};
