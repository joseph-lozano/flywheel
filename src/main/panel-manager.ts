import { WebContentsView, BaseWindow } from 'electron'
import { join } from 'path'

interface ManagedPanel {
  id: string
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

  createPanel(id: string, color: string): void {
    if (this.panels.has(id)) return

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        sandbox: false
      }
    })

    view.setBackgroundColor(color)
    view.webContents.loadURL('about:blank')

    this.window.contentView.addChildView(view)
    this.panels.set(id, { id, view })
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

  destroyAll(): void {
    for (const id of [...this.panels.keys()]) {
      this.destroyPanel(id)
    }
  }
}
