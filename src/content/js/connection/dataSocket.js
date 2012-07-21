function ftpDataSocketMozilla(controlHost, controlPort, security, proxy, host, port, compress, id, observer, cert, asciiMode) {
  this.transportService  = Components.classes["@mozilla.org/network/socket-transport-service;1"].getService(Components.interfaces.nsISocketTransportService);
  this.proxyService      = Components.classes["@mozilla.org/network/protocol-proxy-service;1"].getService  (Components.interfaces.nsIProtocolProxyService);
  this.dnsService        = Components.classes["@mozilla.org/network/dns-service;1"].getService             (Components.interfaces.nsIDNSService);
  this.eventTarget       = Components.classes["@mozilla.org/thread-manager;1"].getService                  ().currentThread;
  this.security          = security || false;
  this.host              = (security ? controlHost : (host || ""));
  this.port              = port     || -1;
  this.proxyType         = proxy ? proxy.proxyType : "";
  this.proxyHost         = proxy ? proxy.proxyHost : "";
  this.proxyPort         = proxy ? proxy.proxyPort : -1;
  this.useCompression    = compress;
  this.dataListener      = new dataListener();
  this.progressEventSink = new progressEventSink();
  this.id                = id;
  this.observer          = observer;
  this.asciiMode         = asciiMode;

  if (security) {
    try {
      this.certOverride = Components.classes["@mozilla.org/security/certoverride;1"].getService(Components.interfaces.nsICertOverrideService);
      var hashAlg = {};  var fingerprint = {};  var overrideBits = {};  var isTemporary = {};
      var ok = this.certOverride.getValidityOverride(controlHost, controlPort, hashAlg, fingerprint, overrideBits, isTemporary);

      this.certOverride.rememberValidityOverride(this.host, port, cert, overrideBits.value, true);
    } catch (ex) {
      this.observer.onDebug(ex);
    }
  }
}

