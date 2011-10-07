function treeSyncManager(remote) {
  var localPathSlash  = gLocalPath.value  + (gLocalPath.value.charAt(gLocalPath.value.length - 1)   != gSlash ? gSlash : '');
  var localSyncSlash  = gTreeSyncLocal    + (gTreeSyncLocal.charAt(gTreeSyncLocal.length - 1)       != gSlash ? gSlash : '');
  var remotePathSlash = gRemotePath.value + (gRemotePath.value.charAt(gRemotePath.value.length - 1) != "/"    ? "/"    : '');
  var remoteSyncSlash = gTreeSyncRemote   + (gTreeSyncRemote.charAt(gTreeSyncRemote.length - 1)     != "/"    ? "/"    : '');

  if (remote && localPathSlash.indexOf(localSyncSlash) == 0) {
    var newRemote      = remoteSyncSlash + gLocalPath.value.substring(localSyncSlash.length).replace(/\x5c/g, "/");
    var newRemoteSlash = newRemote + (newRemote.charAt(newRemote.length - 1) != "/" ? "/" : '');

    if (newRemoteSlash != remotePathSlash) {
      gTreeSyncManager = true;
      remoteDirTree.changeDir(newRemote);
      return;
    }
  } else if (!remote && remotePathSlash.indexOf(remoteSyncSlash) == 0) {
    var newLocal  = localSyncSlash  + gRemotePath.value.substring(remoteSyncSlash.length);

    if (gSlash == "\\") {
      newLocal = newLocal.replace(/\x2f/g, "\\");
    }

    var newLocalSlash = newLocal + (newLocal.charAt(newLocal.length - 1) != gSlash ? gSlash : '');

    if (newLocalSlash  != localPathSlash) {
      gTreeSyncManager = true;
      localDirTree.changeDir(newLocal);
      return;
    }
  }

  gTreeSyncManager = false;
}
