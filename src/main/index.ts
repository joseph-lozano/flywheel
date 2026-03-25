import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { PanelManager } from './panel-manager'

let mainWindow: BaseWindow
let chromeView: WebContentsView
let panelManager: PanelManager

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
    chromeView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chromeView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  panelManager = new PanelManager(mainWindow, chromeView)

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
    panelManager.destroyAll()
  })
}

function setupIpcHandlers(): void {
  ipcMain.on('panel:create', (_event, data: { id: string; color: string }) => {
    panelManager.createPanel(data.id, data.color)
  })

  ipcMain.on('panel:destroy', (_event, id: string) => {
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
        { type: 'separator' },
        {
          label: 'New Panel',
          accelerator: 'CommandOrControl+T',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-panel' })
        },
        {
          label: 'Close Panel',
          accelerator: 'CommandOrControl+W',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'close-panel' })
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
        { role: 'reload' as const },
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
