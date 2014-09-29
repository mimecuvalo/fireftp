function readPreferences() {
  try {
    gDefaultAccount          = gPrefs.getComplexValue("defaultaccount", Components.interfaces.nsISupportsString).data;
    gBytesMode               = gPrefs.getBoolPref("bytesmode");
    gConcurrent              = gPrefs.getIntPref ("concurrent");
    gDebugMode               = gPrefs.getBoolPref("debugmode");
    gDisableDestructMode     = gPrefs.getBoolPref("destructmode");
    gDisableFavicon          = gPrefs.getBoolPref("disablefavicon");
    gDonated                 = gPrefs.getBoolPref("donated");
    gErrorMode               = gPrefs.getBoolPref("errormode");
    gInterfaceMode           = gPrefs.getIntPref ("interfacemode");
    gLoadMode                = gPrefs.getIntPref ("loadmode");
    gLogErrorMode            = gPrefs.getBoolPref("logerrormode");
    gLogMode                 = gPrefs.getBoolPref("logmode");
    gLogQueueMode            = gPrefs.getIntPref ("logqueue");
    gNoPromptMode            = gPrefs.getBoolPref("nopromptmode");
    gPasswordMode            = gPrefs.getBoolPref("passwordmode");
    gRefreshMode             = gPrefs.getBoolPref("refreshmode");
    gTempPasvMode            = gPrefs.getBoolPref("temppasvmode");
    gWelcomeMode             = gPrefs.getBoolPref("welcomemode");
    gOpenMode                = gPrefs.getIntPref ("openmode");

    gFireFTPUtils.hiddenMode = gPrefs.getBoolPref("hiddenmode");

    if (gConnections.length) {
      for (var x = 0; x < gMaxCon; ++x) {
        // NOTE: if you add a preference here, don't forget to update fxp.js if needed
        gConnections[x].hiddenMode          = gPrefs.getBoolPref("hiddenmode");
        gConnections[x].keepAliveMode       = gPrefs.getBoolPref("keepalivemode");
        gConnections[x].networkTimeout      = gPrefs.getIntPref ("network");
        gConnections[x].proxyHost           = gPrefs.getComplexValue("proxyhost", Components.interfaces.nsISupportsString).data;
        gConnections[x].proxyPort           = gPrefs.getIntPref ("proxyport");
        gConnections[x].proxyType           = gPrefs.getCharPref("proxytype");
        gConnections[x].reconnectAttempts   = gPrefs.getIntPref ("attempts");
        gConnections[x].reconnectInterval   = gPrefs.getIntPref ("retry");
        gConnections[x].reconnectMode       = gPrefs.getBoolPref("timeoutmode");
        gConnections[x].sessionsMode        = gPrefs.getBoolPref("sessionsmode");
        gConnections[x].timestampsMode      = gPrefs.getBoolPref("timestampsmode");
        gConnections[x].useCompression      = gPrefs.getBoolPref("compressmode");
        gConnections[x].integrityMode       = gPrefs.getBoolPref("integritymode");

        if (gConnection.protocol == 'ftp') {
          gConnections[x].fileMode          = gPrefs.getIntPref ("filemode");
          gConnections[x].activePortMode    = gPrefs.getBoolPref("activeportmode");
          gConnections[x].activeLow         = gPrefs.getIntPref ("activelow");
          gConnections[x].activeHigh        = gPrefs.getIntPref ("activehigh");
        }
      }
    }

    if (gPrefs.getComplexValue("folder", Components.interfaces.nsISupportsString).data == "") {
      var file = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                           .get("Home", Components.interfaces.nsILocalFile);

      var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
      sString.data = file.path;
      gPrefs.setComplexValue("folder", Components.interfaces.nsISupportsString, sString);
    }

    updateInterface();
    updateOpenMode();

    if (gConnections.length) {
      changeTypeMenu();
    }

    $('logqueue').collapsed = !gLogMode;
    $('logsplitter').state  =  gLogMode ? 'open' : 'collapsed';
    $('logbutton').checked  =  gLogMode;

    $('logQueueTabs').selectedIndex = gLogQueueMode;

    if (gConnections.length && gConnection.protocol == 'ftp') {
      var asciiList = gPrefs.getComplexValue("asciifiles", Components.interfaces.nsISupportsString).data;
      asciiList     = asciiList.split(",");
      for (var x = 0; x < gMaxCon; ++x) {
        for (var y = 0; y < asciiList.length; ++y) {
          gConnections[x].asciiFiles.push(asciiList[y]);
        }
      }
    }

  } catch (ex) {
    debug(ex);
  }
}

function showPreferences() {
  var branch       = gPrefsService.getBranch("browser.");
  var instantApply = branch.getBoolPref("preferences.instantApply");
  window.openDialog("chrome://fireftp/content/preferences.xul", "preferences", "chrome,resizable,centerscreen"
                                                                               + (instantApply ? ",dialog=no" : ",modal,dialog"));
}

var prefsObserver = {
  observe : function(prefsbranch, topic, data) {
    readPreferences();

    if (data == "fireftp.bytesmode") {
      localTree.updateView();

      if (gConnection.isConnected) {
        remoteTree.updateView();
      }
    } else if (data == "fireftp.logerrormode") {
      if (gLogErrorMode) {
        showOnlyErrors();
      } else {
        showAll();
      }
    } else if (data == "fireftp.hiddenmode") {
      if (!gConnection.hiddenMode) {
        var file        = localFile.init(gLocalPath.value);
        var hiddenFound = false;

        while (true) {
          if (file.isHidden() && file.path != localDirTree.data[0].path) {
            hiddenFound = true;
            break;
          }

          if (!(parent in file) || file.path == file.parent.path) {
            break;
          }

          file = file.parent;
        }

        if (hiddenFound) {
          gLocalPath.value = localDirTree.data[0].path;
        }
      }

      localDirTree.data     = new Array();
      localDirTree.treebox.rowCountChanged(0, -localDirTree.rowCount);
      localDirTree.rowCount = 0;
      localDirTree.changeDir(gLocalPath.value);

      if (gConnection.isConnected) {
        remoteTree.refresh();
      }
    }
  }
};
