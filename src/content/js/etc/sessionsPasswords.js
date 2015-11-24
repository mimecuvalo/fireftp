function createAccount() {
  if (!gSiteManager.length) {
    newSite();
  }
}

function newSite() {
  var newSiteCallback = function(site) {
    gSiteManager.push(site);
    accountHelper(site);
  };

  var params = { callback    : newSiteCallback,
                 siteManager : gSiteManager,
                 localPath   : gLocalPath,
                 remotePath  : gRemotePath,
                 site        : { account  : "", host     : "",   port             : 21,    login          : "",    password : "",     anonymous : false,
                                 security : "", pasvmode : true, ipmode           : false, treesync       : false, localdir : "",     remotedir : "",
                                 webhost  : "", prefix   : "",   downloadcasemode : 0,     uploadcasemode : 0,     encoding : "UTF-8",
                                 notes    : "", timezone : 0,    folder           : "",    privatekey     : "",    protocol : "" } };

  window.openDialog("chrome://fireftp/content/accountManager.xul", "accountManager", "chrome,dialog,resizable,centerscreen", params);
}

function editSite() {
  if (!gAccountField.value) {
    return;
  }

  var editSite;                                                      // grab a copy of the old site

  for (var x = 0; x < gSiteManager.length; ++x) {
    if (gSiteManager[x].account == gAccountField.value) {
      editSite = new cloneObject(gSiteManager[x]);
      break;
    }
  }

  var oldSite = new cloneObject(editSite);

  var editSiteCallback = function(site) {
    if (site.markedForDeath) {
      deleteSite(site);
      return;
    }

    for (var x = 0; x < gSiteManager.length; ++x) {
      if (gSiteManager[x].account == oldSite.account) {
        gSiteManager[x] = site;
        break;
      }
    }

    try {                                                            // delete old password from list
      var recordedHost = (oldSite.host.indexOf("ftp.") == 0 ? '' : "ftp.") + oldSite.host + ':' + oldSite.port;
      var logins       = gLoginManager.findLogins({}, recordedHost, "FireFTP", null);
      for (var x = 0; x < logins.length; ++x) {
        if (logins[x].username == oldSite.login) {
          gLoginManager.removeLogin(logins[x]);
        }
      }
    } catch (ex) { }

    accountHelper(site);
  };

  var params          = { callback    : editSiteCallback,
                          siteManager : gSiteManager,
                          localPath   : gLocalPath,
                          remotePath  : gRemotePath,
                          site        : editSite };

  window.openDialog("chrome://fireftp/content/accountManager.xul", "accountManager", "chrome,dialog,resizable,centerscreen", params);
}

