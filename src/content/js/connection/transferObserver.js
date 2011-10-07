function transferObserver(connNo) {
  inherit(this, new baseObserver());
  this.connNo = connNo;
}

transferObserver.prototype = {
  onConnectionRefused : function()                   {
    this.transferQueue();
  },
  onConnected         : function()                   { },
  onWelcomed          : function()                   { },
  onLoginAccepted     : function(newHost)            { },
  onLoginDenied       : function()                   {
    this.transferQueue();
  },
  onDisconnected      : function()                   { },
  onReconnecting      : function()                   { },
  onAbort             : function()                   { },
  onError             : function(msg)                { error("[" + this.connNo + "] " + msg, false, false); },
  onDebug             : function(msg, level)         { debug("[" + this.connNo + "] " + msg, level, false); },
  onAppendLog         : function(msg, css, type)     { appendLog((gDebugMode ? "[" + this.connNo + "] " : "") + msg, css, type, false); },
  onIsReadyChange     : function(state)              { },
  //onShouldRefresh   : use baseObserver function
  onChangeDir         : function(path, dontUpdateView, skipRecursion) { },
  onDirNotFound       : function(buffer)             { },

  // transferObserver-specific
  transferQueue       : function() {
    var foundTransfer = false;

    for (var x = 0; x < gConnections[this.connNo - 1].eventQueue.length; ++x) {
      if (foundTransfer || gConnections[this.connNo - 1].eventQueue[x].cmd == "transferBegin") {
        foundTransfer = true;
        gConnection.eventQueue.push(gConnections[this.connNo - 1].eventQueue[x]);
      }
    }
  },

  // the following functions are protocol specific
  // I guess I could make further derivations of this class, e.g. sftpTransferObserver.js
  // meh.

  // sftp specific
  onSftpCache : function(buffer) {
    return 'n';
  }
};
