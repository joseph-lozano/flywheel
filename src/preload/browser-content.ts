import { ipcRenderer } from "electron";

// Forward horizontal scroll events to the strip.
// Browser content loads untrusted URLs — no contextBridge, just wheel forwarding.
window.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaX !== 0) {
      ipcRenderer.send("panel:wheel", { deltaX: event.deltaX });
    }
  },
  { passive: true },
);
