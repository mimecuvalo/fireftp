// to reuse this code properly, I recommend reading the note in localTree.js

var localDirTree = {
  data         : new Array(),
  rowCount     : 0,
  exceptions   : new Array(),
  dirtyList    : new Array(),
  ignoreSelect : false,

  getCellText         : function(row, column)       { return this.data[row].leafName; },
  getLevel            : function(row)               { return this.data[row].level; },
  getParentIndex      : function(row)               { return this.data[row].parentIndex; },
  getImageSrc         : function(row, col)          { },
  getColumnProperties : function(colid, col, props) { },
  getRowProperties    : function(row, props)        { },
  hasNextSibling      : function(row, nextrow)      { return this.data[row].hasNext; },
  isContainer         : function(row)               { return true; },
  isContainerEmpty    : function(row)               { return this.data[row].empty; },
  isContainerOpen     : function(row)               { return this.data[row].open; },
  isSeparator         : function(row)               { return false; },
  isSorted            : function(row)               { return false; },
  setTree             : function(treebox)           { this.treebox = treebox; },

  setProperty: function(prop, value) {
    if (prop) {
      prop.AppendElement(gAtomService.getAtom(value));
      return "";
    } else {
      return " " + value;
    }
  },

  getCellProperties : function(row, col, props)   {
    let properties = "";
    if (row >= 0 && row < this.data.length && this.data[row]) {
      if (this.data[row].isHidden) {
        properties += this.setProperty(props, "hidden");
      }
    }
    return properties;
  },

  toggleOpenState     : function(row, suppressChange) {
    var doOpen = true;

    if (this.isContainerOpen(row)) {
      doOpen = false;
      var level     = this.data[row].level;
      var lastChild = row;

      while (lastChild + 1 < this.rowCount && this.data[lastChild + 1].level > level) {            // find last index in same level as collapsed dir
        ++lastChild;
      }

      this.data[row].children = this.data.splice(row + 1, lastChild - row);                        // get rid of subdirectories from view
      this.updateParentIndices();
      this.rowCount = this.data.length;
      this.treebox.rowCountChanged(row, -(lastChild - row));

      this.data[row].open = false;
      this.treebox.invalidateRow(row);                                                             // update row

      var localPathSlash = gLocalPath.value    + (gLocalPath.value.charAt(gLocalPath.value.length - 1)       != gSlash ? gSlash : '');
      var dataPathSlash  = this.data[row].path + (this.data[row].path.charAt(this.data[row].path.length - 1) != gSlash ? gSlash : '');

      if (localPathSlash.indexOf(dataPathSlash) == 0 && gLocalPath.value != this.data[row].path
       && gLocalPath.value.match(gSlash == "/" ? /\x2f/g : /\x5c/g ).length > this.data[row].level && !suppressChange) {
        gLocalPath.value = this.data[row].path;                                                    // we were in a subdirectory and we collapsed
        this.selection.select(row);
        this.treebox.ensureRowIsVisible(row);
        localTree.updateView();
      } else if (gLocalPath.value == this.data[row].path) {
        this.selection.select(row);
        this.treebox.ensureRowIsVisible(row);
      }
    } else {
      for (var x = 0; x < this.dirtyList.length; ++x) {                                            // see if the row is dirty
        if (this.dirtyList[x] == this.data[row].path) {
          this.dirtyList.splice(x, 1);
          this.data[row].children = null;
          break;
        }
      }

      if (this.data[row].children) {                                                               // see if any of the rows children are dirty
        for (var x = 0; x < this.dirtyList.length; ++x) {
          var found = false;

          for (var y = this.data[row].children.length - 1; y >= 0; --y) {
            if (this.data[row].children[y].path == this.dirtyList[x]) {
              found = true;
              this.data[row].children[y].children = null;
              this.data[row].children[y].open     = false;
              this.data[row].children[y].empty    = false;
            } else if (this.data[row].children[y].path.indexOf(this.dirtyList[x]
                                                            + (this.dirtyList[x].charAt(this.dirtyList[x].length - 1) != gSlash ? gSlash : '')) == 0) {
              found = true;
              this.data[row].children.splice(y, 1);
            }
          }

          if (found) {
            this.dirtyList.splice(x, 1);
          }
        }
      }

      if (this.data[row].children) {                                                               // stored from before
        for (var x = this.data[row].children.length - 1; x >= 0; --x) {
          this.data.splice(row + 1, 0, this.data[row].children[x]);
        }

        this.updateParentIndices();
        this.rowCount           = this.data.length;
        this.treebox.rowCountChanged(row + 1, this.data[row].children.length);
        this.data[row].children = null;
        this.data[row].open     = true;
        this.treebox.invalidateRow(row);
      } else {                                                                                     // get data for this directory
        var newDirectories = new Array();

        try {
          var dir     = localFile.init(this.data[row].path);
          var entries = dir.directoryEntries;

          while (entries.hasMoreElements()) {
            var file          = entries.getNext().QueryInterface(Components.interfaces.nsILocalFile);// get subdirectories
            var isParent      = false;
            var isException   = false;
            var filePathSlash = file.path + (file.path.charAt(file.path.length - 1) != gSlash ? gSlash : '');

            if (file.exists() && localFile.testSize(file) && file.isDirectory() && this.findDirectory) {                       // we're navigating to a directory that might be hidden
              var findDirectorySlash = this.findDirectory.path
                                    + (this.findDirectory.path.charAt(this.findDirectory.path.length - 1) != gSlash ? gSlash : '');

              if (gSlash == "/") {
                isParent    = findDirectorySlash.indexOf(filePathSlash) == 0;
              } else {
                isParent    = findDirectorySlash.toLowerCase().indexOf(filePathSlash.toLowerCase()) == 0;
              }

              if (isParent) {
                this.exceptions.push(this.findDirectory);
              }
            }

            for (var x = 0; x < this.exceptions.length; ++x) {
              var exceptionsSlash = this.exceptions[x].path + (this.exceptions[x].path.charAt(this.exceptions[x].path.length - 1) != gSlash ? gSlash : '');

              if (gSlash == "/") {
                isException  = exceptionsSlash.indexOf(filePathSlash) == 0;
              } else {
                isException  = exceptionsSlash.toLowerCase().indexOf(filePathSlash.toLowerCase()) == 0;
              }

              if (isException) {
                break;
              }
            }

            if (file.exists() && localFile.testSize(file) && file.isDirectory() && (!file.isHidden() || gFireFTPUtils.hiddenMode || isParent || isException)) {
              newDirectories.push(file);
            }
          }
        } catch (ex) {
          debug(ex);
          error(gStrbundle.getString("noPermission"));
        }

        if (newDirectories.length == 0)  {                                                         // no subdirectories
          this.data[row].empty = true;
          this.data[row].open  = false;
        } else {                                                                                   // has subdirectories
          for (var x = 0; x < newDirectories.length; ++x) {
            newDirectories[x] = { open        : false,
                                  empty       : false,
                                  hasNext     : true,
                                  parentIndex : -1,
                                  children    : null,
                                  path        : newDirectories[x].path,
                                  leafName    : newDirectories[x].leafName,
                                  parent      : newDirectories[x].parent ? newDirectories[x].parent.path : "",
                                  isHidden    : newDirectories[x].isHidden(),
                                  level       : newDirectories[x].path.match(  gSlash == "/" ? /\x2f/g : /\x5c/g).length,
                                  sortPath    : newDirectories[x].path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() };
          }

          newDirectories.sort(directorySort);
          newDirectories[newDirectories.length - 1].hasNext = false;                               // last one doesn't have a next

          for (var x = newDirectories.length - 1; x >= 0; --x) {
            this.data.splice(row + 1, 0, newDirectories[x]);
          }

          this.updateParentIndices();
          this.rowCount       = this.data.length;
          this.treebox.rowCountChanged(row + 1, newDirectories.length);
          this.data[row].open = true;
        }

        this.treebox.invalidateRow(row);
      }
    }

    $('localdirname').removeAttribute('flex');                                                     // horizontal scrollbars, baby!

    var max = 125;
    for (var z = 0; z < this.rowCount; ++z) {                                                     // this is what we CS folk like to call a TOTAL HACK
      var x = { };    var y = { };    var width = { };    var height = { };                       // but, hey, it works so bite me
      this.treebox.getCoordsForCellItem(z, this.treebox.columns["localdirname"], "text", x, y, width, height);

      if (x.value + width.value + 125 > max) {
        max = x.value + width.value + 125;
      }
    }

    //if (doOpen) {
      this.readjustHorizontalPosition(row);
    //}

    $('localdirname').setAttribute('width', max);
  },

  readjustHorizontalPosition : function(row) {
    var x = { };    var y = { };    var width = { };    var height = { };
    var first = this.treebox.getFirstVisibleRow()    >  0 ? this.treebox.getFirstVisibleRow()    : 0;
    var last  = this.treebox.getLastVisibleRow() - 1 >= 0 ? this.treebox.getLastVisibleRow() - 1 : 0;

    this.treebox.getCoordsForCellItem(row != -1 ? row : 0, this.treebox.columns["localdirname"], "text", x, y, width, height);
    this.treebox.scrollToHorizontalPosition(this.treebox.horizontalPosition + x.value - 60 >= 0 ? this.treebox.horizontalPosition + x.value - 60 : 0);

    var self = this;
    var func = function() {
      self.treebox.ensureRowIsVisible(last);
      self.treebox.ensureRowIsVisible(first);
    };
    if (first < this.data.length) {
      setTimeout(func, 0);
    }
  },

  addDirtyList : function(path) {
    for (var x = 0; x < this.dirtyList.length; ++x) {
      if (this.dirtyList[x] == path) {
        return;
      }
    }

    this.dirtyList.push(path);
  },

  updateParentIndices : function() {
    for (var x = 0; x < this.data.length; ++x) {
      this.data[x].parentIndex = this.indexOfPath(this.data[x].parent);                            // ah, beautiful
    }
  },

  indexOfPath : function(path) {                                                                   // binary search to find a path in the localDirTree
    if (!path) {
      return -1;
    }

    var left      = 0;
    var right     = this.data.length - 1;
    var origPath  = path;
    path          = path.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase();         // make '/' less than everything (except null really)

    while (left <= right) {
      var mid      = Math.floor((left + right) / 2);
      var dataPath = this.data[mid].sortPath;
      if (gSlash == "/" && (this.data[mid].path == origPath || this.data[mid].path + "/" == origPath || this.data[mid].path == origPath + "/")) {
        return mid;
      } else if (dataPath == path || dataPath + "\x01" == path || dataPath == path + "\x01") {     // kind of complicated but what can you do
        if (gSlash == "\\") {
          return mid;
        } else {
          break;
        }
      } else if (path < dataPath) {
        right = mid - 1;
      } else if (path > dataPath) {
        left  = mid + 1;
      }
    }

    if (gSlash == "/") {
      for (var x = 0; x < this.data.length; ++x) {                                                 // last ditch effort b/c of we have to account for case
        if (this.data[x].path == origPath || this.data[x].path + "/" == origPath || this.data[x].path == origPath + "/") {
          return x;
        }
      }
    }

    return -1;
  },

  cdup : function() {
    var parentIndex = this.getParentIndex(this.selection.currentIndex);

    if (parentIndex != -1) {
      this.selection.select(parentIndex);
    }
  },

  findDirectory : null,

  changeDir : function(path, retry) {
    if (path.indexOf("\\") == 0) {                                                                 // we can't handle network drives for now
      error(gStrbundle.getString("noPermission"));
      return;
    }

    gLocalPath.value  = path;

    if (this.data.length == 0 || this.data[0].path.charAt(0) != gLocalPath.value.charAt(0)) {      // if dirTree is empty or we're switching to a new drive
      var thePath;                                                                                 // we restart the tree

      if (gLocalPath.value.indexOf('/') == 0) {                                                    // linux
        thePath = "/";
        gSlash  = "/";
      } else {                                                                                     // windows
        if (gLocalPath.value.indexOf('\\') == -1) {
          gLocalPath.value += "\\";
        }

        thePath = gLocalPath.value.substring(0, gLocalPath.value.indexOf('\\') + 1);
        gSlash  = "\\";
      }

      try {                                                                                        // make sure we have a valid drive
        var dir     = localFile.init(thePath);
        var entries = dir.directoryEntries;
      } catch (ex) {
        error(gStrbundle.getString("noPermission"));
        return;
      }

      var oldRowCount = this.rowCount;
      this.data       = new Array();
      this.rowCount   = 0;
      this.treebox.rowCountChanged(0, -oldRowCount);

      this.data.push({ open        : false,
                       empty       : false,
                       hasNext     : false,
                       parentIndex : -1,
                       children    : null,
                       path        : thePath,
                       leafName    : thePath,
                       parent      : "",
                       isHidden    : false,
                       level       : 0,
                       sortPath    : thePath.replace(gSlash == "/" ? /\x2f/g : /\x5c/g, "\x01").toLowerCase() });

      this.rowCount = 1;
      this.treebox.rowCountChanged(0, 1);
    }

    if (gSlash == "/") {                                                                           // error checking here for correct values in path
      gLocalPath.value = gLocalPath.value.replace(/\x5c/g, "/");                                   // linux shouldn't have backslashes
    } else {
      gLocalPath.value = gLocalPath.value.replace(/\x2f/g, "\\");                                  // windows shouldn't have forward slashes
    }

    gLocalPath.value   = gLocalPath.value.replace(/\\\.\.\\/g, "\\");                              // "\..\asdf"; doing relative paths not allowed
    gLocalPath.value   = gLocalPath.value.replace(/\\\.\\/g,   "\\");                              // "\.\asdf"
    gLocalPath.value   = gLocalPath.value.replace(/\\\.\.$/g,  "\\");                              // "\.."
    gLocalPath.value   = gLocalPath.value.replace(/\\\.$/g,    "\\");                              // "\."
    gLocalPath.value   = gLocalPath.value.replace(/\/\.\.\//g, "/");                               // "/../asdf"
    gLocalPath.value   = gLocalPath.value.replace(/\/\.\//g,   "/");                               // "/./asdf"
    gLocalPath.value   = gLocalPath.value.replace(/\/\.\.$/g,  "/");                               // "/.."
    gLocalPath.value   = gLocalPath.value.replace(/\/\.$/g,    "/");                               // "/."

    if (gLocalPath.value != '/' && gLocalPath.value.charAt(gLocalPath.value.length - 1) == gSlash) {
      gLocalPath.value = gLocalPath.value.substring(0, gLocalPath.value.length - 1);               // trim slashes at the end - ruins levels in dir
    }

    if (gSlash == "\\" && gLocalPath.value.indexOf('\\') == -1) {                                  // if it's windows we add a slash to it: 'c:'->'c:\'
      gLocalPath.value += "\\";
    }

    if (gSlash == "/" && gLocalPath.value.charAt(0) != '/') {                                      // linux path has to start with '/'
      gLocalPath.value = '/' + gLocalPath.value;
    }

    var bestMatch;
    var bestPath;
    var localPathLevel = gLocalPath.value.match(gSlash == "/" ? /\x2f/g : /\x5c/g ).length;

    for (var x = 0; x < this.data.length; ++x) {                                                   // open parent directories til we find the directory
      for (var y = this.data.length - 1; y >= x; --y) {
        if ((gLocalPath.value.indexOf(this.data[y].path) == 0
              || (gSlash == "\\" && gLocalPath.value.toLowerCase().indexOf(this.data[y].path.toLowerCase()) == 0))
            && (this.getLevel(y) < localPathLevel || gLocalPath.value == this.data[y].path)) {
          x         = y;
          bestMatch = y;
          bestPath  = this.data[y].path;
          break;
        }
      }

      if (gLocalPath.value.indexOf(this.data[x].path) == 0
          || (gSlash == "\\" && gLocalPath.value.toLowerCase().indexOf(this.data[x].path.toLowerCase()) == 0)) {
        var dirty = false;

        for (var z = 0; z < this.dirtyList.length; ++z) {
          if (this.dirtyList[z] == this.data[x].path) {
            dirty = true;
            break;
          }
        }

        this.ignoreSelect = true;
        if (this.data[x].open && dirty) {
          this.toggleOpenState(x);
          this.toggleOpenState(x);
        }

        if (this.data[x].empty && dirty) {
          this.data[x].empty = false;
          this.treebox.invalidateRow(x);
        }

        if (!this.data[x].open && (gLocalPath.value != this.data[x].path || x == 0)) {
          this.toggleOpenState(x);
        }
        this.ignoreSelect = false;

        if (gLocalPath.value == this.data[x].path
            || (gSlash == "\\" && gLocalPath.value.toLowerCase() == this.data[x].path.toLowerCase())) {
          gLocalPathFocus = gLocalPath.value;                                                      // directory approved
          FormHistory.update({ 'op': 'remove', 'fieldname': gLocalPath.getAttribute("autocompletesearchparam"), value: gLocalPath.value });
          FormHistory.update({ 'op': 'add', 'fieldname': gLocalPath.getAttribute("autocompletesearchparam"), value: gLocalPath.value });
          var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
          sString.data = gLocalPath.value;
          gPrefs.setComplexValue("folder", Components.interfaces.nsISupportsString, sString);      // remember last directory

          localTree.updateView();

          this.readjustHorizontalPosition(this.selection.currentIndex);

          if (gTreeSync && !gTreeSyncManager) {
            treeSyncManager(true);
          } else {
            gTreeSyncManager = false;
          }

          return;
        }
      }
    }

    if (gTreeSyncManager) {
      gTreeSyncManager = false;

      if (bestMatch) {
        gLocalPath.value = bestPath;
        gLocalPathFocus  = bestPath;
        localTree.updateView();
      }

      return;
    }

    var findDirectory = localFile.init(gLocalPath.value);                                          // we didn't find the directory above

    if (localFile.verifyExists(findDirectory) && findDirectory.isDirectory() && (!retry || gLocalPath.value != path)) {
      this.findDirectory = findDirectory;
      var tempPath = gLocalPath.value;
      this.selection.select(bestMatch);                                                            // it's possible the directory was added externally
      localTree.refresh(true);                                                                     // and we don't have it on our dir list
      this.findDirectory = null;
      this.changeDir(tempPath, true);
    }
  },

  select : function(event) {
    if (this.ignoreSelect) {
      return;
    }

    var index = this.selection.currentIndex;

    if (index >= 0 && index < this.data.length && this.data[index].path != gLocalPath.value) {
      this.changeDir(this.data[index].path);
    }
  },

  click : function(event) {                                                                        // this is a special case: if we want the search to go away
    var index = this.selection.currentIndex;

    if (index >= 0 && index < this.data.length && (this.data[index].path == gLocalPath.value && localTree.searchMode)) {
      this.changeDir(this.data[index].path);
    }
  },

  keyPress : function(event) {
    if (event.keyCode == 8) {                                                                      // backspace
      this.cdup();
    } else if (event.keyCode == 116) {                                                             // F5
      event.preventDefault();
      localTree.refresh(false, true);
    }
  },

  canDrop : function(index, orient) {
    if (index == -1 || orient != 0 || !dragObserver.origin || dragObserver.origin == "external") {
      return false;
    }

    if (dragObserver.origin.indexOf('remote') != -1 && (!gConnection || !gConnection.isConnected)) {
      return false;
    }

    if (dragObserver.origin == 'localtreechildren') {                                              // can't move into a subdirectory of itself
      for (var x = 0; x < localTree.rowCount; ++x) {
        var dataPathSlash  = this.data[index].path  + (this.data[index].path.charAt(this.data[index].path.length - 1)   != gSlash ? gSlash : '');
        var localTreeSlash = localTree.data[x].path + (localTree.data[x].path.charAt(localTree.data[x].path.length - 1) != gSlash ? gSlash : '');

        if (localTree.selection.isSelected(x) && ((dataPathSlash.indexOf(localTreeSlash) == 0 && localTree.data[x].isDirectory())
                                                || this.data[index].path == localTree.data[x].parent.path
                                                || this.data[index].path == localTree.data[x].parent.path + gSlash)) {
          return false;
        }
      }
    }

    return true;
  },

  drop : function(index, orient) {
    if (dragObserver.origin == 'localtreechildren') {
      localTree.cut();
      localTree.paste(this.data[index].path);
    } else if (dragObserver.origin == 'remotetreechildren') {
      var anyFolders = false;

      for (var x = 0; x < remoteTree.rowCount; ++x) {
        if (remoteTree.selection.isSelected(x) && remoteTree.data[x].isDirectory()) {
          anyFolders = true;
          break;
        }
      }

      if (anyFolders && this.data[index].path != gLocalPath.value) {
        var self      = this;
        var path      = this.data[index].path;
        var localPath = gLocalPath.value;
        var func = function() { self.dropCallback(path, localPath); };
        gConnection.observer.uponRefreshCallback = func;
      }

      var transferObj          = new transfer();
      transferObj.localRefresh = gLocalPath.value;
      transferObj.start(true,  '', this.data[index].path, '');
    }
  },

  dropCallback : function(newParent, localPath) {
    var refreshIndex = this.indexOfPath(newParent);

    if (refreshIndex != -1) {
      if (this.data[refreshIndex].open) {
        this.toggleOpenState(refreshIndex, true);                                                  // close it up
        this.data[refreshIndex].children = null;                                                   // reset its children
        this.toggleOpenState(refreshIndex);                                                        // and open it up again
      } else {
        this.data[refreshIndex].children = null;                                                   // reset its children
        this.data[refreshIndex].empty    = false;
        this.treebox.invalidateRow(refreshIndex);
      }

      var refreshIndex2 = this.indexOfPath(localPath);

      if (refreshIndex2 == -1) {
        this.changeDir(localPath);
      } else {
        this.selection.select(refreshIndex2);
      }
    } else {
      this.addDirtyList(newParent);
    }
  }
};
