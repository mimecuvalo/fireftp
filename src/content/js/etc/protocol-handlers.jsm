/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
    "FireFTPProtocols",
    "FTPProtocolHandlerFactory",
    "FTPSProtocolHandlerFactory",
    "SFTPProtocolHandlerFactory",
    "FTPPROT_HANDLER_CID",
    "FTPSPROT_HANDLER_CID",
    "SFTPPROT_HANDLER_CID"
];

const { classes: Cc, interfaces: Ci, results: Cr } = Components;

const STANDARDURL_CONTRACTID =
    "@mozilla.org/network/standard-url;1";
const IOSERVICE_CONTRACTID =
    "@mozilla.org/network/io-service;1";

const FTPPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=ftp";
const FTPSPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=ftps";
const SFTPPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=sftp";
const FTPPROT_HANDLER_CID =
    Components.ID("{fd59a43b-2532-4aba-80fb-2f9d58e7f006}");
const FTPSPROT_HANDLER_CID =
    Components.ID("{c8a55d80-be3c-11df-851a-0800200c9a66}");
const SFTPPROT_HANDLER_CID =
    Components.ID("{8ca39389-a7a8-43f1-a502-bf9ce9fdada9}");

const FTP_MIMETYPE = "application/x-ftp";
const FTPS_MIMETYPE = "application/x-ftps";
const SFTP_MIMETYPE = "application/x-sftp";

//XXXgijs: Because necko is annoying and doesn't expose this error flag, we
//         define our own constant for it. Throwing something else will show
//         ugly errors instead of seeminly doing nothing.
const NS_ERROR_MODULE_NETWORK_BASE = 0x804b0000;
const NS_ERROR_NO_CONTENT = NS_ERROR_MODULE_NETWORK_BASE + 17;


function spawnFireFTP(uri) {
    const cpmm = Cc["@mozilla.org/childprocessmessagemanager;1"]
                  .getService(Ci.nsISyncMessageSender);
    cpmm.sendAsyncMessage("FireFTP:SpawnFireFTP", { uri });
}


function FTPProtocolHandler(isSecure)
{
    this.isSecure = isSecure;
}

var protocolFlags = Ci.nsIProtocolHandler.URI_NORELATIVE |
                    Ci.nsIProtocolHandler.ALLOWS_PROXY;
if ("URI_DANGEROUS_TO_LOAD" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE;
}
if ("URI_NON_PERSISTABLE" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_NON_PERSISTABLE;
}
if ("URI_DOES_NOT_RETURN_DATA" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA;
}

FTPProtocolHandler.prototype =
{
    protocolFlags: protocolFlags,

    allowPort(port, scheme)
    {
        // Allow all ports to connect, so long as they are ftp:, ftps: or sftp:
        return (scheme === 'ftp' || scheme === 'ftps' || scheme === 'sftp');
    },

    newURI(spec, charset, baseURI)
    {
        const cls = Cc[STANDARDURL_CONTRACTID];
        const url = cls.createInstance(Ci.nsIStandardURL);
        const port = this.isSecure ? 22 : 21;

        url.init(Ci.nsIStandardURL.URLTYPE_STANDARD, port, spec, charset, baseURI);

        return url.QueryInterface(Ci.nsIURI);
    },

    newChannel(URI)
    {
        const ios = Cc[IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);
        if (!ios.allowPort(URI.port, URI.scheme))
            throw Cr.NS_ERROR_FAILURE;

        return new BogusChannel(URI, this.isSecure);
    },
};


const FTPProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        const protHandler = new FTPProtocolHandler(true);
        protHandler.scheme = "ftp";
        protHandler.defaultPort = 21;
        return protHandler;
    },
};

const FTPSProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        const protHandler = new FTPProtocolHandler(false);
        protHandler.scheme = "ftps";
        protHandler.defaultPort = 21;
        return protHandler;
    },
};


const SFTPProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        const protHandler = new FTPProtocolHandler(true);
        protHandler.scheme = "sftp";
        protHandler.defaultPort = 22;
        return protHandler;
    },
};


/* Bogus FTPS channel used by the FTPProtocolHandler */
function BogusChannel(URI, isSecure)
{
    this.URI = URI;
    this.originalURI = URI;
    this.isSecure = isSecure;
    this.contentType = this.isSecure ? SFTP_MIMETYPE : FTPS_MIMETYPE;
}

BogusChannel.prototype =
{
    /* nsISupports */
    QueryInterface(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIChannel) ||
            iid.equals(Ci.nsIRequest))
        {
            return this;
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    /* nsIChannel */
    loadAttributes: null,
    contentLength: 0,
    owner: null,
    loadGroup: null,
    notificationCallbacks: null,
    securityInfo: null,

    open(observer, context)
    {
        spawnFireFTP(this.URI.spec);
        // We don't throw this (a number, not a real 'resultcode') because it
        // upsets xpconnect if we do (error in the js console).
        Components.returnCode = NS_ERROR_NO_CONTENT;
    },

    asyncOpen(observer, context)
    {
        spawnFireFTP(this.URI.spec);
        // We don't throw this (a number, not a real 'resultcode') because it
        // upsets xpconnect if we do (error in the js console).
        Components.returnCode = NS_ERROR_NO_CONTENT;
    },

    asyncRead(listener, context)
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    /* nsIRequest */
    isPending()
    {
        return true;
    },

    status: Cr.NS_OK,

    cancel(status)
    {
        this.status = status;
    },

    suspend()
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    resume()
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },
};


const FireFTPProtocols =
{
    init()
    {
        const compMgr = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactory(FTPPROT_HANDLER_CID,
                                "FTP protocol handler",
                                FTPPROT_HANDLER_CONTRACTID,
                                FTPProtocolHandlerFactory);
        compMgr.registerFactory(FTPSPROT_HANDLER_CID,
                                "FTPS protocol handler",
                                FTPSPROT_HANDLER_CONTRACTID,
                                FTPSProtocolHandlerFactory);
        compMgr.registerFactory(SFTPPROT_HANDLER_CID,
                                "FTPS protocol handler",
                                SFTPPROT_HANDLER_CONTRACTID,
                                SFTPProtocolHandlerFactory);
    },

    initObsolete(compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactoryLocation(FTPPROT_HANDLER_CID,
                                        "FTP protocol handler",
                                        FTPPROT_HANDLER_CONTRACTID,
                                        fileSpec, location, type);
        compMgr.registerFactoryLocation(FTPSPROT_HANDLER_CID,
                                        "FTPS protocol handler",
                                        FTPSPROT_HANDLER_CONTRACTID,
                                        fileSpec, location, type);
        compMgr.registerFactoryLocation(SFTPPROT_HANDLER_CID,
                                        "SFTP protocol handler",
                                        SFTPPROT_HANDLER_CONTRACTID,
                                        fileSpec, location, type);
    },
};
