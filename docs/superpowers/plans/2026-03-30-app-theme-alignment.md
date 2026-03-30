# App Theme Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Flywheel Electron app's visual theme to match the marketing page — amber accent, Monaspace Neon font, centralized THEME object.

**Architecture:** Add a `THEME` constant to `src/shared/constants.ts` with all color and font tokens. Rewrite existing constants (`SIDEBAR`, `TERMINAL_DEFAULTS`) to reference `THEME`. Migrate all hardcoded colors in components and HTML files to use `THEME` or its derived constants. Bundle Monaspace Neon font files for offline use.

**Tech Stack:** TypeScript, Solid.js (inline styles), Electron (multi-context HTML files), Monaspace Neon webfont (.woff)

---

### Task 1: Download and bundle Monaspace Neon font files

**Files:**
- Create: `src/renderer/assets/fonts/MonaspaceNeon-Light.woff`
- Create: `src/renderer/assets/fonts/MonaspaceNeon-Regular.woff`
- Create: `src/renderer/assets/fonts/MonaspaceNeon-ExtraBold.woff`

- [ ] **Step 1: Create the fonts directory and download font files**

```bash
mkdir -p src/renderer/assets/fonts
curl -L -o src/renderer/assets/fonts/MonaspaceNeon-Light.woff \
  "https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-Light.woff"
curl -L -o src/renderer/assets/fonts/MonaspaceNeon-Regular.woff \
  "https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-Regular.woff"
curl -L -o src/renderer/assets/fonts/MonaspaceNeon-ExtraBold.woff \
  "https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-ExtraBold.woff"
```

- [ ] **Step 2: Verify the files exist and have nonzero size**

Run: `ls -la src/renderer/assets/fonts/`
Expected: Three `.woff` files, each several KB in size.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/assets/fonts/
git commit -m "chore: bundle Monaspace Neon font files (Light, Regular, ExtraBold)"
```

---

### Task 2: Add THEME object and update constants

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add the THEME constant and update SIDEBAR, TERMINAL_DEFAULTS, PANEL_COLORS**

Replace the entire contents of `src/shared/constants.ts` with:

```ts
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
```

Key changes:
- New `THEME` object with all marketing-page tokens plus `danger`, `surface`, `surfaceBorder` for dialog colors
- `PANEL_COLORS`: Amber first (hex changed to `#e8a830`), old Amber entry replaced
- `TERMINAL_DEFAULTS.theme`: cursor is `THEME.accent`, blue shifted to `#5b8def`, brightBlue to `#7cacf8`
- `SIDEBAR`: accent is `THEME.accent`, ACTIVE_BG uses amber rgba

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing errors unrelated to constants).

