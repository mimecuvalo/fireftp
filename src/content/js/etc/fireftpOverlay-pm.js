/* ideas for this bit of gpl'ed code came from ieview (http://ieview.mozdev.org)
 * and that team is... Paul Roub, Ted Mielczarek, and Fabricio Campos Zuardi
 * thanks to Scott Bentley for the suggestion
 */

function loadFireFTP() {
  var prefService    = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var prefSvc        = prefService.getBranch(null);

  var loadMode = 0;
  try {
    loadMode = prefSvc.getIntPref("fireftp.loadmode");
  } catch (ex) {
    loadMode = 1;
  }

  if (loadMode == 1) {
    var theTab          = gBrowser.addTab('chrome://fireftp/content/fireftp-pm.xul');
    theTab.label        = "FireFTP";
    gBrowser.selectedTab = theTab;
  } else if (loadMode == 2) {
    toOpenWindowByType('mozilla:fireftp', 'chrome://fireftp/content/fireftp-pm.xul');
  } else {
    var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].getService(Components.interfaces.nsIWindowWatcher);
    var win = ww.getWindowByName("FireFTP", null);
    if (win) {
      var theTab          = win.gBrowser.addTab('chrome://fireftp/content/fireftp-pm.xul');
      theTab.label        = "FireFTP";
      win.gBrowser.selectedTab = theTab;
      win.focus();
    } else {
      var sa = Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
      var wuri = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
      wuri.data = "chrome://fireftp/content/fireftp-pm.xul";
      sa.AppendElement(wuri);
      var win = ww.openWindow(null, getBrowserURL(), "FireFTP", null, sa);
    }
  }
}

function loadFireFTPFromContentArea() {
  loadFireFTPHelper(gBrowser.currentURI.spec);
}

function loadFireFTPFromContext() {
  loadFireFTPHelper(gContextMenu.getLinkURL());
}

function loadFireFTPFromLink(event) {
  var link = event.originalTarget;

  if (!link || !link.href) {
    link = event.currentTarget;
  }

  if (!link || !link.href) {
    return true;
  }

  event.preventDefault();
  loadFireFTPHelper(link.href);
  return false;
}

function loadFireFTPHelper(uri) {
  if (uri.toLowerCase().indexOf("ftp://") != 0) {
    return;
  }

  var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var prefBranch  = prefService.getBranch("fireftp.");
  var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
  sString.data = uri;
  prefBranch.setComplexValue("loadurl", Components.interfaces.nsISupportsString, sString);
  loadFireFTP();
}

function fireFTPInitListener(event) {
  var menu       = document.getElementById("contentAreaContextMenu");
  var appcontent = document.getElementById("appcontent");   // browser

  var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var prefBranch  = prefService.getBranch("fireftp.");
  var donated     = prefBranch.getBoolPref("donated");

  // If 'Web Developer' menu is available (introduced in Firefox 6)
  // Remove the old entry in Tools menu.
  if (document.getElementById("menu_webDeveloper_fireftp")) {
    var menuFireftp = document.getElementById("fireftptoolsmenu");
    if (menuFireftp) {
      menuFireftp.parentNode.removeChild(menuFireftp);
    }
  }

  if (menu) {
    menu.addEventListener("popupshowing", fireFTPContextListener, false);
  }

  if (appcontent) {
    appcontent.addEventListener("load", fireFTPLoadListener, true);
  }

  if (!donated) {
    prefBranch.setBoolPref("donated", true);

    var windowContent = window.getBrowser();
    window.setTimeout(function() {
      windowContent.selectedTab = windowContent.addTab("http://fireftp.net/donate.html?installed=true");
    }, 0);
  }
}

function fireFTPCheckForcedListener(event) {
  var doc               = event.originalTarget;
  var prefService       = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var prefBranch        = prefService.getBranch("fireftp.");
  var integrateftplinks = prefBranch.getBoolPref("integrateftplinks");

  var framed = event.originalTarget && window._content && window._content.document && (window._content.document != event.originalTarget);

  if (!integrateftplinks || framed) {
    return;
  }

  if (doc.location && doc.location.href && doc.location.href.toLowerCase().indexOf("ftp://") == 0) {
    var ws = gBrowser.docShell.QueryInterface(Components.interfaces.nsIRefreshURI);

    if (ws) {
      ws.cancelRefreshURITimers();
    }

    var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    sString.data = window._content.document.documentURI;
    prefBranch.setComplexValue("loadurl", Components.interfaces.nsISupportsString, sString);

    doc.location.href = "chrome://fireftp/content/fireftp-pm.xul";
  }
}

function fireFTPContextListener(event) {
  if (!gContextMenu) {
    return;
  }

  var uri = gContextMenu.onLink ? gContextMenu.getLinkURL() : gBrowser.currentURI.spec;

  document.getElementById("fireftpcontentarea").hidden =  gContextMenu.onLink || uri.toLowerCase().indexOf("ftp://") != 0;
  document.getElementById("fireftpcontextmenu").hidden = !gContextMenu.onLink || uri.toLowerCase().indexOf("ftp://") != 0;
}

function fireFTPLoadListener(event) {
  var doc               = event.originalTarget;
  var prefService       = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var prefBranch        = prefService.getBranch("fireftp.");
  var integrateftplinks = prefBranch.getBoolPref("integrateftplinks");

  if (!integrateftplinks || !doc || !doc.getElementsByTagName) {
    return;
  }

  var links = doc.getElementsByTagName('a');

  for (var x = 0; x < links.length; ++x) {
    if (links[x] && links[x].href && links[x].href.toLowerCase().indexOf("ftp://") == 0) {
      links[x].addEventListener('click', loadFireFTPFromLink, true);
    }
  }
}

window.addEventListener("load",             fireFTPInitListener,        false);
window.addEventListener("DOMContentLoaded", fireFTPCheckForcedListener, false);
