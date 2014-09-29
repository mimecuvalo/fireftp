function commas(num) {                 // add commas to numbers
  num = num.toString();

  if (num.search(/\d{4}$/) == -1 || !gStrbundle.getString("numSep")) {
    return num;
  }

  num = num.replace(/\d{3}$/, gStrbundle.getString("numSep") + "$&");

  var a = new RegExp("\\d{4}" + (gStrbundle.getString("numSep") == "." ? "\\." : gStrbundle.getString("numSep")));
  var b = new RegExp("\\d{3}" + (gStrbundle.getString("numSep") == "." ? "\\." : gStrbundle.getString("numSep")));

  while (num.search(a) != -1) {
    num = num.replace(b, gStrbundle.getString("numSep") + "$&");
  }

  return num;
}

function zeros(num) {                  // pad with zeros
  num = num.toString();
  return num.length == 2 ? num : '0' + num;
}

function onChangeType(mode) {              // change TYPE A/TYPE I/auto from statusbar
  if (gConnection.protocol == 'ftp') {
    gPrefs.setIntPref("filemode", mode);
  }
  changeTypeMenu();
}

function changeTypeMenu() {
  var typeMode;
  if (gConnection.isConnected && gConnection.protocol != 'ftp') {
    typeMode = 1;
  } else {
    typeMode = gPrefs.getIntPref("filemode");
  }

  $('autoMode').setAttribute(  'checked', typeMode == 0);
  $('binaryMode').setAttribute('checked', typeMode == 1);
  $('asciiMode').setAttribute( 'checked', typeMode == 2);
  $('statustype').label = gTransferTypes[(gConnection.protocol == 'ftp' ? gConnection.fileMode : 1)];
}

function setInterfaceMode() {          // update the interface based on collapsing
  var currentCollapsedState = gPrefs.getIntPref("interfacemode");
  var newCollapsedState = ($('leftsplitter').getAttribute('state')  == 'collapsed') * 2
                        + ($('rightsplitter').getAttribute('state') == 'collapsed');
  gPrefs.setIntPref("interfacemode", newCollapsedState);
  // this is some bs, we have to touch the window so that it resizes properly
  if (currentCollapsedState != newCollapsedState) {
    window.resizeBy(1, 1);
    window.resizeBy(-1, -1);
  }
}

function updateInterface() {           // update the interface based on interfacemode variable
  var local  = (gInterfaceMode & 2);
  var remote = (gInterfaceMode & 1);

  $('storbutton').collapsed  = local;
  $('retrbutton').collapsed  = remote;

  $('localview').collapsed   = local;
  $('remoteview').collapsed  = remote;

  $('leftsplitter').setAttribute( 'state', (local  ? 'collapsed' : 'open'));
  $('rightsplitter').setAttribute('state', (remote ? 'collapsed' : 'open'));
}

function updateOpenMode() {
  $('localUpload').setAttribute(   "defaultAction", gOpenMode == 0);
  $('localOpen').setAttribute(     "defaultAction", gOpenMode == 1);
  $('remoteDownload').setAttribute("defaultAction", gOpenMode == 0);
  $('remoteOpen').setAttribute(    "defaultAction", gOpenMode == 1);

  $('localUpload').setAttribute(   "key", gOpenMode == 0 ? "key_transfer" : "");
  $('localOpen').setAttribute(     "key", gOpenMode == 1 ? "key_transfer" : "key_open");
  $('remoteDownload').setAttribute("key", gOpenMode == 0 ? "key_transfer" : "");
  $('remoteOpen').setAttribute(    "key", gOpenMode == 1 ? "key_transfer" : "key_open");
}

function onLocalPathFocus(event) {
  gLocalPathFocus  = gLocalPath.value;
}

function onLocalPathBlur(event) {
  gLocalPath.value = gLocalPathFocus;
}

function onRemotePathFocus(event) {
  gRemotePathFocus = gRemotePath.value;
}

function onRemotePathBlur(event) {
  if (!gConnection.isConnected) {
    gRemotePathFocus  = gRemotePath.value;
  } else {
    gRemotePath.value = gRemotePathFocus;
  }
}

