/*
   1.) hello! if you're actually interested in reusing this useful bit of code I've set up a stripped
       down demo of all the code and javascript files required to make it work properly
       in fireftp/src/localTreeDemo.xul
   2.) move it into fireftp/src/content and give it a whirl.  yes, there quite a few dependecies
       but it is somewhat complicated thing to implement in the first place
   3.) the only thing that won't work out of the box from that point on are the references
       to transfer() which are obviously meant to transfer files to a remote server.
   4.) another dependency that is not obvious on first glance is it needs
       nsIFireFTPUtils.js/nsIFireFTPUtils.xpt to run.  you can either add this to your registered components
       or move the js into your codebase and refactor the references to nsIFireFTPUtils to call the functions directly.
   5.) localDirTree is tied pretty closely to localTree. if you find you don't need it for your code, you should just make
       that part of the ui hidden. it's possible to refactor it out of this code, just don't ask me how :)
   6.) the provided code is not completely stripped down.  it's close to being a naked widget to reuse but the code
       is more meant to be a starting point that can be cleaned up a little more as necessary.
   7.) good luck!  let me know if there are issues!
*/

var localTree = {
  data                    : new Array(),
  displayData             : new Array(),
  rowCount                : 0,
  localSize               : 0,
  localAvailableDiskSpace : 0,
  searchMode              : 0,
  isEditing               : false,
  editType                : "",
  editParent              : null,
  rememberSort            : null,

  getParentIndex      : function(row)               { return -1; },
  getLevel            : function(row)               { return 0;  },
  getRowProperties    : function(row, props)        { },
  getColumnProperties : function(colid, col, props) { },
  isContainer         : function(row)               { return false; },
  isSeparator         : function(row)               { return false; },
  isSorted            : function(row)               { return false; },
  setTree             : function(treebox)           { this.treebox = treebox; },

  getCellText         : function(row, column)       {                                           // text for the files
    if (row >= 0 && row < this.data.length) {
      switch(column.id) {
        case "localname":
          return this.searchMode == 2 ? this.displayData[row].path : this.displayData[row].leafName;
        case "localsize":
          return this.displayData[row].fileSize;
        case "localdate":
          return this.displayData[row].date;
        case "localtype":
          return this.displayData[row].extension;
        case "localattr":
          return this.displayData[row].attr;
        default:
          return " ";
      }
    }

    return "";
  },

  getImageSrc  : function(row, col)  {
    return row >= 0 && row < this.data.length && col.id == "localname" && this.displayData[row].icon ? this.displayData[row].icon : "";
  },

  cycleHeader : function(col) {
    var sortDirection = col.element.getAttribute("sortDirection") == "descending"
                     || col.element.getAttribute("sortDirection") == "natural"  ? "ascending" : "descending";
    $('localname').setAttribute("sortDirection", "natural");
    $('localsize').setAttribute("sortDirection", "natural");
    $('localdate').setAttribute("sortDirection", "natural");
    $('localtype').setAttribute("sortDirection", "natural");
    $('localattr').setAttribute("sortDirection", "natural");
    col.element.setAttribute(   "sortDirection", sortDirection);
    this.sort();
  },

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
      if (col.id == "localname") {
        if (this.displayData[row].isDirectory) {
          properties += this.setProperty(props, "isFolder");
        } else if (this.displayData[row].isSymlink) {
          properties += this.setProperty(props, "isLink");
        }

        properties += this.setProperty(props, "nameCol");
      }

      if (dragObserver.overName && this.displayData[row].isDirectory) {
        properties += this.setProperty(props, "overName");
      }

      if (this.displayData[row].isHidden) {
        properties += this.setProperty(props, "hidden");
      }

      if (this.displayData[row].isCut) {
        properties += this.setProperty(props, "cut");
      }
    }
    return properties;
  },

  // ****************************************************** updateView ***************************************************

  updateView : function(files) {
    var localTreeItems = new Array();

    if (!files) {
      this.searchMode = 0;
      gLocalTreeChildren.removeAttribute('search');

      try {
        this.localSize               = 0;
        var dir                      = localFile.init(gLocalPath.value);
        this.localAvailableDiskSpace = parseSize(dir.diskSpaceAvailable);                       // get local disk size
        var entries                  = dir.directoryEntries;

        while (entries.hasMoreElements()) {
          var file        = entries.getNext().QueryInterface(Components.interfaces.nsILocalFile);
          var isException = false;

          for (var x = 0; x < localDirTree.exceptions.length; ++x) {
            if (gSlash == "/") {
              isException  = localDirTree.exceptions[x].path               == file.path;
            } else {
              isException  = localDirTree.exceptions[x].path.toLowerCase() == file.path.toLowerCase();
            }

            if (isException) {
              break;
            }
          }

          if (file.exists() && localFile.testSize(file) && (!file.isHidden() || gFireFTPUtils.hiddenMode || isException)) {
            this.localSize += file.fileSize;
            localTreeItems.push(file);
          }
        }

        this.localSize = parseSize(this.localSize);                                             // get directory size
        this.data      = localTreeItems;                                                        // update localTree
      } catch (ex) {
        debug(ex);
        this.data        = new Array();
        this.displayData = new Array();
        this.treebox.rowCountChanged(0, -this.rowCount);
        this.rowCount = this.data.length;
        this.treebox.rowCountChanged(0, this.rowCount);
        this.mouseOver(null);
        error(gStrbundle.getString("noPermission"));
        return;
      }
    } else {
      if (this.localSize != -1) {
        this.data        = new Array();
        this.displayData = new Array();
        this.treebox.rowCountChanged(0, -this.rowCount);

        this.rememberSort = { cols : ["localname", "localsize", "localdate", "localtype", "localattr"],
                              vals : [$('localname').getAttribute("sortDirection"),
                                      $('localsize').getAttribute("sortDirection"),
                                      $('localdate').getAttribute("sortDirection"),
                                      $('localtype').getAttribute("sortDirection"),
                                      $('localattr').getAttribute("sortDirection")] };
      }

      files.sort(compareName);

      for (var x = 0; x < files.length; ++x) {
        this.data.push(files[x]);
      }

      this.localSize  = -1;
      this.searchMode = this.searchMode ? this.searchMode : (gSearchRecursive ? 2 : 1);
      gLocalTreeChildren.setAttribute('search', true);
    }

    this.sort(files);

    var index = localDirTree.indexOfPath(gLocalPath.value);                                     // select directory in localDirTree
    localDirTree.selection.select(index);
    localDirTree.treebox.ensureRowIsVisible(index);

    if (this.data.length && !files) {
      this.selection.select(0);                                                                 // select first element in localTree
    }

    this.mouseOver(null);

    if (files) {
      return;
    }

    var anyFolders = false;                                                                     // see if the folder has any subfolders
    for (var x = 0; x < this.data.length; ++x) {
      if (this.data[x].isDirectory()) {
        anyFolders = true;
        break;
      }
    }

    if (!anyFolders) {                                                                          // and if there are no subfolders then update our tree
      if (localDirTree.data[index].open) {                                                      // if localDirTree is open
        localDirTree.toggleOpenState(index);
      }

      localDirTree.data[index].empty    = true;
      localDirTree.data[index].open     = false;
      localDirTree.data[index].children = null;

      for (var x = 0; x < localDirTree.dirtyList.length; ++x) {
        if (localDirTree.dirtyList[x] == gLocalPath.value) {
          localDirTree.dirtyList.splice(x, 1);
          break;
        }
      }
    } else if (anyFolders && localDirTree.data[index].empty) {
      localDirTree.data[index].empty    = false;
    }

    localDirTree.treebox.invalidateRow(index);
  },

  sort : function(files) {
    if (!files) {
      if (this.rememberSort) {
        for (var x = 0; x < this.rememberSort.cols.length; ++x) {
          $(this.rememberSort.cols[x]).setAttribute("sortDirection", this.rememberSort.vals[x]);
        }

        this.rememberSort = null;
      }

      this.sortHelper($('localname'), this.searchMode == 2 ? directorySort2 : compareName);
      this.sortHelper($('localsize'), compareSize);
      this.sortHelper($('localdate'), compareDate);
      this.sortHelper($('localtype'), compareType);
      this.sortHelper($('localattr'), compareLocalAttr);

      this.displayData = new Array();
    } else {
      $('localname').setAttribute("sortDirection", "natural");
      $('localsize').setAttribute("sortDirection", "natural");
      $('localdate').setAttribute("sortDirection", "natural");
      $('localtype').setAttribute("sortDirection", "natural");
      $('localattr').setAttribute("sortDirection", "natural");
    }

    var start = files ? this.data.length - files.length : 0;

    for (var row = start; row < this.data.length; ++row) {
      if (!localFile.testSize(this.data[row])) {
        this.displayData.push({ leafName    : this.data[row].leafName,
                                fileSize    : '',
                                date        : '',
                                extension   : '',
                                attr        : '',
                                icon        : "moz-icon://" + this.data[row].leafName + "?size=16",
                                path        : this.data[row].path,
                                isDirectory : false,
                                isSymlink   : false,
                                isHidden    : false });
        continue;
      }

      this.displayData.push({ leafName    : this.data[row].leafName,
                              fileSize    : this.getFormattedFileSize(row),
                              date        : this.getFormattedDate(row),
                              extension   : this.data[row].isDirectory() ? "" : this.getExtension(this.data[row].leafName),
                              attr        : this.data[row].permissions   ? this.convertPermissions(this.data[row].isHidden(), this.data[row].permissions) : "",
                              icon        : this.getFileIcon(row),
                              path        : this.data[row].path,
                              isDirectory : this.data[row].isDirectory(),
                              isSymlink   : this.data[row].isSymlink(),
                              isHidden    : this.data[row].isHidden() });
    }

    if (files) {
      this.rowCount = this.data.length;
      this.treebox.rowCountChanged(start, files.length);
    } else {
      this.treebox.rowCountChanged(0, -this.rowCount);
      this.rowCount = this.data.length;
      this.treebox.rowCountChanged(0, this.rowCount);
    }
  },

  sortHelper : function(el, sortFunc) {
    if (el.getAttribute("sortDirection") && el.getAttribute("sortDirection") != "natural") {
      this.data.sort(sortFunc);

      if (!gPrefs.getBoolPref("localsortfix")) {   // blah, fix dumb mistake that changed descending into ascending
        el.setAttribute("sortDirection", "ascending");
        gPrefs.setBoolPref("localsortfix", true);
      }

      if (el.getAttribute("sortDirection") == "descending") {
        this.data.reverse();
      }
    }
  },

  getFormattedFileSize : function(row) {
    if (this.data[row].isDirectory()) {
      return "";
    }

    if (this.data[row].fileSize == 0) {
      return gBytesMode ? "0  " : gStrbundle.getFormattedString("kilobyte", ["0"]) + "  ";
    }

    if (gBytesMode) {
      return commas(this.data[row].fileSize) + "  ";
    }

    return gStrbundle.getFormattedString("kilobyte", [commas(Math.ceil(this.data[row].fileSize / 1024))]) + "  ";
  },

  getFormattedDate : function(row) {
    var date = new Date(this.data[row].lastModifiedTime);

    if ((new Date()).getFullYear() > date.getFullYear()) {                                      // if not current year, display old year
      return gMonths[date.getMonth()] + ' ' + date.getDate() + ' ' + date.getFullYear();
    }

    var time = date.toLocaleTimeString();                                                       // else display time
    var ampm = time.indexOf('AM') != - 1 ? ' AM' : (time.indexOf('PM') != -1 ? ' PM' : '');
    return gMonths[date.getMonth()] + ' ' + date.getDate() + ' ' + time.substring(0, time.lastIndexOf(':')) + ampm;
  },

  getExtension : function(leafName) {
    return leafName.lastIndexOf(".") != -1 ? leafName.substring(leafName.lastIndexOf(".") + 1, leafName.length).toLowerCase() : "";
  },

  convertPermissions : function(hidden, permissions) {
    if (gSlash == "\\") {                                                                       // msdos
      var returnString = "";

      if (permissions == 438) {                                                                 // Normal file  (666 in octal)
        returnString = gStrbundle.getString("normalFile");
      } else if (permissions == 511) {                                                          // Executable file (777 in octal)
        returnString = gStrbundle.getString("executableFile");
      } else if (permissions == 292) {                                                          // Read-only (444 in octal)
        returnString = gStrbundle.getString("readOnlyFile");
      } else if (permissions == 365) {                                                          // Read-only and executable (555 in octal)
        returnString = gStrbundle.getString("readOnlyExecutableFile");
      } else {
        returnString = " ";
      }

      if (hidden) {
        returnString += gStrbundle.getString("hiddenFile");
      }

      return returnString;
    } else {
      permissions           = permissions.toString(8);

      if (gPlatform == 'mac') {
        permissions         = permissions.substring(permissions.length - 4);
      }

      permissions           = parseInt(permissions, 8);
      var binary            = permissions.toString(2);
      var permissionsString = "";

      for (var x = 0; x < 9; x += 3) {
        permissionsString += binary.charAt(0 + x) == "1" ? "r" : "-";
        permissionsString += binary.charAt(1 + x) == "1" ? "w" : "-";
        permissionsString += binary.charAt(2 + x) == "1" ? "x" : "-";
      }

      return permissionsString;
    }
  },

  getFileIcon : function(row) {
    if (this.data[row].isDirectory() || this.data[row].isSymlink()) {
      return "";
    }

    return "moz-icon://" + this.data[row].leafName + "?size=16";
  },

  // ************************************************** refresh *******************************************************

  refresh : function(skipLocalTree, skipDelay) {
    if (localDirTree.data[localDirTree.selection.currentIndex].open) {                          // if localDirTree is open
      localDirTree.toggleOpenState(localDirTree.selection.currentIndex);                        // close it up
      localDirTree.data[localDirTree.selection.currentIndex].children = null;                   // reset its children
      localDirTree.toggleOpenState(localDirTree.selection.currentIndex);                        // and open it up again
    } else {
      localDirTree.data[localDirTree.selection.currentIndex].empty    = false;                  // not empty anymore
      localDirTree.data[localDirTree.selection.currentIndex].children = null;                   // reset its children
      localDirTree.treebox.invalidateRow(localDirTree.selection.currentIndex);
    }

    if (!skipLocalTree) {
      if (skipDelay) {
        this.updateView();
      } else {
        var func = function() {
          localTree.updateView();
        };
        setTimeout(func, 1000);                                                                 // update localTree, after a little bit
      }
    }
  },

  // ****************************************************** file functions ***************************************************

  constructPath : function(parent, leafName) {
    return parent + (parent.charAt(parent.length - 1) != gSlash ? gSlash : '') + leafName;
  },

  launch : function() {
    if (this.selection.count == 0) {
      return;
    }

    for (var x = 0; x < this.rowCount; ++x) {
      if (this.selection.isSelected(x)) {
        if (!localFile.verifyExists(this.data[x])) {
          continue;
        }

        localFile.launch(this.data[x]);
      }
    }
  },

  openContainingFolder : function() {
    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount || !localFile.verifyExists(this.data[this.selection.currentIndex].parent)) {
      return;
    }

    localDirTree.changeDir(this.data[this.selection.currentIndex].parent.path);
  },

  extract : function(toFolder) {
    if (this.selection.count == 0) {
      return;
    }

    var files = new Array();

    for (var x = 0; x < this.rowCount; ++x) {
      if (this.selection.isSelected(x)) {
        if (!localFile.verifyExists(this.data[x])) {
          continue;
        }

        files.push(this.data[x]);
      }
    }

    for (var x = 0; x < files.length; ++x) {
      var extension = this.getExtension(files[x].leafName);
      if (extension != "zip" && extension != "jar" && extension != "xpi") {
        continue;
      }

      this.extractHelper(toFolder, files[x]);
    }
  },

  extractHelper : function(toFolder, file) {                                                    // code modified from
    try {                                                                                       // http://xulfr.org/wiki/RessourcesLibs/lireExtraireZip
      var origParent = gLocalPath.value;                                                        // since were doing threading, the parent path could change during extraction
      ++gProcessing;
      var zip        = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(Components.interfaces.nsIZipReader);
      zip.open(file);

      var leafNameNoExt = file.leafName.lastIndexOf(".") != -1 ? file.leafName.substring(0, file.leafName.lastIndexOf("."))
                                                               : file.leafName;
      var localParent   = toFolder ? this.constructPath(file.parent.path, leafNameNoExt) : file.parent.path;
      var folder        = localFile.init(localParent);

      if (!folder.exists()) {
        folder.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0755);
      }

      var prompt  = true;
      var skipAll = false;

      var entries = zip.findEntries("*");

      while (entries.hasMore()) {
        var entry      = entries.getNext();
        var destFolder = localFile.init(localParent);
        var entrySplit = entry.split('/');

        for (var x = 0; x < entrySplit.length; ++x) {
          if (x == entrySplit.length - 1 && entrySplit[x].length != 0) {
            destFolder.append(entrySplit[x]);
            var zipEntry = zip.getEntry(entry);

            if (destFolder.exists() && skipAll) {
              break;
            }

            if (destFolder.exists() && prompt) {                                                // ask nicely
              var params = { response         : 0,
                             fileName         : destFolder.path,
                             resume           : true,
                             replaceResume    : true,
                             existingSize     : destFolder.fileSize,
                             existingDate     : "",
                             newSize          : zipEntry.realSize,
                             newDate          : "",
                             timerEnable      : false };

              window.openDialog("chrome://fireftp/content/confirmFile.xul", "confirmFile", "chrome,modal,dialog,resizable,centerscreen", params);

              if (params.response == 2) {
                prompt = false;
              } else if (params.response == 3) {
                break;
              } else if (params.response == 4 || params.response == 0) {
                return;
              } else if (params.response == 5) {
                skipAll = true;
                break;
              }
            }

            // XXX: IDL is broken on this?
            // I get this error: Cannot find interface information for parameter arg 0 [nsIFireFTPUtils.extract]
            // moving code outside of gFireFTPUtils since this doesn't run on a separate thread anyway...
            //var innerEx = gFireFTPUtils.extract(zip, entry, destFolder);

            //if (innerEx) {
            //  throw innerEx;
            //}

            zip.extract(entry, destFolder);

            break;
          }

          destFolder.append(entrySplit[x]);

          try {
            if (!destFolder.exists()) {
              destFolder.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0755);
            }
          } catch (ex) { }
        }
      }

      zip.close();

      if (origParent == gLocalPath.value) {                                                     // since we're extracting on a separate thread make sure we're in the same directory on refresh
        this.refresh();
      } else {
        localDirTree.addDirtyList(origParent);
      }
    } catch (ex) {
      error(gStrbundle.getString("errorExtract"));
      debug(ex);
    } finally {
      --gProcessing;
    }
  },

  create : function(isDir) {
    if (this.searchMode == 2) {
      return;
    }

    this.data.push({        leafName    : "",
                            fileSize    : "",
                            date        : "",
                            extension   : "",
                            attr        : "",
                            path        : "",
                            isDir       : isDir,
                            isDirectory : function() { return this.isDir },
                            isSymlink   : function() { return false },
                            isHidden    : false });
    this.displayData.push({ leafName    : "",
                            fileSize    : "",
                            date        : "",
                            extension   : "",
                            attr        : "",
                            icon        : isDir ? "" : "moz-icon://file?size=16",
                            path        : "",
                            isDirectory : isDir,
                            isSymlink   : false,
                            isHidden    : false });
    ++this.rowCount;
    this.treebox.rowCountChanged(this.rowCount - 1, 1);
    this.treebox.ensureRowIsVisible(this.rowCount - 1);

    this.editType   = "create";
    this.editParent = gLocalPath.value;
    var func = function() {
      gLocalTree.startEditing(localTree.rowCount - 1, gLocalTree.columns['localname']);
    };
    setTimeout(func, 0);
  },

  remove : function() {
    if (this.selection.count == 0) {
      return;
    }

    var count = this.selection.count;
    var files = new Array();
    var indexOfFileBeforeDeleted = null;

    for (var x = 0; x < this.rowCount; ++x) {
      if (this.selection.isSelected(x)) {
        if (!this.data[x].path || !localFile.verifyExists(this.data[x])) {
          continue;
        }

        if (indexOfFileBeforeDeleted === null) {
          indexOfFileBeforeDeleted = Math.max(0, x - 1);
        }
        files.push(this.data[x]);
      }
    }

    var origParent = gLocalPath.value;                                                          // since were doing threading, the parent path could change during deleting
    var prompt     = true;

    for (var x = 0; x < files.length; ++x) {
      if (!localFile.remove(files[x], prompt, count)) {
        break;
      }

      prompt = false;
    }

    if (origParent == gLocalPath.value) {                                                       // since we're deleting on a separate thread make sure we're in the same directory on refresh
      this.refresh(false, true);

      if (this.rowCount) {
        this.selection.select(indexOfFileBeforeDeleted);
        this.treebox.ensureRowIsVisible(indexOfFileBeforeDeleted);
      }
    } else {
      localDirTree.addDirtyList(origParent);
    }
  },

  rename : function() {
    if (this.rowCount > 0 && this.selection.count > 0) {
      if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
        this.selection.currentIndex = this.rowCount - 1;
      }

      if (!localFile.verifyExists(this.data[this.selection.currentIndex])) {
        return;
      }

      this.displayData[this.selection.currentIndex].origLeafName = this.data[this.selection.currentIndex].leafName;
      this.displayData[this.selection.currentIndex].origPath     = this.data[this.selection.currentIndex].path;

      if (this.searchMode == 2) {
        this.displayData[this.selection.currentIndex].path = this.displayData[this.selection.currentIndex].leafName;
        this.treebox.invalidateRow(this.selection.currentIndex);
      }

      this.editType   = "rename";
      this.editParent = gLocalPath.value;
      gLocalTree.startEditing(this.selection.currentIndex, gLocalTree.columns["localname"]);
    }
  },

  isEditable : function(row, col) {
    var canEdit = row >= 0 && row < this.data.length && col.id == "localname";
    this.isEditing = canEdit;
    return canEdit;
  },

  setCellText : function(row, col, val) {
    // XXX Firefox 51 has a regression that calls setCellText immediately
    // upon calling startEditing. Hacks below to see if startEditing is in the
    // call stack.
    if (col && !val) {
      try {
        throw Error('blah');
      } catch(ex) {
        if (ex.stack && ex.stack.indexOf('startEditing') != -1) {
          return;
        }
      }
    }

    if (!this.isEditing || this.editParent != gLocalPath.value) {                               // for some reason, this is called twice - so we prevent this
      return;
    }

    this.isEditing = false;
    if (this.editType == "rename") {
      if (this.data[row].leafName == val) {
        // do nothing
      } else if (localFile.rename(this.data[row], val)) {
        var rowDiff = this.treebox.getLastVisibleRow() - row;

        this.refresh(false, true);

        for (var x = 0; x < this.rowCount; ++x) {
          if (this.data[x].leafName == val) {
            this.selection.select(x);
            this.treebox.ensureRowIsVisible(rowDiff + x - 1 < this.rowCount ? rowDiff + x - 1 : this.rowCount - 1);
            break;
          }
        }
      } else {
        this.displayData[row].leafName = val;
        this.treebox.invalidateRow(row);
        var func = function() {
          gLocalTree.startEditing(row, gLocalTree.columns['localname']);
        };
        setTimeout(func, 0);
      }
    } else if (this.editType == "create") {
      if (val) {
        if (localFile.create(this.data[row].isDir, val)) {
          this.refresh(false, true);

          for (var x = 0; x < this.rowCount; ++x) {
            if (this.data[x].leafName == val) {
              this.selection.select(x);
              this.treebox.ensureRowIsVisible(x);
              break;
            }
          }
        } else {
          this.data[row].leafName        = val;
          this.displayData[row].leafName = val;
          this.treebox.invalidateRow(row);
          var func = function() {
            gLocalTree.startEditing(localTree.rowCount - 1, gLocalTree.columns['localname']);
          };
          setTimeout(func, 0);
        }
      } else {
        --this.rowCount;
        this.data.splice(this.rowCount, 1);
        this.displayData.splice(this.rowCount, 1);
        this.treebox.rowCountChanged(this.rowCount, -1);
      }
    }
  },

  showProperties : function(recursive) {
    if (this.rowCount == 0 || this.selection.count == 0) {
      return;
    }

    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      this.selection.currentIndex = this.rowCount - 1;
    }

    if (this.selection.count > 1) {                                                             // multiple files
      var files = new Array();

      for (var x = 0; x < this.rowCount; ++x) {
        if (this.selection.isSelected(x)) {
          if (!localFile.verifyExists(this.data[x])) {
            continue;
          }

          files.push(this.data[x]);
        }
      }

      var recursiveFolderData = { type: "local", nFolders: 0, nFiles: 0, nSize: 0 };

      for (var x = 0; x < files.length; ++x) {
        if (!localFile.verifyExists(files[x])) {
          continue;
        }

        if (files[x].isDirectory()) {
          ++recursiveFolderData.nFolders;

          if (recursive) {
            this.getRecursiveFolderData(files[x], recursiveFolderData);
          }
        } else {
          ++recursiveFolderData.nFiles;
        }

        recursiveFolderData.nSize += files[x].fileSize;
      }

      var params = { multipleFiles       : true,
                     recursiveFolderData : recursiveFolderData };

      window.openDialog("chrome://fireftp/content/properties.xul", "properties", "chrome,modal,dialog,resizable,centerscreen", params);

      return;
    }

    if (!localFile.verifyExists(this.data[this.selection.currentIndex])) {
      return;
    }

    var origParent = gLocalPath.value;                                                          // since were doing threading, the parent path could change

    if (localFile.showProperties(this.data[this.selection.currentIndex], recursive)) {
      if (origParent == gLocalPath.value) {                                                     // since we're working on a separate thread make sure we're in the same directory on refresh
        var single  = this.selection.count == 1 ? this.selection.currentIndex : -1;
        var name    = this.data[this.selection.currentIndex].leafName;
        var rowDiff = this.treebox.getLastVisibleRow() - single;

        this.refresh(false, true);

        if (single != -1) {
          for (var x = 0; x < this.rowCount; ++x) {
            if (this.data[x].leafName == name) {
              this.selection.select(x);
              this.treebox.ensureRowIsVisible(rowDiff + x - 1 < this.rowCount ? rowDiff + x - 1 : this.rowCount - 1);
              break;
            }
          }
        }
      }
    }
  },

  getRecursiveFolderData : function(dir, recursiveFolderData) {
    ++gProcessing;
    gFireFTPUtils.getRecursiveFolderData(dir, new wrapperClass(recursiveFolderData));
    --gProcessing;
  },

  // ************************************************* mouseEvent *****************************************************

  dblClick : function(event) {
    gLocalTree.stopEditing();

    if (event.button != 0 || event.originalTarget.localName != "treechildren" || this.selection.count == 0) {
      return;
    }

    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      this.selection.currentIndex = this.rowCount - 1;
    }

    if (!localFile.verifyExists(this.data[this.selection.currentIndex])) {
      return;
    }

    if (this.data[this.selection.currentIndex].isDirectory()) {                                 // if it's a directory
      localDirTree.changeDir(this.data[this.selection.currentIndex].path);                      // navigate to it
    } else {
      if (gOpenMode) {
        this.launch();
      } else {
        new transfer().start(false);                                                            // else upload the file
      }
    }
  },

  click : function(event) {
    if (event.button == 1 && !$('localPasteContext').disabled) {                                // middle-click paste
      this.paste();
    }
  },

  createContextMenu : function() {
    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      this.selection.currentIndex = this.rowCount - 1;
    }

    for (var x = $('openWithMenu').childNodes.length - 1; x >= 0; --x) {                      // clear out the menu
      $('openWithMenu').removeChild($('openWithMenu').childNodes.item(x));
    }

    $('localOpenCont').collapsed    =               this.searchMode != 2;
    $('localOpenContSep').collapsed =               this.searchMode != 2;
    $('localCutContext').setAttribute("disabled",   this.searchMode == 2);
    $('localCopyContext').setAttribute("disabled",  this.searchMode == 2);
    $('localPasteContext').setAttribute("disabled", this.searchMode == 2 || !this.pasteFiles.length);
    $('localCreateDir').setAttribute("disabled",    this.searchMode == 2);
    $('localCreateFile').setAttribute("disabled",   this.searchMode == 2);

    if (this.selection.currentIndex == -1) {
      return;
    }

    var hasDir = false;
    for (var x = 0; x < this.rowCount; ++x) {
      if (this.selection.isSelected(x)) {
        if (this.data[x].isDirectory()) {
          hasDir = true;
          break;
        }
      }
    }

    $('localRecursiveProperties').setAttribute("disabled", !hasDir);

    var extension = this.getExtension(this.data[this.selection.currentIndex].leafName);
    var item;
    var found     = false;

    var self = this;
    var contextMenuHelper = function(x, y) {
      found = true;
      var program = localFile.init(gPrograms[x].programs[y].executable);

      if (!program) {
        return;
      }

      var fileURI = gIos.newFileURI(program);
      item        = document.createElement("menuitem");
      item.setAttribute("class",     "menuitem-iconic");
      item.setAttribute("image",     "moz-icon://" + fileURI.spec + "?size=16");
      item.setAttribute("label",     gPrograms[x].programs[y].name);
      item.setAttribute("oncommand", "launchProgram(" + x + ", " + y + ")");
      $('openWithMenu').appendChild(item);
    };

    for (var x = 0; x < gPrograms.length; ++x) {
      if (gPrograms[x].extension.toLowerCase() == extension.toLowerCase()) {
        for (var y = 0; y < gPrograms[x].programs.length; ++y) {
          contextMenuHelper(x, y);
        }

        break;
      }
    }

    for (var x = 0; x < gPrograms.length; ++x) {
      if (gPrograms[x].extension == "*.*") {
        for (var y = 0; y < gPrograms[x].programs.length; ++y) {
          contextMenuHelper(x, y);
        }

        break;
      }
    }

    if (found) {
      item = document.createElement("menuseparator");
      $('openWithMenu').appendChild(item);
    }

    item = document.createElement("menuitem");
    item.setAttribute("label", gStrbundle.getString("chooseProgram"));
    item.setAttribute("oncommand", "chooseProgram()");
    $('openWithMenu').appendChild(item);

    var isZippy = extension == "zip" || extension == "jar" || extension == "xpi";
    $('extractHereContext').collapsed = !isZippy;
    $('extractToContext').collapsed   = !isZippy;
  },

  mouseOver : function(event) {                                                                 // display local folder info
    if (gStrbundle && this.rowCount) {
      $('statustxt').label = gStrbundle.getString("localListing") + " " + gStrbundle.getFormattedString("objects", [this.rowCount])
                           + (this.localSize < 0 ? "" : ", " + commas(this.localSize)) + ", "
                           + gStrbundle.getString("diskSpace")    + " " + this.localAvailableDiskSpace;
    } else {
      $('statustxt').label = gStrbundle.getString("localListingNoObjects");
    }
  },

  // ************************************************* keyEvent *****************************************************

  keyDown : function(event) {
    var accelKey = testAccelKey(event);
    if (accelKey && (event.keyCode == 38 || event.keyCode == 40)) {
      this.keyPress(event);
    }
  },

  keyPress : function(event) {
    if (gLocalTree.editingRow != -1) {
      if (event.keyCode == 27) {
        if (this.editType == "create") {
          this.setCellText(-1, "", "");
        } else {
          this.displayData[gLocalTree.editingRow].leafName = this.displayData[gLocalTree.editingRow].origLeafName;
          this.displayData[gLocalTree.editingRow].path     = this.displayData[gLocalTree.editingRow].origPath;
          this.treebox.invalidateRow(gLocalTree.editingRow);
        }
      }

      return;
    }

    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      this.selection.currentIndex = this.rowCount - 1;
    }

    var accelKey = testAccelKey(event);

    if ((event.keyCode == 13 ||
        (accelKey && event.keyCode == 40)) && this.selection.count != 0) {                      // enter, or cmd-down
      if (!localFile.verifyExists(this.data[this.selection.currentIndex])) {
        return;
      }

      if (this.selection.count == 1 && this.data[this.selection.currentIndex].isDirectory()) {  // if it's a directory
        localDirTree.changeDir(this.data[this.selection.currentIndex].path);                    // navigate to it
      } else {
        if (gOpenMode) {
          this.launch();
        } else {
          new transfer().start(false);                                                          // else upload a file
        }
      }
    } else if (accelKey && (event.which == 65 || event.which == 97)) {
      event.preventDefault();                                                                   // accel-a: select all
      this.selection.selectAll();
    } else if (event.ctrlKey && event.keyCode == 32 && this.selection.count != 0) {             // ctrl-space, select or deselect
      this.selection.toggleSelect(this.selection.currentIndex);
    } else if (event.keyCode  == 8) {                                                           // backspace
      event.preventDefault();
      localDirTree.cdup();
    } else if (accelKey && event.keyCode == 38) {                                               // accel-up
      event.preventDefault();
      localDirTree.cdup();
    } else if (event.keyCode  == 116) {                                                         // F5
      event.preventDefault();
      this.refresh(false, true);
    } else if (event.keyCode  == 113 && this.selection.count != 0) {                            // F2
      this.rename();
    } else if (event.charCode == 100 && accelKey) {                                             // accel-d
      event.preventDefault();
      this.create(true);
    } else if (event.charCode == 110 && accelKey) {                                             // accel-n
      event.preventDefault();
      this.create(false);
    } else if (event.keyCode  == 46 && this.selection.count != 0) {                             // del
      this.remove();
    } else if (event.keyCode  == 93) {                                                          // display context menu
      var x = {};    var y = {};    var width = {};    var height = {};
      this.treebox.getCoordsForCellItem(this.selection.currentIndex, this.treebox.columns["localname"], "text", x, y, width, height);
      this.createContextMenu();
      $('localmenu').showPopup(gLocalTreeChildren, gLocalTreeChildren.boxObject.x + 75, gLocalTreeChildren.boxObject.y + y.value + 5, "context");
    } else if (event.charCode == 112 && accelKey && this.selection.count != 0) {                // accel-p
      event.preventDefault();
      this.showProperties(false);
    } else if (event.charCode == 120 && accelKey && this.selection.count != 0) {                // accel-x
      event.preventDefault();
      this.cut();
    } else if (event.charCode == 99  && accelKey && this.selection.count != 0) {                // accel-c
      event.preventDefault();
      this.copy();
    } else if (event.charCode == 118 && accelKey) {                                             // accel-v
      event.preventDefault();
      this.paste();
    } else if (event.charCode == 111 && accelKey) {                                             // accel-o
      event.preventDefault();
      this.launch();
    }
  },

  // ************************************************* cut, copy, paste *****************************************************

  isCut      : false,
  pasteFiles : new Array(),
  oldParent  : "",

  cut  : function() {
    this.copy(true);
  },

  copy : function(isCut) {
    if (this.searchMode == 2) {
      return;
    }

    if (this.selection.count == 0) {
      return;
    }

    this.isCut      = isCut;
    this.pasteFiles = new Array();
    this.oldParent  = gLocalPath.value;

    for (var x = 0; x < this.rowCount; ++x) {                                                   // put files to be cut/copied in an array to be pasted
      if (this.selection.isSelected(x)) {
        if (localFile.verifyExists(this.data[x])) {
          this.pasteFiles.push(this.data[x]);
          this.displayData[x].isCut = isCut;
          this.treebox.invalidateRow(x);
        }
      }
    }

    $('localPasteContext').setAttribute("disabled", false);                                     // enable pasting
  },

  paste : function(dest) {
    if (this.searchMode == 2) {
      return;
    }

    if (this.pasteFiles.length == 0) {
      return;
    }

    var zeFiles = new Array();
    for (var x = 0; x < this.pasteFiles.length; ++x) {
      zeFiles.push(this.pasteFiles[x]);
    }

    var newParent = dest ? dest : gLocalPath.value;
    var currentDir = dest ? this.oldParent : newParent;

    if (!localFile.verifyExists(zeFiles[0])) {
      return;
    }

    for (var x = 0; x < zeFiles.length; ++x) {
      var newParentSlash = newParent       + (newParent.charAt(newParent.length - 1)             != gSlash ? gSlash : '');
      var pasteFileSlash = zeFiles[x].path + (zeFiles[x].path.charAt(zeFiles[x].path.length - 1) != gSlash ? gSlash : '');

      if (zeFiles[x].isDirectory() && newParentSlash.indexOf(pasteFileSlash) == 0) {    // can't copy into a subdirectory of itself
        doAlert(gStrbundle.getString("copySubdirectory"));
        return;
      }
    }

    var prompt     = true;
    var skipAll    = false;
    var anyFolders = false;
    ++gProcessing;

    try {
      var newDir = localFile.init(newParent);

      for (var x = 0; x < zeFiles.length; ++x) {
        if (!localFile.verifyExists(zeFiles[x])) {
          continue;
        }

        if (zeFiles[x].isDirectory()) {
          anyFolders = true;
        }

        var newFile = localFile.init(this.constructPath(newDir.path, zeFiles[x].leafName));

        if (this.isCut && newFile.exists() && zeFiles[x].parent.path == newDir.path) {
          continue;
        }

        var counter = 1;
        while (!this.isCut && newFile.exists() && zeFiles[x].parent.path == newDir.path) {
          newFile = localFile.init(this.constructPath(newDir.path, counter + '_' + zeFiles[x].leafName));
          ++counter;
        }

        if (newFile.exists() && skipAll) {
          continue;
        }

        if (newFile.exists() && (newFile.isDirectory() || zeFiles[x].isDirectory())) {
          error(gStrbundle.getFormattedString("pasteErrorFile", [zeFiles[x].path]));
          continue;
        }

        if (newFile.exists() && prompt) {                                                       // ask nicely
          var params = { response         : 0,
                         fileName         : newFile.path,
                         resume           : true,
                         replaceResume    : true,
                         existingSize     : newFile.fileSize,
                         existingDate     : newFile.lastModifiedTime,
                         newSize          : zeFiles[x].fileSize,
                         newDate          : zeFiles[x].lastModifiedTime,
                         timerEnable      : false };

          window.openDialog("chrome://fireftp/content/confirmFile.xul", "confirmFile", "chrome,modal,dialog,resizable,centerscreen", params);

          if (params.response == 2) {
            prompt = false;
          } else if (params.response == 3) {
            continue;
          } else if (params.response == 4 || params.response == 0) {
            return;
          } else if (params.response == 5) {
            skipAll = true;
            continue;
          }
        }

        // XXX Firefox doesn't send UTF8 across component boundary correctly.
        // So we encodeURI on the leafName to fix that. Woo.
        var innerEx = gFireFTPUtils.cutCopy(this.isCut, zeFiles[x], newFile, newDir, encodeURI(newFile.leafName));

        if (innerEx) {
          throw innerEx;
        }
      }
    } catch (ex) {
      debug(ex);
      error(gStrbundle.getString("pasteError"));
    } finally {
      --gProcessing;
    }

    if (this.isCut && anyFolders) {
      var refreshIndex = dest ? localDirTree.indexOfPath(newParent) : localDirTree.indexOfPath(this.oldParent);

      if (refreshIndex != -1) {
        if (localDirTree.data[refreshIndex].open) {
          localDirTree.toggleOpenState(refreshIndex, true);                                     // close it up
          localDirTree.data[refreshIndex].children = null;                                      // reset its children
          localDirTree.toggleOpenState(refreshIndex);                                           // and open it up again
        } else {
          localDirTree.data[refreshIndex].children = null;                                      // reset its children
          localDirTree.data[refreshIndex].empty    = false;
          localDirTree.treebox.invalidateRow(refreshIndex);
        }

        if (currentDir == gLocalPath.value) {
          var refreshIndex2 = localDirTree.indexOfPath(currentDir);

          if (refreshIndex2 == -1) {
            localDirTree.changeDir(currentDir);
          } else {
            localDirTree.selection.select(refreshIndex2);
          }
        }
      } else {
        localDirTree.addDirtyList(dest ? newParent : this.oldParent);
      }
    }

    if (this.isCut) {
      this.pasteFiles  = new Array();
      this.isCut       = false;
      $('localPasteContext').setAttribute("disabled", true);
    }

    if (currentDir == gLocalPath.value) {                                                       // since we're working on a separate thread make sure we're in the same directory on refresh
      this.refresh();
    } else {
      var path = gLocalPath.value;
      var refreshIndex = localDirTree.indexOfPath(currentDir);

      if (refreshIndex != -1) {
        if (localDirTree.data[refreshIndex].open) {
          localDirTree.toggleOpenState(refreshIndex, true);                                     // close it up
          localDirTree.data[refreshIndex].children = null;                                      // reset its children
          localDirTree.toggleOpenState(refreshIndex);                                           // and open it up again
        } else {
          localDirTree.data[refreshIndex].children = null;                                      // reset its children
          localDirTree.data[refreshIndex].empty    = false;
          localDirTree.treebox.invalidateRow(refreshIndex);
        }

        var refreshIndex2 = localDirTree.indexOfPath(path);

        if (refreshIndex2 == -1) {
          localDirTree.changeDir(path);
        } else {
          localDirTree.selection.select(refreshIndex2);
        }
      } else {
        localDirTree.addDirtyList(currentDir);
      }
    }
  },

  canDrop : function(index, orient) {
    if (!dragObserver.origin || (dragObserver.origin.indexOf('local') != -1 && index == -1) || dragObserver.origin == "external"
     || (dragObserver.origin.indexOf('local') != -1 && !this.data[index].isDirectory())) {
      return false;
    }

    if (dragObserver.origin == 'localtreechildren') {                                           // don't drag onto itself
      for (var x = 0; x < this.rowCount; ++x) {
        if (this.selection.isSelected(x) && index == x) {
          return false;
        }
      }
    }

    if (dragObserver.origin.indexOf('remote') != -1 && (!gConnection || !gConnection.isConnected)) {
      return false;
    }

    return true;
  },

  drop : function(index, orient) {
    if (dragObserver.origin == 'localtreechildren') {
      this.cut();
      this.paste(this.data[index].path);
    } else if (dragObserver.origin == 'remotetreechildren') {
      if (!dragObserver.overName || index == -1 || !this.data[index].isDirectory()) {
        new transfer().start(true);
      } else {
        var transferObj          = new transfer();
        transferObj.localRefresh = gLocalPath.value;
        transferObj.start(true,  '', this.data[index].path, '');
      }
    }
  }
};
