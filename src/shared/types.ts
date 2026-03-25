export interface Panel {
  id: string
  type: 'terminal' | 'placeholder' | 'browser'
  color: string
  label: string
  url?: string
  canGoBack?: boolean
  canGoForward?: boolean
}

export interface Project {
  id: string
  name: string
  path: string
  missing?: boolean
}

export interface PersistedState {
  projects: Project[]
  activeProjectId: string | null
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

export interface PanelChromeState {
  panelId: string
  position: number
  label: string
  focused: boolean
  type: 'terminal' | 'placeholder' | 'browser'
  url?: string
  canGoBack?: boolean
  canGoForward?: boolean
  busy?: boolean
}

export interface PanelLayout {
  panelId: string
  contentBounds: Rectangle
  visibility: VisibilityState
}

export type ShortcutAction = {
  type: 'focus-left' | 'focus-right' | 'swap-left' | 'swap-right' | 'new-panel' | 'new-browser' | 'close-panel' | 'jump-to' | 'blur-panel' | 'reload-browser' | 'browser-back' | 'browser-forward' | 'add-project' | 'switch-project'
  index?: number
}
