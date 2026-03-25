export const LAYOUT = {
  TITLE_BAR_HEIGHT: 32,
  PANEL_GAP: 8,
  STRIP_TOP_PADDING: 8,
  HINT_BAR_HEIGHT: 32,
  SCROLL_TRACK_HEIGHT: 4,
  DEFAULT_PANEL_WIDTH_RATIO: 0.5,
  FOCUS_BORDER_WIDTH: 2,
  BUFFER_ZONE_MULTIPLIER: 1,
  ANIMATION_DURATION_MS: 200,
  SCROLL_END_DEBOUNCE_MS: 150
} as const

export const PANEL_COLORS = [
  { name: 'Slate Blue', hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Teal', hex: '#14b8a6' }
] as const

export const IPC_CHANNELS = {
  PANEL_CREATE: 'panel:create',
  PANEL_DESTROY: 'panel:destroy',
  PANEL_UPDATE_BOUNDS: 'panel:update-bounds',
  PANEL_WHEEL: 'panel:wheel',
  SCROLL_WHEEL: 'scroll:wheel',
  SHORTCUT_ACTION: 'shortcut:action'
} as const
