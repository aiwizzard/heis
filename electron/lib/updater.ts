const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

class UpdaterService {
  start(): void {
    if (!app.isPackaged || process.env.HEIS_DISABLE_UPDATES === "1") return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = true;
    autoUpdater.on("error", (error: Error) => console.error("Heis update check failed:", error.message));
    void autoUpdater.checkForUpdates().catch((error: Error) => console.error("Heis update check failed:", error.message));
  }
}

module.exports = { UpdaterService };