- [ ] **Step 3: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add centralized THEME object with amber accent color palette"
```

---

### Task 3: Update global.css with @font-face declarations

**Files:**
- Modify: `src/renderer/src/global.css`

- [ ] **Step 1: Replace global.css with font-face declarations and updated body styles**

Replace the entire contents of `src/renderer/src/global.css` with:

```css
@font-face {
  font-family: "Monaspace Neon";
  src: url("../assets/fonts/MonaspaceNeon-Light.woff") format("woff");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Monaspace Neon";
  src: url("../assets/fonts/MonaspaceNeon-Regular.woff") format("woff");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Monaspace Neon";
  src: url("../assets/fonts/MonaspaceNeon-ExtraBold.woff") format("woff");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0f0f1a;
  font-family: "Monaspace Neon", monospace;
  color: #e0e0f0;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Verify dev server starts without font loading errors**

Run: `npm run dev` (manual check — verify no 404s for font files in dev tools console).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/global.css
git commit -m "feat: add Monaspace Neon @font-face declarations and update body font"
```

---

### Task 4: Update PanelFrame component

**Files:**
- Modify: `src/renderer/src/components/PanelFrame.tsx`

- [ ] **Step 1: Import THEME and update focus border colors**

Replace the full file contents with:

```tsx
import { LAYOUT, THEME } from "../../../shared/constants";
import type { Rectangle } from "../../../shared/types";

interface PanelFrameProps {
  contentBounds: Rectangle;
  focused: boolean;
  chromeHeight: number;
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH;

  return (
    <>
      {props.focused && (
        <div
          style={{
            position: "absolute",
            left: `${props.contentBounds.x - borderWidth}px`,
            top: `${props.contentBounds.y + props.chromeHeight - borderWidth}px`,
            width: `${props.contentBounds.width + borderWidth * 2}px`,
            height: `${props.contentBounds.height - props.chromeHeight + borderWidth * 2}px`,
            border: `${borderWidth}px solid ${THEME.accent}`,
            "border-radius": "4px",
            "box-shadow": `0 0 16px rgba(232, 168, 48, 0.2)`,
            "pointer-events": "none",
          }}
        />
      )}
    </>
  );
}
```

Changes: `#6366f1` → `THEME.accent`, `rgba(99, 102, 241, 0.2)` → `rgba(232, 168, 48, 0.2)`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/PanelFrame.tsx
git commit -m "feat: update PanelFrame focus border to amber accent"
```

---

### Task 5: Update HintBar component

**Files:**
- Modify: `src/renderer/src/components/HintBar.tsx`

- [ ] **Step 1: Import THEME and update all hardcoded colors**

Replace the full file contents with:

```tsx
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { LAYOUT, THEME } from "../../../shared/constants";

interface HintBarProps {
  viewportHeight: number;
  panelCount: number;
  hasProjects: boolean;
  sidebarWidth: number;
  rowCount?: number;
}

const PANEL_HINTS = [
  { key: "\u2318T", label: "Terminal" },
  { key: "\u2318B", label: "Browser" },
  { key: "\u2318W", label: "Close" },
  { key: "\u2318G", label: "Blur" },
  { key: "\u2318+/-", label: "Zoom" },
  { key: "\u2318\u21e7,", label: "Reload Config" },
];

const ROW_HINTS = [
  { key: "\u2318N", label: "New Row" },
  { key: "\u2318\u2191\u2193", label: "Switch Row" },
];

const NO_PROJECT_HINTS = [{ key: "\u2318\u21e7N", label: "Add Project" }];

export default function HintBar(props: HintBarProps) {
  const top = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT;

  const hints = () => {
    if (!props.hasProjects) return NO_PROJECT_HINTS;
    if (props.rowCount && props.rowCount > 1) return [...PANEL_HINTS, ...ROW_HINTS];
    return PANEL_HINTS;
  };

  const [stats, setStats] = createSignal({
    panelViewCount: 0,
    mainMemoryMB: 0,
    heapUsedMB: 0,
  });

  onMount(() => {
    async function poll() {
      try {
        setStats(await window.api.getDebugStats());
      } catch (e) {
        console.error("debug:stats failed", e);
      }
    }
    void poll();
    const id = setInterval(() => {
      void poll();
    }, 5000);
    onCleanup(() => {
      clearInterval(id);
    });
  });

  const dimStyle = { color: "#444", "font-size": "11px" } as const;
  const valStyle = { color: THEME.muted, "font-size": "11px", "font-family": THEME.font.body } as const;

  return (
    <div
      style={{
        position: "absolute",
        left: `${props.sidebarWidth}px`,
        top: `${top()}px`,
        width: `calc(100% - ${props.sidebarWidth}px)`,
        height: `${LAYOUT.HINT_BAR_HEIGHT}px`,
        display: "flex",
        "align-items": "center",
        background: THEME.faint,
        "border-top": `1px solid ${THEME.surface}`,
        "user-select": "none",
        "font-size": "12px",
        "padding-left": "16px",
        "padding-right": "16px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          "justify-content": "center",
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <For each={hints()}>
          {(hint) => (
            <span>
              <span
                style={{
                  color: THEME.muted,
                  "font-weight": "500",
                  background: THEME.surface,
                  padding: "2px 6px",
                  "border-radius": "3px",
                  "margin-right": "4px",
                  "font-family": THEME.font.body,
                }}
              >
                {hint.key}
              </span>
              <span style={{ color: "#555" }}>{hint.label}</span>
            </span>
          )}
        </For>
      </div>
      <div style={{ display: "flex", gap: "12px", "flex-shrink": 0 }}>
        <span>
          <span style={dimStyle}>panels </span>
          <span style={valStyle}>{props.panelCount}</span>
        </span>
        <span>
          <span style={dimStyle}>views </span>
          <span style={valStyle}>{stats().panelViewCount}</span>
        </span>
        <span>
          <span style={dimStyle}>main </span>
          <span style={valStyle}>{stats().mainMemoryMB}MB</span>
        </span>
        <span>
          <span style={dimStyle}>heap </span>
          <span style={valStyle}>{stats().heapUsedMB}MB</span>
        </span>
      </div>
    </div>
  );
}
```

Changes: `#1a1a2e` → `THEME.faint`, `#252540` → `THEME.surface`, `#888` → `THEME.muted`, `monospace` → `THEME.font.body`, `#666` → `THEME.muted`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx
git commit -m "feat: update HintBar to use THEME constants"
```

---

### Task 6: Update ScrollIndicators component

**Files:**
- Modify: `src/renderer/src/components/ScrollIndicators.tsx`

- [ ] **Step 1: Import THEME and update hardcoded colors**

Replace the full file contents with:

```tsx
import { LAYOUT, THEME } from "../../../shared/constants";

interface ScrollIndicatorsProps {
  scrollOffset: number;
  maxScroll: number;
  viewportWidth: number;
  viewportHeight: number;
  sidebarWidth: number;
}

export default function ScrollIndicators(props: ScrollIndicatorsProps) {
  const effectiveWidth = () => props.viewportWidth - props.sidebarWidth;
  const trackTop = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT;
  const showLeft = () => props.scrollOffset > 1;
  const showRight = () => props.scrollOffset < props.maxScroll - 1;
  const thumbWidth = () => {
    if (props.maxScroll <= 0) return effectiveWidth();
    const ratio = effectiveWidth() / (effectiveWidth() + props.maxScroll);
    return Math.max(40, effectiveWidth() * ratio);
  };
  const thumbLeft = () => {
    if (props.maxScroll <= 0) return 0;
    const ratio = props.scrollOffset / props.maxScroll;
    return ratio * (effectiveWidth() - thumbWidth());
  };

  return (
    <>
      {showLeft() && (
        <div
          style={{
            position: "absolute",
            left: `${props.sidebarWidth}px`,
            top: `${LAYOUT.STRIP_TOP_PADDING}px`,
            width: "60px",
            height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
            background: `linear-gradient(to right, rgba(15,15,26,0.9), transparent)`,
            "pointer-events": "none",
            display: "flex",
            "align-items": "center",
            "padding-left": "8px",
            "z-index": "10",
          }}
        >
          <span style={{ color: THEME.muted, "font-size": "18px" }}>&#8249;</span>
        </div>
      )}

      {showRight() && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: `${LAYOUT.STRIP_TOP_PADDING}px`,
            width: "60px",
            height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
            background: `linear-gradient(to left, rgba(15,15,26,0.9), transparent)`,
            "pointer-events": "none",
            display: "flex",
            "align-items": "center",
            "justify-content": "flex-end",
            "padding-right": "8px",
            "z-index": "10",
          }}
        >
          <span style={{ color: THEME.muted, "font-size": "18px" }}>&#8250;</span>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: `${props.sidebarWidth}px`,
          top: `${trackTop()}px`,
          width: `calc(100% - ${props.sidebarWidth}px)`,
          height: `${LAYOUT.SCROLL_TRACK_HEIGHT}px`,
          background: THEME.faint,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${thumbLeft()}px`,
            top: 0,
            width: `${thumbWidth()}px`,
            height: "100%",
            background: props.maxScroll > 0 ? "#333" : "transparent",
            "border-radius": "2px",
            transition: "background 0.2s",
          }}
        />
      </div>
    </>
  );
}
```

Changes: `#555` → `THEME.muted`, `#1a1a2e` → `THEME.faint`.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ScrollIndicators.tsx
git commit -m "feat: update ScrollIndicators to use THEME constants"
```

---

### Task 7: Update Sidebar component

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Import THEME and update all hardcoded colors**

Add `THEME` to the import from `constants`:

```ts
import { SIDEBAR, THEME } from "../../../shared/constants";
```

Then apply these replacements throughout the file:

| Old value | New value | Locations |
|---|---|---|
| `"monospace"` (font-family on root div) | `THEME.font.body` | Line ~142 |
| `"#e0e0e0"` (active/focused text) | `THEME.text` | Lines ~191, 242, 272, 334, 345, 355 |
| `"#666"` (inactive text) | `THEME.muted` | Lines ~191, 242, 274 |
| `"#555"` (dimmer text) | `"#555"` | Keep as-is (very dim, not accent-adjacent) |
| `"#1a1a2e"` (context menu bg) | `THEME.faint` | Line ~319 |
| `"#f43f5e"` (destructive text) | `THEME.danger` | Lines ~367, 393 |
| `"rgba(244,63,94,0.1)"` (destructive hover) | `"rgba(244,63,94,0.1)"` | Keep as-is (tied to danger, not accent) |

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: update Sidebar to use THEME constants"
```

---

### Task 8: Update dialog components (ConfirmDialog, RemoveRowDialog, RemoveProjectDialog, MissingRowDialog)

**Files:**
- Modify: `src/renderer/src/components/ConfirmDialog.tsx`
- Modify: `src/renderer/src/components/RemoveRowDialog.tsx`
- Modify: `src/renderer/src/components/RemoveProjectDialog.tsx`
- Modify: `src/renderer/src/components/MissingRowDialog.tsx`

All four dialogs share the same color patterns. Apply these changes to each:

- [ ] **Step 1: Update ConfirmDialog.tsx**

Add import and replace all hardcoded colors. Full replacement:

```tsx
import { THEME } from "../../../shared/constants";

interface ConfirmDialogProps {
  processName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onConfirm();
    } else if (e.key === "Escape" || (e.metaKey && e.key === ".")) {
      e.preventDefault();
      props.onCancel();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      ref={(el) => {
        el.focus();
      }}
    >
      <div
        style={{
          background: THEME.surface,
          "border-radius": "8px",
          padding: "24px",
          "max-width": "400px",
          "box-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 20px 0",
            "font-size": "14px",
            "line-height": "1.5",
          }}
        >
          Process{" "}
          <code
            style={{
              background: THEME.faint,
              padding: "2px 6px",
              "border-radius": "3px",
              color: THEME.accent,
            }}
          >
            {props.processName}
          </code>{" "}
          is running. Close anyway?
        </p>
        <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end" }}>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.muted,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Cancel <span style={{ color: "#555", "font-size": "11px" }}>Esc</span>
          </button>
          <button
            onClick={() => {
              props.onConfirm();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Close <span style={{ color: "rgba(255,255,255,0.6)", "font-size": "11px" }}>Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update RemoveRowDialog.tsx**

Add import and replace colors using the same mapping as Step 1. Full replacement:

```tsx
import { THEME } from "../../../shared/constants";

interface RemoveRowDialogProps {
  onRemoveFromFlywheel: () => void;
  onDeleteFromDisk: () => void;
  onCancel: () => void;
}

export default function RemoveRowDialog(props: RemoveRowDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
    >
      <div
        style={{
          background: THEME.surface,
          "border-radius": "8px",
          padding: "24px",
          "max-width": "400px",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 20px 0",
            "font-size": "14px",
            "line-height": "1.5",
          }}
        >
          Remove this worktree row?
        </p>
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <button
            onClick={() => {
              props.onRemoveFromFlywheel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.text,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove from Flywheel
          </button>
          <button
            onClick={() => {
              props.onDeleteFromDisk();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove and delete from disk
          </button>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: "transparent",
              color: THEME.muted,
              border: "none",
              padding: "6px 16px",
              cursor: "pointer",
              "font-size": "12px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update RemoveProjectDialog.tsx**

Same pattern — add import and replace colors. Full replacement:

```tsx
import { THEME } from "../../../shared/constants";

interface RemoveProjectDialogProps {
  onRemoveFromFlywheel: () => void;
  onDeleteWorktrees: () => void;
  onCancel: () => void;
}

export default function RemoveProjectDialog(props: RemoveProjectDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
    >
      <div
        style={{
          background: THEME.surface,
          "border-radius": "8px",
          padding: "24px",
          "max-width": "400px",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 20px 0",
            "font-size": "14px",
            "line-height": "1.5",
          }}
        >
          This project has worktree rows. Delete them from disk?
        </p>
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <button
            onClick={() => {
              props.onRemoveFromFlywheel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.text,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove from Flywheel
          </button>
          <button
            onClick={() => {
              props.onDeleteWorktrees();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove and delete worktrees
          </button>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: "transparent",
              color: THEME.muted,
              border: "none",
              padding: "6px 16px",
              cursor: "pointer",
              "font-size": "12px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update MissingRowDialog.tsx**

```tsx
import { THEME } from "../../../shared/constants";

interface MissingRowDialogProps {
  branch: string;
  onCancel: () => void;
  onRemove: () => void;
}

export default function MissingRowDialog(props: MissingRowDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
    >
      <div
        style={{
          background: THEME.surface,
          "border-radius": "8px",
          padding: "24px",
          "max-width": "420px",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 8px 0",
            "font-size": "14px",
            "font-weight": "bold",
          }}
        >
          Worktree not found
        </p>
        <p
          style={{
            color: THEME.muted,
            margin: "0 0 20px 0",
            "font-size": "13px",
            "line-height": "1.5",
            "font-family": THEME.font.body,
          }}
        >
          The directory for <span style={{ color: THEME.text }}>{props.branch}</span> no longer
          exists on disk.
        </p>
        <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end" }}>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.muted,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              props.onRemove();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Remove Row
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ConfirmDialog.tsx \
       src/renderer/src/components/RemoveRowDialog.tsx \
       src/renderer/src/components/RemoveProjectDialog.tsx \
       src/renderer/src/components/MissingRowDialog.tsx
git commit -m "feat: update dialog components to use THEME constants"
```

---

### Task 9: Update App.tsx toast colors

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Import THEME and update toast styling**

Add `THEME` to the existing import:

```ts
import { LAYOUT, THEME } from "../../shared/constants";
```

Find the toast `<div>` near the bottom of the file (around line 952) and update its style:

Old:
```tsx
background: t.type === "error" ? "#f43f5e" : "#3b82f6",
color: "#fff",
...
"font-family": "monospace",
```

New:
```tsx
background: t.type === "error" ? THEME.danger : THEME.accent,
color: t.type === "error" ? "#fff" : THEME.bg,
...
"font-family": THEME.font.body,
```

Info toasts now use amber background with dark text instead of blue with white text.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: update App.tsx toast to use THEME constants"
```

---

### Task 10: Update terminal panel HTML

**Files:**
- Modify: `src/terminal/index.html`

- [ ] **Step 1: Add @font-face and update all hardcoded colors**

The terminal HTML runs in its own WebContentsView and can't import from constants.ts. Update the `<style>` block to add the font and use the THEME color values directly.

Replace the entire `<style>` block with:

```html
<style>
  @font-face {
    font-family: "Monaspace Neon";
    src: url("../renderer/assets/fonts/MonaspaceNeon-Light.woff") format("woff");
    font-weight: 300;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "Monaspace Neon";
    src: url("../renderer/assets/fonts/MonaspaceNeon-Regular.woff") format("woff");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #1e1e38;
  }
  #panel-titlebar {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 400;
    color: #6a6a8a;
    background: #1e1e38;
    user-select: none;
    border-bottom: 1px solid #2a2a4a;
    box-sizing: border-box;
    font-family: "Monaspace Neon", monospace;
  }
  #panel-titlebar.focused {
    font-weight: 500;
    color: #e0e0f0;
    background: #252540;
    border-bottom-color: #e8a830;
    border-bottom-width: 2px;
  }
  #pos-label {
    flex-shrink: 0;
  }
  #title-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #btn-close {
    flex-shrink: 0;
    margin-left: 6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #555;
    padding: 0;
    opacity: 0;
    transition:
      opacity 0.1s,
      color 0.1s;
  }
  #panel-titlebar:hover #btn-close {
    opacity: 1;
  }
  #btn-close:hover {
    color: #e0e0f0;
    background: rgba(255, 255, 255, 0.08);
  }
  #terminal {
    width: calc(100% - 16px);
    height: calc(100% - 40px);
    padding: 8px;
  }
</style>
```

Changes:
- Added `@font-face` for Monaspace Neon (Light + Regular)
- `#1a1a2e` → `#1e1e38` (THEME.faint)
- `#666` → `#6a6a8a` (THEME.muted)
- `#e0e0e0` → `#e0e0f0` (THEME.text)
- `#2a2a3e` → `#2a2a4a` (THEME.border)
- `#6366f1` → `#e8a830` (THEME.accent)
- Font family → `"Monaspace Neon", monospace`

- [ ] **Step 2: Commit**

```bash
git add src/terminal/index.html
git commit -m "feat: update terminal panel chrome to amber theme with Monaspace Neon"
```

---

### Task 11: Update browser panel HTML

**Files:**
- Modify: `src/browser/browser-host.html`

- [ ] **Step 1: Add @font-face and update all hardcoded colors**

Replace the entire `<style>` block with:

```html
<style>
  @font-face {
    font-family: "Monaspace Neon";
    src: url("../renderer/assets/fonts/MonaspaceNeon-Light.woff") format("woff");
    font-weight: 300;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "Monaspace Neon";
    src: url("../renderer/assets/fonts/MonaspaceNeon-Regular.woff") format("woff");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 60px;
    overflow: hidden;
    background: #1e1e38;
    font-family: "Monaspace Neon", monospace;
  }
  #titlebar {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 400;
    color: #6a6a8a;
    background: #1e1e38;
    user-select: none;
    border-bottom: 1px solid #2a2a4a;
    box-sizing: border-box;
  }
  #titlebar.focused {
    font-weight: 500;
    color: #e0e0f0;
    background: #252540;
  }
  #titlebar .pos {
    flex-shrink: 0;
    margin-right: 6px;
  }
  #titlebar .globe {
    flex-shrink: 0;
    margin-right: 6px;
    color: #06b6d4;
    display: flex;
    align-items: center;
  }
  #titlebar .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #555;
  }
  #titlebar.focused .title {
    color: #c0c0c0;
  }
  #btn-close {
    flex-shrink: 0;
    margin-left: 6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #555;
    padding: 0;
    opacity: 0;
    transition:
      opacity 0.1s,
      color 0.1s;
  }
  #titlebar:hover #btn-close {
    opacity: 1;
  }
  #btn-close:hover {
    color: #e0e0f0;
    background: rgba(255, 255, 255, 0.08);
  }
  #navbar {
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    background: #1e1e36;
    gap: 4px;
    box-sizing: border-box;
    border-bottom: 1px solid #2a2a4a;
  }
  #navbar.focused {
    border-bottom: 2px solid #e8a830;
  }
  .nav-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #6a6a8a;
    padding: 0;
    flex-shrink: 0;
  }
  .nav-btn:disabled {
    color: #444;
    cursor: default;
  }
  .nav-sep {
    width: 1px;
    height: 16px;
    background: #333;
    flex-shrink: 0;
  }
  #url-display {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "Monaspace Neon", monospace;
    font-size: 12px;
    color: #6a6a8a;
    cursor: text;
  }
  #url-input {
    flex: 1;
    background: #1e1e38;
    border: 1px solid #3a3a5c;
    border-radius: 3px;
    color: #e0e0f0;
    font-size: 12px;
    font-family: "Monaspace Neon", monospace;
    padding: 2px 6px;
    outline: none;
    height: 22px;
    display: none;
  }
</style>
```

Changes:
- Added `@font-face` for Monaspace Neon (Light + Regular)
- `#1a1a2e` → `#1e1e38` (THEME.faint)
- `#666` → `#6a6a8a` (THEME.muted)
- `#e0e0e0` → `#e0e0f0` (THEME.text)
- `#2a2a3e` → `#2a2a4a` (THEME.border)
- `#6366f1` → `#e8a830` (THEME.accent)
- `#888` → `#6a6a8a` (THEME.muted)
- All font-family references → `"Monaspace Neon", monospace`

- [ ] **Step 2: Commit**

```bash
git add src/browser/browser-host.html
git commit -m "feat: update browser panel chrome to amber theme with Monaspace Neon"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run TypeScript compiler**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 2: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 3: Run linter**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new lint errors.

- [ ] **Step 4: Visual smoke test**

Run: `npm run dev`
Verify:
- Sidebar header uses amber accent color
- Panel focus border is amber with amber glow
- Hint bar keyboard shortcuts use Monaspace Neon font
- Terminal cursor is amber
- Context menus use updated dark backgrounds
- Toast notifications use amber for info type
- All text renders in Monaspace Neon

- [ ] **Step 5: Commit any fixups if needed**
