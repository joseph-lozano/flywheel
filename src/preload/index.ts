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
  },

  // Focus management
  focusPanel: (panelId: string) => {
    ipcRenderer.send('panel:focus', { panelId })
  },
  focusPanelChrome: (panelId: string) => {
    ipcRenderer.send('panel:focus-chrome', { panelId })
  },
  blurAllPanels: () => {
    ipcRenderer.send('panel:blur-all')
  },
  onPanelFocused: (callback: (data: { panelId: string }) => void) => {
    ipcRenderer.on('panel:focused', (_event, data) => callback(data))
  },
  onPanelTitle: (callback: (data: { panelId: string; title: string }) => void) => {
    ipcRenderer.on('panel:title', (_event, data) => callback(data))
  },
  hideAllPanels: () => {
    ipcRenderer.send('panel:hide-all')
  },
  showAllPanels: () => {
    ipcRenderer.send('panel:show-all')
  },

  // Browser panels
  createBrowserPanel: (id: string, url: string) => {
    ipcRenderer.send('panel:create', { id, type: 'browser', url })
  },
  reloadBrowser: (panelId: string) => {
    ipcRenderer.send('browser:reload', { panelId })
  },
  goBackBrowser: (panelId: string) => {
    ipcRenderer.send('browser:go-back', { panelId })
  },
  goForwardBrowser: (panelId: string) => {
    ipcRenderer.send('browser:go-forward', { panelId })
  },
  onBrowserUrlChanged: (callback: (data: { panelId: string; url: string; canGoBack: boolean; canGoForward: boolean }) => void) => {
    ipcRenderer.on('browser:url-changed', (_event, data) => callback(data))
  },
  onBrowserTitleChanged: (callback: (data: { panelId: string; title: string }) => void) => {
    ipcRenderer.on('browser:title-changed', (_event, data) => callback(data))
  },
  sendChromeState: (panelId: string, state: {
    position: number; label: string; focused: boolean;
    type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
  }) => {
    ipcRenderer.send('panel:send-chrome-state', { panelId, ...state })
  },
  onBrowserOpenUrl: (callback: (data: { url: string }) => void) => {
    ipcRenderer.on('browser:open-url', (_event, data) => callback(data))
  },
  onPanelClosed: (callback: (data: { panelId: string }) => void) => {
    ipcRenderer.on('panel:closed', (_event, data) => callback(data))
  }
})
