export interface Panel {
  id: string
  color: string
  label: string
}

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface PanelBoundsUpdate {
  panelId: string
  bounds: Rectangle
  visible: boolean
}

export type VisibilityState = 'visible' | 'hidden' | 'destroyed'

export interface PanelLayout {
  panelId: string
  contentBounds: Rectangle
  titleBarBounds: Rectangle
  visibility: VisibilityState
}

export interface ShortcutAction {
  type: 'focus-left' | 'focus-right' | 'new-panel' | 'close-panel' | 'jump-to'
  index?: number
}
