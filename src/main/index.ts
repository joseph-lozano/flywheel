import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { PanelManager } from './panel-manager'
import { PtyManager } from './pty-manager'

let mainWindow: BaseWindow
let chromeView: WebContentsView
let panelManager: PanelManager
let ptyManager: PtyManager

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Flywheel'
  })

  chromeView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.contentView.addChildView(chromeView)

  const { width, height } = mainWindow.getContentBounds()
  chromeView.setBounds({ x: 0, y: 0, width, height })

  if (process.env['ELECTRON_RENDERER_URL']) {
    chromeView.webContents.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/renderer/index.html`)
  } else {
    chromeView.webContents.loadFile(join(__dirname, '../renderer/renderer/index.html'))
  }

  panelManager = new PanelManager(mainWindow, chromeView)

  ptyManager = new PtyManager(
    (panelId, channel, data) => {
      const view = panelManager.getPanelView(panelId)
      if (view) view.webContents.send(channel, data)
    },
    (channel, data) => {
      chromeView.webContents.send(channel, data)
    }
  )

  setupIpcHandlers()
  setupShortcuts()

  mainWindow.on('resize', () => {
    const bounds = mainWindow.getContentBounds()
    chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  })

  chromeView.webContents.once('did-finish-load', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => {
    ptyManager.dispose()
    panelManager.destroyAll()
  })
}

function setupIpcHandlers(): void {
  ipcMain.on('panel:create', (_event, data: { id: string; color?: string; type?: string; url?: string }) => {
    if (data.type === 'terminal') {
      panelManager.createPanel(data.id, { type: 'terminal' })
    } else if (data.type === 'browser') {
      panelManager.createPanel(data.id, { type: 'browser', url: data.url || 'about:blank' })
    } else {
      panelManager.createPanel(data.id, { color: data.color || '#333' })
    }
  })

  ipcMain.on('panel:destroy', (_event, id: string) => {
    ptyManager.kill(id)
    panelManager.destroyPanel(id)
  })

  ipcMain.on('panel:update-bounds', (_event, updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>) => {
    panelManager.updateBounds(updates)
  })

  ipcMain.on('panel:wheel', (_event, data: { deltaX: number }) => {
    chromeView.webContents.send('scroll:wheel', data)
  })

  ipcMain.handle('debug:stats', () => {
    const mem = process.memoryUsage()
    return {
      panelViewCount: panelManager.panelCount,
      mainMemoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024)
    }
  })

  // PTY handlers
  ipcMain.on('pty:create', (_event, data: { panelId: string }) => {
    ptyManager.create(data.panelId)
  })

  ipcMain.on('pty:input', (_event, data: { panelId: string; data: string }) => {
    ptyManager.write(data.panelId, data.data)
  })

  ipcMain.on('pty:resize', (_event, data: { panelId: string; cols: number; rows: number }) => {
    ptyManager.resize(data.panelId, data.cols, data.rows)
  })

  // Browser navigation
  ipcMain.on('browser:navigate', (_event, data: { panelId: string; url: string }) => {
    panelManager.navigateBrowser(data.panelId, data.url)
  })

  ipcMain.on('browser:reload', (_event, data: { panelId: string }) => {
    panelManager.reloadBrowser(data.panelId)
  })

  ipcMain.on('browser:go-back', (_event, data: { panelId: string }) => {
    panelManager.goBackBrowser(data.panelId)
  })

  ipcMain.on('browser:go-forward', (_event, data: { panelId: string }) => {
    panelManager.goForwardBrowser(data.panelId)
  })

  // Browser host chrome strip → navigate
  ipcMain.on('browser:navigate-from-host', (_event, data: { panelId: string; url: string }) => {
    panelManager.navigateBrowser(data.panelId, data.url)
  })

  // Chrome view → send chrome state to a panel's views
  ipcMain.on('panel:send-chrome-state', (_event, data: {
    panelId: string; position: number; label: string; focused: boolean;
    type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean
  }) => {
    panelManager.sendChromeState(data.panelId, data)
  })

  // Terminal link detection → open as browser panel
  ipcMain.on('browser:open-url-from-terminal', (_event, data: { url: string }) => {
    chromeView.webContents.send('browser:open-url', { url: data.url })
  })

  // Close confirmation flow
  ipcMain.on('panel:close-request', (_event, data: { panelId: string }) => {
    // Browser panels have no PTY — close immediately
    if (!ptyManager.hasPty(data.panelId)) {
      panelManager.destroyPanel(data.panelId)
      chromeView.webContents.send('panel:closed', { panelId: data.panelId })
      return
    }

    if (ptyManager.isBusy(data.panelId)) {
      const processName = ptyManager.getForegroundProcess(data.panelId) || 'unknown'
      chromeView.webContents.send('pty:confirm-close', {
        panelId: data.panelId,
        processName
      })
    } else {
      // kill() sets disposed=true before calling pty.kill(), which suppresses the
      // real onExit callback. We must send a synthetic pty:exit so the chrome view
      // knows to remove the panel from the store.
      ptyManager.kill(data.panelId)
      panelManager.destroyPanel(data.panelId)
      chromeView.webContents.send('pty:exit', { panelId: data.panelId, exitCode: 0 })
    }
  })

  ipcMain.on('pty:confirm-close-response', (_event, data: { panelId: string; confirmed: boolean }) => {
    if (data.confirmed) {
      ptyManager.kill(data.panelId)
      panelManager.destroyPanel(data.panelId)
      chromeView.webContents.send('pty:exit', { panelId: data.panelId, exitCode: -1 })
    }
  })

  // Focus management
  ipcMain.on('panel:focus', (_event, data: { panelId: string }) => {
    const view = panelManager.getPanelView(data.panelId)
    if (view) view.webContents.focus()
  })

  ipcMain.on('panel:blur-all', () => {
    chromeView.webContents.focus()
  })

  ipcMain.on('panel:hide-all', () => {
    panelManager.hideAll()
  })

  ipcMain.on('panel:show-all', () => {
    panelManager.showAll()
  })
}

function setupShortcuts(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Flywheel',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Panels',
      submenu: [
        {
          label: 'Focus Left',
          accelerator: 'Command+Left',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-left' })
        },
        {
          label: 'Focus Right',
          accelerator: 'Command+Right',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-right' })
        },
        {
          label: 'Swap Left',
          accelerator: 'Command+Shift+Left',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'swap-left' })
        },
        {
          label: 'Swap Right',
          accelerator: 'Command+Shift+Right',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'swap-right' })
        },
        { type: 'separator' },
        {
          label: 'New Terminal',
          accelerator: 'CommandOrControl+T',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-panel' })
        },
        {
          label: 'New Browser',
          accelerator: 'CommandOrControl+B',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-browser' })
        },
        {
          label: 'Close Panel',
          accelerator: 'CommandOrControl+W',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'close-panel' })
        },
        {
          label: 'Blur Panel',
          accelerator: 'CommandOrControl+G',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'blur-panel' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Jump to Panel ${i + 1}`,
          accelerator: `CommandOrControl+${i + 1}`,
          click: () => chromeView.webContents.send('shortcut:action', { type: 'jump-to', index: i })
        }))
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Browser Panel',
          accelerator: 'CommandOrControl+R',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'reload-browser' })
        },
        {
          label: 'Browser Back',
          accelerator: 'Command+[',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'browser-back' })
        },
        {
          label: 'Browser Forward',
          accelerator: 'Command+]',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'browser-forward' })
        },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
