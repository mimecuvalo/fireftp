// if you're actually interested in reusing this class for your app
// it'd be a good idea to get in contact with me, Mime Cuvalo: mimecuvalo@gmail.com

let {LoadContextInfo} = Components.utils.import(
  "resource://gre/modules/LoadContextInfo.jsm", {}
);
let {PrivateBrowsingUtils} = Components.utils.import(
  "resource://gre/modules/PrivateBrowsingUtils.jsm", {}
);

function baseProtocol() {
  this.eventQueue = [];             // commands to be sent
  this.trashQueue = [];             // once commands are read, throw them away here b/c we might have to recycle these if there is an error
  this.listData   = [];             // holds data directory data from the LIST command
}
baseProtocol.prototype = {
  // read-write variables
  protocol             : "",
  observer             : null,
  host                 : "",
  port                 : -1,
  security             : "",
  login                : "",
  password             : "",
  initialPath          : "",             // path we go to first onload
  encoding             : "UTF-8",
  type                 : '',             // what type of FTP connection is this? '' = master connection, 'fxp' = FXP/server-to-server, 'transfer' = transfer-only/slave connection
  connNo               : 1,              // connection #
  timezone             : 0,              // timezone offset
  hiddenMode           : false,          // show hidden files if true
  keepAliveMode        : true,           // keep the connection alive with NOOP's
  networkTimeout       : 30,             // how many seconds b/f we consider the connection to be stale and dead
  proxyHost            : "",
  proxyPort            : 0,
  proxyType            : "",
  reconnectAttempts    : 40,             // how many times we should try reconnecting
  reconnectInterval    : 10,             // number of seconds in b/w reconnect attempts
  reconnectMode        : true,           // true if we want to attempt reconnecting
  sessionsMode         : true,           // true if we're caching directory data
  timestampsMode       : false,          // true if we try to keep timestamps in sync
  useCompression       : true,           // true if we try to do compression
  integrityMode        : true,           // true if we try to do integrity checks
  errorConnectStr      : "Unable to make a connection.  Please try again.", // set to error msg that you'd like to show for a connection error
  errorXCheckFail      : "The transfer of this file was unsuccessful and resulted in a corrupted file. It is recommended to restart this transfer.",  // an integrity check failure
  passNotShown         : "(password not shown)",                            // set to text you'd like to show in place of password
  l10nMonths           : new Array("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), // used in display localized months

  // read-only variables
  transportService     : Components.classes["@mozilla.org/network/socket-transport-service;1"].getService(Components.interfaces.nsISocketTransportService),
  proxyService         : Components.classes["@mozilla.org/network/protocol-proxy-service;1"].getService  (Components.interfaces.nsIProtocolProxyService),
  cacheService         : Components.classes["@mozilla.org/netwerk/cache-storage-service;1"].getService   (Components.interfaces.nsICacheStorageService),
  toUTF8               : Components.classes["@mozilla.org/intl/utf8converterservice;1"].getService       (Components.interfaces.nsIUTF8ConverterService),
  fromUTF8             : Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService   (Components.interfaces.nsIScriptableUnicodeConverter),
  isAttemptingConnect  : false,
  isConnected          : false,          // are we connected?
  isReady              : false,          // are we busy writing/reading the control socket?
  isReconnecting       : false,          // are we attempting a reconnect?
  legitClose           : true,           // are we the ones initiating the close or is it a network error
  reconnectsLeft       : 0,              // how many times more to try reconnecting
  networkTimeoutID     : 0,              // a counter increasing with each read and write
  transferID           : 0,              // a counter increasing with each transfer
  queueID              : 0,              // another counter increasing with each transfer

  controlTransport     : null,
  controlInstream      : null,
  controlOutstream     : null,
  dataSocket           : null,           // only used with (*ahem* lame *ahem*) protocols like FTP that need a second socket

  doingCmdBatch        : false,

  connectedHost        : "",             // name of the host we connect to plus username
  localRefreshLater    : '',
  remoteRefreshLater   : '',
  waitToRefresh        : false,
  currentWorkingDir    : "",             // directory that we're currently, uh, working with
  version              : "",  // version of this class - used to avoid collisions in cache
  remoteMonths         : "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec",      // used in parsing months from list data

  // functions that should be implemented by derived classes
  connect                : function(reconnect) { alert('NOT_IMPLEMENTED'); },
  cleanup                : function(isAbort) { alert('NOT_IMPLEMENTED'); },      // cleanup internal variables
  keepAlive              : function() { alert('NOT_IMPLEMENTED'); },
  isWriteUnnecessary     : function(cmd, parameter) { alert('NOT_IMPLEMENTED'); },
  processWriteCommand    : function(cmd, parameter) { alert('NOT_IMPLEMENTED'); },
  isValidTimeoutCommand  : function(cmd) { alert('NOT_IMPLEMENTED'); },
  getCommandInfo         : function(cmd) { alert('NOT_IMPLEMENTED'); },
  readControl            : function(buffer) { alert('NOT_IMPLEMENTED'); },
  changeWorkingDirectory : function(path, callback) { alert('NOT_IMPLEMENTED'); },
  makeDirectory          : function(path, callback, recursive, errorCallback) { alert('NOT_IMPLEMENTED'); },
  makeBlankFile          : function(path, callback, errorCallback) { alert('NOT_IMPLEMENTED'); },
  remove                 : function(isDirectory, path, callback) { alert('NOT_IMPLEMENTED'); },
  rename                 : function(oldName, newName, callback, isDir, errorCallback) { alert('NOT_IMPLEMENTED'); },
  changePermissions      : function(permissions, path, callback) { alert('NOT_IMPLEMENTED'); },
  custom                 : function(cmd) { alert('NOT_IMPLEMENTED'); },
  list                   : function(path, callback, skipCache, recursive, fxp, eventualGoalPath) { alert('NOT_IMPLEMENTED'); },
  download               : function(remotePath, localPath, remoteSize, resume, localSize, isSymlink, callback, remoteFile) { alert('NOT_IMPLEMENTED'); },
  upload                 : function(localPath, remotePath, resume, localSize, remoteSize, callback, disableTimestampSync, errorCallback, file) { alert('NOT_IMPLEMENTED'); },
  checkDataTimeout       : function(isDownload, id, bytes) { alert('NOT_IMPLEMENTED'); },
  isListing              : function() { alert('NOT_IMPLEMENTED'); },
  recoverFromDisaster    : function() { alert('NOT_IMPLEMENTED'); },

  // optional functions to override
  resetReconnectState : function() { },                                          // called when starting to reconnect, should reset certain internal variables to have clean slate for fresh connection
  sendQuitCommand : function(legitClose) { },                                    // called when shutting down the connection
  sendAbortCommand : function() { },                                             // called when aborting
  doExec : function(cmd, options) { },                                           // execute write command

  // private functions that should not be overridden
  // if a function has a _ prefix, it should be called by corresponding functions (without _ prefix) in derived classes

  setupConnect : function(reconnect) {
    if (!reconnect) {                                                            // this is not a reconnection attempt
      this.isReconnecting = false;
      this.reconnectsLeft = parseInt(this.reconnectAttempts);

      if (!this.reconnectsLeft || this.reconnectsLeft < 1) {
        this.reconnectsLeft = 1;
      }
    }

    if (!this.eventQueue.length || this.eventQueue[0].cmd != "welcome") {
      this.unshiftEventQueue("welcome", "", "");                                 // wait for welcome message first
    }

    ++this.networkTimeoutID;                                                     // just in case we have timeouts from previous connection
    ++this.transferID;
    this.isAttemptingConnect = true;
  },

  onConnected : function() {
    this.isConnected       = true;                                               // good to go
    this.isAttemptingConnect = false;

    this.observer.onConnected();

    this.isReconnecting    = false;
    this.reconnectsLeft    = parseInt(this.reconnectAttempts);                   // setup reconnection settings

    if (!this.reconnectsLeft || this.reconnectsLeft < 1) {
      this.reconnectsLeft = 1;
    }
  },

  disconnect : function() {                                                      // user has requested an explicit disconnect
    this.legitClose = true;                                                      // this close() is ok, don't try to reconnect
    this.isConnected = false;
    this.cleanup();

    if (!(this.eventQueue.length && this.eventQueue[0].cmd == "welcome") || this.protocol == "ssh2") {
      this.sendQuitCommand(true);
    }

    if (this.dataSocket) {
      this.dataSocket.kill();
      this.dataSocket = null;
    }
  },

  onDisconnect : function() {                                                    // called when disconnected
    if ((!this.isConnected && !this.legitClose) || this.isAttemptingConnect) {   // no route to host
      this.observer.onAppendLog(this.errorConnectStr, 'error', "error");
    }

    this.isConnected = false;
    this.isAttemptingConnect = false;

    if (this.dataSocket) {                                                       // kill ftp data socket
      this.dataSocket.kill();
      this.dataSocket = null;
    }

    this.kill();

    this.observer.onDisconnected(!this.legitClose && this.reconnectMode && this.reconnectsLeft > 0);
    this.observer.onIsReadyChange(true);

    if (!this.legitClose && this.reconnectMode) {                                // try reconnecting
      this.resetReconnectState();

      if (this.reconnectsLeft < 1) {
        this.isReconnecting = false;
        if (this.eventQueue.length && this.eventQueue[0].cmd == "welcome") {
          this.eventQueue.shift();
        }
      } else {
        this.isReconnecting = true;

        this.observer.onReconnecting();

        var self = this;
        var func = function() { self.reconnect(); };
        setTimeout(func, this.reconnectInterval * 1000);
      }
    } else {
      this.legitClose = true;
      this.cleanup();
    }
  },

  kill : function() {
    try {
      this.controlInstream.close();
    } catch(ex) {
      this.observer.onDebug(ex);
    }

    try {
      this.controlOutstream.close();
    } catch(ex) {
      this.observer.onDebug(ex);
    }
  },

  _cleanup : function(isAbort) {
    this.eventQueue         = new Array();
    this.trashQueue         = new Array();
    this.currentWorkingDir  = "";
    this.localRefreshLater  = "";
    this.remoteRefreshLater = "";
    this.waitToRefresh      = false;
    this.isReady            = false;

    ++this.networkTimeoutID;
    ++this.transferID;

    this.observer.onClearQueue();
  },

  reconnect : function()  {                                                      // ahhhh! our precious connection has been lost,
    if (!this.isReconnecting) {                                                  // must...get it...back...our...precious
      return;
    }

    --this.reconnectsLeft;

    this.connect(true);
  },

  abort : function(forceKill) {
    this.isReconnecting     = false;

    if (this.dataSocket) {
      this.dataSocket.progressEventSink.bytesTotal = 0;                          // stop uploads
      this.dataSocket.dataListener.bytesTotal      = 0;                          // stop downloads
    }

    this.cleanup(true);

    if (!this.isConnected) {
      return;
    }

    if (forceKill) {
      this.sendAbortCommand();
    }

    //XXX this.writeControl("ABOR");                                             // ABOR does not seem to stop the connection in most cases
    if (this.dataSocket) {                                                       // so this is a more direct approach
      this.dataSocket.kill();
      this.dataSocket = null;
    } else {
      this.isReady = true;
    }

    this.addEventQueue("aborted");

    this.observer.onAbort();
  },

  cancel : function(forceKill) {                                                 // cancel current transfer
    if (this.dataSocket) {
      this.dataSocket.progressEventSink.bytesTotal = 0;                          // stop uploads
      this.dataSocket.dataListener.bytesTotal      = 0;                          // stop downloads
    }

    this.trashQueue = new Array();

    if (forceKill) {
      this.sendAbortCommand();
    }

    //XXX this.writeControl("ABOR");                                             // ABOR does not seem to stop the connection in most cases
    var dId;
    if (this.dataSocket && this.isConnected) {                                   // so this is a more direct approach
      this.dataSocket.kill();
      dId = this.dataSocket.id;
      this.dataSocket = null;
    }

    if (this.transferProgress) {
      dId = this.transferProgress.id;
      this.transferProgress.id = '';
      this.transferProgress.bytesTotal = 0;
    }

    for (var x = 0; x < this.eventQueue.length; ++x) {
      if (this.eventQueue[x].cmd == "transferEnd" && dId == this.eventQueue[x].options.id) {
        this.eventQueue.splice(0, x + 1);
        this.observer.onRemoveQueue(dId);
        break;
      }
    }

    if (this.isConnected && this.protocol != "ssh2") {
      this.unshiftEventQueue("aborted");
    }
  },

  loginAccepted : function() {
    if (this.legitClose) {
      this.observer.onWelcomed();
    }

    var newConnectedHost = this.login + "@" + this.host;

    this.observer.onLoginAccepted(newConnectedHost != this.connectedHost);

    if (newConnectedHost != this.connectedHost) {
      this.legitClose = true;
    }

    this.connectedHost = newConnectedHost;                                       // switching to a different host or different login

    if (!this.legitClose) {
      this.recoverFromDisaster();                                                // recover from previous disaster
      return false;
    }

    this.legitClose   = false;

    return true;                                                                 // proceed normally
  },

  loginDenied : function(buffer) {
    if (this.type == 'transfer') {
      this.observer.onLoginDenied();
    }

    this.cleanup();                                                              // login failed, cleanup variables

    if (this.type != 'transfer' && this.type != 'bad') {
      this.observer.onError(buffer);
    }

    this.isConnected = false;

    this.kill();

    if (this.type == 'transfer') {
      this.type = 'bad';
    }

    if (this.type != 'transfer' && this.type != 'bad') {
      var self = this;
      var func = function() { self.observer.onLoginDenied(); };
      setTimeout(func, 0);
    }
  },

  checkTimeout : function(id, cmd) {
    if (this.isConnected && this.networkTimeoutID == id && this.eventQueue.length && this.eventQueue[0].cmd.indexOf(cmd) != -1) {
      this.resetConnection();
    }
  },

  resetConnection : function() {
    this.legitClose = false;                                                     // still stuck on a command so, try to restart the connection the hard way

    this.sendQuitCommand();

    if (this.dataSocket) {
      this.dataSocket.kill();
      this.dataSocket = null;
    }

    this.kill();
  },

  addEventQueue : function(cmd, parameter, callback, options, exec) {            // this just creates a new queue item
    this.eventQueue.push(   { cmd: cmd, parameter: parameter || '', callback: callback || null, options: options || {}, exec: exec || null });
  },

  unshiftEventQueue : function(cmd, parameter, callback, options, exec) {        // ditto
    this.eventQueue.unshift({ cmd: cmd, parameter: parameter || '', callback: callback || null, options: options || {}, exec: exec || null });
  },

  beginCmdBatch : function() {
    this.doingCmdBatch = true;
  },

  writeControlWrapper : function() {
    if (!this.doingCmdBatch) {
      this.writeControl();
    }
  },

  endCmdBatch : function() {
    this.doingCmdBatch = false;
    this.writeControl();
  },

  refresh : function() {
    var stillWorking = false;
    for (var y = 0; y < gMaxCon; ++y) {
      if (gConnections[y].eventQueue.length) {
        stillWorking = true;
      }
    }
    if (this.waitToRefresh || stillWorking) {
      var self = this;
      var func = function() { self.refresh(); };
      setTimeout(func, 1000);
      return;
    } else if (this.eventQueue.length) {
      return;
    }

    if (this.localRefreshLater) {
      var dir                 = new String(this.localRefreshLater);
      this.localRefreshLater  = "";

      this.observer.onShouldRefresh(true, false, dir);
    }

    if (this.remoteRefreshLater) {
      var dir                 = new String(this.remoteRefreshLater);
      this.remoteRefreshLater = "";

      this.observer.onShouldRefresh(false, true, dir);
    }
  },

  writeControl : function(cmd) {
    try {
      if (!this.isReady || (!cmd && !this.eventQueue.length)) {
        return;
      }

      var parameter;
      var callback;
      var options;
      var exec;

      if (!cmd) {
        cmd        = this.eventQueue[0].cmd;
        parameter  = this.eventQueue[0].parameter;
        callback   = this.eventQueue[0].callback;
        options    = this.eventQueue[0].options;
        exec       = this.eventQueue[0].exec;
      }

      if (cmd == "custom") {
        cmd       = parameter;
        parameter = "";
      }

      var redudantCommand = this.isWriteUnnecessary(cmd, parameter);

      while (cmd == "aborted" || cmd == "goodbye" || cmd == "transferBegin" || cmd == "transferEnd" || redudantCommand) {
        if (redudantCommand) {
          this.trashQueue.push(this.eventQueue[0]);
        }

        if (cmd == "transferEnd") {
          this.observer.onRemoveQueue(options.id);
        }

        this.eventQueue.shift();

        if (this.eventQueue.length) {
          cmd        = this.eventQueue[0].cmd;
          parameter  = this.eventQueue[0].parameter;
          callback   = this.eventQueue[0].callback;
          options    = this.eventQueue[0].options;
          exec       = this.eventQueue[0].exec;
        } else {
          return;
        }

        redudantCommand = this.isWriteUnnecessary(cmd, parameter);
      }

      this.isReady = false;

      this.observer.onIsReadyChange(false);

      var processedCommands = this.processWriteCommand(cmd, parameter);
      cmd = processedCommands.cmd;
      parameter = processedCommands.parameter;

      var outputData = cmd + (parameter ? (' ' + parameter) : '') + "\r\n";      // le original bug fix! - thanks to devin

      if (exec) {
        var success = this.doExec(exec, options);
        if (!success) {
          return;
        }
      } else {
        try {
          outputData   = this.fromUTF8.ConvertFromUnicode(outputData) + this.fromUTF8.Finish();
        } catch (ex) {
          this.observer.onDebug(ex);
        }

        this.controlOutstream.write(outputData, outputData.length);                // write!
      }

      var self = this;
      if (this.isValidTimeoutCommand(cmd)) {
        ++this.networkTimeoutID;                                                   // this checks for timeout
        var currentTimeout = this.networkTimeoutID;
        var func           = function() { self.checkTimeout(currentTimeout, cmd); };
        setTimeout(func, this.networkTimeout * 1000);
      }

      var commandInfo = this.getCommandInfo(cmd);
      if (commandInfo.isTransferCmd) {
        ++this.transferID;
        var currentId    = this.transferID;
        var func         = function() { self.checkDataTimeout(commandInfo.isDownload, currentId, 0); };
        setTimeout(func, this.networkTimeout * 1000);
      }

      outputData = cmd + (parameter ? (' ' + parameter) : '');                   // write it out to the log

      if (commandInfo.skipLog) {
        // do nothing
      } else if (!commandInfo.isPrivate) {
        this.observer.onAppendLog("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" + outputData, 'output', "info");
      } else {
        this.observer.onAppendLog("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" + cmd + " " + this.passNotShown, 'output', "info");
      }

    } catch(ex) {
      this.observer.onDebug(ex);
      this.observer.onError(this.errorConnectStr);
    }
  },

  nextCommand : function() {
    this.isReady = true;

    this.observer.onIsReadyChange(true);

    if (this.eventQueue.length && this.eventQueue[0].cmd != "welcome") {         // start the next command
      this.writeControl();
    } else {
      this.refresh();
    }
  },

  handleCWDResponse : function(success, cmd, parameter, callback, options, exec, buffer) {
    if (success) {
      this.currentWorkingDir = parameter;

      this.observer.onChangeDir(parameter, options.dontUpdateView);              // else navigate to the directory

      if (callback) {
        callback(true);
      }
    } else {                                                                     // if it's not a directory
      if (this.type != 'transfer' && options.isUploading) {
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

      if (callback) {
        callback(false);
      } else if (this.type == 'transfer') {
        if (buffer) {
          this.observer.onDebug(buffer);
        }
        this.unshiftEventQueue(cmd, parameter, callback, options, exec);
        this.makeDirectory(parameter, "", true);
      } else {
        this.observer.onDirNotFound(buffer);

        this.observer.onError(buffer);
      }
    }
  },

  parseListData : function(data, path, skipEncoding) {
    /* Unix style:                     drwxr-xr-x  1 user01 ftp  512    Jan 29 23:32 prog
     * Alternate Unix style:           drwxr-xr-x  1 user01 ftp  512    Jan 29 1997  prog
     * Alternate Unix style:           drwxr-xr-x  1 1      1    512    Jan 29 23:32 prog
     * SunOS style:                    drwxr-xr-x+ 1 1      1    512    Jan 29 23:32 prog
     * A symbolic link in Unix style:  lrwxr-xr-x  1 user01 ftp  512    Jan 29 23:32 prog -> prog2000
     * AIX style:                      drwxr-xr-x  1 user01 ftp  512    05 Nov 2003  prog
     * Novell style:                   drwxr-xr-x  1 user01      512    Jan 29 23:32 prog
     * Weird style:                    drwxr-xr-x  1 user5424867        Jan 29 23:32 prog, where 5424867 is the size
     * Weird style 2:                  drwxr-xr-x  1 user01 anon5424867 Jan 11 12:48 prog, where 5424867 is the size
     * MS-DOS style:                   01-29-97 11:32PM <DIR> prog
     * OS/2 style:                     0           DIR 01-29-97  23:32  PROG
     * OS/2 style:                     2243        RA  04-05-103 00:22  PJL
     * OS/2 style:                     60              11-18-104 06:54  chkdsk.log
     *
     * MLSD style: type=file;size=6106;modify=20070223082414;UNIX.mode=0644;UNIX.uid=32257;UNIX.gid=32259;unique=808g154c727; prog
     *             type=dir;sizd=4096;modify=20070218021044;UNIX.mode=0755;UNIX.uid=32257;UNIX.gid=32259;unique=808g1550003; prog
     *             type=file;size=4096;modify=20070218021044;UNIX.mode=07755;UNIX.uid=32257;UNIX.gid=32259;unique=808g1550003; prog
     *             type=OS.unix=slink:/blah;size=4096;modify=20070218021044;UNIX.mode=0755;UNIX.uid=32257;UNIX.gid=32259;unique=808g1550003; prog
     */

    if (!skipEncoding) {
      try {
        data = this.toUTF8.convertStringToUTF8(data, this.encoding, 1);
      } catch (ex) {
        this.observer.onDebug(ex);
      }
    }

    this.observer.onDebug(data.replace(/</g, '&lt;').replace(/>/g, '&gt;'), "DEBUG");

    var items   = data.replace(/\r\n/g, "\n").split("\n");
    items       = items.filter(this.removeBlanks);
    var curDate = new Date();

    if (items.length) {                                                          // some ftp servers send 'count <number>' or 'total <number>' first
      var firstLine = items[0].toLowerCase();
      if (firstLine.indexOf("count") == 0 || firstLine.indexOf("total") == 0 || firstLine.indexOf("listing directory") == 0 || (!this.featMLSD && items[0].split(" ").filter(this.removeBlanks).length == 2)) {
        items.shift();                                                           // could be in german or croatian or what have you
      }
    }

    for (var x = 0; x < items.length; ++x) {
      try {
        if (!items[x]) {                                                           // some servers put in blank lines b/w entries, aw, for cryin' out loud
          items.splice(x, 1);
          --x;
          continue;
        }

        items[x] = items[x].replace(/^\s+/, "");                                   // @*$% - some servers put blanks in front, do trimming on front

        var temp = items[x];                                                       // account for collisions:  drwxr-xr-x1017 user01

        if (!this.featMLSD) {
          if (!parseInt(items[x].charAt(0)) && items[x].charAt(0) != '0' && items[x].charAt(10) == '+') {     // drwxr-xr-x+ - get rid of the plus sign
            items[x] = this.setCharAt(items[x], 10, ' ');
          }

          if (!parseInt(items[x].charAt(0)) && items[x].charAt(0) != '0' && items[x].charAt(10) != ' ') {     // this is mimicked below if weird style
            items[x] = items[x].substring(0, 10) + ' ' + items[x].substring(10, items[x].length);
          }

          items[x]   = items[x].split(" ").filter(this.removeBlanks);
        }

        if (this.featMLSD) {                                                       // MLSD-standard style
          var newItem    = { permissions : "----------",
                             hardLink    : "",
                             user        : "",
                             group       : "",
                             fileSize    : "0",
                             date        : "",
                             leafName    : "",
                             isDir       : false,
                             isDirectory : function() { return this.isDir },
                             isSymlink   : function() { return this.symlink != "" },
                             symlink     : "",
                             path        : "" };

          var pathname     = items[x].split("; ");
          newItem.leafName = '';
          for (var y = 1; y < pathname.length; ++y) {
            newItem.leafName += (y == 1 ? '' : '; ') + pathname[y];
          }

          // some servers place full path for the filename...arrrgh /users/www/blah has to be just 'blah'
          newItem.leafName = newItem.leafName.substring(newItem.leafName.lastIndexOf("/") + 1);

          newItem.path     = this.constructPath(path, newItem.leafName);

          items[x] = pathname[0];
          items[x] = items[x].split(";");
          var skip = false;

          for (var y = 0; y < items[x].length; ++y) {
            if (!items[x][y]) {
              continue;
            }

            var fact = items[x][y].split('=');
            if (fact.length < 2 || !fact[0] || !fact[1]) {
              continue;
            }

            var factName = fact[0].toLowerCase();
            var factVal  = fact[1];

            switch (factName) {
              case "type":
                if (factVal == "pdir" || factVal == "cdir") {
                  skip = true;
                } else if (factVal == "dir") {
                  newItem.isDir = true;
                  newItem.permissions = this.setCharAt(newItem.permissions, 0, 'd');
                } else if (items[x][y].substring(5).indexOf("OS.unix=slink:") == 0) {
                  newItem.symlink = items[x][y].substring(19);
                  newItem.permissions = this.setCharAt(newItem.permissions, 0, 'l');
                } else if (factVal != "file") {
                  skip = true;
                }
                break;
              case "size":
              case "sizd":
                newItem.fileSize = factVal;
                break;
              case "modify":
                var dateString = factVal.substr(0, 4) + " " + factVal.substr(4,  2) + " " + factVal.substr(6,  2) + " "
                               + factVal.substr(8, 2) + ":" + factVal.substr(10, 2) + ":" + factVal.substr(12, 2) + " GMT";
                var zeDate = new Date(dateString);
                zeDate.setMinutes(zeDate.getMinutes() + this.timezone);
                var timeOrYear = new Date() - zeDate > 15600000000 ? zeDate.getFullYear()    // roughly 6 months
                               : this.zeroPadTime(zeDate.getHours()) + ":" + this.zeroPadTime(zeDate.getMinutes());
                newItem.date = this.l10nMonths[zeDate.getMonth()] + ' ' + zeDate.getDate() + ' ' + timeOrYear;
                newItem.lastModifiedTime = zeDate.getTime();
                break;
              case "unix.mode":
                var offset = factVal.length == 5 ? 1 : 0;
                var sticky = this.zeroPad(parseInt(factVal[0 + offset]).toString(2));
                var owner  = this.zeroPad(parseInt(factVal[1 + offset]).toString(2));
                var group  = this.zeroPad(parseInt(factVal[2 + offset]).toString(2));
                var pub    = this.zeroPad(parseInt(factVal[3 + offset]).toString(2));
                newItem.permissions = this.setCharAt(newItem.permissions, 1, owner[0]  == '1' ? 'r' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 2, owner[1]  == '1' ? 'w' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 3, sticky[0] == '1' ? (owner[2] == '1' ? 's' : 'S')
                                                                                              : (owner[2] == '1' ? 'x' : '-'));
                newItem.permissions = this.setCharAt(newItem.permissions, 4, group[0]  == '1' ? 'r' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 5, group[1]  == '1' ? 'w' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 6, sticky[1] == '1' ? (group[2] == '1' ? 's' : 'S')
                                                                                              : (group[2] == '1' ? 'x' : '-'));
                newItem.permissions = this.setCharAt(newItem.permissions, 7, pub[0]    == '1' ? 'r' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 8, pub[1]    == '1' ? 'w' : '-');
                newItem.permissions = this.setCharAt(newItem.permissions, 9, sticky[2] == '1' ? (pub[2]   == '1' ? 't' : 'T')
                                                                                              : (pub[2]   == '1' ? 'x' : '-'));
                break;
              case "unix.uid":
                newItem.user = factVal;
                break;
              case "unix.gid":
                newItem.group = factVal;
                break;
              default:
                break;
            }

            if (skip) {
              break;
            }
          }

          if (skip) {
            items.splice(x, 1);
            --x;
            continue;
          }

          items[x] = newItem;
        } else if (!parseInt(items[x][0].charAt(0)) && items[x][0].charAt(0) != '0')  {   // unix style - so much simpler with you guys
          var offset = 0;

          if (items[x][3].search(this.remoteMonths) != -1 && items[x][5].search(this.remoteMonths) == -1) {
            var weird = temp;                                                      // added to support weird servers

            if (weird.charAt(10) != ' ') {                                         // same as above code
              weird = weird.substring(0, 10) + ' ' + weird.substring(10, weird.length);
            }

            var weirdIndex = 0;

            for (var y = 0; y < items[x][2].length; ++y) {
              if (parseInt(items[x][2].charAt(y))) {
                weirdIndex = weird.indexOf(items[x][2]) + y;
                break;
              }
            }

            weird    = weird.substring(0, weirdIndex) + ' ' + weird.substring(weirdIndex, weird.length);

            items[x] = weird.split(" ").filter(this.removeBlanks);
          }

          if (items[x][4].search(this.remoteMonths) != -1 && !parseInt(items[x][3].charAt(0))) {
            var weird = temp;                                                      // added to support 'weird 2' servers, oy vey

            if (weird.charAt(10) != ' ') {                                         // same as above code
              weird = weird.substring(0, 10) + ' ' + weird.substring(10, weird.length);
            }

            var weirdIndex = 0;

            for (var y = 0; y < items[x][3].length; ++y) {
              if (parseInt(items[x][3].charAt(y))) {
                weirdIndex = weird.indexOf(items[x][3]) + y;
                break;
              }
            }

            weird    = weird.substring(0, weirdIndex) + ' ' + weird.substring(weirdIndex, weird.length);

            items[x] = weird.split(" ").filter(this.removeBlanks);
          }

          if (items[x][4].search(this.remoteMonths) != -1) {                       // added to support novell servers
            offset   = 1;
          }

          var index = 0;
          for (var y = 0; y < 7 - offset; ++y) {
            index = temp.indexOf(items[x][y], index) + items[x][y].length + 1;
          }

          var name    = temp.substring(temp.indexOf(items[x][7 - offset], index) + items[x][7 - offset].length + 1, temp.length);
          name        = name.substring(name.search(/[^\s]/));
          var symlink = "";

          if (items[x][0].charAt(0) == 'l') {
            symlink = name;

            name    = name.substring(0, name.indexOf("->") - 1);
            symlink = symlink.substring(symlink.indexOf("->") + 3);
          }

          name             = (name.lastIndexOf('/') == -1 ? name : name.substring(name.lastIndexOf('/') + 1));
          var remotepath   = this.constructPath(path, name);
          var month;

          var rawDate    = items[x][6 - offset];

          if (items[x][6].search(this.remoteMonths) != -1) {                       // added to support aix servers
            month        = this.remoteMonths.search(items[x][6 - offset]) / 4;
            rawDate      = items[x][5 - offset];
          } else {
            month        = this.remoteMonths.search(items[x][5 - offset]) / 4;
          }

          var timeOrYear;
          var curDate    = new Date();
          var currentYr  = curDate.getMonth() < month ? curDate.getFullYear() - 1 : curDate.getFullYear();
          var rawYear    = items[x][7 - offset].indexOf(':') != -1 ? currentYr            : parseInt(items[x][7 - offset]);
          var rawTime    = items[x][7 - offset].indexOf(':') != -1 ? items[x][7 - offset] : "00:00";

          rawTime        = rawTime.split(":");

          for (var y = 0; y < rawTime.length; ++y) {
            rawTime[y]   = parseInt(rawTime[y], 10);
          }

          var parsedDate = new Date(rawYear, month, rawDate, rawTime[0], rawTime[1]);  // month-day-year format
          parsedDate.setMinutes(parsedDate.getMinutes() + this.timezone);

          if (new Date() - parsedDate > 15600000000) {                             // roughly 6 months
            timeOrYear   = parsedDate.getFullYear();
          } else {
            timeOrYear   = this.zeroPadTime(parsedDate.getHours()) + ":" + this.zeroPadTime(parsedDate.getMinutes());
          }

          month          = this.l10nMonths[parsedDate.getMonth()];
          items[x]       = { permissions : items[x][0],
                             hardLink    : items[x][1],
                             user        : items[x][2],
                             group       : (offset ? "" : items[x][3]),
                             fileSize    : items[x][4 - offset],
                             date        : month + ' ' + parsedDate.getDate() + ' ' + timeOrYear,
                             leafName    : name,
                             isDir       : items[x][0].charAt(0) == 'd',
                             isDirectory : function() { return this.isDir },
                             isSymlink   : function() { return this.symlink != "" },
                             symlink     : symlink,
                             path        : remotepath };

        } else if (items[x][0].indexOf('-') == -1) {                               // os/2 style
          var offset = 0;

          if (items[x][2].indexOf(':') != -1) {                                    // if "DIR" and "A" are missing
            offset   = 1;
          }

          var rawDate    = items[x][2 - offset].split("-");
          var rawTime    = items[x][3 - offset];
          var timeOrYear = rawTime;
          rawTime        = rawTime.split(":");

          for (var y = 0; y < rawDate.length; ++y) {
            rawDate[y]   = parseInt(rawDate[y], 10);                               // leading zeros are treated as octal so pass 10 as base argument
          }

          for (var y = 0; y < rawTime.length; ++y) {
            rawTime[y]   = parseInt(rawTime[y], 10);
          }

          rawDate[2]     = rawDate[2] + 1900;                                      // ah, that's better
          var parsedDate = new Date(rawDate[2], rawDate[0] - 1, rawDate[1], rawTime[0], rawTime[1]);  // month-day-year format
          parsedDate.setMinutes(parsedDate.getMinutes() + this.timezone);

          if (new Date() - parsedDate > 15600000000) {                             // roughly 6 months
            timeOrYear   = parsedDate.getFullYear();
          } else {
            timeOrYear   = this.zeroPadTime(parsedDate.getHours()) + ":" + this.zeroPadTime(parsedDate.getMinutes());
          }

          var month      = this.l10nMonths[parsedDate.getMonth()];
          var name       = temp.substring(temp.indexOf(items[x][3 - offset]) + items[x][3 - offset].length + 1, temp.length);
          name           = name.substring(name.search(/[^\s]/));
          name           = (name.lastIndexOf('/') == -1 ? name : name.substring(name.lastIndexOf('/') + 1));
          items[x]       = { permissions : items[x][1] == "DIR" ? "d---------" : "----------",
                             hardLink    : "",
                             user        : "",
                             group       : "",
                             fileSize    : items[x][0],
                             date        : month + ' ' + parsedDate.getDate() + ' ' + timeOrYear,
                             leafName    : name,
                             isDir       : items[x][1] == "DIR",
                             isDirectory : function() { return this.isDir },
                             isSymlink   : function() { return this.symlink != "" },
                             symlink     : "",
                             path        : this.constructPath(path, name) };

        } else {                                                                   // ms-dos style
          var rawDate    = items[x][0].split("-");
          var amPm       = items[x][1].substring(5, 7);                            // grab PM or AM
          var rawTime    = items[x][1].substring(0, 5);                            // get rid of PM, AM
          var timeOrYear = rawTime;
          rawTime        = rawTime.split(":");

          for (var y = 0; y < rawDate.length; ++y) {
            rawDate[y]   = parseInt(rawDate[y], 10);
          }

          for (var y = 0; y < rawTime.length; ++y) {
            rawTime[y]   = parseInt(rawTime[y], 10);
          }

          rawTime[0] = rawTime[0] == 12 && amPm == "AM" ? 0 : (rawTime[0] < 12 && amPm == "PM" ? rawTime[0] + 12 : rawTime[0]);

          if (rawDate[2] < 70) {                                                   // assuming you didn't have some files left over from 1904
            rawDate[2]   = rawDate[2] + 2000;                                      // ah, that's better
          } else {
            rawDate[2]   = rawDate[2] + 1900;
          }

          var parsedDate = new Date(rawDate[2], rawDate[0] - 1, rawDate[1], rawTime[0], rawTime[1]);  // month-day-year format
          parsedDate.setMinutes(parsedDate.getMinutes() + this.timezone);

          if (new Date() - parsedDate > 15600000000) {                             // roughly 6 months
            timeOrYear   = parsedDate.getFullYear();
          } else {
            timeOrYear   = this.zeroPadTime(parsedDate.getHours()) + ":" + this.zeroPadTime(parsedDate.getMinutes());
          }

          var month      = this.l10nMonths[parsedDate.getMonth()];
          var name       = temp.substring(temp.indexOf(items[x][2], temp.indexOf(items[x][1]) + items[x][1].length + 1)
                           + items[x][2].length + 1, temp.length);
          name           = name.substring(name.search(/[^\s]/));
          name           = (name.lastIndexOf('/') == -1 ? name : name.substring(name.lastIndexOf('/') + 1));
          items[x]       = { permissions : items[x][2] == "<DIR>" ? "d---------" : "----------",
                             hardLink    : "",
                             user        : "",
                             group       : "",
                             fileSize    : items[x][2] == "<DIR>" ? '0' : items[x][2],
                             date        : month + ' ' + parsedDate.getDate() + ' ' + timeOrYear,
                             leafName    : name,
                             isDir       : items[x][2] == "<DIR>",
                             isDirectory : function() { return this.isDir },
                             isSymlink   : function() { return this.symlink != "" },
                             symlink     : "",
                             path        : this.constructPath(path, name) };
        }

        if (!items[x].lastModifiedTime) {
          var dateTemp  = items[x].date;                                             // this helps with sorting by date
          var dateMonth = dateTemp.substring(0, 3);
          var dateIndex = this.l10nMonths.indexOf(dateMonth);
          dateTemp      = this.remoteMonths.substr(dateIndex * 4, 3) + dateTemp.substring(3);

          if (items[x].date.indexOf(':') != -1) {
            dateTemp = dateTemp + ' ' + (curDate.getFullYear() - (curDate.getMonth() < dateIndex ? 1 : 0));
          }

          items[x].lastModifiedTime = Date.parse(dateTemp);
        }

        items[x].fileSize = parseInt(items[x].fileSize);

        items[x].parent = { path: items[x].path.substring(0, items[x].path.lastIndexOf('/') ? items[x].path.lastIndexOf('/') : 1) };
      } catch (ex) {
        this.observer.onError(ex + items[x].toSource());
        items.splice(x, 1);
        --x;
      }
    }

    var directories = new Array();                                               // sort directories to the top
    var files       = new Array();

    for (var x = 0; x < items.length; ++x) {
      if (!this.hiddenMode && items[x].leafName.charAt(0) == ".") {              // don't show hidden files
        continue;
      }

      items[x].isHidden = items[x].leafName.charAt(0) == ".";

      items[x].leafName = items[x].leafName.replace(/[\\\/]/g, '');              // scrub out / or \, a security vulnerability if file tries to do ..\..\blah.txt
      items[x].path     = this.constructPath(path, items[x].leafName);           // thanks to Tan Chew Keong for the heads-up

      if (items[x].leafName == "." || items[x].leafName == "..") {               // get rid of "." or "..", this can screw up things on recursive deletions
        continue;
      }

      if (items[x].isDirectory()) {
        directories.push(items[x]);
      } else {
        files.push(items[x]);
      }
    }

    items = directories.concat(files);

    if (this.sessionsMode) {
      try {                                                                      // put in cache
        var storage = this.cacheService.memoryCacheStorage(
          // Note: make sure |window| is the window you want
          LoadContextInfo.fromLoadContext(PrivateBrowsingUtils.privacyContextFromWindow(window, false)), false
        );
        storage.asyncOpenURI(
          this.makeURI(this.protocol + "://" + this.version + this.connectedHost + path),
          "",
          Components.interfaces.nsICacheStorage.OPEN_TRUNCATE,
          {
            onCacheEntryCheck: function (entry, appcache) {
              return Components.interfaces.nsICacheEntryOpenCallback.ENTRY_WANTED;
            },
            onCacheEntryAvailable: function (cacheDesc, isnew, appcache, status) {
              try {
                if (cacheDesc) {
                  var cacheOut     = cacheDesc.openOutputStream(0);
                  var cacheData    = unescape(encodeURIComponent(JSON.stringify(items)));
                  cacheOut.write(cacheData, cacheData.length);
                  cacheOut.close();
                }
              } catch (ex) {}
            }
          });
      } catch (ex) {
        this.observer.onDebug(ex);
      }
    }

    return items;
  },

  cacheHit : function(path, callback) {
    try {                                                                        // check the cache first
      var storage = this.cacheService.memoryCacheStorage(
        // Note: make sure |window| is the window you want
        LoadContextInfo.fromLoadContext(PrivateBrowsingUtils.privacyContextFromWindow(window, false)), false
      );
      var self = this;
      storage.asyncOpenURI(
        this.makeURI(this.protocol + "://" + this.version + this.connectedHost + path),
        "",
        Components.interfaces.nsICacheStorage.OPEN_PRIORITY,
        {
          onCacheEntryCheck: function (entry, appcache) {
            return Components.interfaces.nsICacheEntryOpenCallback.ENTRY_WANTED;
          },
          onCacheEntryAvailable: function (cacheDesc, isNew, appcache, status) {
            if (isNew) {
              callback(false);
              return;
            }

            try {
              var cacheIn       = cacheDesc.openInputStream(0);
              var cacheInstream = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
              cacheInstream.setInputStream(cacheIn);

              self.listData     = cacheInstream.readBytes(cacheInstream.available());
              self.listData     = JSON.parse(decodeURIComponent(escape(self.listData)));
              for (var x = 0; x < self.listData.length; ++x) {                         // these functions get lost when encoding in JSON
                self.listData[x].isDirectory = function() { return this.isDir };
                self.listData[x].isSymlink   = function() { return this.symlink != "" };
              }
              cacheInstream.close();

              self.observer.onDebug(self.listData.toSource().replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/, {/g, ',\n{')
                           .replace(/, isDirectory:\(function \(\) { return this.isDir }\), isSymlink:\(function \(\) { return this.symlink != "" }\)/g, ''),
                                                   "DEBUG-CACHE");

              callback(true);
            } catch(ex) {
              callback(false);
            }
          }
        }
      );
    } catch (ex) {
      callback(false);
    }
  },

  removeCacheEntry : function(path) {
    try {
      var storage = this.cacheService.memoryCacheStorage(
        // Note: make sure |window| is the window you want
        LoadContextInfo.fromLoadContext(PrivateBrowsingUtils.privacyContextFromWindow(window, false)), false
      );
      storage.asyncOpenURI(
        this.makeURI(this.protocol + "://" + this.version + this.connectedHost + path),
        "",
        Components.interfaces.nsICacheStorage.OPEN_PRIORITY,
        {
          onCacheEntryCheck: function (entry, appcache) {
            return Components.interfaces.nsICacheEntryOpenCallback.ENTRY_WANTED;
          },
          onCacheEntryAvailable: function (cacheDesc, isnew, appcache, status) {
            if (cacheDesc) {
              cacheDesc.asyncDoom(null);
            }
          }
        });
    } catch (ex) {
      this.observer.onDebug(ex);
    }
  },

  constructPath : function(parent, leafName) {
    return parent + (parent.charAt(parent.length - 1) != '/' ? '/' : '') + leafName;
  },

  removeBlanks : function(element, index, array) {
    return element;
  },

  zeroPad : function(str) {
    return str.length == 3 ? str : (str.length == 2 ? '0' + str : '00' + str);
  },

  zeroPadTime : function(num) {
    num = num.toString();
    return num.length == 2 ? num : '0' + num;
  },

  setCharAt : function(str, index, ch) {                                         // how annoying
    return str.substr(0, index) + ch + str.substr(index + 1);
  },

  setEncoding : function(encoding) {
    try {
      this.fromUTF8.charset = encoding;
      this.encoding         = encoding;
    } catch (ex) {
      this.fromUTF8.charset = "UTF-8";
      this.encoding         = "UTF-8";
    }
  },

  binaryToHex : function(input) {                                                // borrowed from nsUpdateService.js
    var result = "";

    for (var i = 0; i < input.length; ++i) {
      var hex = input.charCodeAt(i).toString(16);

      if (hex.length == 1) {
        hex = "0" + hex;
      }

      result += hex;
    }

    return result;
  },
  makeURI : function(aURL, aOriginCharset, aBaseURI) {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    return ioService.newURI(aURL, aOriginCharset, aBaseURI);
  }
};

function setProtocol(protocol) {
  var protocolMap = { 'ftp'  : { 'transport': ftpMozilla,  'observer': ftpObserver },
                      'ssh2' : { 'transport': ssh2Mozilla, 'observer': ssh2Observer } };

  gConnections = new Array();
  for (var x = 0; x < gMaxCon; ++x) {
    gConnections.push(new protocolMap[protocol].transport(x ? new transferObserver(x + 1) : new protocolMap[protocol].observer()));
    gConnections[x].type            = x ? 'transfer' : '';
    gConnections[x].connNo          = x + 1;
    gConnections[x].errorConnectStr = gStrbundle.getString("errorConn");
    gConnections[x].errorXCheckFail = gStrbundle.getString("errorXCheckFail");
    gConnections[x].passNotShown    = gStrbundle.getString("passNotShown");
    gConnections[x].l10nMonths      = gStrbundle.getString("months").split("|");
    gConnections[x].version         = gVersion;
  }

  gConnection = gConnections[0];

  readPreferences();
}
