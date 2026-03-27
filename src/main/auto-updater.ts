import { dialog } from "electron";
import { autoUpdater } from "electron-updater";

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `Version ${info.version} has been downloaded. Restart to install?`,
        buttons: ["Restart", "Later"],
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.error("Auto-update check failed:", err instanceof Error ? err.message : err);
  });
}
