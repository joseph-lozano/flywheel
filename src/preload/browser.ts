import { contextBridge, ipcRenderer } from "electron";

const params = new URLSearchParams(window.location.search);
const panelId = params.get("panelId") ?? "";

// Forward horizontal scroll events to the strip
window.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaX !== 0) {
      ipcRenderer.send("panel:wheel", { deltaX: event.deltaX });
    }
  },
  { passive: true },
);

contextBridge.exposeInMainWorld("browserHost", {
  panelId,
  initialUrl: params.get("url") ?? "about:blank",
  navigate: (url: string) => {
    ipcRenderer.send("browser:navigate-from-host", { panelId, url });
  },
  goBack: () => {
    ipcRenderer.send("browser:go-back", { panelId });
  },
  goForward: () => {
    ipcRenderer.send("browser:go-forward", { panelId });
  },
  reload: () => {
    ipcRenderer.send("browser:reload", { panelId });
  },
  closePanel: () => {
    ipcRenderer.send("panel:close-request", { panelId });
  },
  onChromeState: (
    callback: (state: {
      position: number;
      label: string;
      focused: boolean;
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }) => void,
  ) => {
    ipcRenderer.on(
      "panel:chrome-state",
      (
        _event,
        state: {
          position: number;
          label: string;
          focused: boolean;
          url: string;
          canGoBack: boolean;
          canGoForward: boolean;
        },
      ) => {
        callback(state);
      },
    );
  },
});
