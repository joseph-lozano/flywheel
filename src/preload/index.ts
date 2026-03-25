import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Existing panel management
  createPanel: (id: string, color: string) => {
    ipcRenderer.send('panel:create', { id, color })
  },
  createTerminalPanel: (id: string) => {
    ipcRenderer.send('panel:create', { id, type: 'terminal' })
  },
  destroyPanel: (id: string) => {
    ipcRenderer.send('panel:destroy', id)
  },
  updateBounds: (updates: Array<{ panelId: string; bounds: { x: number; y: number; width: number; height: number }; visible: boolean }>) => {
    ipcRenderer.send('panel:update-bounds', updates)
  },
  onWheelEvent: (callback: (data: { deltaX: number }) => void) => {
    ipcRenderer.on('scroll:wheel', (_event, data) => callback(data))
  },
  onShortcut: (callback: (action: { type: string; index?: number }) => void) => {
    ipcRenderer.on('shortcut:action', (_event, action) => callback(action))
  },
  getDebugStats: (): Promise<{ panelViewCount: number; mainMemoryMB: number; heapUsedMB: number }> => {
    return ipcRenderer.invoke('debug:stats')
  },

  // New: PTY lifecycle
  createTerminal: (panelId: string) => {
    ipcRenderer.send('pty:create', { panelId })
  },
  onPtyExit: (callback: (data: { panelId: string; exitCode: number }) => void) => {
    ipcRenderer.on('pty:exit', (_event, data) => callback(data))
  },

  // New: Close with busy-check
  closePanel: (panelId: string) => {
    ipcRenderer.send('panel:close-request', { panelId })
  },
  onConfirmClose: (callback: (data: { panelId: string; processName: string }) => void) => {
    ipcRenderer.on('pty:confirm-close', (_event, data) => callback(data))
  },
  confirmCloseResponse: (panelId: string, confirmed: boolean) => {
    ipcRenderer.send('pty:confirm-close-response', { panelId, confirmed })
  }
})
