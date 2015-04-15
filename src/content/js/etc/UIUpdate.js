window.setInterval(UIUpdate, 500);                                              // update twice a second

function UIUpdate() {
  queueTree.updateView();
  updateStatusBar();
  updateLog();
}

function updateStatusBar() {
  if (gQueueSize && !gConnection.isReconnecting) {
    gStatusBarClear      = false;

    var filesLeft        = gQueueLength;
    var totalBytes       = gQueueSize;
    var totalTransferred = 0;
    var totalRate        = 0;

    // grab stats for each individual connection and subtract from total bytes and get total average rate
    for (var x = 0; x < gMaxCon; ++x) {
      if (!gConnections[x].isConnected) {
        continue;
      }

      var timeStart = 0;
      var transferred = 0;
      var partial = 0;
      var rate = 0;
      // todo fixme: this crap needs to be migrated to the new transferProgress style like sftp
      if (gConnections[x].dataSocket && (gConnections[x].dataSocket.progressEventSink.bytesTotal || !gConnections[x].dataSocket.dataListener.bytesDownloaded) && !gConnections[x].dataSocket.progressEventSink.compressStream) {
        transferred = gConnections[x].dataSocket.progressEventSink.bytesUploaded;
        partial     = gConnections[x].dataSocket.progressEventSink.bytesPartial;
        timeStart   = gConnections[x].dataSocket.progressEventSink.timeStart;
      } else if (gConnections[x].dataSocket && (gConnections[x].dataSocket.dataListener.bytesTotal || !gConnections[x].dataSocket.progressEventSink.bytesUploaded)) {
        transferred = gConnections[x].dataSocket.dataListener.bytesDownloaded;
        partial     = gConnections[x].dataSocket.dataListener.bytesPartial;
        timeStart   = gConnections[x].dataSocket.dataListener.timeStart;
      } else if (gConnections[x].transferProgress && gConnections[x].transferProgress.bytesTotal) {
        transferred = gConnections[x].transferProgress.bytesTransferred;
        partial     = gConnections[x].transferProgress.bytesPartial;
        timeStart   = gConnections[x].transferProgress.timeStart;
      }

      if (!transferred) {
        continue;
      }

      var timeElapsed = ((new Date()) - timeStart) / 1000;
      timeElapsed     = timeElapsed != 0 ? timeElapsed : 1;         // no dividing by 0
      var rate        = (transferred - partial) / 1024 / timeElapsed;
      rate            = rate != 0 ? rate : 0.1;                     // no dividing by 0

      totalTransferred += transferred;
      totalRate        += rate;
    }

    if (!totalRate) {
      if (gPrevRate) {
        totalRate = gPrevRate;
      } else {
        // totalRate is 0 somehow and we don't want to divide by zero
        // get here if we're uploading in MODE Z, for example
        gStatusBytes.label = gStrbundle.getString("working");
        gStatusElapsed.label   = "";
        gStatusRemaining.label = "";
        gStatusRate.label      = "";
        gStatusMeter.setAttribute("mode", "undetermined");
        gStatusMeter.setAttribute("value", "0%");
        document.title = gStrbundle.getString("working") + " - " + (gAccount ? gAccount : gConnection.host) + " - FireFTP";
        return;
      }
    } else {
      totalRate = (totalRate + gPrevRate) / 2;    // get an average of the two to get more stable numbers
      gPrevRate = totalRate;
    }


    var totalLeft     = totalBytes - totalTransferred;
    if (gPrevTotal == totalBytes && totalLeft >= gPrevTotal - gPrevTransferred) {  // we're in between connections
      totalLeft = totalBytes - gPrevTransferred;
    }
    gPrevTotal        = totalBytes;
    gPrevTransferred  = totalTransferred;
    totalLeft         = totalLeft < 0 ? 0 : totalLeft;
    var timeRemaining = totalLeft / 1024 * (1 / totalRate);
    totalRate         = totalRate.toFixed(2);
    totalRate         = totalRate.replace(/\./g, gStrbundle.getString("decimal")) + " " + gStrbundle.getString("kbsec");

    var whatsLeft          = commas(totalLeft) + ' - ' + gStrbundle.getFormattedString("filesleft", [gQueueLength]);
    gStatusBytes.label     = whatsLeft;
    var totalTimeElapsed   = ((new Date()) - gQueueStartTime) / 1000;
    totalTimeElapsed       = totalTimeElapsed != 0 ? totalTimeElapsed : 1;
    var hours              = parseInt( totalTimeElapsed / 3600);
    var min                = parseInt((totalTimeElapsed - hours * 3600) / 60);
    var sec                = parseInt( totalTimeElapsed - hours * 3600 - min * 60);
    gStatusElapsed.label   = (hours ? zeros(hours) + ":" : "") + zeros(min) + ":" + zeros(sec);
    hours                  = parseInt( timeRemaining / 3600);
    min                    = parseInt((timeRemaining - hours * 3600) / 60);
    sec                    = parseInt( timeRemaining - hours * 3600 - min * 60);
    var remaining          = (hours ? zeros(hours) + ":" : "") + zeros(min) + ":" + zeros(sec);
    gStatusRemaining.label = remaining;
    gStatusRate.label      = totalRate;
    var progress           = parseInt((gQueueTotalSize - totalLeft) / gQueueTotalSize * 100) + "%";
    gStatusMeter.setAttribute("mode", "determined");
    gStatusMeter.setAttribute("value", progress);
    document.title         = progress + " - " + gStrbundle.getFormattedString("filesleft", [gQueueLength]) + " - " + (gAccount ? gAccount : gConnection.host) + " - FireFTP";
  } else {
    var status = "";
    gPrevRate  = 0;
    gPrevTotal = 0;
    gPrevTranferred = 0;

    if (gQueueLength) {
      status = gStrbundle.getString("working") + ' - ' + gStrbundle.getFormattedString("filesleft", [gQueueLength]);
      gStatusMeter.setAttribute("mode", "undetermined");
      gStatusBarClear = false;
    } else if (gConnection.eventQueue.length) {
      status = gConnection.eventQueue[0].cmd == "welcome" ? gStrbundle.getString("connecting") : gStrbundle.getString("working");
      gStatusMeter.setAttribute("mode", "undetermined");
      gStatusBarClear = false;
    } else if (gProcessing) {
      status = gStrbundle.getString("working");
      gStatusMeter.setAttribute("mode", "undetermined");
      gStatusBarClear = false;
    } else if (!gStatusBarClear) {
      gStatusMeter.setAttribute("mode", "determined");
      gStatusBarClear = true;
    } else if (gStatusBarClear && !gConnection.isReconnecting) {
      return;
    }

    // the rest of the code is if we are reconnecting
    if (!gConnection.isReconnecting && !gConnection.isConnected && !$('abortbutton').disabled) {
      $('abortbutton').disabled = true;
    }

    if (gConnection.isReconnecting) {
      if (gConnection.reconnectsLeft) {
        status = gStrbundle.getFormattedString("reconnect", [gConnection.reconnectInterval, gConnection.reconnectsLeft]);
        gStatusMeter.setAttribute("mode", "undetermined");
      } else {
        status = "";
        gStatusMeter.setAttribute("mode", "determined");
      }
    }

    gStatusBytes.label = status;

    if (!gConnection.isConnected) {
      document.title = (gConnection.isReconnecting ? (status + " - ") : "") + "FireFTP";
      gStatusBarClear = false;
    } else {
      document.title = status + (status == "" ? "" : " - ") + (gAccount ? gAccount : gConnection.host) + " - FireFTP";
    }

    gStatusElapsed.label   = "";
    gStatusRemaining.label = "";
    gStatusRate.label      = "";
    gStatusMeter.setAttribute("value", "0%");
  }
}

