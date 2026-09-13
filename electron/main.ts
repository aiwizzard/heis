const { app, BrowserWindow, shell, dialog, net, protocol } = require('electron');
const path = require('path');
const { pathToFileURL } = require('node:url');
const { register: registerLocalInference } = require('./lib/localInference');
const { register: registerWan2gp } = require('./lib/wan2gpProvider');
const { register: registerCommercialServices } = require('./lib/commercialServices');
const { NextServer } = require('./lib/nextServer');
const { UpdaterService } = require('./lib/updater');
const { LocalMediaService } = require('./lib/localMediaService');

protocol.registerSchemesAsPrivileged([{ scheme: 'heis-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    try {
        dialog.showErrorBox('heis — Unexpected Error', err && err.stack ? err.stack : String(err));
    } catch (_) {
        // dialog unavailable this early; the console log above is the fallback
    }
});

// Ubuntu 24.04+ sets kernel.apparmor_restrict_unprivileged_userns=1 which
// blocks Chromium's user namespace sandbox. The .deb package ships an AppArmor
// profile that grants the permission cleanly. When running the AppImage on an
// affected system, run once: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
// or pass --no-sandbox on the command line.
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}

let mainWindow;
let commercialServices;
const pendingAuthCallbacks = [];
const desktopRenderer = new NextServer();
const updater = new UpdaterService();

function createWindow(rendererUrl) {
    const isMac = process.platform === 'darwin';

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        webPreferences: {
            webSecurity: true,
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
        },
        ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
        backgroundColor: '#0d0d0d',
        show: false,
        title: 'heis',
    });

    mainWindow.loadURL(`${rendererUrl}/studio`).catch((err) => {
        console.error('Failed to load the Next.js studio:', err);
        mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (event, code, desc) => {
        console.error('did-fail-load:', code, desc);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    const localMediaService = new LocalMediaService(app.getPath('userData'), process.resourcesPath);
    protocol.handle('heis-media', (request) => net.fetch(pathToFileURL(localMediaService.resolveUrl(request.url)).toString()));
    app.setAsDefaultProtocolClient('heis');
    const rendererUrl = await desktopRenderer.start();
    createWindow(rendererUrl);

    try {
        registerLocalInference();
        registerWan2gp();
        commercialServices = registerCommercialServices(localMediaService);
        updater.start();
        for (const callbackUrl of pendingAuthCallbacks.splice(0)) {
            void commercialServices.handleAuthCallback(callbackUrl).catch(reportAuthCallbackError);
        }
    } catch (err) {
        console.error('Failed to register local-ai/wan2gp handlers:', err);
        dialog.showErrorBox(
            'Local AI features unavailable',
            `heis started, but local model support failed to initialize:\n\n${err.message}`
        );
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(rendererUrl);
        }
    });
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!commercialServices) {
        pendingAuthCallbacks.push(url);
        return;
    }
    void commercialServices.handleAuthCallback(url).catch(reportAuthCallbackError);
});

function reportAuthCallbackError(error) {
    console.error('Failed to complete Heis sign-in:', error);
    dialog.showErrorBox('Heis sign-in failed', error?.message || String(error));
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    commercialServices?.dispose();
    desktopRenderer.stop();
});
