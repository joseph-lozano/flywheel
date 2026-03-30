export const LAYOUT = {
  TITLE_BAR_HEIGHT: 32,
  BROWSER_NAV_BAR_HEIGHT: 28,
  PANEL_CHROME_HEIGHT: 60, // TITLE_BAR_HEIGHT(32) + BROWSER_NAV_BAR_HEIGHT(28)
  PANEL_GAP: 8,
  STRIP_TOP_PADDING: 8,
  HINT_BAR_HEIGHT: 32,
  SCROLL_TRACK_HEIGHT: 4,
  DEFAULT_PANEL_WIDTH_RATIO: 0.5,
  FOCUS_BORDER_WIDTH: 2,
  BUFFER_ZONE_MULTIPLIER: 1,
  ANIMATION_DURATION_MS: 200,
  SCROLL_END_DEBOUNCE_MS: 150,
} as const;

export const THEME = {
  bg: "#0f0f1a",
  text: "#e0e0f0",
  accent: "#e8a830",
  muted: "#6a6a8a",
  border: "#2a2a4a",
  faint: "#1e1e38",
  danger: "#f43f5e",
  surface: "#252540",
  surfaceBorder: "#3a3a5c",

  font: {
    body: "'Monaspace Neon', monospace",
  },
} as const;

export const PANEL_COLORS = [
  { name: "Amber", hex: "#e8a830" },
  { name: "Slate Blue", hex: "#6366f1" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Orange", hex: "#f97316" },
  { name: "Teal", hex: "#14b8a6" },
] as const;

export const TERMINAL_DEFAULTS = {
  theme: {
    background: THEME.faint,
    foreground: THEME.text,
    cursor: THEME.accent,
    cursorAccent: THEME.faint,
    selectionBackground: "rgba(255, 255, 255, 0.2)",
    black: THEME.faint,
    red: "#f43f5e",
    green: "#10b981",
    yellow: "#f59e0b",
    blue: "#5b8def",
    magenta: "#8b5cf6",
    cyan: "#06b6d4",
    white: THEME.text,
    brightBlack: "#4a4a6a",
    brightRed: "#fb7185",
    brightGreen: "#34d399",
    brightYellow: "#fbbf24",
    brightBlue: "#7cacf8",
    brightMagenta: "#a78bfa",
    brightCyan: "#22d3ee",
    brightWhite: "#ffffff",
  },
} as const;

export const SIDEBAR = {
  MIN_WIDTH: 180,
  MAX_WIDTH: 280,
  BACKGROUND: "#12122a",
  BORDER_COLOR: THEME.border,
  ACCENT_COLOR: THEME.accent,
  ACTIVE_BG: "rgba(232, 168, 48, 0.15)",
  ITEM_PADDING_V: 6,
  ITEM_PADDING_H: 12,
  HEADER_FONT_SIZE: 11,
  ITEM_FONT_SIZE: 11,
  ADD_FONT_SIZE: 10,
} as const;

export function goldenAngleColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${Math.round(hue * 100) / 100}, 65%, 65%)`;
}