function browseLocal(title) {          // browse the local file structure
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp            = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, title ? title : gStrbundle.getString("selectFolder"), nsIFilePicker.modeGetFolder);
  var res = fp.show();

  if (res == nsIFilePicker.returnOK) {
    localDirTree.changeDir(fp.file.path);
  }

  return res == nsIFilePicker.returnOK;
}

function parseSize(size) {             // adds byte information for file sizes
  if (size >= 1024 * 1024 * 1024) {
    size = gStrbundle.getFormattedString("gigabyte", [parseFloat(size / 1024 / 1024 / 1024).toFixed(1).replace(/\./g, gStrbundle.getString("decimal"))]);
  } else if (size >= 1024 * 1024) {
    size = gStrbundle.getFormattedString("megabyte", [parseFloat(size / 1024 / 1024).toFixed(2).replace(/\./g, gStrbundle.getString("decimal"))]);
  } else if (size >= 1024) {
    size = gStrbundle.getFormattedString("kilobyte", [parseFloat(size / 1024).toFixed(1).replace(/\./g, gStrbundle.getString("decimal"))]);
  } else if (size >= 0) {
    size = gStrbundle.getFormattedString("bytes", [size]);
  }

  return size;
}

function displayWelcomeMessage(msg) {
  if (gWelcomeMode) {
    try {
      if (gWelcomeWindow && gWelcomeWindow.close) {          // get rid of those extra pestering welcome windows if the program is reconnecting automatically
        gWelcomeWindow.close();
      }
    } catch (ex) { }

    gWelcomeWindow = window.openDialog("chrome://fireftp/content/welcome.xul", "welcome", "chrome,resizable,centerscreen", msg);
  }
}

function showCustom(show) {
  $('customToolbar').setAttribute("collapsed", !show);

  if (show) {
    gCustomCmd.value = '';
    gCustomCmd.focus();
    gPrefs.setBoolPref("logmode", true);
    gCmdlogBody.scrollTop = gCmdlogBody.scrollHeight - gCmdlogBody.clientHeight;  // scroll to bottom

    if (gConnection.protocol == 'ftp') {
      gConnection.changeWorkingDirectory(gRemotePath.value);
    } else {
      gConnection.startCustomShell();
    }
  }
}

function customExecute() {
  if (!gConnection.isConnected || !isReady()) {
    return;
  }

  var cmd = gCustomCmd.value;
  gCustomCmd.value = '';

  if (!cmd) {
    return;
  }

  FormHistory.update({ 'op': 'remove', 'fieldname': gCustomCmd.getAttribute("autocompletesearchparam"), value: cmd });
  FormHistory.update({ 'op': 'add', 'fieldname': gCustomCmd.getAttribute("autocompletesearchparam"), value: cmd });
  gConnection.custom(cmd);
}

function cloneObject(what) {
  for (i in what) {
    this[i] = what[i];
  }
}

function runInFirefox(path) {
  var windowManager          = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService();
  var windowManagerInterface = windowManager.QueryInterface(Components.interfaces.nsIWindowMediator);
  var win                    = windowManagerInterface.getMostRecentWindow("navigator:browser");

  if (win) {
    var theTab               = win.gBrowser.addTab(path);
    win.gBrowser.selectedTab = theTab;
    return;
  }

  try {    // this is used if FireFTP is running as a standalone and there are no browsers open; much more complicated, not very pretty
    var firefoxInstallPath = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                                       .get("CurProcD", Components.interfaces.nsILocalFile);
    var firefox            = localFile.init(firefoxInstallPath.path + "\\" + "firefox.exe");

    if (!firefox.exists()) {                                 // try linux
      firefox.initWithPath(firefoxInstallPath.path + "/" + "firefox");
      if (!firefox.exists()) {                               // try os x
        firefox.initWithPath(firefoxInstallPath.path + "/" + "firefox-bin");
      }
    }

    var process = Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess);
    process.init(firefox);
    var arguments = new Array(path);
    process.run(false, arguments, arguments.length, {});
  } catch (ex) {
    debug(ex);
  }
}

function tipJar() {
  if (!gDonated) {
    gPrefs.setBoolPref("donated", true);
    runInFirefox("http://fireftp.net/donate.html");
  }
}

