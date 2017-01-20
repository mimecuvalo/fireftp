var gConnections = [];          // array of all our ftp connections
var gConnection;                // the main connection - where the magic happens
var gVersion  = "2.0.31";  // version of FireFTP we're using
var gSlash;                     // holds '/' or '\\' depending on local system
var gPlatform;                  // holds what platform we're on
var gTransferTypes;             // holds 'Auto', 'Binary', 'ASCII'
var gLogQueue;                  // buffers log data
var gAlertWindow;               // reference to the alertDialog
var gWelcomeWindow;             // reference to the welcomeDialog
var gPrograms = new Array();    // programs in our open with list
var gLocalPathFocus;            // keep the correct value in the local  path
var gRemotePathFocus;           // keep the correct value in the remote path
var gMonths;                    // localized months
var gSiteManager;               // hold site manager data
var gWebHost;                   // url used in viewing things on the web
var gPrefix;                    // part of the ftp url to get rid of for viewing on the web, e.g. /www
var gAccount;                   // name of the account we're connecting to
var gFolder;                    // current folder
var gDownloadCaseMode;          // 0 == do nothing, 1 == convert filename to lower case, 2 == convert to uppercase
var gUploadCaseMode;            // ditto
var gTreeSync;                  // whether or not we're trying to keep directories in sync
var gTreeSyncLocal;             // base local  tree sync dir
var gTreeSyncRemote;            // base remote tree sync dir
var gTreeSyncManager;           // the code that manages changes
var gStatusBarClear = true;     // whether the status bar is clear or not
var gProcessing = 0;            // are we doing some processing?
var gFxp;                       // an fxp connection
var gFxpFiles;                  // files to be transfered over fxp
var gTempEditFiles = [];        // files being edited in the tmp directory
var gQueue = [];                // files that are in the queue, used for displaying
var gQueueSize = 0;             // total bytes left to transfer
var gQueueLength = 0;           // total # of files left to process
var gQueueTotalSize = 0;        // keep track of total queue size
var gQueueStartTime = 0;        // keep track of total queue elapsed time
var gPrevRate = 0;              // keep track of general rate of progress
var gPrevTotal = 0;             // keep track of general total of progress
var gPrevTransferred = 0;       // keep track of general total of progress
var gActiveCurrentPort = -1;    // if user specified a range of ports, this is the current port we're using

// XXX this is some crap but it'll work for now. see rsakey.js for more details
var gRsaKeyWorkerJs = 'chrome://fireftp/content/js/connection/paramikojs/sign_ssh_data_worker.js';

var gSearchFound;               // search: did we find any results?
var gSearchRunning = false;     // search: is search running?
var gSearchCallbacks;           // search: local callbacks
var gSearchName;                // search: filename search query
var gSearchType;                // search: 0 = local or 1 = remote
var gSearchRecursive;           // search: recursive or not
var gSearchMatchCase;           // search: match case or not
var gSearchRegExp;              // search: regular expression or not
var gSearchDates;               // search: specify dates or not
var gSearchFrom;                // search: from date
var gSearchTo;                  // search: to date
var gSearchRemoteUpdate = false;// search: if we are updating the view

var gMissingRemoteFiles;        // directory diff: files missing on remote files
var gMissingLocalFiles;         // directory diff: files missing on local side
var gDifferentFiles;            // directory diff: files that have different file sizes
var gNewerFiles;                // directory diff: files that are newer
var gOlderFiles;                // directory diff: files that are older

var gDefaultAccount;            // from prefs: select the opened account
var gBytesMode;                 // from prefs: show kilobytes or just bytes
var gDebugMode;                 // from prefs: show debug msgs in log or not
var gDisableDestructMode;       // from prefs: true if we want to disable the self-destruct timer in the overwrite dialog
var gDisableFavicon;            // from prefs: hidden pref if we want to disable fetching of favicon when connecting
var gDonated;                   // from prefs: donated or not
var gErrorMode;                 // from prefs: show error msgs or not
var gInterfaceMode;             // from prefs: show local view, remote view, or both
var gLoadMode;                  // from prefs: which way to load fireftp: tab or window or window group
var gLoadUrl;                   // from prefs: ftp url to open onload
var gLogErrorMode;              // from prefs: show only errors in log or not
var gLogMode;                   // from prefs: show log window or not
var gLogQueueMode;              // from prefs: show log or queue
var gNoPromptMode;              // from prefs: true if we want to disable the overwrite dialog
var gPasswordMode;              // from prefs: save password or not
var gRefreshMode;               // from prefs: refresh on remote side if change is made or not
var gTempPasvMode;              // from prefs: use passive mode for temporary connections
var gWelcomeMode;               // from prefs: show welcome msg on connect or not
var gConcurrent;                // from prefs: how many simultaneous connections to try to have
var gMaxCon;                    // from prefs: how many max simultaneous connections FireFTP handles
var gOpenMode;                  // from prefs: 0 = download file, 1 = open file

var gStrbundle;                 // $() references
var gConnectButton;
var gAccountField;
var gFolderField;
var gLocalPath;
var gLocalTree;
var gLocalDirTree;
var gLocalTreeChildren;
var gLocalDirTreeChildren;
var gRemotePath;
var gRemoteTree;
var gRemoteDirTree;
var gRemoteTreeChildren;
var gRemoteDirTreeChildren;
var gCmdlogDoc;
var gCmdlogBody;
var gQueueTree;
var gQueueTreeChildren;
var gStatusBytes;
var gStatusElapsed;
var gStatusRemaining;
var gStatusRate;
var gStatusMeter;

var gProfileDir;                // services
var gAtomService;
var gLoginManager;
var gLoginInfo;
var gIos;
var gPromptService;
var gPrefsService;
var gPrefs;
var gFireFTPUtils;
