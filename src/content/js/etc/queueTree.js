var queueTree = {
  data                : new Array(),
  rowCount            : 0,
  oldCount            : 0,
  failed              : new Array(),
  processQueue        : new Array(),

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
        case "queuesource":
          return this.data[row].source;
        case "queuedest":
          return this.data[row].dest;
        case "queuebytes":
          return this.data[row].size;
        case "queueela":
          return this.data[row].ela;
        case "queuerem":
          return this.data[row].remain;
        case "queuerate":
          return this.data[row].rate;
        case "queuepercent":
          return "";
        case "queuetype":
          return this.data[row].type;
        case "queuestatus":
          return this.data[row].status;
        default:
          return " ";
      }
    }

    return "";
  },

  getCellValue : function(row, col) {
    if (row >= 0 && row < this.data.length && col.id == "queuepercent") {
      return this.data[row].percent;
    }

    return 0;
  },

  getImageSrc : function(row, col)  {
    return row >= 0 && row < this.data.length && col.id == "queuesource" && this.data[row].icon ? this.data[row].icon : "";
  },

  cycleHeader : function(col) { },

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
      if (col.id == "queuesource") {
        properties += this.setProperty(props, "nameCol");
      }
    }
    return properties;
  },

  getProgressMode : function(row, col) {
    if (row >= 0 && row < this.data.length) {
      return this.data[row].mode == "determined" ? Components.interfaces.nsITreeView.PROGRESS_NORMAL : Components.interfaces.nsITreeView.PROGRESS_NONE;
    }

    return Components.interfaces.nsITreeView.PROGRESS_NONE;
  },

  addQueue : function(connNo, transferInfo) {
    var self = this;
    var callback = function() {
      var leafName = transferInfo.remotePath.substring(transferInfo.remotePath.lastIndexOf('/') + 1);

      var obj = {
        connNo  : connNo,
        id      : transferInfo.id,
        source  : transferInfo.type == "download" ? transferInfo.remotePath : transferInfo.localPath,
        dest    : transferInfo.type == "download" ? transferInfo.localPath  : transferInfo.remotePath,
        size    : commas(transferInfo.size),
        rawsize : transferInfo.size,
        file    : transferInfo.file,
        typeO   : transferInfo.transport,
        type    : (transferInfo.type == "download" ? gStrbundle.getString("download") : (transferInfo.type == "fxp" ? "FXP" : gStrbundle.getString("upload"))) + (transferInfo.ascii == "A" ? " (ASCII)": ''),
        typeAct : transferInfo.type,
        icon    : "moz-icon://" + leafName + "?size=16",
        ela     : '',
        remain  : '',
        rate    : '',
        percent : '',
        status  : '',
        mode    : '',
        failed  : false,
        transferring : false
      };

      if (self.data.length) {
        var inserted = false;
        for (var x = self.data.length - 1; x >= 0; --x) {
          if (!self.data[x].failed) {
            self.data.splice(x + 1, 0, obj);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          self.data.push(obj);
        }
      } else {
        self.data.push(obj);
      }
    };

    this.processQueue.push(callback);
  },

  removeQueue : function(id) {
    var self = this;
    var callback = function() {
      for (var x = 0; x < self.data.length; ++x) {
        if (self.data[x].id == id) {
          self.data.splice(x, 1);
          break;
        }
      }
    };

    this.processQueue.push(callback);
  },

  clearQueue : function(connNo) {
    var self = this;
    var callback = function() {
      for (var x = self.data.length - 1; x >= 0; --x) {
        if (self.data[x].connNo == connNo) {
          self.data.splice(x, 1);
        }
      }
    };

    this.processQueue.push(callback);
  },

  addFailed : function(info, reason) {
    var self = this;
    var callback = function() {
      info.reason = reason;

      var leafName = info.remotePath.substring(info.remotePath.lastIndexOf('/') + 1);

      var obj = {
        connNo  : -1,
        id      : info.id,
        source  : info.type == "download" ? info.remotePath : info.localPath,
        dest    : info.type == "download" ? info.localPath  : info.remotePath,
        size    : commas(info.size),
        rawsize : info.size,
        file    : info.file,
        typeO   : '',
        type    : (info.type == "download" ? gStrbundle.getString("download") : (info.type == "fxp" ? "FXP" : gStrbundle.getString("upload"))) + (info.ascii == "A" ? " (ASCII)": ''),
        typeAct : info.type,
        icon    : "moz-icon://" + leafName + "?size=16",
        ela     : '',
        remain  : '',
        rate    : '',
        percent : '',
        status  : gStrbundle.getString("error") + ": " + (info.reason == "checksum" ? gStrbundle.getString("checksum") : info.reason),
        mode    : '',
        failed  : true,
        transferring : false
      };

      self.data.push(obj);
    };

    this.processQueue.push(callback);
  },

  // ****************************************************** updateView ***************************************************

  updateView : function() {
    if ($('logQueueTabs').selectedIndex != 1) {
      return;
    }

    var selectedIds    = new Array();
    var currentIndexId = this.selection.currentIndex >= 0 && this.selection.currentIndex < this.rowCount ? this.data[this.selection.currentIndex].id : -1;

    for (var x = 0; x < this.rowCount; ++x) {
      if (this.selection.isSelected(x)) {
        selectedIds.push(this.data[x].id);
      }
    }

    for (var x = 0; x < this.processQueue.length; ++x) {
      this.processQueue[x]();
    }
    this.processQueue = [];

    for (var x = 0; x < gMaxCon; ++x) {
      if (!gConnections[x].isConnected) {
        continue;
      }

      var index = -1;

      var nextTransferEndCommandIndex = -1;
      for (var y = 0; y < gConnections[x].eventQueue.length; ++y) {
        if (y > 5) {
          // We only check near the beginning of the queue.
          break;
        }
        if (gConnections[x].eventQueue[y].cmd == 'transferEnd') {
          nextTransferEndCommandIndex = y;
          break;
        }
      }

      var nextFXPTransferEndCommandIndex = -1;
      for (var y = 0; y < gConnection.eventQueue.length; ++y) {
        if (y > 5) {
          // We only check near the beginning of the queue.
          break;
        }
        if (gConnection.eventQueue[y].cmd == 'transferEnd') {
          nextFXPTransferEndCommandIndex = y;
          break;
        }
      }

      if (gConnections[x].dataSocket && gConnections[x].dataSocket.id) {
        for (var y = 0; y < this.data.length; ++y) {
          if (this.data[y].id == gConnections[x].dataSocket.id) {
            index = y;
            break;
          }
        }
      } else if (gConnections[x].protocol == 'ssh2' && nextTransferEndCommandIndex != -1) {
        for (var y = 0; y < this.data.length; ++y) {
          if (this.data[y].id == gConnections[x].eventQueue[nextTransferEndCommandIndex].options.id) {
            index = y;
            break;
          }
        }
      } else if (this.data.length && this.data[0].typeO == 'fxp') {
        index = 0;
      } else {
        continue;
      }

      if ((gConnections[x].dataSocket && gConnections[x].dataSocket.id == this.data[index].id && this.data[index].typeAct == "upload" && gConnections[x].dataSocket.progressEventSink.compressStream)
       || (this.data[index].typeO == 'fxp' && nextFXPTransferEndCommandIndex != -1 && gConnection.eventQueue[nextFXPTransferEndCommandIndex].options.id == this.data[index].id)) {
        var encryptedLabel       = gConnections[x].security ? ", "
          + (gConnections[x].protocol != "ftp" || gConnections[x].securityMode == "P" ? gStrbundle.getString("dataEncrypted")
                                                                                      : gStrbundle.getString("dataNotEncrypted")) : "";
        this.data[index].status = gStrbundle.getString("transferring") + encryptedLabel;
        this.data[index].transferring = true;
      } else if ((gConnections[x].dataSocket && gConnections[x].dataSocket.id == this.data[index].id)
          || (gConnections[x].transferProgress && gConnections[x].transferProgress.bytesTotal)) {
        var bytesTotal;
        var bytesTransferred;
        var bytesPartial;
        var timeStart;

        if (gConnections[x].transferProgress) {
          bytesTotal        = gConnections[x].transferProgress.bytesTotal;
          bytesTransferred  = gConnections[x].transferProgress.bytesTransferred;
          bytesPartial      = gConnections[x].transferProgress.bytesPartial;
          timeStart         = gConnections[x].transferProgress.timeStart;
        } else if (this.data[index].typeAct == "upload") {
          bytesTotal        = gConnections[x].dataSocket.progressEventSink.bytesTotal;
          bytesTransferred  = gConnections[x].dataSocket.progressEventSink.bytesUploaded;
          bytesPartial      = gConnections[x].dataSocket.progressEventSink.bytesPartial;
          timeStart         = gConnections[x].dataSocket.progressEventSink.timeStart;
        } else {
          bytesTotal        = gConnections[x].dataSocket.dataListener.bytesTotal;
          bytesTransferred  = gConnections[x].dataSocket.dataListener.bytesDownloaded;
          bytesPartial      = gConnections[x].dataSocket.dataListener.bytesPartial;
          timeStart         = gConnections[x].dataSocket.dataListener.timeStart;
        }

        if (bytesTotal) {
          var timeElapsed   = ((new Date()) - timeStart) / 1000;
          timeElapsed       = timeElapsed != 0 ? timeElapsed : 1;                         // no dividing by 0
          var averageRate   = ((bytesTransferred - bytesPartial) / 1024 / timeElapsed).toFixed(2);
          averageRate       = averageRate != 0 ? averageRate : "0.1";                     // no dividing by 0
          var timeRemaining = (bytesTotal - bytesTransferred) / 1024 * (1 / averageRate);
          averageRate       = averageRate.replace(/\./g, gStrbundle.getString("decimal")) + " " + gStrbundle.getString("kbsec");

          var hours         = parseInt( timeElapsed / 3600);
          var min           = parseInt((timeElapsed - hours * 3600) / 60);
          var sec           = parseInt( timeElapsed - hours * 3600 - min * 60);
          this.data[index].ela = zeros(hours) + ":" + zeros(min) + ":" + zeros(sec);

          hours             = parseInt( timeRemaining / 3600);
          min               = parseInt((timeRemaining - hours * 3600) / 60);
          sec               = parseInt( timeRemaining - hours * 3600 - min * 60);
          this.data[index].remain = zeros(hours) + ":" + zeros(min) + ":" + zeros(sec);

          this.data[index].rate    = averageRate;
          var total                = bytesTotal != 0 ? bytesTotal : 1;                           // no dividing by 0
          var progress             = parseInt(bytesTransferred / total * 100) + "%";
          this.data[index].mode    = "determined";
          this.data[index].percent = progress;
          this.data[index].size    = progress + " - " + commas(bytesTransferred) + " / " + commas(bytesTotal);
          var encryptedLabel       = gConnections[x].security ? ", "
            + (gConnections[x].protocol != "ftp" || gConnections[x].securityMode == "P" ? gStrbundle.getString("dataEncrypted")
                                                                                        : gStrbundle.getString("dataNotEncrypted")) : "";
          this.data[index].status  = gStrbundle.getString("transferring") + encryptedLabel;
          this.data[index].transferring = true;
        }
      }
    }

    this.rowCount = this.data.length;
    this.treebox.rowCountChanged(this.oldCount - 1, this.rowCount - this.oldCount);
    this.treebox.invalidate();
    this.oldCount = this.rowCount;

    this.selection.clearSelection();
    for (var x = 0; x < selectedIds.length; ++x) {                                              // reselect the rows that were selected
      for (var y = 0; y < this.rowCount; ++y) {
        if (selectedIds[x] == this.data[y].id && !this.selection.isSelected(y)) {
          this.selection.toggleSelect(y);
          break;
        }
      }
    }

    for (var x = 0; x < this.rowCount; ++x) {
      if (currentIndexId == this.data[x].id) {
        this.selection.currentIndex = x;
        break;
      }
    }
  },

  retry : function() {                                                                          // retry items from queue
    if (!gConnection.isConnected || this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      return;
    }

    var files = new Array();
    var selectedIds = new Array();
    for (var x = this.rowCount - 1; x >= 0; --x) {
      if (this.selection.isSelected(x) && this.data[x].failed) {
        files.push(this.data[x]);
        selectedIds.push(this.data[x].id);
      }
    }

    var self = this;
    var callback = function() {
      for (var x = 0; x < selectedIds.length; ++x) {
        for (var y = 0; y < self.rowCount; ++y) {
          if (self.data[y].id == selectedIds[x]) {
            self.data.splice(y, 1);
            break;
          }
        }
      }
    };
    this.processQueue.push(callback);

    for (var x = 0; x < files.length; ++x) {
      if (files[x].typeAct == "upload") {
        gConnection.upload(files[x].source, files[x].dest, false, files[x].rawsize, -1, null, false, null, files[x].file);
      } else if (files[x].typeAct == "download") {
        gConnection.download(files[x].source, files[x].dest, files[x].rawsize, false, -1, false, null, files[x].file);
      }
    }
  },

  cancel : function(zeFiles) {                                                                  // cancel items from queue
    if (!zeFiles && !this.selection.count) {
      return;
    }

    var files = new Array();

    if (zeFiles) {
      files = zeFiles;
    } else {
      for (var x = 0; x < this.rowCount; ++x) {
        if (this.selection.isSelected(x)) {
          files.push(this.data[x]);
        }
      }
    }

    for (var x = 0; x < files.length; ++x) {
      var connNo = files[x].id.split('-');
      connNo     = connNo[0] - 1;

      if (gConnections[connNo].dataSocket && gConnections[connNo].dataSocket.id == files[x].id
       || gConnections[connNo].transferProgress && gConnections[connNo].transferProgress.id == files[x].id) {
        var forceKill = gConnections[connNo].protocol == 'ssh2';
        gConnections[connNo].cancel(forceKill);
      } else if (files[x].failed) {
        this.cancelHelper(files[x]);
      } else {
        var begin = -1;
        var end   = -1;

        for (var y = 0; y < gConnections[connNo].eventQueue.length; ++y) {
          if (gConnections[connNo].eventQueue[y].cmd == "transferBegin" && gConnections[connNo].eventQueue[y].options.id == files[x].id) {
            begin = y;
          } else if (gConnections[connNo].eventQueue[y].cmd == "transferEnd" && gConnections[connNo].eventQueue[y].options.id == files[x].id) {
            end   = y;
            if (gConnections[connNo].observer) {
              gConnections[connNo].observer.onRemoveQueue(gConnections[connNo].eventQueue[y].options.id);
            }
            break;
          }
        }

        if (end != -1) {
          gConnections[connNo].eventQueue.splice(begin, end - begin + 1);
        }
      }
    }
  },

  cancelHelper : function(file) {
    var self = this;
    var callback = function() {
      for (var y = self.data.length - 1; y >= 0; --y) {
        if (file.id == self.data[y].id) {
          self.data.splice(y, 1);
          break;
        }
      }
    };
    this.processQueue.push(callback);
  },

  // ************************************************* keyEvent *****************************************************

  keyPress : function(event) {
    if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount) {
      this.selection.currentIndex = 0;
    }

    if (testAccelKey(event) && (event.which == 65 || event.which == 97)) {
      event.preventDefault();                                                                   // accel-a: select all
      this.selection.selectAll();
    } else if (event.ctrlKey && event.keyCode == 32 && this.selection.count != 0) {             // ctrl-space, select or deselect
      this.selection.toggleSelect(this.selection.currentIndex);
    } else if (event.keyCode  == 46 && this.selection.count != 0) {                             // del
      this.cancel();
    } else if (event.keyCode  == 93) {                                                          // display context menu
      var x = {};    var y = {};    var width = {};    var height = {};
      this.treebox.getCoordsForCellItem(this.selection.currentIndex, this.treebox.columns["queuesource"], "text", x, y, width, height);
      this.createContextMenu();
      $('queuemenu').showPopup(gQueueTreeChildren, gQueueTreeChildren.boxObject.x + 75, gQueueTreeChildren.boxObject.y + y.value + 5, "context");
    }
  },

  createContextMenu : function() {
    var fxp   = false;
    var retry = false;

    for (var x = 0; x < this.rowCount; ++x) {
      if (!this.selection.isSelected(x)) {
        continue;
      }

      if (this.data[x].typeO == 'fxp') {
        fxp   = true;
        break;
      } else if (this.data[x].failed) {
        retry = true;
      }
    }

    $('queueRetry').setAttribute( "disabled", this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount || fxp || !retry);
    $('queueCancel').setAttribute("disabled", this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount || fxp);
  },

  // ************************************************* dropEvent *****************************************************

  canDrop : function(index, orient) {
    if (!gConnection.isConnected || !dragObserver.origin) {
      return false;
    }

    return true;
  },

  drop : function(index, orient) {
    if (dragObserver.origin == 'localtreechildren') {
      new transfer().start(false);
    } else if (dragObserver.origin == 'remotetreechildren') {
      new transfer().start(true);
    } else if (dragObserver.origin == 'external') {
      var transferObj           = new transfer();
      transferObj.remoteRefresh = gRemotePath.value;

      for (var x = 0; x < dragObserver.externalFiles.length; ++x) {
        var droppedFile    = dragObserver.externalFiles[x];
        var fileParent     = droppedFile.parent ? droppedFile.parent.path : "";

        transferObj.start(false, droppedFile, fileParent, gRemotePath.value);

        if (transferObj.cancel) {
          break;
        }
      }
    }
  }
};
