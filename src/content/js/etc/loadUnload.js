function startup() {
  if (gStrbundle) {                            // we get two onload events b/c of the embedded browser
    return;
  }

  window.onerror         = detailedError;

  gStrbundle             = $("strings");
  gConnectButton         = $('connectbutton');
  gAccountField          = $('account');
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
  gFireFTPUtils          = Components.classes['@nightlight.ws/fireftputils;1'].getService          (Components.interfaces.nsIFireFTPUtils);
  gFormHistory           = Components.classes["@mozilla.org/satchel/form-history;1"].getService    (Components.interfaces.nsIFormHistory ?
                                                                                                    Components.interfaces.nsIFormHistory :
                                                                                                    Components.interfaces.nsIFormHistory2);
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

  var trht = 'http://www.youtube.com/watch?v=Uh_8j8k39y0';
  appendLog("<span id='opening' style='line-height:16px'><span style='cursor:pointer;text-decoration:underline;color:blue;' onclick=\"window.open('http://fireftp.mozdev.org/donate.html','FireFTP');\">"
      + "FireFTP</span> <span>" + gVersion
      + "  '</span><span style='cursor:pointer;text-decoration:underline;' onclick=\"window.open('" + trht + "','trht');\">"
      + "Young Folks</span>'"
      //+ " <img style='cursor:pointer;text-decoration:underline;' onclick=\"window.open('"
      //+ trht + "','trht');\" src='chrome://fireftp/skin/icons/trht.png'/>"
      + " " + gStrbundle.getString("opening")
      + "</span><br style='font-size:5pt'/><br style='font-size:5pt'/>", 'blue', "info", true);
  gCmdlogBody.scrollTop = 0;

  onAccountChange(gDefaultAccount);
  setTimeout("gAccountField.focus()", 0);

  //tipJar();

  setTimeout(doResizeHack, 0);

  if (gLoadUrl) {
    setTimeout("externalLink()", 1000);
  }
}

function beforeUnload() {
  return "";
}

function unload() {
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
