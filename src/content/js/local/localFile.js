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
      if (gPlatform == "windows") {
        this.removeWindows(file);
      } else if (gPlatform == "mac") {
        this.removeMac(file);
      } else if (gPlatform == "linux") {
        this.removeLinux(file);
      } else {
        // this is the old method that permanently deletes the file
        var innerEx = gFireFTPUtils.removeFile(file);
        if (innerEx) {
          throw innerEx;
        }
      }
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

  // This is a reimplementation of plat_other.py with reference to the
  // freedesktop.org trash specification:
  //   [1] http://www.freedesktop.org/wiki/Specifications/trash-spec
  //   [2] http://www.ramendik.ru/docs/trashspec.html
  // See also:
  //   [3] http://standards.freedesktop.org/basedir-spec/basedir-spec-latest.html
  //
  // For external volumes this implementation will raise an exception if it can't
  // find or create the user's trash directory.
  removeLinux : function(file) {
    const FILES_DIR   = 'files';
    const INFO_DIR    = 'info';
    const INFO_SUFFIX = '.trashinfo';

    // Default of ~/.local/share [3]
    var env = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment);
    var home = Components.classes["@mozilla.org/file/directory_service;1"].createInstance(Components.interfaces.nsIProperties)
                         .get("Home", Components.interfaces.nsILocalFile).path;
    const XDG_DATA_HOME = env.get('XDG_DATA_HOME') || (home + '/.local/share');
    const HOMETRASH = XDG_DATA_HOME + '/' + 'Trash';

    try {
      // open libc so that we can use lstat! hooray for complicated code!
      var libc = ctypes.open("libc.so.6");

      var timespec = new ctypes.StructType("timespec", [{"tv_sec": ctypes.unsigned_long}, {"tv_nsec": ctypes.unsigned_long}]);
      var stat;
      // http://code.woboq.org/linux/linux/arch/x86/include/uapi/asm/stat.h.html
      if (navigator.userAgent.indexOf('x86_64') != -1) {
        stat = new ctypes.StructType("stat", [
           { "st_dev":     ctypes.unsigned_long },  // ID of device containing file
           { "st_ino":     ctypes.unsigned_long },  // inode number
           { "st_nlink":   ctypes.unsigned_long },  // number of hard links
           { "st_mode":    ctypes.unsigned_int },   // protection
           { "st_uid":     ctypes.unsigned_int },   // user ID of owner
           { "st_gid":     ctypes.unsigned_int },   // group ID of owner
           { "__pad0":     ctypes.unsigned_int },
           { "st_rdev":    ctypes.unsigned_long },  // device ID (if special file)
           { "st_size":    ctypes.long },           // total size, in bytes
           { "st_blksize": ctypes.long },           // blocksize for filesystem I/O
           { "st_blocks":  ctypes.long },           // number of blocks allocated
           { "st_atime":   timespec },              // time of last access
           { "st_mtime":   timespec },              // time of last modification
           { "st_ctime":   timespec },              // time of last status change
           { "unused":     ctypes.long },           // number of blocks allocated
           { "unused2":     ctypes.long },          // number of blocks allocated
           { "unused3":     ctypes.long },          // number of blocks allocated
        ]);
      } else {
        stat = new ctypes.StructType("stat", [
           { "st_dev":     ctypes.unsigned_long },  // ID of device containing file
           { "st_ino":     ctypes.unsigned_long },  // inode number
           { "st_mode":    ctypes.unsigned_short }, // protection
           { "st_nlink":   ctypes.unsigned_short }, // number of hard links
           { "st_uid":     ctypes.unsigned_short }, // user ID of owner
           { "st_gid":     ctypes.unsigned_short }, // group ID of owner
           { "st_rdev":    ctypes.unsigned_long },  // device ID (if special file)
           { "st_size":    ctypes.unsigned_long },  // total size, in bytes
           { "st_blksize": ctypes.unsigned_long },  // blocksize for filesystem I/O
           { "st_blocks":  ctypes.unsigned_long },  // number of blocks allocated
           { "st_atime":   timespec },              // time of last access
           { "st_mtime":   timespec },              // time of last modification
           { "st_ctime":   timespec },              // time of last status change
           { "unused4":    ctypes.unsigned_long },  // number of blocks allocated
           { "unused5":    ctypes.unsigned_long },  // number of blocks allocated
        ]);
      }

      // declare __lxstat
      var lstat = libc.declare("__lxstat",    // function name
                         ctypes.default_abi,  // call ABI
                         ctypes.int,          // return type
                         ctypes.int,          // argument type
                         ctypes.char.ptr,     // argument type
                         stat.ptr);           // argument type

      // declare getuid
      var getuid = libc.declare("getuid",           // function name
                                ctypes.default_abi, // call ABI
                                ctypes.int);        // return type

      var uid = getuid();

      const TOPDIR_TRASH    = '.Trash';
      const TOPDIR_FALLBACK = '.Trash-' + uid;
      var self = this;

      function is_parent(parent, path) {
        var pathFile   = self.init(path);
        var parentFile = self.init(parent);
        // mime: the file has already been os.rename'd so checking for symlink doesn't work here
        // path   = pathFile.isSymlink()   ? pathFile.target   : path;  // In case it's a symlink
        parent = parentFile.isSymlink() ? parentFile.target : parent;

        return path.indexOf(parent) == 0;
      }

      function format_date(date) {
        return date.toISOString().slice(0, -5);
      }

      function info_for(src, topdir) {
        // ...it MUST not include a ".."" directory, and for files not "under" that
        // directory, absolute pathnames must be used. [2]
        if (!topdir || !is_parent(topdir, src)) {
          src = src;  // abspath by default on firefox
        } else {
          src = src.substring(topdir.length + 1);
        }

        var info = "[Trash Info]\n";
        info += "Path=" + escape(src) + "\n";
        info += "DeletionDate=" + format_date(new Date()) + "\n";
        return info;
      }

      function check_create(dir) {
        // use 0700 for paths [3]
        var dirFile = self.init(dir);
        if (!dirFile.exists()) {
          dirFile.create(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0700);
        }
      }

      function trash_move(src, dst, topdir) {
        var filename  = src.substring(src.lastIndexOf('/') + 1);
        var filespath = dst + '/' + FILES_DIR;
        var infopath  = dst + '/' + INFO_DIR;
        var base_name = filename.substring(0, filename.lastIndexOf('.'));
        var ext       = filename.substring(filename.lastIndexOf('.'));

        var counter = 0;
        var destname = filename;
        while (true) {
          var destFile = self.init(filespath + '/' + destname);
          var infoFile = self.init(infopath + '/' + destname + INFO_SUFFIX);

          if (!destFile.exists() && !infoFile.exists()) {
            break;
          }

          ++counter;
          destname = base_name + ' ' + counter + ext;
        }

        check_create(filespath);
        check_create(infopath);

        var srcFile = self.init(src);
        var fileFile = self.init(filespath);
        srcFile.moveTo(fileFile, destname);

        var infoFile = self.init(infopath + '/' + destname + INFO_SUFFIX);
        var foutstream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
        foutstream.init(infoFile, 0x04 | 0x08 | 0x20, 0644, 0);
        var data = info_for(src, topdir);
        var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                createInstance(Components.interfaces.nsIConverterOutputStream);
        converter.init(foutstream, "UTF-8", 0, 0);
        converter.writeString(data);
        converter.close();
      }

      function find_mount_point(path) {
        // Even if something's wrong, "/" is a mount point, so the loop will exit.
        // Use realpath in case it's a symlink
        var pathFile = self.init(path);
        path = pathFile.isSymlink() ? pathFile.target : path;

        // transcoded from Python's standard library: os.path.ismount
        function ismount(mountPath) {
          var s1 = new stat;
          var s2 = new stat;

          var returnCode = lstat(1, mountPath, s1.address());
          var returnCode2 = lstat(1, mountPath + '/..', s2.address());
          if (returnCode != 0 || returnCode2 != 0) {  // It doesn't exist -- so not a mount point :-)
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

        return path;
      }

      function find_ext_volume_global_trash(volume_root) {
        // from [2] Trash directories (1) check for a .Trash dir with the right
        // permissions set.

        var trash_dir = volume_root + '/' + TOPDIR_TRASH;
        var trashFile = self.init(trash_dir);
        if (!trashFile.exists()) {
          return null;
        }

        var s1 = new stat;
        var returnCode = lstat(1, trash_dir, s1.address());
        var mode = parseInt(s1.st_mode);
        // vol/.Trash must be a directory, cannot be a symlink, and must have the
        // sticky bit set.
        if (!trash_dir.isDirectory() || trash_dir.isSymlink() || mode & 512) { // 512 == stat.S_ISVTX
          return null;
        }

        trash_dir = trash_dir + '/' + uid;
        try {
          check_create(trash_dir);
        } catch (ex) {
          return null;
        }

        return trash_dir;
      }

      function find_ext_volume_fallback_trash(volume_root) {
        // from [2] Trash directories (1) create a .Trash-$uid dir.
        var trash_dir = volume_roto + '/' + TOPDIR_FALLBACK;
        // Try to make the directory, if we can't the OSError exception will escape
        // be thrown out of send2trash.
        check_create(trash_dir);
        return trash_dir;
      }

      function find_ext_volume_trash(volume_root) {
        var trash_dir = find_ext_volume_global_trash(volume_root);
        if (!trash_dir) {
          trash_dir = find_ext_volume_fallback_trash(volume_root);
        }
        return trash_dir;
      }

      // Pull this out so it's easy to stub (to avoid stubbing lstat itself)
      function get_dev(path) {
        var s1 = new stat;
        var returnCode = lstat(1, path, s1.address());
        return parseInt(s1.st_dev);
      }

      // finally, send2trash
      var path = file.path;
      if (!file.exists()) {
        throw "File not found: " + path;
      }
      // ...should check whether the user has the necessary permissions to delete
      // it, before starting the trashing operation itself. [2]
      // if not os.access(path, os.W_OK):
      //  raise OSError("Permission denied: %s" % path)
      // if the file to be trashed is on the same device as HOMETRASH we
      // want to move it there.
      var path_dev = get_dev(path);

      // If XDG_DATA_HOME or HOMETRASH do not yet exist we need to stat the
      // home directory, and these paths will be created further on if needed.
      var trash_dev = get_dev(home);

      var topdir;
      var dest_trash;
      if (path_dev == trash_dev) {
        topdir = XDG_DATA_HOME;
        dest_trash = HOMETRASH;
      } else {
        topdir = find_mount_point(path);
        trash_dev = get_dev(topdir);
        if (trash_dev != path_dev) {
          throw "Couldn't find mount point for " + path;
        }
        dest_trash = find_ext_volume_trash(topdir);
      }
      trash_move(path, dest_trash, topdir);
    } catch (ex) {
      throw ex;
    } finally {
      libc.close();
    }
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
