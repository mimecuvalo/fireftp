var localFile = {
  init : function(path) {
    try {
      var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
      file.initWithPath(path);
      return file;
    } catch (ex) {
      return null;
    }
  },

  launch : function(file) {
    try {
      if (file.exists()) {
        file.launch();
      }
    } catch (ex) {
      debug(ex);
    }
  },

  create : function(isDir, name) {
    var path = localTree.constructPath(gLocalPath.value, name);
    var dir  = this.init(path);

    try {
      dir.create(isDir ? Components.interfaces.nsILocalFile.DIRECTORY_TYPE : Components.interfaces.nsILocalFile.NORMAL_FILE_TYPE,
                 isDir ? 0755 : 0644);
      this.overrideOSXQuarantine(path);
    } catch (ex) {
      debug(ex);
      error(gStrbundle.getString(isDir ? "dirFail" : "fileFail"));
      return null;
    }

    return dir;
  },

  overrideOSXQuarantine : function(path) {
    if (gPlatform == 'mac') {                // since when is mac so vista-like?
      var command = this.init("/bin/sh");
      var args = ["-c", "/usr/bin/xattr -d com.apple.quarantine " + path];
      var process = Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess);
      process.init(command);
      process.run(true, args, args.length, {});
    }
  },

  remove : function(file, prompt, multiple) {
    if (prompt && multiple && multiple > 1) {                                           // deleting multiple
      if (!window.confirm(gStrbundle.getFormattedString("confirmDelete2", [multiple]))) {
        return false;
      }
    } else if (prompt && file.isDirectory()) {                                          // deleting a directory
      if (!window.confirm(gStrbundle.getFormattedString("confirmDelete3", [file.leafName]))) {
        return false;
      }
    } else if (prompt) {                                                                // deleting a file
      if (!window.confirm(gStrbundle.getFormattedString("confirmDelete", [file.leafName]))) {
        return false;
      }
    }

    try {
      ++gProcessing;
      // this is the old method that permanently deletes the file
      //var innerEx = gFireFTPUtils.removeFile(file);
      if (gPlatform == "windows") {
        this.removeWindows(file);
      } else if (gPlatform == "mac") {
        this.removeMac(file);
      } else if (gPlatform == "linux") {
        this.removeLinux(file);
      }

      //if (innerEx) {
      //  throw innerEx;
      //}
    } catch (ex) {
      debug(ex);
      error(gStrbundle.getString("delFail"));
      return false;
    } finally {
      --gProcessing;
    }

    return true;
  },

  // Transcoded Python from http://hg.hardcoded.net/send2trash
  // Copyright 2010 Hardcoded Software (http://www.hardcoded.net)

  // This software is licensed under the "BSD" License as described in the "LICENSE" file,
  // which should be included with this package. The terms are also available at
  // http://www.hardcoded.net/licenses/bsd_license

  removeWindows : function(file) {
    try {
      var shell32 = ctypes.open("shell32.dll");
      var path = file.path;
      const FO_DELETE = 3;
      const FOF_SILENT = 4;
      const FOF_NOCONFIRMATION = 16;
      const FOF_ALLOWUNDO = 64;
      const FOF_NOERRORUI = 1024;

      var SHFILEOPSTRUCTW = new ctypes.StructType("SHFILEOPSTRUCTW", [
        { "hwnd":                  ctypes.int32_t },
        { "wFunc":                 ctypes.uint32_t },
        { "pFrom":                 ctypes.jschar.ptr },
        { "pTo":                   ctypes.jschar.ptr },
        { "fFlags":                ctypes.int32_t },
        { "fAnyOperationsAborted": ctypes.bool },
        { "hNameMappings":         ctypes.voidptr_t },
        { "lpszProgressTitle":     ctypes.jschar.ptr }
      ]);

      var SHFileOperationW = shell32.declare("SHFileOperationW", ctypes.winapi_abi, ctypes.int32_t, SHFILEOPSTRUCTW.ptr);

      var fileop = new SHFILEOPSTRUCTW;
      fileop.hwnd = 0;
      fileop.wFunc = FO_DELETE;
      var str = ctypes.jschar.array()(path + "\0"); // path must be double null-terminated
      fileop.pFrom = ctypes.cast(str, ctypes.jschar).address();
      fileop.pTo = null;
      fileop.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT;
      fileop.fAnyOperationsAborted = 0;
      fileop.hNameMappings = null;
      fileop.lpszProgressTitle = null;
      var result = SHFileOperationW(fileop.address());
      if (result) {
        throw "Error code: " + result;
      }
    } catch(ex) {
      throw ex;
    } finally {
      shell32.close();
    }
  },

  removeMac : function(file) {
    // open libraries
    var Foundation   = ctypes.open("/System/Library/Frameworks/Foundation.framework/Foundation");
    var CoreServices = ctypes.open("/System/Library/Frameworks/CoreServices.framework/CoreServices");

    try {
      // declare types and functions
      const OSStatus = ctypes.int32_t;
      const OptionBits = ctypes.uint32_t;
      var FSRef = new ctypes.StructType("FSRef", [ {"hidden": ctypes.char.array(80)}]);

      var GetMacOSStatusCommentString = Foundation.declare("GetMacOSStatusCommentString", ctypes.default_abi, ctypes.char.ptr, OSStatus);
      var FSPathMakeRefWithOptions = CoreServices.declare("FSPathMakeRefWithOptions", ctypes.default_abi, OSStatus, ctypes.unsigned_char.ptr, OptionBits, ctypes.voidptr_t, ctypes.bool.ptr);
      var FSMoveObjectToTrashSync = CoreServices.declare("FSMoveObjectToTrashSync", ctypes.default_abi, OSStatus, ctypes.voidptr_t, ctypes.voidptr_t, OptionBits);

      // check operations went ok
      function check_op_result(op_result) {
        if (op_result) {
          msg = GetMacOSStatusCommentString(op_result);
          throw msg.readString();
        }
      }

      var fp, opts, op_result;

      // get reference to file
      const kFSPathMakeRefDoNotFollowLeafSymlink = 0x01;
      var path  = file.path;
      fp        = new FSRef;
      opts      = kFSPathMakeRefDoNotFollowLeafSymlink;
      op_result = FSPathMakeRefWithOptions(path, opts, fp.address(), null);
      check_op_result(op_result);

      // delete the file!
      const kFSFileOperationDefaultOptions = 0;
      opts      = kFSFileOperationDefaultOptions;
      op_result = FSMoveObjectToTrashSync(fp.address(), null, opts);
      check_op_result(op_result);
    } catch(ex) {
      throw ex;
    } finally {
      // close libraries
      Foundation.close();
      CoreServices.close();
    }
  },

  removeLinux : function(file) {
    const CANDIDATES = ['.local/share/Trash/files', '.Trash'];
    const EXTERNAL_CANDIDATES = ['.Trash-1000/files', '.Trash/files', '.Trash-1000', '.Trash'];

    var self = this;
    // move to a unique place in Trash
    function move_without_conflict(file, dst) {
      var counter = 0;
      var leafName = file.leafName.substring(0, file.leafName.lastIndexOf('.'));
      var ext = file.leafName.substring(file.leafName.lastIndexOf('.') + 1);
      var newLeafName = file.leafName;
      var newFile = self.init(dst + '/' + newLeafName);

      while (newFile.exists()) {
        ++counter;
        newLeafName = leafName + ' ' + counter + '.' + ext;
        newFile.leafName = newLeafName;
      }

      var destDir = self.init(dst);
      file.moveTo(destDir, newLeafName);
    }

    function find_mount_point(path) {
      try {
        // open libc so that we can use lstat! hooray for complicated code!
        var libc = ctypes.open("libc.so.6");
        var timespec = new ctypes.StructType("timespec", [{"tv_sec": ctypes.unsigned_long}, {"tv_nsec": ctypes.unsigned_long}]);
        // XXX: wtf? why does declaring the long/shorts of the stat struct type not seem to match up with what's declared in /usr/include/bits/stat.h ?
        var stat = new ctypes.StructType("stat", [
           { "st_dev":     ctypes.unsigned_long },  /* ID of device containing file */
           { "st_ino":     ctypes.unsigned_long },  /* inode number */
           { "st_mode":    ctypes.unsigned_short }, /* protection */
           { "st_nlink":   ctypes.unsigned_short }, /* number of hard links */
           { "st_uid":     ctypes.unsigned_short }, /* user ID of owner */
           { "st_gid":     ctypes.unsigned_short }, /* group ID of owner */
           { "st_rdev":    ctypes.unsigned_long },  /* device ID (if special file) */
           { "st_size":    ctypes.unsigned_long },  /* total size, in bytes */
           { "st_blksize": ctypes.unsigned_long },  /* blocksize for filesystem I/O */
           { "st_blocks":  ctypes.unsigned_long },  /* number of blocks allocated */
           { "st_atime":   timespec },              /* time of last access */
           { "st_mtime":   timespec },              /* time of last modification */
           { "st_ctime":   timespec },              /* time of last status change */
           { "unused":     ctypes.unsigned_long },  /* number of blocks allocated */
        ]);


        // declare __lxstat
        var lstat = libc.declare("__lxstat", /* function name */
                           ctypes.default_abi, /* call ABI */
                           ctypes.int, /* return type */
                           ctypes.int, /* argument type */
                           ctypes.char.ptr, /* argument type */
                           stat.ptr /* argument type */ );

        // transcoded from Python's standard library: os.path.ismount
        function ismount(mountPath) {
          var s1 = new stat;
          var s2 = new stat;

          var returnCode = lstat(1, mountPath, s1.address());
          var returnCode = lstat(1, mountPath + '/..', s2.address());
          if (returnCode != 0 || returnCode != 0) {  // It doesn't exist -- so not a mount point :-)
            return false;
          }

          if (parseInt(s1.st_dev) != parseInt(s2.st_dev)) { // path/.. on a different device as path
            return true;
          }
          if (parseInt(s1.st_ino) == parseInt(s2.st_ino)) { // path/.. is the same i-node as path
            return true;
          }

          return false;
        }

        while (!ismount(path)) {
          path = path.substring(0, path.lastIndexOf('/'));
          path = path ? path : '/';
        }
      } catch(ex) {
        path = "/";
      } finally {
        libc.close();
      }

      return path;
    }

    function find_volume_trash(trash_root) {
      var candidates = trash_root == '/' ? CANDIDATES : EXTERNAL_CANDIDATES;
      if (trash_root == '/') {
        trash_root = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                         .get("Home", Components.interfaces.nsILocalFile).path;
      }
      for (var x = 0; x < candidates.length; ++x) {
        var candidate_path = trash_root + '/' + candidates[x];
        var file = self.init(candidate_path);
        if (file.exists()) {
          return candidate_path;
        }
      }

      // Something's wrong here. Screw that, just create a .Trash folder
      var trash_path = trash_root + '/' + '.local/share/Trash/files';
      var dir = self.init(trash_path);
      dir.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0755);
      return trash_path;
    }

    var path = file.path;
    var mount_point = find_mount_point(path);
    var dest_trash = find_volume_trash(mount_point);
    move_without_conflict(file, dest_trash);
  },

  // end transcoded Python from http://hg.hardcoded.net/send2trash

  rename : function(file, newName) {
    if (!file.exists()) {
      return false;
    }

    if (!newName || file.leafName == newName) {
      return false;
    }

    var oldName = file.leafName;

    try {
      var newFile = this.init(file.parent.path);
      newFile.append(newName);

      if (newFile && newFile.exists() && (gSlash == '/' || oldName.toLowerCase() != newName.toLowerCase())) {
        error(gStrbundle.getString("renameFail"));
        return false;
      }

      file.moveTo(null, newName);                                                       // rename the file
    } catch (ex) {
      if (gSlash == '\\' && oldName.toLowerCase() == newName.toLowerCase()) {           // we renamed the file the same but with different case
        return true;                                                                    // for some reason this throws an exception
      }

      debug(ex);
      error(gStrbundle.getString("renameFail"));
      return false;
    }

    return true;
  },

  showProperties : function(file, recursive) {
    try {
      var date = new Date(file.lastModifiedTime);
      date     = gMonths[date.getMonth()] + ' ' + date.getDate() + ' ' + date.getFullYear() + ' ' + date.toLocaleTimeString();

      var recursiveFolderData = { type: "local", nFolders: 0, nFiles: 0, nSize: 0 };

      if (file.isDirectory() && recursive) {
        localTree.getRecursiveFolderData(file, recursiveFolderData);
      }

      var origWritable = file.isWritable();

      var params = { path                : file.path,
                     leafName            : file.leafName,
                     fileSize            : file.fileSize,
                     date                : date,
                     origPermissions     : gSlash == "/" ? "-" + localTree.convertPermissions(false, file.permissions) : 0,
                     permissions         : "",
                     writable            : file.isWritable(),
                     hidden              : file.isHidden(),
                     isDirectory         : file.isDirectory(),
                     multipleFiles       : false,
                     isLinuxType         : gSlash == "/",
                     isLocal             : true,
                     recursiveFolderData : file.isDirectory() && recursive ? recursiveFolderData : null,
                     returnVal           : false,
                     isSymlink           : file.isSymlink(),
                     symlink             : file.isSymlink() ? file.target : "" };

      window.openDialog("chrome://fireftp/content/properties.xul", "properties", "chrome,modal,dialog,resizable,centerscreen", params);

      if (!params.returnVal) {
        return false;
      }

      if (params.isLinuxType) {
        if (params.permissions) {
          if (gPlatform == 'mac') {
            var perm         = (file.isDirectory() ? "4" : "10") + params.permissions;
            file.permissions = parseInt(perm, 8);
          } else {
            file.permissions = parseInt(params.permissions, 8);
          }
          return true;
        }
      } else if (origWritable != params.writable) {
        if (params.writable) {
          file.permissions = file.permissions == 365 ? 511 : 438;
        } else {
          file.permissions = file.permissions == 511 ? 365 : 292;
        }

        return true;
      }
    } catch (ex) {
      debug(ex);
    }

    return false;
  },

  verifyExists : function(file) {
    var exists = file && file.exists();

    if (!exists && file) {
      error(gStrbundle.getFormattedString("fileDoesNotExist", [file.path]));
    }

    return exists;
  },

  testSize : function(file) {                                                           // XXX in linux, files over 2GB throw an exception
    try {
      var x = file.fileSize;
      return true;
    } catch (ex) {
      return false;
    }
  }
}
