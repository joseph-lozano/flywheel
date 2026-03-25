import { ipcRenderer } from 'electron'

window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })
