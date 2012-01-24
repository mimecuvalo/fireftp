var gStrbundle;
var gPrograms;
var gArgs;

function init() {
  setTimeout(window.sizeToContent, 0);

  gStrbundle = $("strings");
  gArgs      = window.arguments;
  gPrograms  = gArgs[0].value;
  var index  = -1;

  for (var x = 0; x < gPrograms.length; ++x) {
    if (gPrograms[x].extension == gArgs[0].extension.toLowerCase()) {
      index = x;
    }

    $('extensions').appendItem(gPrograms[x].extension, gPrograms[x].extension);
  }

  disableAll();

  if (index == -1 && gArgs[0].extension != "") {
    var func = function() {
      initHelper();
    };
    setTimeout(func, 0);
  } else if (gArgs[0].extension != "") {
    var func = function() {
      initHelper2(index);
    };
    setTimeout(func, 0);
  }
}

function initHelper() {                             // XXX: we get warnings otherwise if we don't do the setTimeout.  stupid listbox.
  addExtension(gArgs[0].extension.toLowerCase());
  addProgram();
}

function initHelper2(index) {                       // XXX: ditto
  $('extensions').ensureIndexIsVisible(index);
  $('extensions').selectedIndex = index;
  loadPrograms();
  addProgram();
}

function disableAll() {
  $('program').disabled = true;
  $('addp').disabled    = true;
  $('removep').disabled = true;
  detailsDisabler(true);

  for (var x = $('program').getRowCount() - 1; x >= 0; --x) {
    $('program').removeItemAt(x);
  }
}

function detailsDisabler(disable) {
  $('namelabel').disabled       = disable;
  $('name').disabled            = disable;
  $('executablelabel').disabled = disable;
  $('executable').disabled      = disable;
  $('browse').disabled          = disable;
  $('argumentslabel').disabled  = disable;
  $('arguments').disabled       = disable;
  $('argshelp1').disabled       = disable;
  $('argshelp2').disabled       = disable;
  $('apply').disabled           = disable;
  $('name').value               = "";
  $('executable').value         = "";
  $('arguments').value          = "";
  $('name').removeAttribute('missing');
  $('executable').removeAttribute('missing');
}

function addExtension(ext) {
  var newExtension = ext ? ext : window.prompt(gStrbundle.getString("extension"), "", gStrbundle.getString("addExtension"));

  if (!newExtension || newExtension == ".") {
    return;
  }

  if (newExtension.indexOf('.') != -1) {
    newExtension = newExtension.substring(newExtension.lastIndexOf('.') + 1, newExtension.length);
  }

  newExtension = { extension: newExtension.toLowerCase(), programs: new Array() };

  for (var x = 0; x < $('extensions').getRowCount(); ++x) {
    if ($('extensions').getItemAtIndex(x).value == newExtension.extension) {
      return;
    }
  }

  for (var x = 0; x < $('extensions').getRowCount(); ++x) {
    if ($('extensions').getItemAtIndex(x).value > newExtension.extension) {
      $('extensions').insertItemAt(x, newExtension.extension, newExtension.extension);
      gPrograms.splice(x, 0, newExtension);
      $('extensions').ensureIndexIsVisible(x);
      $('extensions').selectedIndex = x;
      loadPrograms();
      return;
    }
  }

  $('extensions').appendItem(newExtension.extension, newExtension.extension);
  gPrograms.push(newExtension);

  disableAll();

  $('extensions').ensureIndexIsVisible($('extensions').getRowCount() - 1);
  $('extensions').selectedIndex = $('extensions').getRowCount() - 1;
  loadPrograms();
  $('addp').focus();
}

function removeExtension() {
  if (!$('extensions').selectedItem) {
    return;
  }

  var value = $('extensions').selectedItem.value;

  if (value == "*.*") {
    return;
  }

  $('extensions').removeItemAt($('extensions').getIndexOfItem($('extensions').selectedItem));

  for (var x = 0; x < gPrograms.length; ++x) {
    if (gPrograms[x].extension == value) {
      gPrograms.splice(x, 1);
      break;
    }
  }

  disableAll();
}

