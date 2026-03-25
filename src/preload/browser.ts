import { ipcRenderer } from 'electron'

// Forward horizontal scroll events to the strip for Niri-style scrolling.
// Browser panels load arbitrary URLs so we keep this preload minimal —
// no contextBridge exposure, just wheel forwarding.
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })
