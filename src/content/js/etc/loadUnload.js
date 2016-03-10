function startup() {
  if (gStrbundle) {                            // we get two onload events b/c of the embedded browser
    return;
  }

  window.onerror         = detailedError;

  gStrbundle             = $("strings");
  gConnectButton         = $('connectbutton');
  gAccountField          = $('account');
  gCustomCmd             = $('customCmd');
  gFolderField           = $('folder');
  gLocalPath             = $('localpath');
  gLocalTree             = $('localtree');
  gLocalDirTree          = $('localdirtree');
  gLocalTreeChildren     = $('localtreechildren');
  gLocalDirTreeChildren  = $('localdirtreechildren');
  gRemotePath            = $('remotepath');
  gRemoteTree            = $('remotetree');
  gRemoteDirTree         = $('remotedirtree');
  gRemoteTreeChildren    = $('remotetreechildren');
  gRemoteDirTreeChildren = $('remotedirtreechildren');
  gCmdlogDoc             = $('cmdlog').contentWindow.document;
  gCmdlogBody            = $('cmdlog').contentWindow.document.body;
  gLogQueue              = gCmdlogDoc.createDocumentFragment();
  gQueueTree             = $('queuetree');
  gQueueTreeChildren     = $('queuetreechildren');
  gStatusBytes           = $('statusbytes');
  gStatusElapsed         = $('statuselapsed');
  gStatusRemaining       = $('statusremaining');
  gStatusRate            = $('statusrate');
  gStatusMeter           = $('statusmeter');
  gLocalTree.view        = localTree;
  gLocalDirTree.view     = localDirTree;
  gRemoteTree.view       = remoteTree;
  gRemoteDirTree.view    = remoteDirTree;
  gQueueTree.view        = queueTree;

  gProfileDir            = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                                     .get("ProfD", Components.interfaces.nsILocalFile);
  gAtomService           = Components.classes["@mozilla.org/atom-service;1"].getService            (Components.interfaces.nsIAtomService);
  gLoginManager          = Components.classes["@mozilla.org/login-manager;1"].getService           (Components.interfaces.nsILoginManager);
  gIos                   = Components.classes["@mozilla.org/network/io-service;1"].getService      (Components.interfaces.nsIIOService);
  gPromptService         = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
  gPrefsService          = Components.classes["@mozilla.org/preferences-service;1"].getService     (Components.interfaces.nsIPrefService);
  gFireFTPUtils          = Components.classes['@nite-lite.net/fireftputils;1'].getService          (Components.interfaces.nsIFireFTPUtils);
  gLoginInfo             = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",     Components.interfaces.nsILoginInfo, "init");

  gPrefs                 = gPrefsService.getBranch("fireftp.");
  gPlatform              = getPlatform();

  if (gPrefsService instanceof Components.interfaces.nsIPrefBranchInternal) {
    gPrefsService.addObserver("fireftp", prefsObserver, false);
  }

  gMaxCon                = gPrefs.getIntPref("concurrentmax");
  gTransferTypes         = new Array(gStrbundle.getString("auto"), gStrbundle.getString("binary"), gStrbundle.getString("ascii"));
  gMonths                = gStrbundle.getString("months").split("|");

  for (var x = 0; x < gMaxCon; ++x) {
    gQueue.push([]);
  }

  treeHighlighter.valid  = new Array({ tree: gLocalTree,  children: gLocalTreeChildren,  column: "localname"  },
                                     { tree: gRemoteTree, children: gRemoteTreeChildren, column: "remotename" },
                                     { tree: gQueueTree,  children: gQueueTreeChildren });

  if ($('searchWhich').selectedIndex == -1) {
    $('searchWhich').selectedIndex = 0;
  }

  searchSelectType();
  showSearchDates();
  securityPopup();

  readPreferences();
  gLocalPath.value = gPrefs.getComplexValue("folder", Components.interfaces.nsISupportsString).data;
  gLoadUrl         = gPrefs.getComplexValue("loadurl", Components.interfaces.nsISupportsString).data;

  setConnectButton(true);
  accountButtonsDisabler(true);
  connectedButtonsDisabler();
  loadSiteManager(true);
  localDirTree.changeDir(gLocalPath.value);
  loadPrograms();

  gCmdlogDoc.getElementById('version').textContent = gVersion;
  gCmdlogBody.scrollTop = 0;

  var hashUsed = false;
  if (!gLoadUrl && window.location.protocol == 'chrome:' && window.location.hash) {
    gDefaultAccount = getArgument('?' + window.location.hash.substring(1), 'account');
    hashUsed = true;
  }

  var accountFound = onAccountChange(gDefaultAccount);
  var func = function() {
    gAccountField.focus();
  };
  setTimeout(func, 0);

  tipJar();

  // only do this if in tab mode; window mode causes this problem:
  // https://www.mozdev.org/bugs/show_bug.cgi?id=24935
  if (gLoadMode == 1) {
    setTimeout(doResizeHack, 0);
  }

  if (gLoadUrl) {
    setTimeout(externalLink, 1000);
  } else if (hashUsed && accountFound) {
    setTimeout(connect, 1000);
  }
}

function beforeUnload() {
  return "";
}

function unload() {
  try {
    if (window.location.protocol == 'chrome:') {
      window.location.hash = '';
    }
  } catch(ex) {}

  if (gPrefsService instanceof Components.interfaces.nsIPrefBranchInternal) {
    gPrefsService.removeObserver("fireftp", prefsObserver, false);
  }

  for (var x = 0; x < gMaxCon; ++x) {
    if (gConnections[x].isConnected) {
      gConnections[x].disconnect();
    }
  }

  if (gFxp && gFxp.isConnected) {
    gFxp.disconnect();
  }

  for (var x = 0; x < gTempEditFiles.length; ++x) {
    gFireFTPUtils.removeFile(gTempEditFiles[x].file);
  }
}
