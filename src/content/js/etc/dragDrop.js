var dragObserver = {
  origin        : null,
  overName      : false,
  externalFiles : new Array(),

  getSupportedFlavours : function() {
    var flavours = new FlavourSet();
    flavours.appendFlavour("application/x-moz-file", "nsILocalFile");
    flavours.appendFlavour("text/unicode");
    return flavours;
  },

  onDragStart : function (event, dragData, dragAction) {
    var targetID  = event.target.getAttribute('id');
    this.origin   = null;
    this.overName = false;

    if ((gConnection && !gConnection.isConnected && targetID == 'remotetreechildren') || !treeHighlighter.dragSessionEnabled) {
      return;
    }

    if (targetID == 'localtreechildren' || targetID == 'remotetreechildren') {
      dragData.data = new TransferData();
      dragData.data.addDataForFlavour("text/unicode", targetID);
      this.origin = targetID;
    }
  },

  onDragOver : function (event, flavour, dragSession) {
    var targetID = event.target.getAttribute('id');
    var row = { }; var col = { }; var child = { };

    if (gConnection && gConnection.isConnected && flavour.contentType == "application/x-moz-file"
                         && (targetID == 'remotetreechildren' || targetID == 'remotedirtreechildren' || targetID == 'queuetreechildren')) {
      this.externalFiles = new Array();

      var transObj = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
      // init() was added to nsITransferable in FF16 for Private Browsing Mode
      // see https://bugzilla.mozilla.org/show_bug.cgi?id=722872 for more info
      if ('init' in trans) {
        var privacyContext = document.commandDispatcher.focusedWindow.
          QueryInterface(Components.interfaces.nsIInterfaceRequestor).
          getInterface(Components.interfaces.nsIWebNavigation).
          QueryInterface(Components.interfaces.nsILoadContext);
        trans.init(privacyContext);
      }
      transObj.addDataFlavor("application/x-moz-file");       // only look at files

      for (var x = 0; x < dragSession.numDropItems; ++x) {    // iterate through dragged items getting any files
        try {
          dragSession.getData(transObj, x);
          var dataObj     = new Object();
          var dropSizeObj = new Object();
          transObj.getTransferData("application/x-moz-file", dataObj, dropSizeObj);

          var droppedFile = dataObj.value.QueryInterface(Components.interfaces.nsILocalFile);
          this.externalFiles.push(droppedFile);
        } catch (ex) {
          debug(ex);
          continue;
        }
      }

      this.origin         = "external";
      if (dragSession.dataTransfer) {
        dragSession.dataTransfer.effectAllowed = "all";
      }
    } else if (gConnection && !gConnection.isConnected && flavour.contentType == "application/x-moz-file") {
      this.origin         = null;
      if (dragSession.dataTransfer) {
        dragSession.dataTransfer.effectAllowed = "none";
      }
    }

    if (!dragSession.dataTransfer) {
      return;
    }

    if (((this.origin == 'remotetreechildren' || this.origin == 'localtreechildren') && targetID == 'localtreechildren')
    ||  ((this.origin == 'localtreechildren' || this.origin == "external" || this.origin == 'remotetreechildren') && targetID == 'remotetreechildren')) {
      dragSession.dataTransfer.effectAllowed = "all";

      var x = { }; var y = { }; var width = { }; var height = { };

      if (targetID == 'localtreechildren') {
        gLocalTree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
        gLocalTree.treeBoxObject.getCoordsForCellItem(row.value, gLocalTree.columns["localname"], "text", x, y, width, height);
        this.overName = row.value != -1 && event.pageX - gLocalTreeChildren.boxObject.x < x.value + width.value;
        if (row.value != -1) {
          gLocalTree.treeBoxObject.invalidateCell(row.value, gLocalTree.columns["localname"]);
        }
      } else {
        gRemoteTree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
        gRemoteTree.treeBoxObject.getCoordsForCellItem(row.value, gRemoteTree.columns["remotename"], "text", x, y, width, height);
        this.overName = row.value != -1 && event.pageX - gRemoteTreeChildren.boxObject.x < x.value + width.value;
        if (row.value != -1) {
          gRemoteTree.treeBoxObject.invalidateCell(row.value, gRemoteTree.columns["remotename"]);
        }
      }
    } else if (targetID == 'localdirtreechildren' || targetID == 'remotedirtreechildren') {
      if (targetID == 'localdirtreechildren') {
        gLocalDirTree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
      } else {
        gRemoteDirTree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
      }

      dragSession.dataTransfer.effectAllowed = row.value != -1 ? "all" : "none";
    } else if ((this.origin == 'localtreechildren' || this.origin == "remotetreechildren" || this.origin == "external") && targetID == 'queuetreechildren') {
      dragSession.dataTransfer.effectAllowed = "all";
    } else if (targetID == 'localtreechildren' || targetID == 'remotetreechildren') {
      dragSession.dataTransfer.effectAllowed = "all";
    } else {
      dragSession.dataTransfer.effectAllowed = "none";
    }

    if (dragSession.dataTransfer.effectAllowed == "none") {
      return;
    }

    // new since Firefox 3.5, XXX stoopid hack
    // seems that the canDrop function of the trees doesn't affect the dragSession anymore,
    // the canDrop property of the dragSession object seems to do nothing
    // only effectAllowed seems to work.  So we call the tree's canDrop function manually
    // and set effectAllowed appropriately

    var targetTree;
    var targetTreeElement;
    if (targetID == 'localtreechildren') {
      targetTree = localTree;
      targetTreeElement = gLocalTree;
    } else if (targetID == 'localdirtreechildren') {
      targetTree = localDirTree;
      targetTreeElement = gLocalDirTree;
    } else if (targetID == 'remotetreechildren') {
      targetTree = remoteTree;
      targetTreeElement = gRemoteTree;
    } else if (targetID == 'remotedirtreechildren') {
      targetTree = remoteDirTree;
      targetTreeElement = gRemoteDirTree;
    } else if (targetID == 'queuetreechildren') {
      targetTree = queueTree;
      targetTreeElement = gQueueTree;
    } else {
      dragSession.dataTransfer.effectAllowed = "none";
      return;
    }

    targetTreeElement.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
    dragSession.dataTransfer.effectAllowed = targetTree.canDrop(row.value, 0) ? "all" : "none";
  },

  onDrop: function (event, dragData, dragSession) {
    event.preventDefault();
  }
};
