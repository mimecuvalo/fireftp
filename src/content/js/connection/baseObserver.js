function baseObserver() { }

baseObserver.prototype = {
  uponRefreshCallback : null,
  securityCallbacks   : null,
  connNo              : 1,

  // functions that should be implemented by derived classes
  onDirNotFound       : function(buffer) { alert('NOT_IMPLEMENTED'); },

  // optional functions to override
  onWelcomed          : function() { },

  // private functions that should not be overridden, however, exceptions are fxp and transfer which are special cases
  // if a function has a _ prefix, it should be called by corresponding functions (without _ prefix) in derived classes
  _onDirNotFound : function(path) {
    if (path) {                                                    // this is a fix for people who can't access '/' on their remote hosts
      gRemotePath.value = path;
      remoteDirTree.dontPanic();                                   // don't forget to bring a towel
    }
  },

  onConnectionRefused : function() {
    this.onWelcomed();
    setConnectButton(true);
  },

  onConnected : function() {
    connectedButtonsDisabler();
    setConnectButton(false);

    if (gConnection.security) {
      $('remotepath').setAttribute("security", "on");
      securityPopup(true);
    }

    // this is necessary in case previous connections got marked as 'bad'
    for (var x = 1; x < gMaxCon; ++x) {
      gConnections[x].type = 'transfer';
    }

    if (!gDisableFavicon) {
      $('page-proxy-favicon').src = (gWebHost ? gWebHost : "http://" + gConnection.host) + "/favicon.ico";
    }

    if (window.location.protocol == 'chrome:') {
      window.location.hash = generateArgs({ 'account': gAccount }).substring(1);
    }
  },

  onLoginAccepted : function(newHost) {
    if (gConnection.isConnected && newHost) {                               // switching to a different host or different login
      remoteTree.treebox.rowCountChanged(0,    -remoteTree.rowCount);
      remoteTree.rowCount    = 0;
      remoteTree.data        = new Array();
      remoteDirTree.treebox.rowCountChanged(0, -remoteDirTree.rowCount);
      remoteDirTree.rowCount = 0;
      remoteDirTree.data     = new Array();
    }
  },

  onLoginDenied : function() {
    connect(false, true);
  },

  onDisconnected : function(attemptingReconnect) {
    try {
      if (window.location.protocol == 'chrome:') {
        window.location.hash = '';
      }

      if (connectedButtonsDisabler) {                                       // connectedButtonsDisabler could be gone b/c we're disposing
        connectedButtonsDisabler();
        setConnectButton(true);
        remoteDirTree.expandDirectoryCallback = null;
        remoteTree.updateViewCallback         = null;
        this.uponRefreshCallback    = null;
        gTreeSyncManager            = false;
        remoteTree.pasteFiles       = new Array();
        document.title              = "FireFTP";
        $('remotePasteContext').setAttribute("disabled", true);
        $('remotepath').removeAttribute("security");
        securityPopup();

        if (gFxp && gFxp.isConnected) {
          gFxp.disconnect();
        }

        $('page-proxy-deck').selectedIndex = 0;
        $('page-proxy-favicon').src = "";

        if (!attemptingReconnect) {
          for (var x = 0; x < gTempEditFiles.length; ++x) {
            gFireFTPUtils.removeFile(gTempEditFiles[x].file);
            clearInterval(gTempEditFiles[x].id);
          }

          gTempEditFiles = [];

          queueTree.selection.selectAll();
          queueTree.cancel();
        }
      }
    } catch (ex) { }
  },

  onReconnecting : function() {
    $('abortbutton').disabled = false;
  },

  onAbort : function() {
    remoteDirTree.expandDirectoryCallback = null;
    remoteTree.updateViewCallback         = null;
    this.uponRefreshCallback    = null;
    gTreeSyncManager            = false;

    if (!gSearchRunning) {
      localTree.refresh();
      remoteTree.refresh();
    }

    if (gFxp && gFxp.isConnected) {
      gFxp.disconnect();
    }
  },

  onError : function(msg, skipAlert) {
    error(msg, false, false, skipAlert);

    remoteDirTree.expandDirectoryCallback = null;
    remoteTree.updateViewCallback         = null;
    this.uponRefreshCallback              = null;

    if (gFxp && gFxp.isConnected) {
      gFxp.disconnect();
    }
  },

  onDebug : function(msg, level) {
    debug(msg, level, false);
  },

  onAppendLog : function(msg, css, type) {
    appendLog(msg, css, type, false);
  },

  onIsReadyChange : function(state) {
    try {
      window.onbeforeunload = state ? null : beforeUnload;

      if (gLoadUrl && state && gConnection.isConnected && !gConnection.eventQueue.length) { // if it's an external link check to see if it's a file to download
        var leafName = gLoadUrl.substring(gLoadUrl.lastIndexOf('/') + 1);
        var index = -1;

        for (var x = 0; x < gConnection.listData.length; ++x) {
          if (leafName == gConnection.listData[x].leafName) {
            index = x;
            break;
          }
        }

        var loadUrl = gLoadUrl;
        gLoadUrl    = "";

        if (index == -1) {
          appendLog(gStrbundle.getString("remoteNoExist"), 'error', "error");
          return;
        }

        if (gConnection.listData[index].isDirectory()) {
          remoteDirTree.changeDir(loadUrl);
        } else {                                                              // if it is, well, then download it
          var prefBranch = gPrefsService.getBranch("browser.");

          try {
            if (!prefBranch.getBoolPref("download.useDownloadDir")) {
              if (!browseLocal(gStrbundle.getString("saveFileIn"))) {
                return;
              }
            }
          } catch (ex) { }

          remoteTree.selection.select(index);
          new transfer().start(true);
        }
      }
    } catch (ex) { }
  },

  onShouldRefresh : function(local, remote, dir) {
    for (var x = 0; x < gMaxCon; ++x) {
      if (!gConnections[x].isConnected) {
        continue;
      }

      if (gConnections[x].eventQueue.length && gConnections[x].eventQueue[0].cmd != "welcome") {
        if (local) {
          gConnections[x].localRefreshLater = dir;
        }

        if (remote) {
          gConnections[x].remoteRefreshLater = dir;
        }
        return;
      }
    }

    if (gRefreshMode && local) {
      if (this.uponRefreshCallback) {
        var tempCallback = this.uponRefreshCallback;
        this.uponRefreshCallback = null;
        tempCallback();
      } else {
        if (gLocalPath.value != dir) {
          localDirTree.addDirtyList(dir);
        } else {
          localTree.refresh();
        }
      }
    }

    if (gRefreshMode && remote) {
      if (this.uponRefreshCallback) {
        var tempCallback = this.uponRefreshCallback;
        this.uponRefreshCallback = null;
        tempCallback();
      } else {
        if (gRemotePath.value != dir) {
          remoteDirTree.addDirtyList(dir);
        } else {
          remoteTree.refresh();
        }
      }
    }
  },

  onChangeDir : function(path, dontUpdateView, skipRecursion) {
    if (!dontUpdateView) {
      if (skipRecursion) {
        gRemotePath.value = path ? path : gRemotePath.value;
        remoteDirTree.dontPanic();                                          // don't forget to bring a towel
      } else {
        remoteDirTree.changeDir(path ? path : gRemotePath.value);
      }
    }
  },

  onTransferFail : function(params, reason) {
    queueTree.addFailed(params, reason);
  },

  onAddQueue : function(id, cmd, transferInfo, size) {
    onAddQueue(this.connNo - 1, id, cmd, transferInfo, size);
  },

  onRemoveQueue : function(id) {
    onRemoveQueue(this.connNo - 1, id);
  },

  onClearQueue : function() {
    onClearQueue(this.connNo - 1);
  },

  getActivePort : function(low, high) {
    var currentPort = gActiveCurrentPort == -1 ? low : gActiveCurrentPort + 2;

    if (currentPort < low || currentPort > high) {
      currentPort = low;
    }

    gActiveCurrentPort = currentPort;

    return currentPort;
  }
};