function updateLog() {
  if (gLogQueue && gLogMode) {
    var scrollLog = gCmdlogBody.scrollTop + 50 >= gCmdlogBody.scrollHeight - gCmdlogBody.clientHeight;
    gCmdlogBody.appendChild(gLogQueue);                                             // update log

    gLogQueue = gCmdlogDoc.createDocumentFragment();

    var nodeList = gCmdlogDoc.getElementsByTagName("div");                          // don't keep too much log data or it will slow down things
    var count    = 0;
    while (nodeList.length > 200 + count) {
      if (nodeList.item(count).getAttribute("type") == 'error') {
        ++count;
      } else {
        gCmdlogBody.removeChild(nodeList.item(count));
      }
    }

    if (scrollLog) {
      gCmdlogBody.scrollTop = gCmdlogBody.scrollHeight - gCmdlogBody.clientHeight;  // scroll to bottom
    }
  }
}

function onAddQueue(connNo, id, cmd, transferInfo, size) {
  if (gQueueSize == 0) {
    gQueueStartTime = new Date();
  }

  gQueue[connNo].push({ id: id, cmd: cmd, transferInfo: transferInfo, size: size });
  gQueueSize += size;
  gQueueTotalSize += size;
  ++gQueueLength;
  if (cmd != "delete") {
    queueTree.addQueue(connNo, transferInfo);
  }
}

function onRemoveQueue(connNo, id) {
  for (var x = 0; x < gQueue[connNo].length; ++x) {
    if (gQueue[connNo][x].id == id) {
      gQueueSize -= gQueue[connNo][x].size;
      gQueue[connNo].splice(x, 1);
      --gQueueLength;
      break;
    }
  }
  queueTree.removeQueue(id);

  if (gQueueSize == 0) {
    gQueueTotalSize = 0;
    gQueueStartTime = 0;
  }
}

function onClearQueue(connNo) {
  for (var x = gQueue[connNo].length - 1; x >= 0; --x) {
    gQueueSize -= gQueue[connNo][x].size;
    gQueue[connNo].splice(x, 1);
    --gQueueLength;
  }
  queueTree.clearQueue(connNo);

  if (gQueueSize == 0) {
    gQueueTotalSize = 0;
    gQueueStartTime = 0;
  }
}
