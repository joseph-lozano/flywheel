import { contextBridge, ipcRenderer } from "electron";
import type { FlywheelConfig } from "../shared/config";

// Horizontal scroll → strip (existing behavior, unchanged)
// Vertical scroll → consumed by xterm.js natively (no forwarding needed)
window.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaX !== 0) {
      ipcRenderer.send("panel:wheel", { deltaX: event.deltaX });
    }
  },
  { passive: true },
);

// PTY communication
contextBridge.exposeInMainWorld("pty", {
  input: (panelId: string, data: string) => {
    ipcRenderer.send("pty:input", { panelId, data });
  },
  onOutput: (callback: (data: string) => void) => {
    ipcRenderer.on("pty:output", (_event, payload: { data: string }) => {
      callback(payload.data);
    });
  },
  resize: (panelId: string, cols: number, rows: number) => {
    ipcRenderer.send("pty:resize", { panelId, cols, rows });
  },
  onExit: (callback: (exitCode: number) => void) => {
    ipcRenderer.on("pty:exit", (_event, payload: { exitCode: number }) => {
      callback(payload.exitCode);
    });
  },
  getPanelId: (): string => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("panelId");
    if (!id) console.error("panel preload: panelId missing from URL query string");
    return id ?? "";
  },
  openUrl: (url: string) => {
    ipcRenderer.send("browser:open-url-from-terminal", { url });
  },
  onChromeState: (
    callback: (state: { position: number; label: string; focused: boolean }) => void,
  ) => {
    ipcRenderer.on(
      "panel:chrome-state",
      (_event, state: { position: number; label: string; focused: boolean }) => {
        callback(state);
      },
    );
  },
  getConfig: (): Promise<{ terminal: { fontFamily: string; fontSize: number } }> => {
    return ipcRenderer
      .invoke("config:get-all")
      .then((config: FlywheelConfig) => config.preferences);
  },
  onConfigUpdated: (callback: (config: FlywheelConfig) => void) => {
    ipcRenderer.on("config:updated", (_event, config: FlywheelConfig) => {
      callback(config);
    });
  },
  onSetFontSize: (callback: (data: { fontSize: number }) => void) => {
    ipcRenderer.on("terminal:set-font-size", (_event, data: { fontSize: number }) => {
      callback(data);
    });
  },
  onSetClip: (callback: (data: { clip: number; fullWidth: number }) => void) => {
    ipcRenderer.on("terminal:set-clip", (_event, data: { clip: number; fullWidth: number }) => {
      callback(data);
    });
  },
  onClear: (callback: () => void) => {
    ipcRenderer.on("terminal:clear", () => {
      callback();
    });
  },
  closePanel: (panelId: string) => {
    ipcRenderer.send("panel:close-request", { panelId });
  },
});
