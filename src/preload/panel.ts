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
  },
  openUrl: (url: string) => {
    ipcRenderer.send('browser:open-url-from-terminal', { url })
  },
  onChromeState: (callback: (state: { position: number; label: string; focused: boolean }) => void) => {
    ipcRenderer.on('panel:chrome-state', (_event, state) => callback(state))
  },
  getConfig: (): Promise<{ terminal: { fontFamily: string; fontSize: number } }> => {
    return ipcRenderer.invoke('config:get-all').then((config: any) => config.preferences)
  },
  onConfigUpdated: (callback: (config: any) => void) => {
    ipcRenderer.on('config:updated', (_event, config) => callback(config))
  },
  onSetFontSize: (callback: (data: { fontSize: number }) => void) => {
    ipcRenderer.on('terminal:set-font-size', (_event, data) => callback(data))
  },
})
