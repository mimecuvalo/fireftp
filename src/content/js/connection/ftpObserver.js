function ftpObserver() {
  inherit(this, new baseObserver());
}

ftpObserver.prototype = {
  securityCallbacks : securityCallbacks,

  onWelcomed : function() {
    displayWelcomeMessage(gConnection.welcomeMessage);
  },

  onDirNotFound : function(buffer) {                                        // so this isn't exactly the cleanest way to do it, bite me
    var changeDirPath;

    if (gConnection.eventQueue.length > 1 && gConnection.eventQueue[1].cmd == "LIST") {
      if (gConnection.eventQueue[1].options.eventualGoalPath) {
        changeDirPath = gConnection.eventQueue[1].options.eventualGoalPath;
      }

      gConnection.eventQueue.shift();                                       // get rid of pasv and list in the queue
      gConnection.eventQueue.shift();
      gConnection.trashQueue = new Array();
    }

    this._onDirNotFound(changeDirPath);
  }
};
