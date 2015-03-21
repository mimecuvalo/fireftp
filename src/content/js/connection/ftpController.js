function connect(noAccountChange, showPassDialog) {
  if (!noAccountChange) {
    onAccountChange();
  }

  gStatusBarClear = false;

  for (var x = 0; x < gMaxCon; ++x) {
    gConnections[x].host = gConnections[x].host.replace(/^ftp:\/*/i, '');    // error checking - get rid of 'ftp://'

    if (gConnections[x].host && gConnections[x].host.charAt(gConnections[x].host.length - 1) == '/') {
      gConnections[x].host = gConnections[x].host.substring(0, gConnections[x].host.length - 1);
    }
  }

  if (gConnection.host == "about:mozilla") {                                // just for fun
    window.openDialog("chrome://fireftp/content/welcome.xul", "welcome", "chrome,dialog,resizable,centerscreen", "", true);
    gConnectButton.label = "Flame On!";
    gConnectButton.setAttribute('accesskey', "F");
    return;
  }

  if (!gConnection.host) {                                                  // need to fill in the host
    doAlert(gStrbundle.getString("alertFillHost"));
    return;
  }

  if (!gConnection.port || !parseInt(gConnection.port)) {                   // need a valid port
    doAlert(gStrbundle.getString("alertFillPort"));
    return;
  }

  if (!gConnection.login || !gConnection.password || showPassDialog) {      // get a password if needed
    var passwordObject       = new Object();
    passwordObject.login     = gConnection.login;
    passwordObject.password  = gConnection.password;
    passwordObject.returnVal = false;

    window.openDialog("chrome://fireftp/content/password.xul", "password", "chrome,modal,dialog,resizable,centerscreen", passwordObject);

    if (passwordObject.returnVal) {
      for (var x = 0; x < gMaxCon; ++x) {
        gConnections[x].login    = passwordObject.login;
        gConnections[x].password = passwordObject.password;
      }
    } else {
      return;
    }
  }

  if (gConnection.protocol == "ssh2" && gConnection.privatekey) {
    var pk = localFile.init(gConnection.privatekey);

    if (!pk || !pk.exists()) {
      doAlert(gStrbundle.getString("pkNotFound"));
      return;
    }
  }

  setConnectButton(false);

  for (var x = 0; x < gSiteManager.length; ++x) {                           // print out debug info; help me help you
    if (gSiteManager[x].account == gAccount) {
      var debugSite = new cloneObject(gSiteManager[x]);
      debugSite.account = "";
      debugSite.host = "";
      debugSite.login = "";
      debugSite.port = "";
      debugSite.password = "";
      debug(debugSite.toSource(), "DEBUG");
      break;
    }
  }

  debug(  "gConcurrent:"    + gConcurrent
      + ", gMaxCon:"        + gMaxCon
      + ", gRefreshMode:"   + gRefreshMode
      + ", gTempPasvMode:"  + gTempPasvMode
      + ", gLoadUrl:"       + (gLoadUrl ? 'true' : 'false')
      + ", fileMode:"       + (gConnection.fileMode || "n/a")
      + ", protocol:"       + gConnection.protocol
      + ", hiddenMode:"     + gConnection.hiddenMode
      + ", keepAliveMode:"  + gConnection.keepAliveMode
      + ", networkTimeout:" + gConnection.networkTimeout
      + ", proxyHost:"      + gConnection.proxyHost
      + ", proxyPort:"      + gConnection.proxyPort
      + ", proxyType:"      + gConnection.proxyType
      + ", activePortMode:" + (gConnection.activePortMode || "n/a")
      + ", activeLow:"      + (gConnection.activeLow || "n/a")
      + ", activeHigh:"     + (gConnection.activeHigh || "n/a")
      + ", reconnectMode:"  + gConnection.reconnectMode
      + ", sessionsMode:"   + gConnection.sessionsMode
      + ", timestampsMode:" + gConnection.timestampsMode
      + ", useCompression:" + gConnection.useCompression
      + ", integrityMode:"  + gConnection.integrityMode
      + ", userAgent:"      + navigator.userAgent, "DEBUG");

  gConnection.connect();
}

function disconnect() {
  var working = false;

  for (var x = 0; x < gMaxCon; ++x) {
    if (gConnections[x].isConnected && gConnections[x].eventQueue.length && (gConnections[x].eventQueue.length > 1
                                                                         || (gConnections[x].eventQueue[0].cmd != "NOOP" && gConnections[x].eventQueue[0].cmd != "aborted"))) {
      working = true;
      break;
    }
  }

  if (working && !confirm(gStrbundle.getString("reallyclose"))) {
    return;
  }

  setConnectButton(true);
  gRemotePath.value = '/';
  gRemotePathFocus  = '/';
  document.title    = "FireFTP";

  for (var x = 0; x < gMaxCon; ++x) {
    if (gConnections[x].isConnected) {
      gConnections[x].disconnect();
    }
  }

  if (gFxp && gFxp.isConnected) {
    gFxp.disconnect();
  }
}

function isReady() {
  for (var x = 0; x < gMaxCon; ++x) {
    if (!gConnections[x].isConnected) {
      continue;
    }

    if (!gConnections[x].isReady) {
      return false;
    }
  }

  return true;
}