ftpDataSocketMozilla.prototype = {
  dataTransport : null,
  dataInstream  : null,
  dataOutstream : null,
  fileInstream  : null,
  serverSocket  : null,

  listData      : "",
  finished      : true,
  exception     : false,

  emptyFile     : false,                                                                    // XXX empty files are (still) special cases

  connect : function(write, localPath, fileTotalBytes, filePartialBytes, activeTransport) {
    try {
      if (activeTransport) {
        this.dataTransport = activeTransport;
      } else {
        var proxyInfo = this.proxyType == "" ? null : this.proxyService.newProxyInfo(this.proxyType, this.proxyHost, this.proxyPort,
                                                        Components.interfaces.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST, 30, null);

        if (this.security) {
          this.dataTransport = this.transportService.createTransport(["ssl"], 1, this.host, this.port, proxyInfo);
        } else {
          this.dataTransport = this.transportService.createTransport(null,    0, this.host, this.port, proxyInfo);
        }
      }

      this.finished = false;

      if (write)  {                                                                         // upload
        this.dataOutstream  = this.dataTransport.openOutputStream(0, 0, -1);
        var file;

        try {
          file              = localFile.init(localPath);
          this.fileInstream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance();
          this.fileInstream.QueryInterface(Components.interfaces.nsIFileInputStream);
          this.fileInstream.init(file, 0x01, 0644, 0);
          this.fileInstream.QueryInterface(Components.interfaces.nsISeekableStream);
          this.fileInstream.seek(0, filePartialBytes);                                      // append or not to append
        } catch (ex) {
          this.observer.onDebug(ex);

          this.observer.onError(gStrbundle.getFormattedString("failedUpload", [localPath]));

          this.kill();
          return;
        }

        var binaryOutstream = Components.classes["@mozilla.org/binaryoutputstream;1"].createInstance(Components.interfaces.nsIBinaryOutputStream);
        binaryOutstream.setOutputStream(this.dataOutstream);

        this.dataInstream = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
        this.dataInstream.setInputStream(this.fileInstream);

        this.progressEventSink.parent        = this;
        this.progressEventSink.localPath     = localPath;
        this.progressEventSink.sendPrevSent  = 0;
        this.progressEventSink.timeStart     = new Date();
        this.progressEventSink.bytesTotal    = file.fileSize;
        this.progressEventSink.bytesUploaded = this.useCompression ? 0 : filePartialBytes;
        this.progressEventSink.bytesPartial  = filePartialBytes;
        this.progressEventSink.dataInstream  = this.dataInstream;
        this.progressEventSink.dataOutstream = binaryOutstream;
        this.progressEventSink.fileInstream  = this.fileInstream;
        this.progressEventSink.asciiMode     = this.asciiMode;
        this.emptyFile                       = !file.fileSize;
        this.progressEventSink.asciiCarryover = false;

        this.dataTransport.setEventSink(this.progressEventSink, this.eventTarget);

        if (this.useCompression && file.fileSize) {                                         // never as elegant as downloading :(
          this.progressEventSink.compressStream = true;

          var streamConverter = Components.classes["@mozilla.org/streamconv;1?from=uncompressed&to=deflate"].createInstance(Components.interfaces.nsIStreamConverter);
          streamConverter.asyncConvertData("uncompressed", "deflate", this.progressEventSink, null);

          var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].createInstance(Components.interfaces.nsIInputStreamPump);
          pump.init(this.dataInstream, -1, -1, 0, 0, false);
          pump.asyncRead(streamConverter, null);
        } else {
          var dataBuffer = this.dataInstream.readBytes(this.dataInstream.available() < 4096 ? this.dataInstream.available() : 4096);

          if (this.asciiMode && dataBuffer.length && dataBuffer.charAt(dataBuffer.length - 1) == '\r') {
            this.progressEventSink.asciiCarryover = true;
          }

          var diff = dataBuffer.length;

          if (this.asciiMode) {
            dataBuffer = dataBuffer.replace(/(^|[^\r])\n/g, "$1\r\n");
          }

          this.progressEventSink.bytesTotal += dataBuffer.length - diff;

          this.progressEventSink.dataOutstream.writeBytes(dataBuffer, dataBuffer.length);
        }
      } else {                                                                              // download
        this.listData                     = "";
        var dataStream                    = this.dataTransport.openInputStream(0, 0, 0);

        var streamConverter;
        this.dataInstream                 = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
        if (this.useCompression) {
          streamConverter = Components.classes["@mozilla.org/streamconv;1?from=deflate&to=uncompressed"].createInstance(Components.interfaces.nsIStreamConverter);
          streamConverter.asyncConvertData("deflate", "uncompressed", this.dataListener, null);
        } else {
          this.dataInstream.setInputStream(dataStream);
        }

        this.dataListener.parent          = this;
        this.dataListener.localPath       = localPath;
        this.dataListener.dataInstream    = this.dataInstream;
        this.dataListener.data            = "";
        this.dataListener.file            = "";
        this.dataListener.fileOutstream   = "";
        this.dataListener.binaryOutstream = "";
        this.dataListener.bytesTotal      = fileTotalBytes   || 0;
        this.dataListener.bytesDownloaded = filePartialBytes || 0;
        this.dataListener.bytesPartial    = filePartialBytes || 0;
        this.dataListener.timeStart       = new Date();
        this.dataListener.dataBuffer      = "";
        this.dataListener.isNotList       = localPath != null;
        this.dataListener.useCompression  = this.useCompression;
        this.dataListener.asciiMode       = this.asciiMode;
        this.dataListener.asciiCarryover  = false;

        var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].createInstance(Components.interfaces.nsIInputStreamPump);
        pump.init(dataStream, -1, -1, 0, 0, false);
        pump.asyncRead(this.useCompression ? streamConverter : this.dataListener, null);
      }

    } catch(ex) {
      this.observer.onDebug(ex);

      this.observer.onError(gStrbundle.getString("errorDataConn"));

      return;
    }
  },

  createServerSocket : function(activeInfo) {
    try {
      var ipAddress      = this.dnsService.resolve(this.dnsService.myHostName, false).getNextAddrAsString();
      var re             = /\x2e/g;
      this.serverSocket  = Components.classes["@mozilla.org/network/server-socket;1"].createInstance(Components.interfaces.nsIServerSocket);

      var self = this;
      var serverListener = {
        onSocketAccepted : function(serv, transport) {
          if (activeInfo.cmd == "LIST") {
            self.connect(false, null,                  0,                    0,                       transport);
          } else if (activeInfo.cmd == "RETR") {
            self.connect(false, activeInfo.localPath, activeInfo.totalBytes, 0,                       transport);
          } else if (activeInfo.cmd == "REST") {
            self.connect(false, activeInfo.localPath, activeInfo.totalBytes, activeInfo.partialBytes, transport);
          } else if (activeInfo.cmd == "STOR") {
            self.connect(true,  activeInfo.localPath, 0,                     0,                       transport);
          } else if (activeInfo.cmd == "APPE") {
            self.connect(true,  activeInfo.localPath, 0,                     activeInfo.partialBytes, transport);
          }
        },

        onStopListening : function(serv, status) { }
      };

      this.serverSocket.init(this.port, false, -1);
      this.serverSocket.asyncListen(serverListener);

      if (activeInfo.ipType == "IPv4" && ipAddress.indexOf(':') == -1) {
        return ipAddress.replace(re, ",") + "," + parseInt(this.serverSocket.port / 256) + "," + this.serverSocket.port % 256;
      } else {
        return (ipAddress.indexOf(':') != -1 ? "|2|" : "|1|") + ipAddress + "|" + this.serverSocket.port + "|";
      }
    } catch (ex) {
      this.observer.onDebug(ex);

      this.observer.onError(gStrbundle.getString("errorDataConn"));

      return null;
    }
  },

  kill : function(override) {
    this.progressEventSink.bytesTotal = 0;                                                  // stop uploads
    this.dataListener.bytesTotal      = 0;                                                  // stop downloads

    try {
      if (this.dataInstream && this.dataInstream.close) {
        this.dataInstream.close();
      }
    } catch(ex) { }

    try {
      if ((!this.emptyFile || override) && this.dataOutstream && this.dataOutstream.flush) {
        this.dataOutstream.flush();
      }

      if ((!this.emptyFile || override) && this.dataOutstream && this.dataOutstream.close) {
        this.dataOutstream.close();
      }
    } catch(ex) { }

    try {
      if ((!this.emptyFile || override) && this.fileInstream && this.fileInstream.close) {
        this.fileInstream.close();
      }
    } catch(ex) { }

    try {
      if ((!this.emptyFile || override)) {                                                  // XXX empty files are (still) special cases
        if (this.dataTransport && this.dataTransport.close) {
          this.dataTransport.close("Finished");
        }
      }
    } catch(ex) { }

    try {
      if (this.dataListener.binaryOutstream && this.dataListener.binaryOutstream.close) {
        this.dataListener.binaryOutstream.close();
      }
    } catch(ex) { }

    try {
      if (this.dataListener.fileOutstream && this.dataListener.fileOutstream.close) {
        this.dataListener.fileOutstream.close();
      }
    } catch(ex) { }

    try {
      if (this.serverSocket && this.serverSocket.close) {
        this.serverSocket.close();
      }
    } catch(ex) { }

    this.progressEventSink.parent     = null;                                               // stop memory leakage!
    this.dataListener.parent          = null;                                               // stop memory leakage!

    this.finished  = true;

    if (this.security) {
      try {
        this.certOverride.clearValidityOverride(this.host, this.port);
      } catch (ex) {
        this.observer.onDebug(ex);
      }
    }
  }
};

