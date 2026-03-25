import { WebContentsView, BaseWindow } from 'electron'
import { join } from 'path'

interface ManagedPanel {
  id: string
  type: 'terminal' | 'placeholder' | 'browser'
  view: WebContentsView
}

export class PanelManager {
  private panels = new Map<string, ManagedPanel>()
  private window: BaseWindow
  private chromeView: WebContentsView

  constructor(window: BaseWindow, chromeView: WebContentsView) {
    this.window = window
    this.chromeView = chromeView
  }

  createPanel(id: string, options: { type: 'terminal' } | { type: 'browser'; url: string } | { type?: 'placeholder'; color: string }): void {
    if (this.panels.has(id)) return

    const panelType = options.type || 'placeholder'

    const preloadFile = panelType === 'browser' ? '../preload/browser.js' : '../preload/panel.js'
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, preloadFile),
        sandbox: panelType === 'browser'
      }
    })

    if (panelType === 'terminal') {
      if (process.env['ELECTRON_RENDERER_URL']) {
        view.webContents.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/terminal/index.html?panelId=${id}`)
      } else {
        view.webContents.loadFile(join(__dirname, '../renderer/terminal/index.html'), {
          query: { panelId: id }
        })
      }
    } else if (panelType === 'browser') {
      const url = 'url' in options ? options.url : 'about:blank'
      view.webContents.loadURL(url)

      // Intercept target="_blank" / window.open → open as new strip panel
      view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        this.chromeView.webContents.send('browser:open-url', { url: targetUrl })
        return { action: 'deny' }
      })

      // Track URL changes → update address bar in chrome view
      view.webContents.on('did-navigate', (_event, navUrl) => {
        this.chromeView.webContents.send('browser:url-changed', { panelId: id, url: navUrl })
        this.chromeView.webContents.send('browser:nav-state-changed', {
          panelId: id,
          canGoBack: view.webContents.canGoBack(),
          canGoForward: view.webContents.canGoForward()
        })
      })
      view.webContents.on('did-navigate-in-page', (_event, navUrl) => {
        this.chromeView.webContents.send('browser:url-changed', { panelId: id, url: navUrl })
        this.chromeView.webContents.send('browser:nav-state-changed', {
          panelId: id,
          canGoBack: view.webContents.canGoBack(),
          canGoForward: view.webContents.canGoForward()
        })
      })
    } else {
      const color = 'color' in options ? options.color : '#333'
      view.setBackgroundColor(color)
      view.webContents.loadURL(
        `data:text/html,<html><body style="margin:0;background:${encodeURIComponent(color)};height:100vh"></body></html>`
      )
    }

    // Intercept app shortcuts before xterm.js / browser content consumes them.
    // Menu accelerators don't fire when a child WebContentsView has focus,
    // so we manually forward matching key combos to the chrome view.
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.meta) return

      let action: { type: string; index?: number } | null = null

      if (input.shift) {
        if (input.key === 'ArrowLeft') action = { type: 'swap-left' }
        else if (input.key === 'ArrowRight') action = { type: 'swap-right' }
      } else {
        if (input.key === 'ArrowLeft') action = { type: 'focus-left' }
        else if (input.key === 'ArrowRight') action = { type: 'focus-right' }
        else if (input.key === 't') action = { type: 'new-panel' }
        else if (input.key === 'b') action = { type: 'new-browser' }
        else if (input.key === 'w') action = { type: 'close-panel' }
        else if (input.key === 'g') action = { type: 'blur-panel' }
        else if (input.key === 'r') action = { type: 'reload-browser' }
        else if (input.key === '[') action = { type: 'browser-back' }
        else if (input.key === ']') action = { type: 'browser-forward' }
        else if (input.key >= '1' && input.key <= '9') action = { type: 'jump-to', index: parseInt(input.key) - 1 }
      }

      if (action) {
        event.preventDefault()
        this.chromeView.webContents.send('shortcut:action', action)
      }
    })

    // When a panel gains focus via click, notify chrome view so it can update focusedIndex
    view.webContents.on('focus', () => {
      this.chromeView.webContents.send('panel:focused', { panelId: id })
    })

    this.window.contentView.addChildView(view)
    this.panels.set(id, { id, type: panelType, view })
  }

  navigateBrowser(id: string, url: string): void {
    const panel = this.panels.get(id)
    if (!panel || panel.type !== 'browser') return
    panel.view.webContents.loadURL(url)
  }

  reloadBrowser(id: string): void {
    const panel = this.panels.get(id)
    if (!panel || panel.type !== 'browser') return
    panel.view.webContents.reload()
  }

  goBackBrowser(id: string): void {
    const panel = this.panels.get(id)
    if (!panel || panel.type !== 'browser') return
    panel.view.webContents.goBack()
  }

  goForwardBrowser(id: string): void {
    const panel = this.panels.get(id)
    if (!panel || panel.type !== 'browser') return
    panel.view.webContents.goForward()
  }

  destroyPanel(id: string): void {
    const panel = this.panels.get(id)
    if (!panel) return
    this.window.contentView.removeChildView(panel.view)
    panel.view.webContents.close()
    this.panels.delete(id)
  }

  updateBounds(updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>): void {
    for (const update of updates) {
      const panel = this.panels.get(update.panelId)
      if (!panel) continue
      if (update.visible) {
        panel.view.setBounds(update.bounds)
        panel.view.setVisible(true)
      } else {
        panel.view.setVisible(false)
      }
    }
  }

  getPanelView(id: string): WebContentsView | null {
    return this.panels.get(id)?.view || null
  }

  get panelCount(): number {
    return this.panels.size
  }

  hideAll(): void {
    for (const panel of this.panels.values()) {
      panel.view.setVisible(false)
    }
  }

  showAll(): void {
    for (const panel of this.panels.values()) {
      panel.view.setVisible(true)
    }
  }

  destroyAll(): void {
    for (const id of [...this.panels.keys()]) {
      this.destroyPanel(id)
    }
  }
}
