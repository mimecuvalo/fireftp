Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");                               // makes life easier

var gThreadManager    = Components.classes["@mozilla.org/thread-manager;1"].getService();       // threading functions
var gMainThread       = gThreadManager.mainThread;

function threadedEvent(func) {
  this.run = func;
}

threadedEvent.prototype = {
  QueryInterface : XPCOMUtils.generateQI([Components.interfaces.nsIRunnable, Components.interfaces.nsISupports])
};

function dispatchEvent(func, isMainThread, isNormal) {
  var target = isMainThread ? gMainThread : gThreadManager.newThread(0);
  target.dispatch(new threadedEvent(func), isNormal ? target.DISPATCH_NORMAL : target.DISPATCH_SYNC);

  if (!isMainThread) {
    target.shutdown();
  }
}

function FireFTPUtils() { };                                                                    // FireFTPUtils

FireFTPUtils.prototype = {
  classDescription  : "FireFTP Utilities",
  classID           : Components.ID("{42bd5782-5c3e-11dc-8314-0800200c9a66}"),
  contractID        : "@nite-lite.net/fireftputils;1",
  _xpcom_categories : [{ category: 'FireFTP Utilities', service: true }],
  QueryInterface    : XPCOMUtils.generateQI([Components.interfaces.nsIFireFTPUtils, Components.interfaces.nsISupports, Components.interfaces.nsIObserver]),
  observe: function(){},

  hiddenMode        : false,

  getRecursiveFolderData : function(dir, recursiveFolderData) {
    recursiveFolderData = recursiveFolderData.wrappedJSObject.obj;
    var self    = this;
    var func    = function() { self.getRecursiveFolderData2(dir, recursiveFolderData) };        // <strike>separate thread</strike>
    func(); //dispatchEvent(func);
  },

  getRecursiveFolderData2 : function(dir, recursiveFolderData) {
    try {
      var entries = dir.directoryEntries;

      while (entries.hasMoreElements()) {
        var file = entries.getNext().QueryInterface(Components.interfaces.nsILocalFile);

        if (file.exists() && this.testSize(file) && (!file.isHidden() || this.hiddenMode)) {
          if (file.isDirectory()) {
            ++recursiveFolderData.nFolders;
            this.getRecursiveFolderData2(file, recursiveFolderData);
          } else {
            ++recursiveFolderData.nFiles;
          }

          recursiveFolderData.nSize += file.fileSize;
        }
      }
    } catch (ex) {
                                                                                                // do nothing, skip this directory
    }
  },

  testSize : function(file) {                                                                   // XXX in linux, files over 2GB throw an exception
    try {
      var x = file.fileSize;
      return true;
    } catch (ex) {
      return false;
    }
  },

  generateHash : function(file, hash) {
    var result;
    var self = this;

    var func = function() {                                                                     // generate hash, <strike>separate thread</strike>
      try {
        var cryptoHash;

        if (hash == 'md5') {
          cryptoHash = Components.interfaces.nsICryptoHash.MD5;
        } else if (hash == 'sha1') {
          cryptoHash = Components.interfaces.nsICryptoHash.SHA1;
        } else if (hash == 'sha256') {
          cryptoHash = Components.interfaces.nsICryptoHash.SHA256;
        } else if (hash == 'sha384') {
          cryptoHash = Components.interfaces.nsICryptoHash.SHA384;
        } else if (hash == 'sha512') {
          cryptoHash = Components.interfaces.nsICryptoHash.SHA512;
        }

        var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
        fstream.init(file, 1, 0, false);

        var hashComp = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
        hashComp.init(cryptoHash);
        hashComp.updateFromStream(fstream, -1);
        result = self.binaryToHex(hashComp.finish(false));

        fstream.close();
      } catch (ex) { }
    };
    func(); //dispatchEvent(func);

    return result;
  },

  binaryToHex : function(input) {                                                               // borrowed from nsUpdateService.js
    var result = "";

    for (var i = 0; i < input.length; ++i) {
      var hex = input.charCodeAt(i).toString(16);

      if (hex.length == 1) {
        hex = "0" + hex;
      }

      result += hex;
    }

    return result;
  },

  removeFile : function(file) {
    var innerEx = "";

    var func = function() {                                                                     // delete file (recursively if dir), <strike>separate thread</strike>
      try {
        file.remove(true);
      } catch (ex) {
        innerEx = ex;
      }
    };
    func(); //dispatchEvent(func);

    return innerEx;
  },

  // XXX: IDL is broken on this?
  // I get this error: Cannot find interface information for parameter arg 0 [nsIFireFTPUtils.extract]
  // moving code outside of here since this doesn't run on a separate thread anyway...
  // OBSOLETE CODE
  extract : function(zip, entry, destFolder) {
    var innerEx = "";

    var func = function() {                                                                     // extract file, <strike>separate thread</strike>
      try {
        zip.extract(entry, destFolder);
      } catch (ex) {
        innerEx = ex;
      }
    };
    func(); //dispatchEvent(func);

    return innerEx;
  },

  cutCopy : function(isCut, file, newFile, newDir, newName) {
    var innerEx = "";

    var func = function() {                                                                     // cut or copy file, <strike>separate thread</strike>
      try {
        if (newFile.exists()) {
          newFile.remove(true);
        }

        newName = decodeURI(newName);                                                           // XXX Firefox doesn't send UTF8 across component boundary correctly.

        if (isCut) {
          file.moveTo(newDir, newName);                                                         // cut
        } else {
          file.copyTo(newDir, newName);                                                         // or copy
        }
      } catch (ex) {
        innerEx = ex;
      }
    };
    func(); //dispatchEvent(func);

    return innerEx;
  },

  getFileList : function(dir, files) {
    var innerEx = "";
    var self    = this;
    files       = files.wrappedJSObject.obj;

    var func = function() {                                                                     // get file list, <strike>separate thread</strike>
      try {
        var entries = dir.directoryEntries;

        while (entries.hasMoreElements()) {
          var file = entries.getNext().QueryInterface(Components.interfaces.nsILocalFile);

          if (file.exists() && self.testSize(file) && (!file.isHidden() || self.hiddenMode)) {
            files.push(file);
          }
        }
      } catch (ex) {
        innerEx = ex;
        return;                                                                                 // skip this directory
      }
    };
    func(); //dispatchEvent(func);

    return innerEx;
  }
};

var components = [FireFTPUtils];                                                                // register components

if (XPCOMUtils.generateNSGetFactory) {
  var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
} else {
  var NSGetModule = XPCOMUtils.generateNSGetModule(components);
}
