var gStrbundle;
var gAnonymous;
var gArgs;
var gSite;
var gSiteManager;
var gCallback;
var gCancelCallback;
var gAutoAccount = false;
var gOrigAccount;

let Ci = Components.interfaces;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CharsetMenu",
    "resource://gre/modules/CharsetMenu.jsm");

function init() {
  setTimeout(window.sizeToContent, 0);

  gStrbundle                  = $("strings");
  gArgs                       = window.arguments[0];
  gSite                       = window.arguments[0].site;
  gOrigAccount                = window.arguments[0].site.account;
  gSiteManager                = window.arguments[0].siteManager;
  gCallback                   = window.arguments[0].callback;
  gCancelCallback             = window.arguments[0].cancelCallback;
  gAnonymous                  = gSite.anonymous;

  gSite.timezone              = gSite.timezone ? gSite.timezone : 0;

  createFolders();

  $('account').value          = gSite.account;
  $('host').value             = gSite.host;
  $('port').value             = gSite.port;
  $('login').value            = gSite.login;
  $('password').value         = gSite.password;
  $('anonymous').checked      = gAnonymous;
  $('login').disabled         = gAnonymous;
  $('password').disabled      = gAnonymous;
  $('security').value         = gSite.security   || "";
  $('pasvmode').checked       = gSite.pasvmode;
  $('ipmode').checked         = gSite.ipmode;
  $('webhost').value          = gSite.webhost    || "";
  $('prefix').value           = gSite.prefix     || "";
  $('localdir').value         = gSite.localdir;
  $('remotedir').value        = gSite.remotedir;
  $('treesync').checked       = gSite.treesync;
  $('encoding').setAttribute("label", gSite.encoding || "UTF-8");
  $('notes').value            = gSite.notes      || "";
  $('timezoneHours').value    = parseInt(gSite.timezone / 60);
  $('timezoneMinutes').value  = gSite.timezone - parseInt(gSite.timezone / 60) * 60;
  $('folder').value           = gSite.folder     || "";
  $('privatekey').value       = gSite.privatekey || "";

  onPassiveChange();
  onSftpChange();
  webPreview();

  initialDirChange();

  $('host').focus();

  if (!$('account').value && !gArgs.quickConnect) {
    gAutoAccount = true;
  }

  if (gArgs.quickConnect) {                                // this is a QuickConnect, no data saved, put a Connect button in place of an Ok button
    $('accountrow').collapsed                      = true;
    $('accountManager8').getButton("accept").label = gStrbundle.getString("connectButton");
    document.title                                 = gStrbundle.getString("quickConnect");
  }

  if (!gArgs.quickConnect && gSite.temporary) {
    $('accountManager8').getButton("accept").label = gStrbundle.getString("saveTempAccount");
    $('accountManager8').getButton("extra2").collapsed = true;
  } else if (gSite.account) {
    $('accountManager8').getButton("extra2").label = gStrbundle.getString("delete");
    $('accountManager8').getButton("extra2").setAttribute("onclick", "doDelete()");
  } else {
    $('accountManager8').getButton("extra2").collapsed = true;
  }
}

function createFolders() {
  var folders = new Array();

  for (var x = 0; x < gSiteManager.length; ++x) {
    var found = false;
    gSiteManager[x].folder = gSiteManager[x].folder || "";

    for (var y = 0; y < folders.length; ++y) {
      if (gSiteManager[x].folder == folders[y]) {
        found = true;
        break;
      }
    }

    if (!found && gSiteManager[x].folder != "") {
      folders.push(gSiteManager[x].folder);
    }
  }

  folders.sort();

  for (var x = 0; x < folders.length; ++x) {
    $('folder').appendItem(folders[x], folders[x]);
  }
}

function autoAccount() {
  if (gAutoAccount) {
    $('account').value = $('host').value;
  }
}

function autoAccountDisable() {
  gAutoAccount = false;
}

function useCurrentLocal() {
  $('localdir').value  = gArgs.localPath.value;
  initialDirChange();
}

function useCurrentRemote() {
  $('remotedir').value = gArgs.remotePath.value;
  initialDirChange();
}

function anonymousChange() {
  gAnonymous             = !gAnonymous;
  $('login').disabled    =  gAnonymous;
  $('password').disabled =  gAnonymous;
  $('login').value       =  gAnonymous ? "anonymous"           : "";
  $('password').value    =  gAnonymous ? "fireftp@example.com" : "";
}

