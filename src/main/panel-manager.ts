import { WebContentsView, BaseWindow } from 'electron'
import { join } from 'path'

interface ManagedPanel {
  id: string
  type: 'terminal' | 'placeholder'
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

  createPanel(id: string, options: { type: 'terminal' } | { type?: 'placeholder'; color: string }): void {
    if (this.panels.has(id)) return

    const panelType = options.type || 'placeholder'

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        sandbox: false
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
    } else {
      const color = 'color' in options ? options.color : '#333'
      view.setBackgroundColor(color)
      view.webContents.loadURL(
        `data:text/html,<html><body style="margin:0;background:${encodeURIComponent(color)};height:100vh"></body></html>`
      )
    }

    // When a panel gains focus via click, notify chrome view so it can update focusedIndex
    view.webContents.on('focus', () => {
      this.chromeView.webContents.send('panel:focused', { panelId: id })
    })

    this.window.contentView.addChildView(view)
    this.panels.set(id, { id, type: panelType, view })
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
