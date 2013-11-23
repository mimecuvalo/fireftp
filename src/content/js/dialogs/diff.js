var gStrbundle;
var gArgs;
var gDiffTree;
var gRecursive;
var gCallback;
var gIos = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

function init() {
  setTimeout(window.sizeToContent, 0);

  gStrbundle = $("strings");
  gArgs      = window.arguments;
  gDiffTree  = $('diffTree');
  gRecursive = gArgs[6];
  gCallback  = gArgs[7];
  $('diff3').getButton("accept").label = gStrbundle.getString("diffSyncBtn");

  for (var x = 0; x < gArgs[0].length; ++x) {
    constructRow(gArgs[0][x].file,      gStrbundle.getString("diffMissingLocal"),  gArgs[0][x].action, "local"   + x, "upload");
  }

  for (var x = 0; x < gArgs[1].length; ++x) {
    constructRow(gArgs[1][x].file,      gStrbundle.getString("diffMissingRemote"), gArgs[1][x].action, "remote"  + x, "download");
  }

  for (var x = 0; x < gArgs[2].length; ++x) {
    constructRow(gArgs[2][x].localFile, gArgs[2][x].reason,                        gArgs[2][x].action, "diff"    + x, "delete");
  }

  for (var x = 0; x < gArgs[3].length; ++x) {
    constructRow(gArgs[3][x].localFile, gStrbundle.getString("diffNewer"),         gArgs[3][x].action, "newer"   + x, "delete");
  }

  for (var x = 0; x < gArgs[4].length; ++x) {
    constructRow(gArgs[4][x].localFile, gStrbundle.getString("diffOlder"),         gArgs[4][x].action, "older"   + x, "delete");
  }

  if (!gArgs[0].length) {
    $('localRow').collapsed  = true;
  }

  if (!gArgs[1].length) {
    $('remoteRow').collapsed = true;
  }

  if (!gArgs[2].length) {
    $('diffRow').collapsed   = true;
  }

  if (!gArgs[3].length) {
    $('newerRow').collapsed  = true;
  }

  if (!gArgs[4].length) {
    $('olderRow').collapsed  = true;
  }
}

function $C(el) {
  return document.createElement(el);
}

function constructRow(file, reason, action, id, disable) {
  var treeitem     = $C("treeitem");
  var treerow      = $C("treerow");
  var fileCell     = $C("treecell");
  var reasonCell   = $C("treecell");
  var downloadCell = $C("treecell");
  var uploadCell   = $C("treecell");
  var deleteCell   = $C("treecell");
  var nothingCell  = $C("treecell");

  treeitem    .setAttribute("id",         id);
  treeitem    .setAttribute("choice",     action);
  treeitem    .setAttribute("default",    action);
  treeitem    .setAttribute("disable",    disable ? disable  : "");
  fileCell    .setAttribute("label",      gRecursive ? file.path : file.leafName);
  fileCell    .setAttribute("properties", file.isDirectory() ? "isFolder" : (file.isSymlink() ? "isLink" : "") + " nameCol");
  fileCell    .setAttribute("src",        file.isDirectory() || file.isSymlink() ? ""
                                        : (disable == "upload" ? "moz-icon://" + file.leafName + "?size=16"
                                                               : "moz-icon://" + gIos.newFileURI(file).spec + "?size=16"));
  reasonCell  .setAttribute("label",      reason);
  downloadCell.setAttribute("id",         id       + "download");
  downloadCell.setAttribute("value",      action  == "download" ? "true"  : "false");
  downloadCell.setAttribute("editable",   disable == "download" ? "false" : "true");
  uploadCell  .setAttribute("id",         id       + "upload");
  uploadCell  .setAttribute("value",      action  == "upload"   ? "true"  : "false");
  uploadCell  .setAttribute("editable",   disable == "upload"   ? "false" : "true");
  deleteCell  .setAttribute("id",         id       + "delete");
  deleteCell  .setAttribute("value",      action  == "delete"   ? "true"  : "false");
  deleteCell  .setAttribute("editable",   disable == "delete"   ? "false" : "true");
  nothingCell .setAttribute("id",         id       + "nothing");
  nothingCell .setAttribute("value",      action  == "nothing"  ? "true"  : "false");

  treerow  .appendChild(fileCell);
  treerow  .appendChild(reasonCell);
  treerow  .appendChild(downloadCell);
  treerow  .appendChild(uploadCell);
  treerow  .appendChild(deleteCell);
  treerow  .appendChild(nothingCell);
  treeitem .appendChild(treerow);
  $('main').appendChild(treeitem);
}

function parseList() {
  gArgs[5].value = true;     // return value of this dialog

  for (var x = 0; x < gArgs[0].length; ++x) {
    gArgs[0][x].action = $("local"   + x).getAttribute('choice');
  }

  for (var x = 0; x < gArgs[1].length; ++x) {
    gArgs[1][x].action = $("remote"  + x).getAttribute('choice');
  }

  for (var x = 0; x < gArgs[2].length; ++x) {
    gArgs[2][x].action = $("diff"    + x).getAttribute('choice');
  }

  for (var x = 0; x < gArgs[3].length; ++x) {
    gArgs[3][x].action = $("newer"   + x).getAttribute('choice');
  }

  for (var x = 0; x < gArgs[4].length; ++x) {
    gArgs[4][x].action = $("older"   + x).getAttribute('choice');
  }

  gCallback();
  return true;
}

function mouseDown(event) {
  var row = { }; var col = { }; var child = { };
  gDiffTree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, col, child);

  if (row.value != -1) {
    gDiffTree.view.selection.currentIndex = row.value;

    var row     = gDiffTree.contentView.getItemAtIndex(row.value);
    var id      = row.getAttribute('id');
    var current = row.getAttribute('choice');
    var defaultValue = row.getAttribute('default');
    var disable = row.getAttribute('disable');

    if ((col.value == gDiffTree.columns["download"] && disable == "download")
     || (col.value == gDiffTree.columns["upload"]   && disable == "upload")
     || (col.value == gDiffTree.columns["delete"]   && disable == "delete")
     || (col.value != gDiffTree.columns["download"] && col.value != gDiffTree.columns["upload"] && col.value != gDiffTree.columns["delete"] && col.value != gDiffTree.columns["nothing"])) {
      return;
    }

    var colName   = col.value == gDiffTree.columns["download"] ? "download"
        : (col.value == gDiffTree.columns["upload"] ? "upload" :
          (col.value == gDiffTree.columns["delete"] ? "delete" : "nothing"));

    var newChoice = current == "nothing" ? (colName == "nothing" ? defaultValue : colName) : (colName == current ? "nothing" : colName);

    row.setAttribute('choice', newChoice);
    $(id + "download").setAttribute('value',  newChoice == "download");
    $(id + "upload")  .setAttribute('value',  newChoice == "upload");
    $(id + "delete")  .setAttribute('value',  newChoice == "delete");
    $(id + "nothing") .setAttribute('value',  newChoice == "nothing");
  }
}

function setDefault(index, type, newChoice) {
  for (var x = 0; x < gArgs[index].length; ++x) {
    $(type   + x)             .setAttribute('choice', newChoice);
    $(type   + x + "download").setAttribute('value',  newChoice == "download");
    $(type   + x + "upload")  .setAttribute('value',  newChoice == "upload");
    $(type   + x + "delete")  .setAttribute('value',  newChoice == "delete");
    $(type   + x + "nothing") .setAttribute('value',  newChoice == "nothing");
  }
}
