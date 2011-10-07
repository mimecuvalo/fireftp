function showSearch(show) {
  $('searchToolbar').setAttribute("collapsed", !show);

  if (show) {
    $('searchFile').focus();
    $('searchFile').select();
  } else {
    if (localTree.searchMode) {
      localTree.updateView();
    }

    if (remoteTree.searchMode) {
      remoteTree.updateView();
    }
  }
}

function searchSelectType() {
  $('searchButton').disabled   =  $('searchWhich').selectedIndex == 1 && (!gConnection || !gConnection.isConnected);
}

function showSearchDates() {
  $('searchDateBox').collapsed = !$('searchDates').getAttribute('checked');
}

function searchWrapper() {
  gSearchRemoteUpdate = false;

  if (gSearchRunning) {
    if (gSearchType && gSearchRecursive) {
      gConnection.abort();
    }

    gSearchRunning = false;
    --gProcessing;
    $('searchFile').disabled = false;
    $('searchButton').label = gStrbundle.getString("search");
    $('searchFile').focus();
    return;
  }

  search();
}

function search(zeParent, last) {
  if (zeParent && !gSearchRunning) {
    return;
  }

  if (!zeParent) {                                                                      // get the input variables
    gSearchDates     = $('searchDates').getAttribute('checked');

    if (!$('searchFile').value && !gSearchDates) {
      if (localTree.searchMode) {
        localTree.updateView();
      }

      if (remoteTree.searchMode) {
        remoteTree.updateView();
      }

      return;
    }

    gSearchFound     = false;
    gSearchCallbacks = new Array();
    gSearchName      = $('searchFile').value;
    gSearchType      = $('searchWhich').selectedIndex;
    gSearchRecursive = $('searchSubdir').getAttribute('checked');
    gSearchMatchCase = $('searchMatchCase').getAttribute('checked');
    gSearchRegExp    = $('searchRegExp').getAttribute('checked');
    gSearchFrom      = $('searchDateFrom').dateValue;
    gSearchTo        = $('searchDateTo').dateValue;
    gSearchFrom.setHours(0); gSearchFrom.setMinutes(0); gSearchFrom.setSeconds(0); gSearchFrom.setMilliseconds(0);
    gSearchTo.setHours(0);   gSearchTo.setMinutes(0);   gSearchTo.setSeconds(0);   gSearchTo.setMilliseconds(0);

    if (!gSearchRegExp) {                                                               // extract the search terms
      gSearchName    = gSearchName.replace(/'/g, '"');

      var quote = false;
      for (var x = 0; x < gSearchName.length; ++x) {
        if (gSearchName.charAt(x) == '"' || gSearchName.charAt(x) == "'") {
          quote = !quote;
        } else if (gSearchName.charAt(x) == ' ' && quote) {
          gSearchName = setCharAt(gSearchName, x, "/");
        } else if (gSearchName.charAt(x) == ',' && !quote) {
          gSearchName = setCharAt(gSearchName, x, " ");
        } else if (gSearchName.charAt(x) == '*' && !quote) {
          gSearchName = setCharAt(gSearchName, x, " ");
        }
      }

      gSearchName    = gSearchName.replace(/"/g, "");
      gSearchName    = gSearchName.split(" ").filter(removeBlanks);

      for (var x = 0; x < gSearchName.length; ++x) {
        gSearchName[x] = gSearchName[x].trim().replace(/\//g, " ");
      }
    }
  }

  if (gSearchType && (!gConnection.isConnected || (!zeParent && !isReady()))) {
    return;
  }

  if (!zeParent) {                                                                      // reset trees, setup for new search
    if (!gSearchType && localTree.searchMode) {
      localTree.updateView();
    } else if (gSearchType && remoteTree.searchMode && !gSearchRemoteUpdate) {
      gSearchRemoteUpdate = true;
      remoteTree.updateViewCallback = search;
      remoteTree.updateView();
      return;
    }

    gSearchRunning = true;
    ++gProcessing;
    $('searchFile').removeAttribute("status");
    $('searchStatusIcon').removeAttribute("status");
    $('searchStatus').value  = '';
    $('searchButton').focus();
    $('searchFile').disabled = true;
    $('searchButton').label  = gStrbundle.getString("searchStop");
  }

  var files = new Array();

  if (zeParent) {                                                                       // get the files to be searched
    if (gSearchType) {
      for (var x = 0; x < gConnection.listData.length; ++x) {
        files.push(gConnection.listData[x]);
      }
    } else {
      try {
        var dir     = localFile.init(zeParent);
        var innerEx = gFireFTPUtils.getFileList(dir, new wrapperClass(files));

        if (innerEx) {
          throw innerEx;
        }
      } catch (ex) {
        debug(ex);
        return;                                                                         // skip this directory
      }
    }
  } else {
    if (gSearchType) {
      for (var x = 0; x < remoteTree.data.length; ++x) {
        files.push(remoteTree.data[x]);
      }
    } else {
      for (var x = 0; x < localTree.data.length; ++x) {
        files.push(localTree.data[x]);
      }
    }
  }

  if (gSearchRecursive) {
    files.sort(compareName).reverse();
  }

  if (gSearchType && gSearchRecursive && !zeParent) {
    gConnection.beginCmdBatch();
  }

  var searchFiles  = new Array();
  var anyRecursion = false;
  var firstFolder  = true;
  var allMinus     = true;
  var regEx;

  for (var y = 0; y < gSearchName.length; ++y) {
    if (gSearchName[y].charAt(0) != '-') {
      allMinus = false;
      break;
    }
  }

  if (gSearchRegExp) {
    regEx = new RegExp(gSearchName, gSearchMatchCase ? "" : "i");
  }

  for (var x = 0; x < files.length; ++x) {                                              // do the search!
    var exclude = false;

    if (gSearchRegExp) {
      if (files[x].leafName.search(regEx) != -1) {
        searchFiles.push(files[x]);
      }
    } else {
      if (allMinus) {
        searchFiles.push(files[x]);
      }

      for (var y = 0; y < gSearchName.length; ++y) {
        if (gSearchName[y].charAt(0) == '-') {
          if (gSearchRecursive && files[x].isDirectory()) {
            if ((!gSearchMatchCase && files[x].leafName.toLowerCase().indexOf(gSearchName[y].substring(1).toLowerCase()) != -1)
              || (gSearchMatchCase && files[x].leafName.indexOf(gSearchName[y].substring(1)) != -1)) {
              exclude = true;
            }
          }

          continue;
        }

        var searchTerm = gSearchName[y].charAt(0) == '+' ? gSearchName[y].substring(1) : gSearchName[y];

        if ((!gSearchMatchCase && files[x].leafName.toLowerCase().indexOf(searchTerm.toLowerCase()) != -1)
          || (gSearchMatchCase && files[x].leafName.indexOf(searchTerm) != -1)) {
          searchFiles.push(files[x]);
          break;
        }
      }
    }

    if (gSearchRecursive && files[x].isDirectory() && !exclude) {                       // look in subdirectories if needed
      makeSearchCallback(files[x], (firstFolder && !zeParent) || last);
      last         = false;
      anyRecursion = true;
      firstFolder  = false;
    }
  }

  if (!gSearchRegExp) {                                                                 // look at + and - criteria
    for (var x = 0; x < gSearchName.length; ++x) {
      var ch = gSearchName[x].charAt(0);

      if (ch != '+' && ch != '-') {
        continue;
      }

      for (var y = searchFiles.length - 1; y >= 0; --y) {
        if (!gSearchMatchCase && ((ch == '-' && searchFiles[y].leafName.toLowerCase().indexOf(gSearchName[x].substring(1).toLowerCase()) != -1)
                               || (ch == '+' && searchFiles[y].leafName.toLowerCase().indexOf(gSearchName[x].substring(1).toLowerCase()) == -1))) {
          searchFiles.splice(y, 1);
        } else if (gSearchMatchCase && ((ch == '-' && searchFiles[y].leafName.indexOf(gSearchName[x].substring(1)) != -1)
                                     || (ch == '+' && searchFiles[y].leafName.indexOf(gSearchName[x].substring(1)) == -1))) {
          searchFiles.splice(y, 1);
        }
      }
    }
  }

  if (gSearchDates) {                                                                   // look at dates
    for (var x = searchFiles.length - 1; x >= 0; --x) {
      if (searchFiles[x].lastModifiedTime < gSearchFrom || searchFiles[x].lastModifiedTime - 86400000 > gSearchTo) {
        searchFiles.splice(x, 1);
      }
    }
  }

  if (searchFiles.length) {                                                             // update the view with the new results
    gSearchFound = true;

    if (gSearchType) {
      remoteTree.updateView2(searchFiles);
    } else {
      localTree.updateView(searchFiles);
    }
  }

  if (gSearchType && gSearchRecursive && !zeParent) {
    gConnection.endCmdBatch();
  }

  if (!last && !gSearchType && gSearchRecursive && !zeParent) {                         // go to next directory
    while (gSearchCallbacks.length) {
      var func = gSearchCallbacks[0];
      gSearchCallbacks.shift();
      func();
    }
  }

  if (!gSearchRecursive || last || (!anyRecursion && !zeParent)) {
    finalSearchCallback();
  }
}

function makeSearchCallback(file, last) {
  var func = function() {
    search(file.path, last);
  };

  if (gSearchType) {
    gConnection.list(file.path, func, true, true);
  } else {
    gSearchCallbacks.unshift(func);
  }
}

function finalSearchCallback() {                                                        // close up shop
  gSearchRunning = false;
  --gProcessing;
  $('searchFile').disabled = false;
  $('searchFile').focus();
  $('searchButton').label = gStrbundle.getString("search");

  if (!gSearchFound) {
    $('searchFile').setAttribute("status",       "notfound");
    $('searchStatusIcon').setAttribute("status", "notfound");
    $('searchStatus').value = gStrbundle.getString("notFound");
    return;
  }
}

function removeBlanks(element, index, array) {
  return element;
}
