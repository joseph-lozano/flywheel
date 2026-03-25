import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  createPanel: (id: string, color: string) => {
    ipcRenderer.send('panel:create', { id, color })
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
  }
})