function dataListener() { }

dataListener.prototype = {
  parent           : null,
  localPath        : "",
  dataInstream     : "",
  data             : "",
  file             : "",
  fileOutstream    : "",
  binaryOutstream  : "",
  bytesTotal       : 0,
  bytesDownloaded  : 0,
  bytesPartial     : 0,
  timeStart        : new Date(),
  dataBuffer       : "",
  isNotList        : false,
  useCompression   : false,
  asciiMode        : false,
  asciiCarryover   : false,

  onStartRequest : function(request, context) {
    if (this.isNotList) {
      this.timeStart = new Date();

      try {
        this.file          = localFile.init(this.localPath);
        this.fileOutstream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);

        if (this.bytesPartial) {
          this.fileOutstream.init(this.file, 0x04 | 0x10, 0644, 0);
        } else {
          this.fileOutstream.init(this.file, 0x04 | 0x08 | 0x20, 0644, 0);
        }

        this.binaryOutstream = Components.classes["@mozilla.org/binaryoutputstream;1"].createInstance(Components.interfaces.nsIBinaryOutputStream);
        this.binaryOutstream.setOutputStream(this.fileOutstream);
      } catch (ex) {
        this.failure(ex);
      }
    }
  },

  onStopRequest : function(request, context, status) {
    if (this.isNotList) {
      try {
        if (this.asciiMode && this.getPlatform() != "windows") {
          if (this.asciiCarryover) {
            var buffer = '\r';
            this.binaryOutstream.writeBytes(buffer, buffer.length);
            this.asciiCarryover = false;
          }
        }
      } catch (ex) {
        this.failure(ex);
      }
    }

    if (!this.isNotList && this.parent) {
      this.parent.listData = this.data;
    }

    if (this.parent) {
      this.parent.kill();
    }
  },

  onDataAvailable : function(request, context, inputStream, offset, count) {
    if (this.useCompression) {
      this.dataInstream.setInputStream(inputStream);
    }

    if (this.isNotList) {
      try {
        this.dataBuffer = this.dataInstream.readBytes(count);

        var length = this.dataBuffer.length;

        if (this.asciiMode && this.getPlatform() != "windows") {
          if (this.asciiCarryover) {
            this.dataBuffer = '\r' + this.dataBuffer;
          }
          this.asciiCarryover = false;

          this.dataBuffer = this.dataBuffer.replace(/\r\n/g, '\n');

          if (this.dataBuffer.charAt(this.dataBuffer.length - 1) == '\r') {
            this.asciiCarryover = true;
            this.dataBuffer = this.dataBuffer.substring(0, this.dataBuffer.length - 1);
          }
        }

        this.binaryOutstream.writeBytes(this.dataBuffer, this.dataBuffer.length);
        this.bytesDownloaded += length;

        // XXX laaaamesauce, if socket has security enabled, then we never get an onStopRequest telling us
        // that the connection is finished
        if (this.parent.security && this.bytesTotal == this.bytesDownloaded) {
          this.parent.kill();
        }
      } catch (ex) {
        this.failure(ex);
      }
    } else {
      this.data += this.dataInstream.readBytes(count);
    }
  },

  failure : function(ex) {
    this.parent.observer.onDebug(ex);

    this.parent.observer.onError(gStrbundle.getFormattedString("failedSave", [this.localPath]));

    this.parent.exception = true;
    this.parent.kill();
  },

  getPlatform : function() {
    var platform = navigator.platform.toLowerCase();

    if (platform.indexOf('linux') != -1) {
      return 'linux';
    }

    if (platform.indexOf('mac') != -1) {
      return 'mac';
    }

    if (platform.indexOf('win') != -1) {
      return 'windows';
    }

    return 'other';
  }
};