function initialDirChange() {
  $('treesync').disabled = !$('localdir').value || !$('remotedir').value;

  if ($('treesync').disabled) {
    $('treesync').checked = false;
  }
}

function onPassiveChange() {
  $('security').disabled = !$('pasvmode').checked;
}

function onSecurityChange() {
  $('port').value       = $('security').value == "ssl" ? 990 : ($('security').value == "sftp" ? 22 : 21);
  onSftpChange();
}

function onSftpChange() {
  $('pasvmode').disabled           = $('security').value != "";
  $('ipmode').disabled             = $('security').value == "sftp";
  $('privatekeylbl').disabled      = $('security').value != "sftp";
  $('privatekey').disabled         = $('security').value != "sftp";
  $('privatekeyBrowse').disabled   = $('security').value != "sftp";
}

function privateKeyBrowse() {
  var nsIFilePicker   = Components.interfaces.nsIFilePicker;
  var fp              = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, null, nsIFilePicker.modeOpen);

  if (getPlatform() != 'windows') {
    fp.displayDirectory = localFile.init("~/.ssh");
  }

  var res = fp.show();

  if (res != nsIFilePicker.returnOK) {
    return;
  }

  $('privatekey').value = fp.file.path;
}

function createMenu(node) {
  var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
  observerService.notifyObservers(null, "charsetmenu-selected", node);
}

function chooseCharset(event) {
  var node     = event.target;
  var fromUTF8 = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService(Components.interfaces.nsIScriptableUnicodeConverter);

  try {
    fromUTF8.charset = node.getAttribute('charset');
    $('encoding').setAttribute("label", node.getAttribute('charset'));
  } catch (ex) {
    $('encoding').setAttribute("label", "UTF-8");
  }
}

function doDelete() {
  if (!confirm(gStrbundle.getFormattedString("confirmDelete", [gSite.account]))) {
    return;
  }

  gSite.markedForDeath = true;
  gCallback(gSite);

  $('accountManager8').cancelDialog();
}

function webPreview() {
  var exampleFile = $('prefix').value + '/example/file.txt';
  $('webpreview').value = exampleFile + ' -> ' +
      $('webhost').value + exampleFile.substring($('prefix').value.length);
}

function doOk() {
  $('host').value = $('host').value.replace(/^http:\/*/, '');
  $('host').removeAttribute('missing');
  $('account').removeAttribute('missing');

  if ((!gArgs.quickConnect && $('account').value == "") || $('host').value == "") {
    $('tabbox').selectedIndex = 0;

    if ($('host').value == "") {
      $('host').setAttribute('missing', true);
      $('host').focus();
    }

    if (!gArgs.quickConnect && $('account').value == "") {
      $('account').setAttribute('missing', true);
      $('account').focus();
    }

    return false;
  }

  if (!gArgs.quickConnect && gOrigAccount != $('account').value) {
    for (var x = 0; x < gSiteManager.length; ++x) {
      if (gSiteManager[x].account == $('account').value) {
        $('account').setAttribute('missing', true);
        $('account').select();
        alert(gStrbundle.getString("dupAccount"));
        return false;
      }
    }
  }

  gSite.account          = $('account').value;
  gSite.folder           = $('folder').value;
  gSite.host             = $('host').value.trim();
  gSite.port             = $('port').value;
  gSite.login            = $('login').value.trim();
  gSite.password         = $('password').value;
  gSite.anonymous        = $('anonymous').checked;
  gSite.protocol         = $('security').value == 'sftp' ? 'ssh2' : 'ftp';
  gSite.security         = $('security').value;
  gSite.pasvmode         = $('pasvmode').checked;
  gSite.ipmode           = $('ipmode').checked;
  gSite.webhost          = $('webhost').value.trim();
  gSite.prefix           = $('prefix').value;
  gSite.localdir         = $('localdir').value;
  gSite.remotedir        = $('remotedir').value;
  gSite.treesync         = $('treesync').checked;
  gSite.encoding         = $('encoding').getAttribute("label");
  gSite.notes            = $('notes').value;
  gSite.timezone         = (parseInt($('timezoneHours').value) * 60) + parseInt($('timezoneMinutes').value);
  gSite.privatekey       = $('privatekey').value;

  if (!gArgs.quickConnect && gSite.temporary) {
    gSite.temporary      = false;
  }

  gCallback(gSite);

  return true;
}

function doCancel() {
  if (gCancelCallback) {
    gCancelCallback();
  }

  return true;
}