function doAbort() {
  gSearchRunning = false;
  var forceKill  = false;

  if (gFxp && gFxp.isConnected) {
    gFxp.disconnect();
    forceKill = true;
  }

  if (gConnection.protocol == 'ssh2') {
    forceKill = true;
  }

  for (var x = 0; x < gMaxCon; ++x) {
    gConnections[x].abort(forceKill);
    forceKill = false;
  }

  queueTree.selection.selectAll();
  queueTree.cancel();
}

function toolsPopupMenu() {
  $('diffMenuItem').setAttribute("disabled",     !gConnection.isConnected || localTree.searchMode == 2 || remoteTree.searchMode == 2);
  $('recDiffMenuItem').setAttribute("disabled",  !gConnection.isConnected || localTree.searchMode == 2 || remoteTree.searchMode == 2);
}

function setCharAt(str, index, ch) {                         // how annoying
  return str.substr(0, index) + ch + str.substr(index + 1);
}

// thanks to David Huynh
// http://mozilla-firefox-extension-dev.blogspot.com/2004/11/passing-objects-between-javascript.html
function wrapperClass(obj) {
  this.wrappedJSObject = this;
  this.obj             = obj;
}

wrapperClass.prototype = {
  QueryInterface : function(iid) {
    if (iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
}

function getPlatform() {
  var platform = navigator.platform.toLowerCase();

  if (platform.indexOf('linux') != -1) {
    return 'linux';
  }

  if (platform.indexOf('mac') != -1) {
    return 'mac';
  }

  if (platform.indexOf('win') != -1) {
    return 'windows';
  }

  return 'other';
}

function doResizeReverseHack() {        // bah, humbug - we have to do all this crap to get the horizontal scroll on dir. views
  // only do this if in tab mode; window mode causes this problem:
  // https://www.mozdev.org/bugs/show_bug.cgi?id=24935
  if (gLoadMode != 1) {
    return;
  }

  //$('localdirtree').setAttribute(    'flex', '1');
  //$('remotedirtree').setAttribute(   'flex', '1');
  $('localview').setAttribute(       'flex', '1');
  $('remoteview').setAttribute(      'flex', '1');
  //$('localdirtree').removeAttribute( 'width');
  //$('remotedirtree').removeAttribute('width');
  $('localview').removeAttribute(    'width');
  $('remoteview').removeAttribute(   'width');

  doResizeHack();
}

function doResizeHack() {
  $('localdirtree').setAttribute(    'width', $('localdirtree').treeBoxObject.width);
  $('remotedirtree').setAttribute(   'width', $('remotedirtree').treeBoxObject.width);
  $('localview').setAttribute(       'width', $('localview').boxObject.width);
  //$('remoteview').setAttribute(      'width', $('remoteview').boxObject.width);
  $('localdirtree').removeAttribute( 'flex');
  $('remotedirtree').removeAttribute('flex');
  $('localview').removeAttribute(    'flex');
  //$('remoteview').removeAttribute(   'flex');
}

function testAccelKey(event) {
  if (getPlatform() == 'mac') {
    return event.metaKey;
  }

  return event.ctrlKey;
}

function parseArguments(args) {
  args = args.split('?');
  if (args.length < 2) {
    return {};
  }
  args = args[1].split('&');

  var parsedArgs = {};
  for (var x = 0; x < args.length; ++x) {
    var split = args[x].split('=');
    parsedArgs[split[0]] = decodeURIComponent(split[1]);
  }

  return parsedArgs;
}

function getArgument(args, field) {
  var parsedArgs = parseArguments(args);
  return parsedArgs[field] || '';
}

function generateArgs(args) {
  if (!args) {
    return '';
  }

  var queryString = '';
  for (var key in args) {
    queryString += (!queryString.length ? '?' : '&') + key + '=' + encodeURIComponent(args[key]);
  }

  return queryString;
}

// Converts objects stored in toSource format to JSON format.
// Not for general purpose usage - this works in FireFTP's case.
// Does not check for example if
// , <string>:
// exists between quotes, i.e. a property value.
function jsonParseWithToSourceConversion(toSource) {
  try {
    return JSON.parse(toSource);
  } catch(ex) {
    // As Borat would say: This is totally awesome. NOT.
    toSource = unescape(toSource.replace(/[^\\]\\x/g, '%'));
    return JSON.parse(toSource.replace(/({|, )(\w+?):/g, '$1"$2":'));
  }
}
