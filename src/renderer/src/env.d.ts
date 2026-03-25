/// <reference types="vite/client" />

interface FlywheelAPI {
  createPanel(id: string, color: string): void
  destroyPanel(id: string): void
  updateBounds(updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>): void
  onWheelEvent(callback: (data: { deltaX: number }) => void): void
  onShortcut(callback: (action: { type: string; index?: number }) => void): void
}

declare global {
  interface Window {
    api: FlywheelAPI
  }
}

export {}
