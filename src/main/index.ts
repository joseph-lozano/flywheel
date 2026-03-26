import { app, BaseWindow, WebContentsView, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { PanelManager } from './panel-manager'
import { PtyManager } from './pty-manager'
import { ProjectStore } from './project-store'
import { WorktreeManager } from './worktree-manager'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { goldenAngleColor } from '../shared/constants'
import type { Row, Project } from '../shared/types'

let mainWindow: BaseWindow
let chromeView: WebContentsView
let panelManager: PanelManager
let ptyManager: PtyManager
let projectStore: ProjectStore
let worktreeManager: WorktreeManager

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

  projectStore = new ProjectStore()
  worktreeManager = new WorktreeManager()

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
  ipcMain.on('pty:create', (_event, data: { panelId: string; cwd?: string }) => {
    ptyManager.create(data.panelId, data.cwd)
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
    type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
  }) => {
    // Enrich terminal panels with busy state from PTY
    if (data.type === 'terminal') {
      data.busy = ptyManager.isBusy(data.panelId)
    }
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

  ipcMain.on('panel:focus-chrome', (_event, data: { panelId: string }) => {
    const view = panelManager.getPanelChromeView(data.panelId)
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

  // Project management
  ipcMain.handle('project:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Add Project'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const dirPath = result.filePaths[0]

    let defaultBranch = 'main'
    try {
      defaultBranch = await worktreeManager.getDefaultBranch(dirPath)
    } catch {
      // Not a git repo or no branch — use 'main'
    }

    const project = projectStore.addProject(dirPath, defaultBranch)
    return project
  })

  ipcMain.handle('project:remove', async (_event, data: { projectId: string; deleteWorktrees: boolean }) => {
    const project = projectStore.getProjects().find(p => p.id === data.projectId)
    const errors: string[] = []
    if (project) {
      for (const row of project.rows) {
        ptyManager.killByPrefix(row.id)
        panelManager.destroyByPrefix(row.id)
      }
      if (data.deleteWorktrees) {
        for (const row of project.rows) {
          if (row.isDefault) continue
          try {
            await worktreeManager.removeWorktree(project.path, row.path)
          } catch (err) {
            errors.push((err as Error).message)
          }
        }
      }
    }
    projectStore.removeProject(data.projectId)
    return { errors }
  })

  ipcMain.on('project:switch', (_event, data: { projectId: string }) => {
    projectStore.setActiveProjectId(data.projectId)
  })

  ipcMain.handle('project:list', () => {
    return {
      projects: projectStore.getProjects(),
      activeProjectId: projectStore.getActiveProjectId()
    }
  })

  // Prefix-based panel management
  ipcMain.on('panel:hide-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.hideByPrefix(data.prefix)
  })

  ipcMain.on('panel:show-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.showByPrefix(data.prefix)
  })

  ipcMain.on('panel:set-sidebar-width', (_event, data: { width: number }) => {
    panelManager.sidebarWidth = data.width
  })

  ipcMain.on('panel:destroy-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.destroyByPrefix(data.prefix)
  })

  ipcMain.on('project:set-expanded', (_event, data: { projectId: string; expanded: boolean }) => {
    projectStore.setExpanded(data.projectId, data.expanded)
  })

  ipcMain.handle('row:check-path', (_event, data: { path: string }) => {
    return { exists: existsSync(data.path) }
  })

  // Row management
  ipcMain.handle('row:create', async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find(p => p.id === data.projectId)
    if (!project) return { error: 'Project not found' }

    const isGit = await worktreeManager.isGitRepo(project.path)
    if (!isGit) return { error: 'Not a git repository' }

    const name = worktreeManager.generateName(projectStore.nextWorktreeCounter())
    const worktreePath = worktreeManager.getWorktreePath(project.name, name)

    try {
      const base = await worktreeManager.resolveBase(project.path)
      await worktreeManager.createWorktree(project.path, name, worktreePath, base)
    } catch (err) {
      return { error: `Failed to create worktree: ${(err as Error).message}` }
    }

    const row: Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: name,
      path: worktreePath,
      color: goldenAngleColor(project.rows.length),
      isDefault: false
    }

    projectStore.addRow(project.id, row)
    projectStore.setActiveRowId(project.id, row.id)

    return { row }
  })

  ipcMain.handle('row:remove', async (_event, data: { rowId: string; deleteFromDisk: boolean }) => {
    const projects = projectStore.getProjects()
    let targetProject: Project | undefined
    let targetRow: Row | undefined

    for (const p of projects) {
      const row = p.rows.find(r => r.id === data.rowId)
      if (row) { targetProject = p; targetRow = row; break }
    }

    if (!targetProject || !targetRow) return { error: 'Row not found' }
    if (targetRow.isDefault) return { error: 'Cannot remove the default row' }

    // Kill PTYs and destroy panels for this row
    ptyManager.killByPrefix(data.rowId)
    panelManager.destroyByPrefix(data.rowId)

    let diskError: string | undefined
    if (data.deleteFromDisk) {
      try {
        await worktreeManager.removeWorktree(targetProject.path, targetRow.path)
      } catch (err) {
        diskError = (err as Error).message
      }
    }

    projectStore.removeRow(targetProject.id, data.rowId)
    return { error: diskError }
  })

  ipcMain.handle('row:discover', async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find(p => p.id === data.projectId)
    if (!project) return { rows: [] }

    const worktrees = await worktreeManager.listWorktrees(project.path)
    const existingPaths = new Set(project.rows.map(r => r.path))
    const newRows: Row[] = []

    for (const wt of worktrees) {
      if (existingPaths.has(wt.path)) continue
      if (wt.path === project.path) continue // Skip main worktree
      const row: Row = {
        id: randomUUID(),
        projectId: project.id,
        branch: wt.branch,
        path: wt.path,
        color: goldenAngleColor(project.rows.length + newRows.length),
        isDefault: false
      }
      newRows.push(row)
      projectStore.addRow(project.id, row)
    }

    return { rows: newRows }
  })

  ipcMain.handle('row:check-branches', async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find(p => p.id === data.projectId)
    if (!project) return { updates: [] }

    const worktrees = await worktreeManager.listWorktrees(project.path)
    const pathToBranch = new Map(worktrees.map(wt => [wt.path, wt.branch]))
    const updates: { rowId: string; branch: string }[] = []

    for (const row of project.rows) {
      const currentBranch = pathToBranch.get(row.path)
      if (currentBranch && currentBranch !== row.branch) {
        updates.push({ rowId: row.id, branch: currentBranch })
        projectStore.updateRowBranch(project.id, row.id, currentBranch)
      }
    }

    return { updates }
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
      label: 'Projects',
      submenu: [
        {
          label: 'Add Project',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'add-project' })
        },
        { type: 'separator' },
        {
          label: 'Previous Project',
          accelerator: 'Command+Shift+Up',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'prev-project' })
        },
        {
          label: 'Next Project',
          accelerator: 'Command+Shift+Down',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'next-project' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Switch to Project ${i + 1}`,
          accelerator: `CommandOrControl+Shift+${i + 1}`,
          click: () => chromeView.webContents.send('shortcut:action', { type: 'switch-project', index: i })
        }))
      ]
    },
    {
      label: 'Rows',
      submenu: [
        {
          label: 'New Worktree Row',
          accelerator: 'CommandOrControl+N',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-row' })
        },
        { type: 'separator' },
        {
          label: 'Previous Row',
          accelerator: 'Command+Up',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'prev-row' })
        },
        {
          label: 'Next Row',
          accelerator: 'Command+Down',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'next-row' })
        }
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

// Isolate dev instances to a separate userData directory
// so they can't corrupt production electron-store data
if (process.env['ELECTRON_RENDERER_URL']) {
  app.setPath('userData', app.getPath('userData') + '-dev')
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
