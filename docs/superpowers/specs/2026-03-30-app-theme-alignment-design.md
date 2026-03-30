# App Theme Alignment with Marketing Page

## Goal

Update the Flywheel Electron app's visual theme to match the marketing page (`www/index.html`). This means adopting the amber accent color, Monaspace Neon font, and unified color tokens throughout the app.

## Design Decisions

- **Approach:** Centralized `THEME` object in `constants.ts` (Approach A). All components reference this object instead of hardcoded hex values.
- **Font:** Bundle Monaspace Neon (Light 300, Regular 400, ExtraBold 800) as `.woff` files. Monaspace Radon is not used — it's marketing-page-only.
- **Panel colors:** Amber becomes the default (first entry in `PANEL_COLORS`). The full palette remains available.
- **Terminal theme:** Amber cursor and focus indicators. ANSI blue adjusted to avoid clashing with amber accent.
- **Scope:** UI shell + terminal chrome + terminal ANSI palette. No structural/layout changes.

## 1. Theme Object

New `THEME` constant in `src/shared/constants.ts`, mirroring the marketing page's CSS variables:

```ts
const THEME = {
  bg: "#0f0f1a",
  text: "#e0e0f0",
  accent: "#e8a830",
  muted: "#6a6a8a",
  border: "#2a2a4a",
  faint: "#1e1e38",

  font: {
    body: "'Monaspace Neon', monospace",
  },
};
```

Existing constants (`SIDEBAR.ACCENT_COLOR`, `SIDEBAR.BORDER_COLOR`, `SIDEBAR.BACKGROUND`, `TERMINAL_DEFAULTS.theme`, etc.) are rewritten to reference `THEME` values.

## 2. Font Bundling

Download Monaspace Neon `.woff` files (Light, Regular, ExtraBold) into `src/renderer/assets/fonts/`.

Add `@font-face` declarations in `src/renderer/src/global.css`:

```css
@font-face {
  font-family: "Monaspace Neon";
  src: url("../assets/fonts/MonaspaceNeon-Light.woff") format("woff");
  font-weight: 300;
  font-display: swap;
}
/* ... Regular 400, ExtraBold 800 */
```

Update the body font-family from system sans-serif to `'Monaspace Neon', monospace`.

The HTML panel files (`src/terminal/index.html`, `src/browser/browser-host.html`) get their own `@font-face` declarations since they can't import from `constants.ts`.

## 3. Component Migration

Every component with hardcoded color or font values is updated to reference `THEME`.

| Current value                                | Becomes                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `#6366f1` (accent)                           | `THEME.accent`                                                                                  |
| `#0f0f1a` (body bg)                          | `THEME.bg`                                                                                      |
| `#e0e0e0` (text)                             | `THEME.text`                                                                                    |
| `#2a2a4a` (borders)                          | `THEME.border`                                                                                  |
| `#1a1a2e` (panel/chrome bg)                  | `THEME.faint`                                                                                   |
| `#12122a` (sidebar bg)                       | Derived — slightly darker than `THEME.faint`                                                    |
| `rgba(99, 102, 241, ...)` (indigo glows)     | Amber equivalent `rgba(232, 168, 48, ...)`                                                      |
| Various muted grays (`#555`, `#666`, `#888`) | `THEME.muted` where accent-adjacent; kept as neutral grays where they serve as generic dim text |
| System sans-serif font stack                 | `THEME.font.body`                                                                               |

**Files:**

- `src/renderer/src/global.css`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/HintBar.tsx`
- `src/renderer/src/components/PanelFrame.tsx`
- `src/renderer/src/components/ScrollIndicators.tsx`
- `src/renderer/src/components/Strip.tsx`
- `src/renderer/src/components/ConfirmDialog.tsx`
- `src/renderer/src/components/RemoveRowDialog.tsx`
- `src/renderer/src/components/RemoveProjectDialog.tsx`
- `src/renderer/src/components/MissingRowDialog.tsx`
- `src/terminal/index.html`
- `src/browser/browser-host.html`

## 4. Terminal Theme Update

`TERMINAL_DEFAULTS.theme` changes:

- **Cursor:** `THEME.accent` (amber) instead of white
- **Focus border/glow:** Amber (`THEME.accent`) replaces indigo
- **ANSI blue:** Shift from `#6366f1` to a cooler blue like `#5b8def` that doesn't clash with amber. Bright blue similarly adjusted.
- **Other ANSI colors:** Red, green, yellow, cyan, magenta stay as-is.

## 5. Panel Colors Default

`PANEL_COLORS` reordered with amber first:

```ts
PANEL_COLORS = [
  { name: "Amber", hex: "#e8a830" },
  { name: "Slate Blue", hex: "#6366f1" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Orange", hex: "#f97316" },
  { name: "Teal", hex: "#14b8a6" },
];
```

Any logic defaulting to `PANEL_COLORS[0]` now picks amber. Existing user data storing color by hex is unaffected.

## Out of Scope

- Layout or structural changes to components
- Light theme / theme switching
- Monaspace Radon font (marketing-page-only)
- Changes to the marketing page itself
