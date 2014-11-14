var treeHighlighter = {
  valid              : null,
  tree               : null,
  treeBoxObject      : null,
  selection          : null,
  boxObject          : null,
  column             : null,
  mouseDownRow       : 0,
  mouseDownPressed   : 0,
  mouseDirection     : 0,
  mousePreviousY     : 0,
  previousMousePos   : -1,
  dragSessionEnabled : false,

  mouseDown : function(event) {                                // record the start position
    if (event.button != 0) {
      return;
    }

    var found = false;

    for (var x = 0; x < this.valid.length; ++x) {
      var item = this.valid[x];
      if (event.target == item.children) {
        found              = true;
        this.tree          = item.tree;
        this.treeBoxObject = item.tree.treeBoxObject;
        this.selection     = item.tree.view.selection;
        this.boxObject     = item.children.boxObject;
        this.column        = item.column;
        break;
      }
    }

    if (!found) {
      return;
    }

    this.mouseDownPressed = true;
    this.mousePreviousY   = event.pageY;

    var rowValueNeg = false;
    var row = { };    var col = { };    var child = { };
    this.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);

    if (row.value == -1) {                                     // this is if we click in the white space below the available rows
      this.selection.clearSelection();
      row.value   = this.tree.view.rowCount - 1;
      rowValueNeg = true;
    }

    this.mouseDownRow = row.value;

    if (this.column) {
      var x = { };    var y = { };    var width = { };    var height = { };
      this.treeBoxObject.getCoordsForCellItem(row.value, this.tree.columns[this.column], "text", x, y, width, height);
      this.dragSessionEnabled = !rowValueNeg && event.pageX - this.boxObject.x < x.value + width.value; // drag enabled if mouse over name
    }

    if (gCmdlogDoc) {
      gCmdlogDoc.getElementById('mousePressed').textContent = "true";
      var func = function() {
        treeHighlighter.totalHack();
      };
      setTimeout(func, 100);
    }
  },

  mouseMove : function(event, hack) {                          // change the selection depending on mouse movement
    if (event && event.button != 0) {
      return;
    }

    if (hack) {                                                // XXX we need 'hack' to get mouse events from the log window
      event = { pageY: hack, pageX: 0 };
    } else if (gCmdlogDoc) {
      gCmdlogDoc.getElementById('mouseY').textContent = this.previousMousePos;
    }

    if (this.mouseDownPressed && !event.ctrlKey && !event.shiftKey && !this.dragSessionEnabled) {
      if (this.mousePreviousY) {
        this.mouseDirection = event.pageY - this.mousePreviousY > 0 ? true : false;
      }

      this.mousePreviousY = event.pageY;

      if (event.pageY < this.boxObject.y) {                    // we need to do some scrolling
        this.extendSelectionUpwards();
        return;
      } else if (event.pageY > this.boxObject.y + this.boxObject.height) {
        this.extendSelectionDownwards();
        return;
      }

      var row = {};    var col = {};    var child = {};
      this.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);

      if (row.value == -1) {                                   // this is if we are in the white space below the available rows
        row.value = this.treeBoxObject.getLastVisibleRow();
      }

      this.selection.rangedSelect(this.mouseDownRow, row.value, false);
    }
  },

  mouseUp : function(event) {                                  // finish up
    if (event && event.button != 0) {
      return;
    }

    this.mouseDownPressed = false;
    if (gCmdlogDoc) {
      gCmdlogDoc.getElementById('mousePressed').textContent = "false";
    }
  },

  extendSelectionUpwards : function() {                        // scrolling up while highlighting files
    if (this.mouseDirection || !this.mouseDownPressed) {
      return;
    }

    if (this.treeBoxObject.getFirstVisibleRow() == 0) {        // we've hit the top of the list
      this.selection.rangedSelect(this.mouseDownRow, this.treeBoxObject.getFirstVisibleRow(), false);
      return;
    }

    this.treeBoxObject.ensureRowIsVisible(this.treeBoxObject.getFirstVisibleRow() - 1);
    this.selection.rangedSelect(this.mouseDownRow, this.treeBoxObject.getFirstVisibleRow(), false);

    if (this.mouseDownPressed) {
      var func = function() {
        treeHighlighter.extendSelectionUpwards();
      };
      setTimeout(func, 100);
    }
  },

  extendSelectionDownwards : function() {                      // scrolling down while highlighting files
    if (!this.mouseDirection || !this.mouseDownPressed) {
      return;                                                  // we've hit the bottom of the list
    }

    if (this.tree.view.rowCount - 1 < this.treeBoxObject.getLastVisibleRow()) {
      this.selection.rangedSelect(this.mouseDownRow, this.treeBoxObject.getLastVisibleRow(), false);
      return;
    }

    this.treeBoxObject.ensureRowIsVisible(this.treeBoxObject.getLastVisibleRow() + 1);
    this.selection.rangedSelect(this.mouseDownRow, this.treeBoxObject.getLastVisibleRow(), false);

    if (this.mouseDownPressed) {
      var func = function() {
        treeHighlighter.extendSelectionDownwards();
      };
      setTimeout(func, 100);
    }
  },
                                                               // TOTAL HACK XXX - this sucks!
  totalHack : function() {                                     // sigh, we need mouse move events to be received
    if (this.mouseDownPressed) {                               // from the log window for treehighlighting
      if (gCmdlogDoc.getElementById('mousePressed').textContent == "false") {
        this.mouseUp(null);
        return;
      }

      var newMousePos = parseInt(gCmdlogDoc.getElementById('mouseY').textContent);

      if (newMousePos && this.previousMousePos != newMousePos) {
        this.previousMousePos = newMousePos;
        this.mouseMove(null, newMousePos + this.boxObject.y);
      }

      var func = function() {
        treeHighlighter.totalHack();
      };
      setTimeout(func, 100);
    }
  }
};
