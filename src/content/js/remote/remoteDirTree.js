var remoteDirTree = {
  data                    : new Array(),
  rowCount                : 0,
  expandDirectoryCallback : null,
  dirtyList               : new Array(),
  ignoreSelect            : false,

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
      if (!gConnection.isConnected) {
        properties += this.setProperty(props, "disconnected");
      }

      if (this.data[row].isHidden) {
        properties += this.setProperty(props, "hidden");
      }
    }
    return properties;
  },

  toggleOpenState     : function(row, suppressChange) {
    if (!gConnection.isConnected || gConnection.isListing()) {
      return;
    }

    if (this.isContainerOpen(row)) {
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

      var remotePathSlash = gRemotePath.value   + (gRemotePath.value.charAt(gRemotePath.value.length - 1)     != "/" ? "/" : '');
      var dataPathSlash   = this.data[row].path + (this.data[row].path.charAt(this.data[row].path.length - 1) != "/" ? "/" : '');

      if (remotePathSlash.indexOf(dataPathSlash) == 0 && gRemotePath.value != this.data[row].path
       && gRemotePath.value.match(/\x2f/g).length > this.data[row].level && !suppressChange) {
        gRemotePath.value = this.data[row].path;                                                   // we were in a subdirectory and we collapsed
        this.selection.select(row);
        this.treebox.ensureRowIsVisible(row);
        remoteTree.updateView();
      } else if (gRemotePath.value == this.data[row].path) {
        this.selection.select(row);
        this.treebox.ensureRowIsVisible(row);
      }

      this.horizontalScroll(false, row);
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
                                                            + (this.dirtyList[x].charAt(this.dirtyList[x].length - 1) != "/" ? "/" : '')) == 0) {
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

        this.horizontalScroll(true, row);
      } else {
        var callback = function() { remoteDirTree.toggleOpenState2(row); };
        gConnection.list(this.data[row].path, callback, false);      // get data for this directory
      }
    }
  },

  toggleOpenState2 : function(row) {
    var newDirectories = new Array();

    for (var x = 0; x < gConnection.listData.length; ++x) {                                               // pick out the directories
      if (gConnection.listData[x].isDirectory()) {
        newDirectories.push(gConnection.listData[x]);
      }
    }

    if (newDirectories.length == 0)  {                                                             // no subdirectories
      this.data[row].empty = true;
      this.data[row].open  = false;
    } else {                                                                                       // has subdirectories
      for (var x = 0; x < newDirectories.length; ++x) {
        var path          = gConnection.constructPath(this.data[row].path, newDirectories[x].leafName);
        var parentDir     = this.data[row].path;
        newDirectories[x] = { open        : false,
                              empty       : false,
                              hasNext     : true,
                              parentIndex : -1,
                              children    : null,
                              path        : path,
                              leafName    : newDirectories[x].leafName,
                              parent      : parentDir,
                              level       : path.match(/\x2f/g).length,
                              sortPath    : path.replace(/\x2f/g, "\x01").toLowerCase(),
                              isHidden    : newDirectories[x].isHidden };
      }

      newDirectories.sort(directorySort);
      newDirectories[newDirectories.length - 1].hasNext = false;                                   // last one doesn't have a next

      for (var x = newDirectories.length - 1; x >= 0; --x) {
        this.data.splice(row + 1, 0, newDirectories[x]);
      }

      this.updateParentIndices();
      this.rowCount       = this.data.length;
      this.treebox.rowCountChanged(row + 1, newDirectories.length);
      this.data[row].open = true;
    }

    this.treebox.invalidateRow(row);

    this.horizontalScroll(true, row);

    if (this.updateViewAfter) {
      this.updateViewAfter = false;
      remoteTree.updateView2();
    }

    if (this.expandDirectoryCallback) {
      var tempCallback   = this.expandDirectoryCallback;
      this.expandDirectoryCallback = null;
      tempCallback();
    }
  },

  horizontalScroll : function(doOpen, row) {                                                       // horizontal scrollbars, baby!
    $('remotedirname').removeAttribute('flex');

    var max = 125;
    for (var z = 0; z < this.rowCount; ++z) {                                                      // this is what we CS folk like to call a TOTAL HACK
      var x = { };    var y = { };    var width = { };    var height = { };                        // but, hey, it works so bite me
      this.treebox.getCoordsForCellItem(z, this.treebox.columns["remotedirname"], "text", x, y, width, height);

      if (x.value + width.value + 125 > max) {
        max = x.value + width.value + 125;
      }
    }

    //if (doOpen) {
      this.readjustHorizontalPosition(row);
    //}

    $('remotedirname').setAttribute('width', max);
  },

  readjustHorizontalPosition : function(row) {
    var x = { };    var y = { };    var width = { };    var height = { };
    var first = this.treebox.getFirstVisibleRow()    > 0  ? this.treebox.getFirstVisibleRow()    : 0;
    var last  = this.treebox.getLastVisibleRow() - 1 >= 0 ? this.treebox.getLastVisibleRow() - 1 : 0;

    this.treebox.getCoordsForCellItem(row != -1 ? row : 0, this.treebox.columns["remotedirname"], "text", x, y, width, height);
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
    gConnection.removeCacheEntry(path);

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

  indexOfPath : function(path) {                                                                   // binary search to find a path in the remoteDirTree
    if (!path) {
      return -1;
    }

    var left      = 0;
    var right     = this.data.length - 1;
    var origPath  = path;
    path          = path.replace(/\x2f/g, "\x01").toLowerCase();

    while (left <= right) {
      var mid      = Math.floor((left + right) / 2);
      var dataPath = this.data[mid].sortPath;
      if (this.data[mid].path == origPath || this.data[mid].path + "/" == origPath || this.data[mid].path == origPath + "/") {
        return mid;
      } else if (dataPath == path || dataPath + "\x01" == path || dataPath == path + "\x01") {
        break;
      } else if (path < dataPath) {
        right = mid - 1;
      } else if (path > dataPath) {
        left  = mid + 1;
      }
    }

    for (var x = 0; x < this.data.length; ++x) {                                                   // last ditch effort b/c of we have to account for case
      if (this.data[x].path == origPath || this.data[x].path + "/" == origPath || this.data[x].path == origPath + "/") {
        return x;
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

  updateViewAfter : false,

  changeDir : function(path) {
    if (!gConnection.isConnected || gConnection.isListing()) {
      if (!gConnection.isConnected) {
        gTreeSyncManager = null;
      }

      return;
    }

    gRemotePath.value = path;

    if (this.data.length == 0) {                                                                   // if dirTree is empty
      var oldRowCount = this.rowCount;
      this.data       = new Array();
      this.rowCount   = 0;
      this.treebox.rowCountChanged(0, -oldRowCount);

      this.data.push({ open        : false,                                                        // restart the tree
                       empty       : false,
                       hasNext     : false,
                       parentIndex : -1,
                       children    : null,
                       path        : "/",
                       leafName    : "/",
                       parent      : "",
                       level       : 0,
                       sortPath    : "/".replace(/\x2f/g, "\x01").toLowerCase() });

      this.rowCount = 1;
      this.treebox.rowCountChanged(0, 1);
    }
                                                                                                   // error checking here for correct values in path
    gRemotePath.value = gRemotePath.value.replace(/\x5c/g, "/");                                   // shouldn't have backslashes

    if (gRemotePath.value != '/' && gRemotePath.value.charAt(gRemotePath.value.length - 1) == '/') {
      gRemotePath.value = gRemotePath.value.substring(0, gRemotePath.value.length - 1);            // cannot end with '\' ruins levels in dir tree
    }

    if (gRemotePath.value.charAt(0) != '/') {                                                      // has to start with '/'
      gRemotePath.value = '/' + gRemotePath.value;
    }

    for (var x = 0; x < this.data.length; ++x) {                                                   // open parent directories til we find the directory
      for (var y = this.data.length - 1; y >= x; --y) {
        if (gRemotePath.value.indexOf(this.data[y].path) == 0) {
          x = y;
          break;
        }
      }

      if (gRemotePath.value.indexOf(this.data[x].path) == 0) {
        var dirty = false;

        for (var z = 0; z < this.dirtyList.length; ++z) {
          if (this.dirtyList[z] == this.data[x].path) {
            dirty = true;
            break;
          }
        }

        if (this.data[x].open && dirty) {
          this.ignoreSelect = true;
          this.toggleOpenState(x);
          this.ignoreSelect = false;
        }

        if (this.data[x].empty && dirty) {
          this.data[x].empty = false;
          this.treebox.invalidateRow(x);
        }

        if (!this.data[x].open && !this.data[x].empty && gRemotePath.value != this.data[x].path) {
          gRemotePath.value = this.data[x].path;
          gRemotePathFocus  = this.data[x].path;
          this.selection.select(x);
          let callbackRow = x;
          let eventualGoalPath = path;
          var callback = function() { remoteDirTree.toggleOpenState2(callbackRow); remoteDirTree.changeDir(eventualGoalPath); };
          gConnection.list(this.data[x].path, callback, false, false, false, eventualGoalPath);
          return;
        } else if (gRemotePath.value == this.data[x].path) {
          gRemotePathFocus = gRemotePath.value;                                                    // directory approved
          FormHistory.update({ 'op': 'remove', 'fieldname': gRemotePath.getAttribute("autocompletesearchparam"), value: gRemotePath.value });
          FormHistory.update({ 'op': 'add', 'fieldname': gRemotePath.getAttribute("autocompletesearchparam"), value: gRemotePath.value });

          if (!this.data[x].open && !this.data[x].empty && x == 0) {
            this.updateViewAfter = true;
            this.toggleOpenState(x);
          } else {
            remoteTree.updateView();

            this.readjustHorizontalPosition(this.selection.currentIndex);
          }

          if (gTreeSync && !gTreeSyncManager) {
            treeSyncManager(false);
          } else {
            gTreeSyncManager = false;
          }

          return;
        }
      }
    }

    if (gTreeSyncManager) {
      gTreeSyncManager  = false;
      gRemotePath.value = gRemotePathFocus;
      remoteTree.updateView();
      return;
    }

    this.dontPanic();
  },

  dontPanic : function() {                                                                         // we haven't found the directory in the conventional
    gRemotePathFocus = gRemotePath.value;                                                          // sense: don't freak out, just create directories
    this.treebox.rowCountChanged(0, -this.rowCount);                                               // above as if it were there and list
    this.rowCount    = 0;
    this.data        = new Array();
    this.data.push({ open        : true,                                                           // restart the tree
                     empty       : false,
                     hasNext     : false,
                     parentIndex : -1,
                     children    : null,
                     path        : "/",
                     leafName    : "/",
                     parent      : "",
                     level       : 0,
                     sortPath    : "/".replace(/\x2f/g, "\x01").toLowerCase() });

    var paths     = gRemotePath.value.split("/");
    var parentDir = "/";

    for (var x = 0; x < paths.length; ++x) {
      if (paths[x] != "") {
        var path = gConnection.constructPath(parentDir, paths[x]);
        this.data.push({ open        : true,
                         empty       : false,
                         hasNext     : false,
                         parentIndex : -1,
                         children    : null,
                         path        : path,
                         leafName    : paths[x],
                         parent      : parentDir,
                         level       : path.match(/\x2f/g).length,
                         sortPath    : path.replace(/\x2f/g, "\x01").toLowerCase() });

        parentDir += (parentDir != "/" ? "/" : "") + paths[x];
      }
    }

    this.data[this.data.length - 1].open = false;                                                  // make last directory closed

    this.updateParentIndices();
    this.rowCount = this.data.length;                                                              // update tree
    this.treebox.rowCountChanged(0, this.rowCount);
    this.selection.select(this.rowCount - 1);

    this.updateViewAfter = true;                                                                   // open up the last directory
    this.toggleOpenState(this.data.length - 1);
  },

  select : function(event) {
    if (this.ignoreSelect) {
      return;
    }

    var index = this.selection.currentIndex;

    if (index >= 0 && index < this.data.length && this.data[index].path != gRemotePath.value) {
      this.changeDir(this.data[index].path);
    }
  },

  click : function(event) {                                                                        // this is a special case: if we want the search to go away
    var index = this.selection.currentIndex;

    if (index >= 0 && index < this.data.length && (this.data[index].path == gRemotePath.value && remoteTree.searchMode)) {
      this.changeDir(this.data[index].path);
    }
  },

  keyPress : function(event) {
    if (event.keyCode == 8) {                                                                      // backspace
      this.cdup();
    } else if (event.keyCode == 116) {                                                             // F5
      event.preventDefault();
      remoteTree.refresh();
    }
  },

  canDrop : function(index, orient) {
    if (!gConnection.isConnected || index == -1 || orient != 0 || !dragObserver.origin) {
      return false;
    }

    if (dragObserver.origin == 'remotetreechildren') {                                             // can't move into a subdirectory of itself
      for (var x = 0; x < remoteTree.rowCount; ++x) {
        var remotePath      = remoteTree.data[x].path;
        var dataPathSlash   = this.data[index].path + (this.data[index].path.charAt(this.data[index].path.length - 1) != "/" ? "/" : '');
        var remotePathSlash = remotePath            + (remotePath.charAt(remotePath.length - 1)                       != "/" ? "/" : '');

        if (remoteTree.selection.isSelected(x) && ((dataPathSlash.indexOf(remotePathSlash) == 0 && remoteTree.data[x].isDirectory())
                                                 || this.data[index].path ==
                                                    remotePath.substring(0, remotePath.lastIndexOf('/') ? remotePath.lastIndexOf('/') : 1))) {
          return false;
        }
      }
    }

    return true;
  },

  drop : function(index, orient) {
    if (dragObserver.origin == 'remotetreechildren') {
      remoteTree.cut();

      var self = this;
      var path = this.data[index].path;
      var func = function() { remoteTree.paste(path); };
      gConnection.list(this.data[index].path, func, true);
    } else if (dragObserver.origin == 'localtreechildren') {
      var anyFolders = false;

      for (var x = 0; x < localTree.rowCount; ++x) {
        if (localTree.selection.isSelected(x) && localTree.data[x].isDirectory()) {
          anyFolders = true;
          break;
        }
      }

      var path = this.data[index].path;

      if (anyFolders && this.data[index].path != gRemotePath.value) {
        var self       = this;
        var remotePath = gRemotePath.value;
        var func = function() { self.dropCallback(path, remotePath); };
        gConnection.observer.uponRefreshCallback = func;
      }

      var self                  = this;
      var transferObj           = new transfer();
      transferObj.remoteRefresh = gRemotePath.value;
      var func = function() { transferObj.start(false, '', '', path); };
      gConnection.list(this.data[index].path, func, true);
    } else if (dragObserver.origin == 'external') {
      var anyFolders = false;

      for (var x = 0; x < dragObserver.externalFiles.length; ++x) {
        if (dragObserver.externalFiles[x].isDirectory()) {
          anyFolders = true;
          break;
        }
      }

      if (anyFolders && this.data[index].path != gRemotePath.value) {
        var self       = this;
        var path       = this.data[index].path;
        var remotePath = gRemotePath.value;
        var func       = function() { self.dropCallback(path, remotePath); };
        gConnection.observer.uponRefreshCallback = func;
      }

      var transferObj           = new transfer();
      transferObj.remoteRefresh = gRemotePath.value;

      for (var x = 0; x < dragObserver.externalFiles.length; ++x) {
        var droppedFile = dragObserver.externalFiles[x];
        var fileParent  = droppedFile.parent ? droppedFile.parent.path : "";

        this.dropHelper(transferObj, droppedFile, fileParent, index);

        if (transferObj.cancel) {
          break;
        }
      }
    }
  },

  dropHelper : function(transferObj, droppedFile, fileParent, index) {
    var self                  = this;
    var remotePath            = this.data[index].path;
    var func                  = function() { transferObj.start(false, droppedFile, fileParent, remotePath); };
    gConnection.list(this.data[index].path, func, true);
  },

  dropCallback : function(newParent, remotePath) {
    var refreshIndex = this.indexOfPath(newParent);

    if (refreshIndex != -1) {
      if (this.data[refreshIndex].open) {
        var self           = this;
        var path           = remotePath;
        var dropCallback2  = function() { self.dropCallback2(path); };
        this.expandDirectoryCallback = dropCallback2;

        this.toggleOpenState(refreshIndex, true);                                                  // close it up
        this.data[refreshIndex].children = null;                                                   // reset its children
        this.toggleOpenState(refreshIndex);                                                        // and open it up again
        return;
      } else {
        this.data[refreshIndex].children = null;                                                   // reset its children
        this.data[refreshIndex].empty    = false;
        this.treebox.invalidateRow(refreshIndex);
      }

      var refreshIndex2 = this.indexOfPath(remotePath);

      if (refreshIndex2 == -1) {
        this.changeDir(remotePath);
        return;
      } else {
        this.selection.select(refreshIndex2);
      }
    } else {
      this.addDirtyList(newParent);
    }
  },

  dropCallback2 : function(returnDir) {
    var refreshIndex2 = this.indexOfPath(returnDir);

    if (refreshIndex2 == -1) {
      this.changeDir(returnDir);
      return;
    } else {
      this.selection.select(refreshIndex2);
    }
  }
};