function deleteSite(site) {
  for (var x = 0; x < gSiteManager.length; ++x) {                    // delete the account
    if (gSiteManager[x].account == site.account) {
      try {                                                          // delete password from list
        var recordedHost = (gSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + gSiteManager[x].host + ':' + gSiteManager[x].port;
        var logins       = gLoginManager.findLogins({}, recordedHost, "FireFTP", null);
        for (var y = 0; y < logins.length; ++y) {
          if (logins[y].username == gSiteManager[x].login) {
            gLoginManager.removeLogin(logins[y]);
          }
        }
      } catch (ex) { }

      gSiteManager.splice(x, 1);

      break;
    }
  }

  saveSiteManager();
  loadSiteManager();

  onFolderChange();
}

function quickConnect() {                                            // make a quick connection, account not saved
  var quickConnectCallback = function(site) {
    tempAccountHelper(site);
  };

  var quickConnectCancelCallback = function() {
    $('quickMenuItem').setAttribute("disabled", gConnection.isConnected);
  };

  $('quickMenuItem').setAttribute("disabled", true);

  var params = { callback       : quickConnectCallback,
                 cancelCallback : quickConnectCancelCallback,
                 siteManager    : gSiteManager,
                 quickConnect   : true,
                 localPath      : gLocalPath,
                 remotePath     : gRemotePath,
                 site           : { account  : "", host     : "",   port             : 21,    login          : "",    password : "",     anonymous : false,
                                    security : "", pasvmode : true, ipmode           : false, treesync       : false, localdir : "",     remotedir : "",
                                    webhost  : "", prefix   : "",   downloadcasemode : 0,     uploadcasemode : 0,     encoding : "UTF-8",
                                    notes    : "", timezone : 0,    folder           : "",    privatekey     : "",    protocol : "",
                                    temporary : true } };

  window.openDialog("chrome://fireftp/content/accountManager.xul", "accountManager", "chrome,dialog,resizable,centerscreen", params);
}

function externalLink() {                                            // opened up fireFTP using a link in Firefox
  var site = { account  : "", host     : "",            port             : 21,    login          : "anonymous", password : "fireftp@example.com", anonymous : true,
               security : "", pasvmode : gTempPasvMode, ipmode           : false, treesync       : false,       localdir : "",                    remotedir : "",
               webhost  : "", prefix   : "",            downloadcasemode : 0,     uploadcasemode : 0,           encoding : "UTF-8",
               notes    : "", timezone : 0,             folder           : "",    privatekey     : "",          protocol : "",
               temporary : true };

  var uri    = Components.classes["@mozilla.org/network/standard-url;1"].getService(Components.interfaces.nsIURI);
  var toUTF8 = Components.classes["@mozilla.org/intl/utf8converterservice;1"].getService(Components.interfaces.nsIUTF8ConverterService);
  uri.spec   = gLoadUrl;

  if (!(uri.schemeIs("ftp") || uri.schemeIs("sftp") || uri.schemeIs("ftps")) || gLoadUrl.length <= 6) {                // sanity check
    return;
  }

  if (uri.username) {
    site.login     = unescape(uri.username);
    site.password  = unescape(uri.password);
    site.anonymous = site.login && site.login != "anonymous" ? false : true;
  }

  site.host = uri.host;
  site.port = uri.port == -1 ? (uri.schemeIs("sftp") ? 22 : 21) : uri.port;

  try {
    var recordedHost = (site.host.indexOf("ftp.") == 0 ? '' : "ftp.") + site.host + ':' + site.port;
    var logins = gLoginManager.findLogins({}, recordedHost, "FireFTP", null);
    for (var x = 0; x < logins.length; ++x) {
      if (uri.username && logins[x].username != site.login) {
        continue;
      }

      site.login = logins[x].username;
      site.password = logins[x].password;
      site.anonymous = site.login && site.login != "anonymous" ? false : true;
      break;
    }
  } catch (ex) { }

  if (uri.schemeIs("sftp")) {
    site.security = "sftp";

    site.privatekey = getArgument('?' + window.location.hash.substring(1), 'pkey');
  } else if (uri.schemeIs("ftps")) {
    site.security = "authtls";
  }

  site.protocol = uri.schemeIs("sftp") ? "ssh2" : "ftp";

  var prefBranch   = gPrefsService.getBranch("browser.");

  // get rid of the hash, e.g. when using #pkey=<file>
  if (uri.path.indexOf('#') != -1) {
    uri.path = uri.path.substring(0, uri.path.lastIndexOf('#'));
  }

  // test to see if the path is a file or directory, rudimentary test to see if slash is at the end
  gLoadUrl         = uri.path.charAt(uri.path.length - 1) == '/' ? "" : unescape(uri.path);

  try {
    gLoadUrl       = toUTF8.convertStringToUTF8(gLoadUrl, "UTF-8", 1);
  } catch (ex) {
    debug(ex);
  }

  try {
    if (prefBranch.getBoolPref("download.useDownloadDir")) {
      site.localdir  = prefBranch.getComplexValue("download.dir", Components.interfaces.nsISupportsString).data;
    }
  } catch (ex) { }

  site.remotedir = gLoadUrl == "" ? (uri.path == "/" ? "" : unescape(uri.path)) : unescape(uri.path.substring(0, uri.path.lastIndexOf('/')));

  try {
    site.remotedir = toUTF8.convertStringToUTF8(site.remotedir, "UTF-8", 1);
  } catch (ex) {
    debug(ex);
  }

  gPrefs.setCharPref("loadurl", "");

  tempAccountHelper(site);
}

function accountHelper(site) {
  if (gPasswordMode && site.password) {
    try {                                                            // save username & password
      var recordedHost = (site.host.indexOf("ftp.") == 0 ? '' : "ftp.") + site.host + ':' + site.port;
      var loginInfo    = new gLoginInfo(recordedHost, "FireFTP", null, site.login, site.password, "", "");
      gLoginManager.addLogin(loginInfo);
    } catch (ex) { }
  }

  var tempPassword = site.password;
  saveSiteManager();                                                 // save site manager
  loadSiteManager();

  for (var x = 0; x < gSiteManager.length; ++x) {                    // select the new site
    if (gSiteManager[x].account == site.account) {
      gAccountField.selectedIndex = x;
      gSiteManager[x].password    = tempPassword;                    // if "Remember Passwords" is off we have to remember what it is temporarily
      onAccountChange(site.account);
      break;
    }
  }
}

function tempAccountHelper(site) {
  site.account = site.host;

  var found = true;
  var count = 0;

  while (found) {
    found = false;

    for (var x = 0; x < gSiteManager.length; ++x) {
      if (gSiteManager[x].account == site.account) {
        found = true;
        ++count;
        site.account = site.host + '-' + count.toString();
        break;
      }
    }
  }

  gSiteManager.push(site);

  accountHelper(site);

  connect(true);
}

function onFolderChange(dontSelect, click) {
  if (click && gFolder == gFolderField.value) {
    return;
  }

  gAccountField.removeAllItems();

  if (!gSiteManager.length) {
    gAccountField.setAttribute("label", gStrbundle.getString("createAccount"));
  }

  gAccountField.appendItem(gStrbundle.getString("createAccount"), "");
  gAccountField.firstChild.lastChild.setAttribute("oncommand", "newSite()");
  gAccountField.appendItem(gStrbundle.getString("quickConnectMenu"), "");
  gAccountField.firstChild.lastChild.setAttribute("id", "quickMenuItem");
  gAccountField.firstChild.lastChild.setAttribute("oncommand", "quickConnect()");

  if (gSiteManager.length) {
    gAccountField.firstChild.appendChild(document.createElement("menuseparator"));
  }

  for (var x = 0; x < gSiteManager.length; ++x) {
    if (gSiteManager[x].folder == gFolderField.value || (!gSiteManager[x].folder && gFolderField.value == "")) {
      gAccountField.appendItem(gSiteManager[x].account, gSiteManager[x].account);
      if (gSiteManager[x].security) {
        gAccountField.firstChild.lastChild.setAttribute("style", "menuitem-iconic");
        gAccountField.firstChild.lastChild.setAttribute("image", "chrome://fireftp/skin/icons/Secure16.png");
      }
    }
  }

  if (!dontSelect && gSiteManager.length) {
    gAccountField.selectedIndex = 3;
    onAccountChange();
  }

  gFolder = gFolderField.value;
}

function onAccountChange(account) {
  if (account != null) {
    var found = -1;

    for (var x = 0; x < gSiteManager.length; ++x) {
      if (gSiteManager[x].account == account) {
        found = x;
        break;
      }
    }

    if (found == -1) {
      gFolderField.value = "";
      onFolderChange();
      return false;
    }

    gFolderField.value  = gSiteManager[x].folder;
    onFolderChange(true);
    gAccountField.value = account;
  }

  var accountToLoad = gConnection.isConnected ? gAccount : gAccountField.value;

  for (var x = 0; x < gSiteManager.length; ++x) {                    // load up the new values into the global variables
    if (gSiteManager[x].account == accountToLoad) {
      accountChangeHelper(gSiteManager[x]);
      break;
    }
  }

  if (gAccountField.value) {
    accountButtonsDisabler(false);
  }

  return true;
}

function accountChangeHelper(site) {
  if (!gConnection.isConnected) {
    setProtocol(site.protocol);
  }

  for (var x = 0; x < gMaxCon; ++x) {
    if (!gConnection.isConnected) {
      gConnections[x].host       = site.host;
      gConnections[x].port       = site.port;
      gConnections[x].login      = site.login;
      gConnections[x].password   = site.password;
      gConnections[x].security   = site.security;

      if (gConnection.protocol == 'ssh2') {
        gConnections[x].privatekey = site.privatekey;
      }
    }

    gConnections[x].setEncoding   (site.encoding || "UTF-8");
    gConnections[x].initialPath  = site.remotedir ? site.remotedir : '';
    gConnections[x].timezone     = site.timezone  ? site.timezone  : 0;

    if (gConnection.protocol == 'ftp') {
      gConnections[x].passiveMode  = site.pasvmode;
      gConnections[x].ipType       = site.ipmode ? "IPv6" : "IPv4";
    }
  }

  gAccount          = site.account;
  gDownloadCaseMode = site.downloadcasemode;
  gUploadCaseMode   = site.uploadcasemode;
  gWebHost          = site.webhost;
  gPrefix           = site.prefix;
  gTreeSync         = site.treesync;
  gTreeSyncLocal    = site.localdir;
  gTreeSyncRemote   = site.remotedir;

  if (!gConnection.isConnected) {
    if (site.localdir) {
      var dir = localFile.init(site.localdir);
      if (localFile.verifyExists(dir)) {
        localDirTree.changeDir(site.localdir);
      } else {
        error(gStrbundle.getString("noPermission"));
      }
    }

    if (site.remotedir) {
      gRemotePath.value = site.remotedir;
    } else {
      gRemotePath.value = "/";
    }
  }

  if (site.account) {
    var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    sString.data = site.account;
    gPrefs.setComplexValue("defaultaccount", Components.interfaces.nsISupportsString, sString);
  }

  accountButtonsDisabler(false);
}

function setConnectButton(connect) {
  gConnectButton.label =                   connect ? gStrbundle.getString("connectButton") : gStrbundle.getString("disconnectButton");
  gConnectButton.setAttribute('command',   connect ? 'cmd_connect'                         : 'cmd_disconnect');
  gConnectButton.setAttribute('accesskey', connect ? gStrbundle.getString("connectAccess") : gStrbundle.getString("disconnectAccess"));
}

function accountButtonsDisabler(enable) {
  $('editMenuItem').setAttribute(  "disabled", enable);

  if (gConnection && !gConnection.isConnected) {
    $('connectbutton').disabled = enable;
  }
}

function connectedButtonsDisabler() {
  var isConnected = gConnection && gConnection.isConnected;
  var protocol    = gConnection ? gConnection.protocol : "ftp";

  $('abortbutton').disabled =                             !isConnected;
  $('retrieveButton').disabled =                          !isConnected;
  $('storeButton').disabled =                             !isConnected;
  $('remoteUpButton').disabled =                          !isConnected;
  $('remoteRefreshButton').disabled =                     !isConnected;
  $('remoteChangeButton').disabled =                      !isConnected;
  $('searchRemote').disabled =                            !isConnected;
  $('diffMenuItem').setAttribute(             "disabled", !isConnected);
  $('recDiffMenuItem').setAttribute(          "disabled", !isConnected);
  $('customMenuItem').setAttribute(           "disabled", !isConnected);
  $('localUpload').setAttribute(              "disabled", !isConnected);
  $('remoteOpenCont').setAttribute(           "disabled", !isConnected);
  $('remoteDownload').setAttribute(           "disabled", !isConnected);
  $('remoteOpen').setAttribute(               "disabled", !isConnected);
  $('remoteOpenWith').setAttribute(           "disabled", !isConnected);
  $('remoteWeb').setAttribute(                "disabled", !isConnected);
  $('remoteCopyUrl').setAttribute(            "disabled", !isConnected);
  $('remoteFXP').setAttribute(                "disabled", !isConnected || protocol != "ftp");
  $('remoteCutContext').setAttribute(         "disabled", !isConnected);
  $('remotePasteContext').setAttribute(       "disabled", !isConnected);
  $('remoteCreateDir').setAttribute(          "disabled", !isConnected);
  $('remoteCreateFile').setAttribute(         "disabled", !isConnected);
  $('remoteRemove').setAttribute(             "disabled", !isConnected);
  $('remoteRename').setAttribute(             "disabled", !isConnected);
  $('remoteProperties').setAttribute(         "disabled", !isConnected);
  $('remoteRecursiveProperties').setAttribute("disabled", !isConnected);
  $('queueRetry').setAttribute(               "disabled", !isConnected);
  $('queueCancel').setAttribute(              "disabled", !isConnected);
  $('queueCancelAll').setAttribute(           "disabled", !isConnected);
  if ($('quickMenuItem')) {
    $('quickMenuItem').setAttribute(          "disabled",  isConnected);
  }
  $('remotepath').setAttribute("disconnected",            !isConnected);
  $('customCmd').setAttribute("autocompletesearchparam",  "customcommands" + protocol);
  remoteDirTree.treebox.invalidate();
  remoteTree.treebox.invalidate();

  searchSelectType();
}

function loadSiteManager(pruneTemp, importFile) {             // read gSiteManager data
  try {
    gFolderField.removeAllItems();

    if (!gConnection || !gConnection.isConnected) {
      setProtocol('ftp');

      for (var x = 0; x < gMaxCon; ++x) {
        gConnections[x].host         = "";
        gConnections[x].port         = 21;
        gConnections[x].login        = "";
        gConnections[x].password     = "";
        gConnections[x].initialPath  = "";
        gConnections[x].setEncoding("UTF-8");
        gConnections[x].timezone     = 0;

        if (gConnection.protocol == 'ftp') {
          gConnections[x].passiveMode  = true;
        } else if (gConnection.protocol == 'ssh2') {
          gConnections[x].privatekey   = "";
        }
      }

      gAccount          = "";
      gDownloadCaseMode = 0;
      gUploadCaseMode   = 0;
      gWebHost          = "";
      gPrefix           = "";
      gRemotePath.value = "/";
    }

    var file;
    if (importFile) {
      file = importFile;
    } else {
      file = gProfileDir.clone();
      file.append("fireFTPsites.dat");
    }

    var folders = new Array();
    if (!file.exists() && !importFile) {
      gSiteManager = new Array();
    } else if (file.exists()) {
      var fstream  = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
      var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].createInstance(Components.interfaces.nsIConverterInputStream);
      fstream.init(file, 1, 0, false);
      cstream.init(fstream, "UTF-8", 0, 0);

      var siteData = "";
      {
        let str = {};
        let read = 0;
        do {
          read = cstream.readString(0xffffffff, str); // read as much as we can and put it in str.value
          siteData += str.value;
        } while (read != 0);
      }
      cstream.close();

      if (localTree.getExtension(file.leafName) == "xml") {
        siteData = importFileZilla(siteData);
        siteData = JSON.stringify(siteData);
      }

      if (importFile) {
        try {
          var tempSiteManager = jsonParseWithToSourceConversion(siteData);
        } catch (ex) {
          error(gStrbundle.getString("badImport"));
          return;
        }

        var passCheck = false;
        var cipherType = "arc4";
        var toUTF8    = Components.classes["@mozilla.org/intl/utf8converterservice;1"].getService(Components.interfaces.nsIUTF8ConverterService);
        var key;
        for (var x = 0; x < tempSiteManager.length; ++x) {
          if (tempSiteManager[x].passcheck) {
            passCheck = true;
            cipherType = tempSiteManager[x].cipher || "arc4";
            var passwordObject       = new Object();
            passwordObject.returnVal = false;

            window.openDialog("chrome://fireftp/content/password2.xul", "password", "chrome,modal,dialog,resizable,centerscreen", passwordObject);

            if (passwordObject.returnVal) {
              key = passwordObject.password;
            } else {
              return;
            }

            key = key ? key : "";
            var cipher = cipherType == "arc4" ? new kryptos.cipher.ARC4(key) : new kryptos.cipher.Blowfish(key, 2, "");
            if (cipher.decrypt(tempSiteManager[x].password).replace(/\0/g, '') != "check123") {
              error(gStrbundle.getString("badPassword"));
              return;
            }
            break;
          }
        }

        for (var x = 0; x < tempSiteManager.length; ++x) {
          if (tempSiteManager[x].passcheck) {
            continue;
          }

          var found   = true;
          var count   = 0;
          var skip    = true;
          var account = tempSiteManager[x].account;

          while (found) {
            found = false;

            for (var y = 0; y < gSiteManager.length; ++y) {
              if (gSiteManager[y].account == account) {
                found = true;

                for (var i in gSiteManager[y]) {                         // if it's the exact same object skip it
                  if (i != "password" && gSiteManager[y][i] != tempSiteManager[x][i]) {
                    skip = false;
                    break;
                  }
                }

                if (skip) {
                  break;
                }

                ++count;
                account = tempSiteManager[x].account + '-' + count.toString();
                break;
              }
            }

            if (skip) {
              break;
            }
          }

          if (skip && found) {
            continue;
          }

          if ((gSlash == "/" && tempSiteManager[x].localdir.indexOf("/") == -1) || (gSlash == "\\" && tempSiteManager[x].localdir.indexOf("\\") == -1)) {
            tempSiteManager[x].localdir = "";
            tempSiteManager[x].treesync = false;
          }

          if (passCheck) {
            var cipher = cipherType == "arc4" ? new kryptos.cipher.ARC4(key) : new kryptos.cipher.Blowfish(key, 2, "");
            tempSiteManager[x].password = cipher.decrypt(tempSiteManager[x].password).replace(/\0/g, '');

            try {
              tempSiteManager[x].password = toUTF8.convertStringToUTF8(tempSiteManager[x].password, "UTF-8", 1);
            } catch (ex) {
              debug(ex);
            }
          }

          if (gPasswordMode && tempSiteManager[x].password) {
            try {                                                    // save username & password
              var recordedHost = (tempSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + tempSiteManager[x].host + ':' + tempSiteManager[x].port;
              var loginInfo    = new gLoginInfo(recordedHost, "FireFTP", null, tempSiteManager[x].login, tempSiteManager[x].password, "", "");
              gLoginManager.addLogin(loginInfo);
            } catch (ex) { }
          }

          tempSiteManager[x].account = account;
          gSiteManager.push(tempSiteManager[x]);
        }
      } else {
        gSiteManager = jsonParseWithToSourceConversion(siteData);
      }

      if (gPasswordMode) {
        for (var x = 0; x < gSiteManager.length; ++x) {              // retrieve passwords from passwordmanager
          try {
            var logins = gLoginManager.findLogins({}, (gSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + gSiteManager[x].host + ':' + gSiteManager[x].port, "FireFTP", null);
            var found  = false;
            for (var y = 0; y < logins.length; ++y) {
              if (logins[y].username == gSiteManager[x].login) {
                gSiteManager[x].password = logins[y].password;
                found = true;
                break;
              }
            }
            if (!found) {                                            // fireftp growing pains: older versions didn't include port #
              var logins = gLoginManager.findLogins({}, (gSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + gSiteManager[x].host, "FireFTP", null);
              for (var y = 0; y < logins.length; ++y) {
                if (logins[y].username == gSiteManager[x].login) {
                  gSiteManager[x].password = logins[y].password;

                  // migrate
                  gLoginManager.removeLogin(logins[y]);
                  var recordedHost = (gSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + gSiteManager[x].host + ':' + gSiteManager[x].port;
                  var loginInfo    = new gLoginInfo(recordedHost, "FireFTP", null, gSiteManager[x].login, gSiteManager[x].password, "", "");
                  gLoginManager.addLogin(loginInfo);

                  found = true;
                  break;
                }
              }
            }
          } catch (ex) { }
        }
      }

      if (pruneTemp) {
        for (var x = gSiteManager.length - 1; x >= 0; --x) {
          if (gSiteManager[x].temporary) {
            gSiteManager.splice(x, 1);
          }
        }
      }

      for (var x = 0; x < gSiteManager.length; ++x) {
        var found = false;
        gSiteManager[x].folder   = gSiteManager[x].folder || "";
        gSiteManager[x].protocol = gSiteManager[x].protocol && gSiteManager[x].protocol != "sftp"
              ? gSiteManager[x].protocol : (gSiteManager[x].security == "sftp" ? "ssh2" : "ftp");

        for (var y = 0; y < folders.length; ++y) {
          if (gSiteManager[x].folder == folders[y]) {
            found = true;
            break;
          }
        }

        if (!found) {
          folders.push(gSiteManager[x].folder);
        }
      }

      folders.sort();

      for (var x = 0; x < folders.length; ++x) {
        gFolderField.appendItem(folders[x] ? folders[x] : gStrbundle.getString("noFolder"), folders[x]);
      }
    }

    if (!folders.length) {
      gFolderField.appendItem(gStrbundle.getString("noFolder"), "");
    }

    gFolderField.selectedIndex = 0;
    $('folderItem').collapsed = !folders.length || (folders.length == 1 && folders[0] == "");

    if (gSiteManager.length) {
      gAccountField.setAttribute("label", gStrbundle.getString("chooseAccount"));
    } else {
      gAccountField.setAttribute("label", gStrbundle.getString("createAccount"));
    }

    accountButtonsDisabler(true);
  } catch (ex) {
    debug(ex);
  }
}

function saveSiteManager(exportFile) {
  try {                                                              // write gSiteManager out to disk
    var tempSiteManagerArray = new Array();

    for (var x = 0; x < gSiteManager.length; ++x) {
      tempSiteManagerArray.push(new cloneObject(gSiteManager[x]));
    }

    var key;
    if (exportFile) {
      var passwordObject       = new Object();
      passwordObject.returnVal = false;

      window.openDialog("chrome://fireftp/content/password2.xul", "password", "chrome,modal,dialog,resizable,centerscreen", passwordObject);

      if (passwordObject.returnVal) {
        key = passwordObject.password;
      } else {
        return;
      }

      key = key ? key : "";
      tempSiteManagerArray.push({ account: "a", passcheck: "check123", cipher: "blowfish", password: "check123" });
    }

    var fromUTF8     = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService(Components.interfaces.nsIScriptableUnicodeConverter);
    fromUTF8.charset = "UTF-8";
    for (var x = 0; x < tempSiteManagerArray.length; ++x) {          // we don't save out the passwords, those are saved in the passwordmanager
      if (exportFile) {
        try {
          tempSiteManagerArray[x].password = fromUTF8.ConvertFromUnicode(tempSiteManagerArray[x].password) + fromUTF8.Finish();
        } catch (ex) {
          debug(ex);
        }

        var cipher = new kryptos.cipher.Blowfish(key, 2, "");
        tempSiteManagerArray[x].password = cipher.encrypt(tempSiteManagerArray[x].password);
      } else {
        tempSiteManagerArray[x].password = "";
      }
    }

    var file;
    if (exportFile) {
      file = exportFile;
    } else {
      file = gProfileDir.clone();
      file.append("fireFTPsites.dat");
    }

    var foutstream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
    foutstream.init(file, 0x04 | 0x08 | 0x20, 0644, 0);
    tempSiteManagerArray.sort(compareAccount);
    var data = JSON.stringify(tempSiteManagerArray);
    var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(foutstream, "UTF-8", 0, 0);
    converter.writeString(data);
    converter.close();
  } catch (ex) {
    debug(ex);
  }
}

function importSites() {
  var nsIFilePicker   = Components.interfaces.nsIFilePicker;
  var fp              = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.defaultExtension = "dat";
  fp.appendFilter("FireFTP (*.dat)", "*.dat");
  fp.appendFilter("FileZilla (*.xml)", "*.xml");
  fp.init(window, null, nsIFilePicker.modeOpen);
  var res = fp.show();

  if (res != nsIFilePicker.returnOK) {
    return;
  }

  var tempAccount = gAccountField.value;

  loadSiteManager(true, fp.file);
  saveSiteManager();                                                 // save site manager
  loadSiteManager();

  onAccountChange(tempAccount);                                      // select the new site
}

function importFileZilla(theString) {
  var parser    = new DOMParser();
  var dom       = parser.parseFromString(theString, "text/xml");

  if (dom.documentElement.nodeName == "parsererror") {
    error(gStrbundle.getString("badImport"));
    return new Array();
  }

  var el        = dom.firstChild.firstChild;
  while (el) {                                                       // find the servers or sites element
    if (el.nodeName == 'Sites' || el.nodeName == 'Servers') {
      el = el.firstChild;
      break;
    }

    el = el.nextSibling;
  }

  return fileZillaHelper(el);
}

function fileZillaHelper(el, folder) {
  var siteData = new Array();

  while (el) {                                                       // find the server or site element
    if (el.nodeName == 'Folder') {
      var newFolder  = (folder ? folder + "-" : "") + (el.getAttribute('Name') ? el.getAttribute('Name') : el.firstChild.nodeValue.trim());
      var returnData = fileZillaHelper(el.firstChild, newFolder);

      for (var x = 0; x < returnData.length; ++x) {
        siteData.push(returnData[x]);
      }
    } else if (el.nodeName == 'Site') {                              // filezilla 2
      var password = "";

      if (el.getAttribute('Pass')) {
        var cipher  = "FILEZILLA1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var pass    = el.getAttribute('Pass');
        var passLen = parseInt(pass.length / 3);
        var offset  = (pass.length / 3) % cipher.length;

        for (var x = 0; x < pass.length; x += 3) {
          var c1 = parseInt(pass.substring(x, x + 3), 10);
          var c2 = cipher.charCodeAt((x / 3 + offset) % cipher.length);
          var c3 = String.fromCharCode(c1 ^ c2);
          password += c3;
        }
      }

      var obj = {
        account           : el.getAttribute('Name'),
        folder            : folder ? folder : "",
        host              : el.getAttribute('Host'),
        port              : el.getAttribute('Port'),
        login             : el.getAttribute('Logontype') == "0" ? "anonymous"           : el.getAttribute('User'),
        password          : el.getAttribute('Logontype') == "0" ? "fireftp@example.com" : password,
        anonymous         : el.getAttribute('Logontype') == "0",
        protocol          : el.getAttribute('ServerType') == "3" ? "ssh2" : "ftp",
        security          : el.getAttribute('ServerType') == "1" ? "ssl" : (el.getAttribute('ServerType') == "2" ? "authssl" : (el.getAttribute('ServerType') == "3" ? "sftp" : (el.getAttribute('ServerType') == "4" ? "authtls" : ""))),
        pasvmode          : el.getAttribute('PasvMode') != "2",
        localdir          : el.getAttribute('LocalDir'),
        remotedir         : el.getAttribute('RemoteDir'),
        notes             : el.getAttribute('Comments'),
        timezone          : (parseInt(el.getAttribute('TimeZoneOffset')) * 60) + parseInt(el.getAttribute('TimeZoneOffsetMinutes')),
        ipmode            : false,
        treesync          : false,
        webhost           : "",
        privatekey        : "",
        prefix            : "",
        encoding          : "UTF-8",
        downloadcasemode  : 0,
        uploadcasemode    : 0
      };

      siteData.push(obj);
    } else if (el.nodeName == 'Server') {                            // filezilla 3
      var serverEl = el.firstChild;

      var obj = { account  : "", host     : "",   port             : 21,    login          : "",    password : "",     anonymous : false,
                  security : "", pasvmode : true, ipmode           : false, treesync       : false, localdir : "",     remotedir : "",
                  webhost  : "", prefix   : "",   downloadcasemode : 0,     uploadcasemode : 0,     encoding : "UTF-8",
                  notes    : "", timezone : 0,    folder           : "",    privatekey     : "",    protocol : "" };
      obj.account = el.lastChild.nodeValue.trim();
      obj.folder  = folder ? folder : "";

      while (serverEl) {
        switch (serverEl.nodeName) {
          case "Host":
            obj.host      = serverEl.textContent;
            break;
          case "Port":
            obj.port      = serverEl.textContent;
            break;
          case "Protocol":
            obj.protocol  = serverEl.textContent == "1" ? "ssh2" : "ftp";
            obj.security  = serverEl.textContent == "3" ? "authssl" : (serverEl.textContent == "4" ? "authtls" : (serverEl.textContent == "1" ? "sftp" : ""));
            break;
          case "Logontype":
            obj.anonymous = serverEl.textContent == "0";
            break;
          case "User":
            obj.login     = serverEl.textContent;
            break;
          case "Pass":
            obj.password  = serverEl.textContent;
            break;
          case "TimezoneOffset":
            obj.timezone  = serverEl.textContent;
            break;
          case "PasvMode":
            obj.pasvmode  = serverEl.textContent != "MODE_ACTIVE";
            break;
          case "Comments":
            obj.notes     = serverEl.textContent;
            break;
          case "LocalDir":
            obj.localdir  = serverEl.textContent;
            break;
          case "RemoteDir":
            obj.remotedir = serverEl.textContent.substring(3);       // seriously, wtf? example: "1 0 4 test 4 aeou 7 aoe4aoe 2 4 "
            obj.remotedir = obj.remotedir.replace(/\s[0-9]\s/g, "/");
            break;
          default:
            break;
        }

        serverEl = serverEl.nextSibling;
      }

      if (obj.anonymous) {
        obj.login    = "anonymous";
        obj.password = "fireftp@example.com";
      }

      siteData.push(obj);
    }

    el = el.nextSibling;
  }

  return siteData;
}

function exportSites() {
  var nsIFilePicker   = Components.interfaces.nsIFilePicker;
  var fp              = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.defaultString    = "fireFTPsites.dat";
  fp.defaultExtension = "dat";
  fp.appendFilter("FireFTP (*.dat)", "*.dat");
  fp.init(window, null, nsIFilePicker.modeSave);
  var res = fp.show();

  if (res == nsIFilePicker.returnOK || res == nsIFilePicker.returnReplace) {
    saveSiteManager(fp.file);
  }
}
