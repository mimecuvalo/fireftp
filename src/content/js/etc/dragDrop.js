var dragObserver = {
  origin        : null,
  overName      : false,
  externalFiles : new Array(),

  onDragStart : function (event, dragData, dragAction) {
    var targetID  = event.target.getAttribute('id');
    this.origin   = null;
    this.overName = false;

    if ((gConnection && !gConnection.isConnected && targetID == 'remotetreechildren') || !treeHighlighter.dragSessionEnabled) {
      return;
    }

    if (targetID == 'localtreechildren' || targetID == 'remotetreechildren') {
      this.origin = targetID;
      event.dataTransfer.setData('text/plain', targetID);
      event.dataTransfer.effectAllowed = 'move';
    }
  },

  onDragOver : function (event) {
    event.stopPropagation();
    event.preventDefault();

    var targetID = event.target.getAttribute('id');
    var row = { }; var col = { }; var child = { };
    var includesMozFile = event.dataTransfer.types.includes ?
        event.dataTransfer.types.includes('application/x-moz-file') :
        event.dataTransfer.types.contains('application/x-moz-file');

    if (gConnection && gConnection.isConnected && includesMozFile &&
        (targetID == 'remotetreechildren' || targetID == 'remotedirtreechildren' || targetID == 'queuetreechildren')) {
      this.origin         = "external";
      event.dataTransfer.effectAllowed = "all";
    } else if (gConnection && !gConnection.isConnected && includesMozFile) {
      this.origin         = null;
      event.dataTransfer.effectAllowed = "none";
    }

    if (((this.origin == 'remotetreechildren' || this.origin == 'localtreechildren') && targetID == 'localtreechildren')
    ||  ((this.origin == 'localtreechildren' || this.origin == "external" || this.origin == 'remotetreechildren') && targetID == 'remotetreechildren')) {
      event.dataTransfer.effectAllowed = "all";

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

      event.dataTransfer.effectAllowed = row.value != -1 ? "all" : "none";
    } else if ((this.origin == 'localtreechildren' || this.origin == "remotetreechildren" || this.origin == "external") && targetID == 'queuetreechildren') {
      event.dataTransfer.effectAllowed = "all";
    } else if (targetID == 'localtreechildren' || targetID == 'remotetreechildren') {
      event.dataTransfer.effectAllowed = "all";
    } else {
      event.dataTransfer.effectAllowed = "none";
    }

    if (event.dataTransfer.effectAllowed == "none") {
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
      event.dataTransfer.effectAllowed = "none";
      return;
    }

    targetTreeElement.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);
    event.dataTransfer.effectAllowed = targetTree.canDrop(row.value, 0) ? "all" : "none";
  },

  onDrop: function (event) {
    event.preventDefault();

    if (gConnection && gConnection.isConnected && this.origin == 'external') {
      this.externalFiles = new Array();

      for (var x = 0; x < event.dataTransfer.files.length; ++x) {    // iterate through dragged items getting any files
        try {
          var droppedFile = localFile.init(event.dataTransfer.files[x].mozFullPath);
          this.externalFiles.push(droppedFile);
        } catch (ex) {
          debug(ex);
          continue;
        }
      }
    }
  }
};
