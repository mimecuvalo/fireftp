var gPrefAsciiFiles = new Array();
var gStrbundle;
var gPrefs;

// Dev note: the reason we update the gPrefAsciiFiles along with the listbox is b/c when the window is closing and you're
// saving prefs the listbox has a bug (currently in Firefox 1.5) where it's like it's disposing the listbox so that you can't access it

function readPreferences() {
  setTimeout(window.sizeToContent, 0);

  gStrbundle = $("strings");
  var prefs  = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  gPrefs     = prefs.getBranch("fireftp.");

  try {
    var asciiFiles = gPrefs.getComplexValue("asciifiles", Components.interfaces.nsISupportsString).data.split(",");

    for (var x = 0; x < asciiFiles.length && asciiFiles[x] != ""; ++x) {
      $('asciilist').appendItem(asciiFiles[x], asciiFiles[x]);
      gPrefAsciiFiles.push(asciiFiles[x]);
    }

  } catch (ex) { }
}

function savePreferences() {
  try {
    var prefAsciiString = "";

    for (var x = 0; x < gPrefAsciiFiles.length; ++x) {
      if (prefAsciiString) {
        prefAsciiString += "," + gPrefAsciiFiles[x];
      } else {
        prefAsciiString = gPrefAsciiFiles[x];
      }
    }

    var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    sString.data = prefAsciiString;
    gPrefs.setComplexValue("asciifiles", Components.interfaces.nsISupportsString, sString);
  } catch (ex) { }

  return true;
}

function addType() {
  var newType = window.prompt(gStrbundle.getString("addType"), "", gStrbundle.getString("asciiFiles"));

  if (!newType) {
    return;
  }

  newType = newType.toLowerCase();

  for (var x = 0; x < $('asciilist').getRowCount(); ++x) {
    if ($('asciilist').getItemAtIndex(x).value == newType) {
      return;
    }
  }

  for (var x = 0; x < $('asciilist').getRowCount(); ++x) {
    if ($('asciilist').getItemAtIndex(x).value > newType) {
      $('asciilist').insertItemAt(x, newType, newType);
      $('asciilist').ensureIndexIsVisible(x);
      $('asciilist').selectedIndex = x;
      gPrefAsciiFiles.splice(x, 0, newType);
      return;
    }
  }

  $('asciilist').appendItem(newType, newType);
  $('asciilist').ensureIndexIsVisible($('asciilist').getRowCount() - 1);
  $('asciilist').selectedIndex = $('asciilist').getRowCount() - 1;
  gPrefAsciiFiles.push(newType);
}

function removeType() {
  if (!$('asciilist').selectedItem) {
    return;
  }

  var value = $('asciilist').selectedItem.value;
  $('asciilist').removeItemAt($('asciilist').getIndexOfItem($('asciilist').selectedItem));

  for (var x = 0; x < gPrefAsciiFiles.length; ++x) {
    if (gPrefAsciiFiles[x] == value) {
      gPrefAsciiFiles.splice(x, 1);
      break;
    }
  }

  if ($('asciilist').getRowCount()) {
    $('asciilist').ensureIndexIsVisible(0);
    $('asciilist').selectedIndex = 0;
  }
}
