/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

const MEDIATOR_CONTRACTID =
    "@mozilla.org/appshell/window-mediator;1";
const ASS_CONTRACTID =
    "@mozilla.org/appshell/appShellService;1";
const RDFS_CONTRACTID =
    "@mozilla.org/rdf/rdf-service;1";
const CATMAN_CONTRACTID =
    "@mozilla.org/categorymanager;1";
const PPMM_CONTRACTID =
    "@mozilla.org/parentprocessmessagemanager;1";

const STARTUP_CID =
    Components.ID("{6f12497c-6491-417c-82ba-83200feeff3c}");


Cu.import("chrome://fireftp/content/js/etc/protocol-handlers.jsm");


function spawnFireFTP(uri, count)
{
    var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
    var prefBranch  = prefService.getBranch("fireftp.");
    var sString  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    sString.data = uri;
    prefBranch.setComplexValue("loadurl", Components.interfaces.nsISupportsString, sString);

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
    var browserWindow = wm.getMostRecentWindow("navigator:browser");
    browserWindow.openUILinkIn("chrome://fireftp/content/fireftp.xul", 'current');
    return true;
}



function ProcessHandler()
{
}

ProcessHandler.prototype =
{
    /* nsISupports */
    QueryInterface(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserver) ||
            iid.equals(Ci.nsIMessageListener))
        {
            return this;
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    /* nsIObserver */
    observe(subject, topic, data)
    {
        if (topic !== "profile-after-change")
            return;

        const ppmm = Cc[PPMM_CONTRACTID].getService(Ci.nsIMessageBroadcaster);
        ppmm.loadProcessScript("chrome://fireftp/content/js/etc/protocol-script.js", true);
        ppmm.addMessageListener("FireFTP:SpawnFireFTP", this);
    },

    /* nsIMessageListener */
    receiveMessage(msg)
    {
        if (msg.name !== "FireFTP:SpawnFireFTP")
            return;

        spawnFireFTP(msg.data.uri);
    },
};


const StartupFactory =
{
    createInstance(outer, iid)
    {
        if (outer)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_NO_INTERFACE;

        // startup:
        return new ProcessHandler();
    },
};


const FireFTPModule =
{
    registerSelf(compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);

        debug("*** Registering ftps protocol handler.\n");
            FireFTPProtocols.initObsolete(compMgr, fileSpec, location, type);

        debug("*** Registering done.\n");
    },

    unregisterSelf(compMgr, fileSpec, location)
    {
    },

    getClassObject(compMgr, cid, iid)
    {
        // Checking if we're disabled in the Chrome Registry.
        var rv;
        try
        {
            const rdfSvc = Cc[RDFS_CONTRACTID].getService(Ci.nsIRDFService);
            const rdfDS = rdfSvc.GetDataSource("rdf:chrome");
            const resSelf = rdfSvc.GetResource("urn:mozilla:package:fireftp");
            const resDisabled = rdfSvc.GetResource("http://www.mozilla.org/rdf/chrome#disabled");
            rv = rdfDS.GetTarget(resSelf, resDisabled, true);
        }
        catch (e)
        {
        }
        if (rv)
            throw Cr.NS_ERROR_NO_INTERFACE;

        if (cid.equals(FTPPROT_HANDLER_CID))
            return FTPProtocolHandlerFactory;

        if (cid.equals(FTPSPROT_HANDLER_CID))
            return FTPSProtocolHandlerFactory;

        if (cid.equals(SFTPPROT_HANDLER_CID))
            return SFTPProtocolHandlerFactory;

        if (cid.equals(STARTUP_CID))
            return StartupFactory;

        if (!iid.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    canUnload(compMgr)
    {
        return true;
    },
};


/* entrypoint */
function NSGetModule(compMgr, fileSpec)
{
    return FireFTPModule;
}

function NSGetFactory(cid)
{
    return FireFTPModule.getClassObject(null, cid, null);
}
