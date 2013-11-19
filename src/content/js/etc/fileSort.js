function directorySort(a, b) {
  if (a.sortPath < b.sortPath)
    return -1;
  if (a.sortPath > b.sortPath)
    return 1;
  return 0;
}

function directorySort2(a, b) {
  if (a.parent.path.toLowerCase() < b.parent.path.toLowerCase())
    return -1;
  if (a.parent.path.toLowerCase() > b.parent.path.toLowerCase())
    return 1;
  if (a.path.toLowerCase() < b.path.toLowerCase())
    return -1;
  if (a.path.toLowerCase() > b.path.toLowerCase())
    return 1;
  return 0;
}

function compareName(a, b) {
  try {
    if (!a.isDirectory() && b.isDirectory())
      return 1;
    if (a.isDirectory() && !b.isDirectory())
      return -1;
    if (a.leafName.toLowerCase() < b.leafName.toLowerCase())
      return -1;
    if (a.leafName.toLowerCase() > b.leafName.toLowerCase())
      return 1;
    return 0;
  } catch (ex) {
    return 0;
  }
}

function compareSize(a, b) {
  try {
    if (!a.isDirectory() && b.isDirectory())
      return 1;
    if (a.isDirectory() && !b.isDirectory())
      return -1;
    return a.fileSize - b.fileSize;
  } catch (ex) {
    return 0;
  }
}

function compareType(a, b) {
  try {
    if (!a.isDirectory() && b.isDirectory())
      return 1;
    if (a.isDirectory() && !b.isDirectory())
      return -1;
    if (localTree.getExtension(a.leafName.toLowerCase()) < localTree.getExtension(b.leafName.toLowerCase()))
      return -1;
    if (localTree.getExtension(a.leafName.toLowerCase()) > localTree.getExtension(b.leafName.toLowerCase()))
      return 1;
    return 0;
  } catch (ex) {
    return 0;
  }
}

function compareDate(a, b) {
  try {
    if (!a.isDirectory() && b.isDirectory())
      return 1;
    if (a.isDirectory() && !b.isDirectory())
      return -1;
    return a.lastModifiedTime - b.lastModifiedTime;
  } catch (ex) {
    return 0;
  }
}

function compareLocalAttr(a, b) {
  try {
    if (!a.isDirectory() && b.isDirectory())
      return 1;
    if (a.isDirectory() && !b.isDirectory())
      return -1;
    if (localTree.convertPermissions(a.isHidden(), a.permissions) < localTree.convertPermissions(b.isHidden(), b.permissions))
      return -1;
    if (localTree.convertPermissions(a.isHidden(), a.permissions) > localTree.convertPermissions(b.isHidden(), b.permissions))
      return 1;
    return 0;
  } catch (ex) {
    return 0;
  }
}

function compareRemoteAttr(a, b) {
  if (!a.isDirectory() && b.isDirectory())
    return 1;
  if (a.isDirectory() && !b.isDirectory())
    return -1;
  if (a.permissions < b.permissions)
    return -1;
  if (a.permissions > b.permissions)
    return 1;
  return 0;
}

function compareAccount(a, b) {
  if (a.account.toLowerCase() < b.account.toLowerCase())
    return -1;
  if (a.account.toLowerCase() > b.account.toLowerCase())
    return 1;
  return 0;
}
