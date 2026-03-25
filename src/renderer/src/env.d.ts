/// <reference types="vite/client" />

interface FlywheelAPI {
  createPanel(id: string, color: string): void
  createTerminalPanel(id: string): void
  destroyPanel(id: string): void
  updateBounds(updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>): void
  onWheelEvent(callback: (data: { deltaX: number }) => void): void
  onShortcut(callback: (action: { type: string; index?: number }) => void): void
  getDebugStats(): Promise<{ panelViewCount: number; mainMemoryMB: number; heapUsedMB: number }>

  // PTY lifecycle
  createTerminal(panelId: string): void
  onPtyExit(callback: (data: { panelId: string; exitCode: number }) => void): void

  // Close with busy-check
  closePanel(panelId: string): void
  onConfirmClose(callback: (data: { panelId: string; processName: string }) => void): void
  confirmCloseResponse(panelId: string, confirmed: boolean): void

  // Focus management
  focusPanel(panelId: string): void
  blurAllPanels(): void
  onPanelFocused(callback: (data: { panelId: string }) => void): void
  onPanelTitle(callback: (data: { panelId: string; title: string }) => void): void
  hideAllPanels(): void
  showAllPanels(): void

  // Browser panels
  createBrowserPanel(id: string, url: string): void
  navigateBrowser(panelId: string, url: string): void
  reloadBrowser(panelId: string): void
  goBackBrowser(panelId: string): void
  goForwardBrowser(panelId: string): void
  onBrowserUrlChanged(callback: (data: { panelId: string; url: string }) => void): void
  onBrowserNavStateChanged(callback: (data: { panelId: string; canGoBack: boolean; canGoForward: boolean }) => void): void
  onBrowserOpenUrl(callback: (data: { url: string }) => void): void
  onPanelClosed(callback: (data: { panelId: string }) => void): void
}

declare global {
  interface Window {
    api: FlywheelAPI
  }
}

export {}