function loadPrograms() {
  if (!$('extensions').selectedItem) {
    return;
  }

  $('removeext').disabled = $('extensions').selectedItem.value == "*.*";
  $('program').disabled   = false;
  $('addp').disabled      = false;
  $('removep').disabled   = false;
  detailsDisabler(true);

  for (var x = $('program').getRowCount() - 1; x >= 0; --x) {
    $('program').removeItemAt(x);
  }

  for (var x = 0; x < gPrograms.length; ++x) {
    if ($('extensions').selectedItem.value == gPrograms[x].extension) {
      for (var y = 0; y < gPrograms[x].programs.length; ++y) {
        $('program').appendItem(gPrograms[x].programs[y].name, gPrograms[x].programs[y].name);
      }
      break;
    }
  }
}

function loadProgramDetails() {
  if (!$('program').selectedItem) {
    return;
  }

  for (var x = 0; x < gPrograms.length; ++x) {
    if ($('extensions').selectedItem.value == gPrograms[x].extension) {
      for (var y = 0; y < gPrograms[x].programs.length; ++y) {
        if ($('program').selectedItem.value == gPrograms[x].programs[y].name) {
          detailsDisabler(false);
          $('name').value       = gPrograms[x].programs[y].name;
          $('executable').value = gPrograms[x].programs[y].executable;
          $('arguments').value  = gPrograms[x].programs[y].arguments;
          break;
        }
      }
      break;
    }
  }
}

function addProgram() {
  if (!$('extensions').selectedItem) {
    return;
  }

  detailsDisabler(false);
  $('name').focus();
}

function removeProgram() {
  if (!$('program').selectedItem) {
    return;
  }

  for (var x = 0; x < gPrograms.length; ++x) {
    if ($('extensions').selectedItem.value == gPrograms[x].extension) {
      for (var y = 0; y < gPrograms[x].programs.length; ++y) {
        if ($('program').selectedItem.value == gPrograms[x].programs[y].name) {
          gPrograms[x].programs.splice(y, 1);
          break;
        }
      }
      break;
    }
  }

  var value = $('program').selectedItem.value;
  $('program').removeItemAt($('program').getIndexOfItem($('program').selectedItem));

  loadPrograms();
}

function apply() {
  if ($('name').value == "" || $('executable').value == "") {
    if ($('executable').value == "") {
      $('executable').setAttribute('missing', true);
      $('executable').focus();
    }

    if ($('name').value == "") {
      $('name').setAttribute('missing', true);
      $('name').focus();
    }

    return;
  }

  var extIndex       = 0;
  var inserted       = false;
  var programDetails = { name       : $('name').value,
                         executable : $('executable').value,
                         arguments  : $('arguments').value };

  for (var x = 0; x < gPrograms.length; ++x) {
    if ($('extensions').selectedItem.value == gPrograms[x].extension) {
      extIndex = x;
      for (var y = 0; y < gPrograms[x].programs.length; ++y) {
        if (gPrograms[x].programs[y].name == $('name').value) {
          gPrograms[x].programs[y] = programDetails;
          inserted = true;
          break;
        }
        if (gPrograms[x].programs[y].name > $('name').value) {
          gPrograms[x].programs.splice(y, 0, programDetails);
          inserted = true;
          break;
        }
      }
      break;
    }
  }

  if (!inserted) {
    gPrograms[extIndex].programs.push(programDetails);
  }

  loadPrograms();
}

function browseLocal() {
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp            = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, gStrbundle.getString("selectFolder"), nsIFilePicker.modeOpen);
  fp.appendFilters(nsIFilePicker.filterApps | nsIFilePicker.filterAll);
  var res = fp.show();

  if (res == nsIFilePicker.returnOK) {
    $('executable').value = fp.file.path;
  }
}

function savePrograms() {
  if (!$('apply').disabled) {
    apply();
  }

  gArgs[1].value = true;
  return true;
}
