const { app, BrowserWindow, shell, dialog, net, protocol } = require('electron');
const path = require('path');
const { pathToFileURL } = require('node:url');
const { register: registerLocalInference } = require('./lib/localInference');
const { register: registerWan2gp } = require('./lib/wan2gpProvider');
const { register: registerCommercialServices } = require('./lib/commercialServices');
const { installDesktopProtocol, desktopUrl } = require('./lib/desktopRenderer');
const { UpdaterService } = require('./lib/updater');
const { LocalMediaService } = require('./lib/localMediaService');
const { ProjectService } = require('./lib/projectService');
const { registerEditor } = require('./editor/register');

protocol.registerSchemesAsPrivileged([{ scheme: 'heis-project', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }, { scheme: 'heis-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, { scheme: 'heis-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    try {
        dialog.showErrorBox('Heis: Unexpected Error', err && err.stack ? err.stack : String(err));
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

const updater = new UpdaterService();

function createWindow(rendererUrl) {
    const isMac = process.platform === 'darwin';

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 640,
        webPreferences: {
            webSecurity: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        // Center the native 14px controls in the shared 48px app header.
        ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 17 } } : {}),
        backgroundColor: '#101113',
        show: false,
        title: 'Heis',
        icon: path.join(app.isPackaged ? path.join(process.resourcesPath, 'desktop') : path.join(app.getAppPath(), 'public'), 'brand', 'heis-icon-256.png'),
    });

    mainWindow.loadURL(`${rendererUrl}/studio`).catch((err) => {
        console.error('Failed to load the desktop studio:', err);
        mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (event, code, desc) => {
        console.error('did-fail-load:', code, desc);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        const expected = new URL(rendererUrl); const target = new URL(url);
        if(target.protocol !== expected.protocol || target.host !== expected.host) event.preventDefault();
    });
    mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        app.dock?.setIcon(path.join(app.isPackaged ? path.join(process.resourcesPath, 'desktop') : path.join(app.getAppPath(), 'public'), 'brand', 'heis-icon-1024.png'));
    }
    const localMediaService = new LocalMediaService(app.getPath('userData'), process.resourcesPath);
    const projectService = new ProjectService(app.getPath('userData'));
    const editorService = registerEditor();
    protocol.handle('heis-media', (request) => net.fetch(pathToFileURL(localMediaService.resolveUrl(request.url)).toString()));
    app.setAsDefaultProtocolClient('heis');
    installDesktopProtocol();
    const rendererUrl = desktopUrl();
    try {
        registerLocalInference();
        registerWan2gp();
        commercialServices = registerCommercialServices(localMediaService, projectService, editorService);
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

    createWindow(rendererUrl);

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
    
});
