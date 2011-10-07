function fxpObserver() {
  inherit(this, new baseObserver());
}

fxpObserver.prototype = {
  securityCallbacks   : securityCallbacks,

  onConnectionRefused : function()                   { this.onWelcomed(); },
  onConnected         : function()                   { },
  onWelcomed          : function()                   { displayWelcomeMessage(gFxp.welcomeMessage); },
  onLoginAccepted     : function(newHost)            { },
  onLoginDenied       : function()                   { fxpConnect(true); },
  onDisconnected      : function()                   {
    try {
      if (connectedButtonsDisabler) {                                       // connectedButtonsDisabler could be gone b/c we're disposing
        $('remoteFXP').disabled = false;
      }
    } catch (ex) { }
  },
  onReconnecting      : function()                   { },
  onAbort             : function()                   {
    if (gFxp.isConnected) {
      gFxp.disconnect();
    }
  },
  onError             : function(msg)                {
    error('[FXP] ' + msg, false, false);

    gConnection.abort(true);

    if (gFxp.isConnected) {
      gFxp.disconnect();
    }
  },
  onDebug             : function(msg, level)         { debug('[FXP] ' + msg, level, false); },
  onAppendLog         : function(msg, css, type)     { appendLog('[FXP] ' + msg, css, type, false); },
  onIsReadyChange     : function(state) {
    if (gFxpFiles && state && gFxp.isConnected && !gFxp.eventQueue.length) {
      var transferObj = new fxpTransfer();
      var files       = gFxpFiles;
      gFxpFiles       = null;

      gFxp.beginCmdBatch();
      for (var x = 0; x < files.length; ++x) {
        transferObj.start(files[x]);

        if (transferObj.cancel) {
          return;
        }
      }
      gFxp.endCmdBatch();
    }
  },
  onShouldRefresh     : function(local, remote, dir) { },
  onChangeDir         : function(path, dontUpdateView, skipRecursion) { },
  onDirNotFound       : function(buffer)             { },
  onTransferFail      : function(params, reason)     { },
  onAddQueue          : function(id, cmd, transferInfo, size) { },
  onRemoveQueue       : function(id)                 { },
  onClearQueue        : function()                   { }
};