var securityCallbacks = {
  connection : null,

  getInterface : function(iid, instance) {
    if (iid.equals(Components.interfaces.nsIBadCertListener2)) {
      return this;
    }

    return null;
  },

  notifyCertProblem : function(socketInfo, status, targetSite) {
    var self = this;

    var func = function() {
      var flags = gPromptService.BUTTON_TITLE_IS_STRING * gPromptService.BUTTON_POS_0 +
                  gPromptService.BUTTON_TITLE_IS_STRING * gPromptService.BUTTON_POS_1;
      var response = gPromptService.confirmEx(window, gStrbundle.getString("secureConnFailed"),
                                                     gStrbundle.getFormattedString("usesInvalidCert", [self.connection.host]) + "\n\n"
                                                   + (status.isDomainMismatch     ? gStrbundle.getFormattedString("domainMismatch", [status.serverCert.commonName]) + "\n" : "")
                                                   + (status.isNotValidAtThisTime ? gStrbundle.getString("isNotValidAtThisTime") + "\n" : "")
                                                   + (status.isUntrusted          ? gStrbundle.getString("isUntrusted") + "\n" : "")
                                                   + "\n" + gStrbundle.getString("secureConnFailedDesc"), flags,
                                                     gStrbundle.getString("cancelButton"),
                                                     gStrbundle.getString("orSeeWhatsBehindDoorNumberTwo"),
                                                     null, null, {});

      if (response == 0) {
        self.connection.onDisconnect();
        self.connection = null;
        return;
      }

      response = gPromptService.confirmEx(window, gStrbundle.getString("secureConnFailed"),
                                                 gStrbundle.getString("addExceptionDesc"), flags,
                                                 gStrbundle.getString("addExceptionEscape"),
                                                 gStrbundle.getString("addException"),
                                                 null, null, {});

      if (response == 0) {
        self.connection.onDisconnect();
        self.connection = null;
        return;
      }

      var params = { location : targetSite, exceptionAdded : false, sslStatus : status };
      window.openDialog('chrome://pippki/content/exceptionDialog.xul', '', 'chrome,centerscreen,modal', params);

      if (params.exceptionAdded) {
        self.connection.onDisconnect();
        self.connection.connect();
      } else {
        self.connection.onDisconnect();
      }

      self.connection = null;
    };

    setTimeout(func, 0);

    return true;
  }
};

function securityPopup(secure) {
  $('identity-popup').className                        = secure ? "verifiedDomain" : "unknownIdentity";
  $('identity-box').className                          = secure ? "verifiedDomain" : "unknownIdentity";
  $('identity-popup-content-box').className            = secure ? "verifiedDomain" : "unknownIdentity";
  $('identity-popup-content-host').textContent         = secure ? gConnection.host                    : "";
  $('identity-popup-content-supplemental').textContent = secure ? gStrbundle.getString("locVerified") : gStrbundle.getString("idUnknown");
  $('identity-popup-content-verifier').textContent     = secure ? ""                                  : "";
  $('identity-popup-encryption-label').textContent     = secure ? gStrbundle.getString("encrypted")   : gStrbundle.getString("notEncrypted");
}
