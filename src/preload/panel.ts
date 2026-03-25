import { contextBridge, ipcRenderer } from 'electron'

// Horizontal scroll → strip (existing behavior, unchanged)
// Vertical scroll → consumed by xterm.js natively (no forwarding needed)
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })

// PTY communication
contextBridge.exposeInMainWorld('pty', {
  input: (panelId: string, data: string) => {
    ipcRenderer.send('pty:input', { panelId, data })
  },
  onOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('pty:output', (_event, payload: { data: string }) => callback(payload.data))
  },
  resize: (panelId: string, cols: number, rows: number) => {
    ipcRenderer.send('pty:resize', { panelId, cols, rows })
  },
  onExit: (callback: (exitCode: number) => void) => {
    ipcRenderer.on('pty:exit', (_event, payload: { exitCode: number }) => callback(payload.exitCode))
  },
  getPanelId: (): string => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('panelId')
    if (!id) console.error('panel preload: panelId missing from URL query string')
    return id || ''
  }
})