function progressEventSink() { }

progressEventSink.prototype = {
  parent         : null,
  localPath      : "",
  bytesTotal     : 0,
  sendPrevSent   : 0,
  bytesUploaded  : 0,
  timeStart      : new Date(),
  bytesPartial   : 0,
  dataOutstream  : null,
  fileInstream   : null,
  compressFirst  : true,
  compressStream : false,
  compressTotal  : 0,
  compressDone   : false,
  compressBuffer : "",
  asciiMode      : false,
  asciiCarryover : false,

  onStartRequest  : function(request, context) { },
  onStopRequest   : function(request, context, status) {
    this.compressDone = true;
  },

  onDataAvailable : function(request, context, inputStream, offset, count) {
    try {
      var dataInstream = Components.classes["@mozilla.org/binaryinputstream;1"].createInstance(Components.interfaces.nsIBinaryInputStream);
      dataInstream.setInputStream(inputStream);
      this.compressTotal  += count;
      this.compressBuffer += dataInstream.readBytes(count);

      if (this.compressFirst) {
        this.compressFirst = false;
        this.dataOutstream.writeBytes(this.compressBuffer, this.compressBuffer.length);
        this.compressBuffer = "";
      }
    } catch (ex) {
      this.failure(ex);
    }
  },

  onTransportStatus : function (transport, status, progress, progressMax) {
    this.bytesUploaded += progress - this.sendPrevSent;
    this.sendPrevSent   = progress;

    if ((!this.compressStream && this.bytesUploaded == this.bytesTotal)
      || (this.compressStream && this.compressDone && this.bytesUploaded == this.compressTotal)) {  // finished writing
      this.parent.kill();                                                                           // can't rely on this.fileInstream.available() - corrupts uploads
      return;
    }

    if (this.compressStream) {
      this.dataOutstream.writeBytes(this.compressBuffer, this.compressBuffer.length);
      this.compressBuffer = "";
    } else {
      var dataBuffer = this.dataInstream.readBytes(this.dataInstream.available() < 4096 ? this.dataInstream.available() : 4096);

      var diff = dataBuffer.length;

      if (this.asciiMode) {
        var didCarryover = false;

        if (this.asciiCarryover && dataBuffer.length && dataBuffer.charAt(0) == '\n') {
          didCarryover = true;
          dataBuffer = dataBuffer.substring(1);
        }

        dataBuffer = dataBuffer.replace(/(^|[^\r])\n/g, "$1\r\n");

        if (didCarryover) {
          dataBuffer = '\n' + dataBuffer;
        }
        this.asciiCarryover = false;

        if (dataBuffer.length && dataBuffer.charAt(dataBuffer.length - 1) == '\r') {
          this.asciiCarryover = true;
        }
      }

      this.bytesTotal += dataBuffer.length - diff;

      this.dataOutstream.writeBytes(dataBuffer, dataBuffer.length);
    }
  },

  failure : function(ex) {
    this.parent.observer.onDebug(ex);

    this.parent.observer.onError(gStrbundle.getFormattedString("failedUpload", [this.localPath]));

    this.parent.exception = true;
    this.parent.kill();
  }
};
