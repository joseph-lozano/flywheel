# Phase 1: Electron Shell + Scrollable Strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Electron app with the core spatial model — a horizontal strip of placeholder panels with free-form trackpad scrolling, keyboard navigation, and animated transitions.

**Architecture:** An Electron `BaseWindow` hosts a full-window Chrome View (Solid.js) that owns layout state and renders UI chrome (title bars, focus indicators, hint bar, scroll indicators). Panel `WebContentsView` instances are overlaid on top as colored placeholders, positioned via `setBounds()`. The Chrome View computes layout and sends bounds to the main process via IPC.

**Tech Stack:** Electron 41 (`BaseWindow` + `WebContentsView`), Solid.js 1.9, electron-vite 5, Vite 6, Vitest 4, TypeScript 5.7

---

## File Structure

```
flywheel/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── vitest.config.ts
├── .gitignore                        (update existing)
├── src/
│   ├── shared/
│   │   ├── types.ts                  # Panel, Rectangle, IPC channel types
│   │   └── constants.ts              # Layout constants (gap, title bar height, etc.)
│   ├── main/
│   │   ├── index.ts                  # Entry: BaseWindow, Chrome View, IPC, shortcuts
│   │   └── panel-manager.ts          # Panel WCV lifecycle (create/destroy/position)
│   ├── preload/
│   │   ├── index.ts                  # Chrome View preload (contextBridge API)
│   │   └── panel.ts                  # Panel preload (wheel event forwarding)
│   └── renderer/
│       ├── index.html                # Chrome View HTML entry
│       └── src/
│           ├── index.tsx             # Solid mount point
│           ├── App.tsx               # Root component — wires store, layout, IPC, effects
│           ├── global.css            # Base styles (dark theme, reset)
│           ├── env.d.ts              # Vite + window.api type declarations
│           ├── store/
│           │   └── strip.ts          # Solid store: panels, focusedIndex, scrollOffset
│           ├── layout/
│           │   └── engine.ts         # Pure functions: state → panel bounds + visibility
│           ├── scroll/
│           │   └── animator.ts       # Ease-out animation helper (RAF-based)
│           └── components/
│               ├── Strip.tsx         # Renders PanelFrames for each panel
│               ├── PanelFrame.tsx    # Title bar + focus border for one panel
│               ├── HintBar.tsx       # Keyboard shortcut hint bar
│               └── ScrollIndicators.tsx  # Fade edges + scroll track
└── tests/
    ├── layout/
    │   └── engine.test.ts            # Layout computation tests
    ├── store/
    │   └── strip.test.ts             # Strip store action tests
    └── scroll/
        └── animator.test.ts          # Easing + animation tests
```

---

### Task 1: Project Scaffold + Configuration

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore`
- Create: `src/main/index.ts` (placeholder)
- Create: `src/preload/index.ts` (placeholder)
- Create: `src/renderer/index.html` (placeholder)
- Create: `src/renderer/src/index.tsx` (placeholder)
- Create: `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/global.css` (placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flywheel",
  "version": "0.1.0",
  "description": "Development Command Center",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "solid-js": "^1.9.0"
  },
  "devDependencies": {
    "electron": "^41.0.0",
    "electron-vite": "^5.0.0",
    "vite": "^6.0.0",
    "vite-plugin-solid": "^2.11.0",
    "vitest": "^4.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `electron.vite.config.ts`**

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          panel: resolve(__dirname, 'src/preload/panel.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [solidPlugin()]
  }
})
```

- [ ] **Step 3: Create TypeScript configs**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "composite": true,
    "types": ["node"]
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "electron.vite.config.ts"
  ]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "composite": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vite/client"]
  },
  "include": [
    "src/renderer/src/**/*",
    "src/shared/**/*",
    "tests/**/*"
  ]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
})
```

- [ ] **Step 5: Update `.gitignore`**

Append to existing `.gitignore`:
```
node_modules/
out/
dist/
*.tsbuildinfo
```

- [ ] **Step 6: Create placeholder source files**

`src/main/index.ts`:
```typescript
import { app } from 'electron'

app.whenReady().then(() => {
  console.log('Flywheel main process started')
})

app.on('window-all-closed', () => {
  app.quit()
})
```

`src/preload/index.ts`:
```typescript
console.log('Chrome View preload loaded')
```

`src/preload/panel.ts`:
```typescript
console.log('Panel preload loaded')
```

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flywheel</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/index.tsx"></script>
</body>
</html>
```

`src/renderer/src/index.tsx`:
```tsx
import { render } from 'solid-js/web'
import './global.css'

function Placeholder() {
  return <div style={{ padding: '20px', color: '#e0e0e0' }}>Flywheel — Phase 1</div>
}

render(() => <Placeholder />, document.getElementById('root')!)
```

`src/renderer/src/global.css`:
```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0f0f1a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #e0e0e0;
  -webkit-font-smoothing: antialiased;
}
```

`src/renderer/src/env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: Clean install, no errors.

- [ ] **Step 8: Verify build**

Run: `npx electron-vite build`
Expected: Build succeeds, output in `out/` directory.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json vitest.config.ts .gitignore src/ tests/
git commit -m "feat: scaffold Electron + Solid + Vite project"
```

---

### Task 2: Shared Types + Constants

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/shared/constants.ts`**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/
git commit -m "feat: add shared types and layout constants"
```

---

### Task 3: Layout Engine (TDD)

**Files:**
- Create: `tests/layout/engine.test.ts`
- Create: `src/renderer/src/layout/engine.ts`

- [ ] **Step 1: Write failing tests**

`tests/layout/engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  computeLayout,
  computeVisibility,
  computeScrollToCenter,
  computeMaxScroll,
  findMostCenteredPanel
} from '../../src/renderer/src/layout/engine'
import type { Panel } from '../../src/shared/types'

const mkPanel = (id: string): Panel => ({ id, color: '#000', label: id })

describe('computeVisibility', () => {
  const vw = 1000
  const pw = 500 // 50% of viewport

  it('returns visible when panel intersects viewport', () => {
    expect(computeVisibility(0, pw, vw)).toBe('visible')
    expect(computeVisibility(499, pw, vw)).toBe('visible')
    expect(computeVisibility(-499, pw, vw)).toBe('visible')
  })

  it('returns hidden when within buffer zone', () => {
    expect(computeVisibility(-600, pw, vw)).toBe('hidden')
    expect(computeVisibility(1100, pw, vw)).toBe('hidden')
  })

  it('returns destroyed when beyond buffer zone', () => {
    expect(computeVisibility(-1600, pw, vw)).toBe('destroyed')
    expect(computeVisibility(2100, pw, vw)).toBe('destroyed')
  })

  it('returns visible for panel partially on-screen', () => {
    // Panel right edge at x=1, just barely intersects
    expect(computeVisibility(-499, pw, vw)).toBe('visible')
  })
})

describe('computeLayout', () => {
  const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c')]

  it('positions panels left-to-right with gap', () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600
    })

    expect(layout).toHaveLength(3)
    // Panel width = 1000 * 0.5 = 500
    // Panel 0: x=0, Panel 1: x=508, Panel 2: x=1016
    expect(layout[0].contentBounds.x).toBe(0)
    expect(layout[1].contentBounds.x).toBe(508) // 500 + 8 gap
    expect(layout[2].contentBounds.x).toBe(1016) // 2 * (500 + 8)
  })

  it('offsets panels by scrollOffset', () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 200,
      viewportWidth: 1000,
      viewportHeight: 600
    })

    expect(layout[0].contentBounds.x).toBe(-200)
    expect(layout[1].contentBounds.x).toBe(308) // 508 - 200
  })

  it('positions title bars above content', () => {
    const layout = computeLayout({
      panels: [mkPanel('a')],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600
    })

    expect(layout[0].titleBarBounds.y).toBe(8) // STRIP_TOP_PADDING
    expect(layout[0].titleBarBounds.height).toBe(32) // TITLE_BAR_HEIGHT
    expect(layout[0].contentBounds.y).toBe(40) // 8 + 32
  })

  it('computes content height from viewport', () => {
    const layout = computeLayout({
      panels: [mkPanel('a')],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600
    })

    // stripHeight = 600 - 8 (top padding) - 32 (hint bar) - 4 (scroll track) = 556
    // contentHeight = 556 - 32 (title bar) = 524
    expect(layout[0].contentBounds.height).toBe(524)
  })

  it('assigns visibility based on viewport position', () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600
    })

    expect(layout[0].visibility).toBe('visible')
    expect(layout[1].visibility).toBe('visible')
    // Panel 2 at x=1016, right edge at 1516 — within buffer zone (1000-2000)
    expect(layout[2].visibility).toBe('hidden')
  })

  it('returns empty array for no panels', () => {
    const layout = computeLayout({
      panels: [],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600
    })
    expect(layout).toHaveLength(0)
  })
})

describe('computeMaxScroll', () => {
  it('returns 0 for no panels', () => {
    expect(computeMaxScroll(0, 1000)).toBe(0)
  })

  it('returns 0 when all panels fit in viewport', () => {
    // 1 panel at 500px width in 1000px viewport
    expect(computeMaxScroll(1, 1000)).toBe(0)
  })

  it('returns correct max for multiple panels', () => {
    // 3 panels: total = 3*500 + 2*8 = 1516, max = 1516 - 1000 = 516
    expect(computeMaxScroll(3, 1000)).toBe(516)
  })
})

describe('computeScrollToCenter', () => {
  it('centers first panel (clamps to 0)', () => {
    // Panel 0 at x=0, center=250, target = 0 - (1000-500)/2 = -250 → clamped to 0
    expect(computeScrollToCenter(0, 3, 1000)).toBe(0)
  })

  it('centers middle panel', () => {
    // Panel 1 at x=508, target = 508 - (1000-500)/2 = 508 - 250 = 258
    expect(computeScrollToCenter(1, 3, 1000)).toBe(258)
  })

  it('clamps to max scroll for last panel', () => {
    // Panel 2 at x=1016, target = 1016 - 250 = 766, max = 516 → clamped to 516
    expect(computeScrollToCenter(2, 3, 1000)).toBe(516)
  })
})

describe('findMostCenteredPanel', () => {
  it('returns -1 for no panels', () => {
    expect(findMostCenteredPanel(0, 0, 1000)).toBe(-1)
  })

  it('returns 0 at scroll offset 0', () => {
    expect(findMostCenteredPanel(0, 3, 1000)).toBe(0)
  })

  it('returns panel closest to viewport center', () => {
    // At scroll 258, panel 1 is centered
    expect(findMostCenteredPanel(258, 3, 1000)).toBe(1)
  })

  it('returns last panel at max scroll', () => {
    expect(findMostCenteredPanel(516, 3, 1000)).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/layout/engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement layout engine**

`src/renderer/src/layout/engine.ts`:
```typescript
import { LAYOUT } from '../../../shared/constants'
import type { Panel, PanelLayout, VisibilityState } from '../../../shared/types'

export interface LayoutInput {
  panels: Panel[]
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
}

export function computeVisibility(
  screenX: number,
  panelWidth: number,
  viewportWidth: number
): VisibilityState {
  const panelRight = screenX + panelWidth
  const bufferZone = viewportWidth * LAYOUT.BUFFER_ZONE_MULTIPLIER

  if (panelRight > 0 && screenX < viewportWidth) {
    return 'visible'
  }

  if (panelRight > -bufferZone && screenX < viewportWidth + bufferZone) {
    return 'hidden'
  }

  return 'destroyed'
}

export function computeLayout(input: LayoutInput): PanelLayout[] {
  const { panels, scrollOffset, viewportWidth, viewportHeight } = input
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const stripHeight =
    viewportHeight - LAYOUT.STRIP_TOP_PADDING - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT
  const contentHeight = stripHeight - LAYOUT.TITLE_BAR_HEIGHT
  const contentTop = LAYOUT.STRIP_TOP_PADDING + LAYOUT.TITLE_BAR_HEIGHT

  return panels.map((panel, index) => {
    const stripX = index * (panelWidth + LAYOUT.PANEL_GAP)
    const screenX = stripX - scrollOffset
    const visibility = computeVisibility(screenX, panelWidth, viewportWidth)

    return {
      panelId: panel.id,
      contentBounds: {
        x: screenX,
        y: contentTop,
        width: panelWidth,
        height: contentHeight
      },
      titleBarBounds: {
        x: screenX,
        y: LAYOUT.STRIP_TOP_PADDING,
        width: panelWidth,
        height: LAYOUT.TITLE_BAR_HEIGHT
      },
      visibility
    }
  })
}

export function computeMaxScroll(panelCount: number, viewportWidth: number): number {
  if (panelCount === 0) return 0
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const totalStripWidth = panelCount * panelWidth + (panelCount - 1) * LAYOUT.PANEL_GAP
  return Math.max(0, totalStripWidth - viewportWidth)
}

export function computeScrollToCenter(
  panelIndex: number,
  panelCount: number,
  viewportWidth: number
): number {
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const stripX = panelIndex * (panelWidth + LAYOUT.PANEL_GAP)
  const centerOffset = stripX - (viewportWidth - panelWidth) / 2
  const maxScroll = computeMaxScroll(panelCount, viewportWidth)
  return Math.max(0, Math.min(centerOffset, maxScroll))
}

export function findMostCenteredPanel(
  scrollOffset: number,
  panelCount: number,
  viewportWidth: number
): number {
  if (panelCount === 0) return -1
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const viewportCenter = scrollOffset + viewportWidth / 2

  let closestIndex = 0
  let closestDistance = Infinity

  for (let i = 0; i < panelCount; i++) {
    const stripX = i * (panelWidth + LAYOUT.PANEL_GAP)
    const panelCenter = stripX + panelWidth / 2
    const distance = Math.abs(panelCenter - viewportCenter)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = i
    }
  }

  return closestIndex
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/layout/engine.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/layout/ tests/layout/
git commit -m "feat: add layout engine with full test coverage"
```

---

### Task 4: Animation Utilities (TDD)

**Files:**
- Create: `tests/scroll/animator.test.ts`
- Create: `src/renderer/src/scroll/animator.ts`

- [ ] **Step 1: Write failing tests**

`tests/scroll/animator.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { easeOut, lerp } from '../../src/renderer/src/scroll/animator'

describe('easeOut', () => {
  it('returns 0 at t=0', () => {
    expect(easeOut(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeOut(1)).toBe(1)
  })

  it('progresses faster at the start', () => {
    const early = easeOut(0.3)
    const late = easeOut(0.7) - easeOut(0.4)
    // Early progress (0 to 0.3) should cover more ground than same-size late interval
    expect(early).toBeGreaterThan(late)
  })

  it('is monotonically increasing', () => {
    let prev = 0
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const val = easeOut(t)
      expect(val).toBeGreaterThan(prev)
      prev = val
    }
  })
})

describe('lerp', () => {
  it('returns from at t=0', () => {
    expect(lerp(100, 200, 0)).toBe(100)
  })

  it('returns to at t=1', () => {
    expect(lerp(100, 200, 1)).toBe(200)
  })

  it('returns midpoint at t=0.5', () => {
    expect(lerp(100, 200, 0.5)).toBe(150)
  })

  it('works with negative values', () => {
    expect(lerp(-100, 100, 0.5)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/scroll/animator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement animation utilities**

`src/renderer/src/scroll/animator.ts`:
```typescript
export type EasingFn = (t: number) => number

export const easeOut: EasingFn = (t) => 1 - (1 - t) ** 3

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export interface AnimationHandle {
  cancel: () => void
}

export interface AnimateOptions {
  from: number
  to: number
  duration: number
  easing: EasingFn
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export function animate(options: AnimateOptions): AnimationHandle {
  const { from, to, duration, easing, onUpdate, onComplete } = options
  let rafId: number
  let startTime: number | null = null
  let cancelled = false

  function tick(now: number) {
    if (cancelled) return
    if (startTime === null) startTime = now

    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easedProgress = easing(progress)
    const value = lerp(from, to, easedProgress)

    onUpdate(value)

    if (progress < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      onComplete?.()
    }
  }

  rafId = requestAnimationFrame(tick)

  return {
    cancel: () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/scroll/animator.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/scroll/ tests/scroll/
git commit -m "feat: add easing and animation utilities"
```

---

### Task 5: Strip Store (TDD)

**Files:**
- Create: `tests/store/strip.test.ts`
- Create: `src/renderer/src/store/strip.ts`

- [ ] **Step 1: Write failing tests**

`tests/store/strip.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createStripStore } from '../../src/renderer/src/store/strip'

function withStore(fn: (store: ReturnType<typeof createStripStore>) => void) {
  createRoot((dispose) => {
    const store = createStripStore()
    fn(store)
    dispose()
  })
}

describe('createStripStore', () => {
  it('starts with no panels', () => {
    withStore(({ state }) => {
      expect(state.panels).toHaveLength(0)
      expect(state.focusedIndex).toBe(0)
      expect(state.scrollOffset).toBe(0)
    })
  })
})

describe('addPanel', () => {
  it('inserts panel after focused index', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel()
      expect(state.panels).toHaveLength(1)
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focuses newly added panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      expect(state.panels).toHaveLength(2)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('inserts after current focus, not at end', () => {
    withStore(({ state, actions }) => {
      actions.addPanel() // [A], focus 0
      actions.addPanel() // [A, B], focus 1
      actions.jumpTo(0) // focus back to A
      actions.addPanel() // [A, C, B], focus 1 (C inserted after A)
      expect(state.panels).toHaveLength(3)
      expect(state.focusedIndex).toBe(1)
      // The second panel should be the newly added one
      expect(state.panels[1].id).not.toBe(state.panels[0].id)
    })
  })

  it('assigns sequential colors from palette', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      actions.addPanel()
      expect(state.panels[0].color).toBe('#6366f1') // Slate Blue
      expect(state.panels[1].color).toBe('#10b981') // Emerald
      expect(state.panels[2].color).toBe('#f59e0b') // Amber
    })
  })
})

describe('removePanel', () => {
  it('removes focused panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      actions.jumpTo(0)
      const removed = actions.removePanel()
      expect(removed).toBeTruthy()
      expect(state.panels).toHaveLength(1)
    })
  })

  it('moves focus to nearest neighbor after removal', () => {
    withStore(({ state, actions }) => {
      actions.addPanel() // [A]
      actions.addPanel() // [A, B]
      actions.addPanel() // [A, B, C]
      actions.jumpTo(1) // focus B
      actions.removePanel() // remove B → [A, C], focus 1 (C)
      expect(state.panels).toHaveLength(2)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('clamps focus when removing last panel in list', () => {
    withStore(({ state, actions }) => {
      actions.addPanel() // [A]
      actions.addPanel() // [A, B]
      // focus is on B (index 1)
      actions.removePanel() // remove B → [A], focus 0
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('returns null when no panels', () => {
    withStore(({ actions }) => {
      expect(actions.removePanel()).toBeNull()
    })
  })
})

describe('focus navigation', () => {
  it('focusLeft decrements index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      // focus is on 1
      actions.focusLeft()
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focusLeft clamps at 0', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.jumpTo(0)
      actions.focusLeft()
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focusRight increments index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      actions.jumpTo(0)
      actions.focusRight()
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('focusRight clamps at last panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      // focus is on 1 (last)
      actions.focusRight()
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('jumpTo sets focus to specific index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.addPanel()
      actions.addPanel()
      actions.jumpTo(0)
      expect(state.focusedIndex).toBe(0)
      actions.jumpTo(2)
      expect(state.focusedIndex).toBe(2)
    })
  })

  it('jumpTo ignores out-of-range index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.jumpTo(5)
      expect(state.focusedIndex).toBe(0)
      actions.jumpTo(-1)
      expect(state.focusedIndex).toBe(0)
    })
  })
})

describe('viewport', () => {
  it('sets viewport dimensions', () => {
    withStore(({ state, actions }) => {
      actions.setViewport(1920, 1080)
      expect(state.viewportWidth).toBe(1920)
      expect(state.viewportHeight).toBe(1080)
    })
  })
})

describe('scrollOffset', () => {
  it('sets scroll offset', () => {
    withStore(({ state, actions }) => {
      actions.setScrollOffset(150)
      expect(state.scrollOffset).toBe(150)
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement strip store**

`src/renderer/src/store/strip.ts`:
```typescript
import { createStore } from 'solid-js/store'
import type { Panel } from '../../../shared/types'
import { PANEL_COLORS } from '../../../shared/constants'

export interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
}

export function createStripStore() {
  let nextId = 0
  let colorIndex = 0

  function nextPanel(): Panel {
    const color = PANEL_COLORS[colorIndex % PANEL_COLORS.length]
    colorIndex++
    nextId++
    return {
      id: `panel-${nextId}`,
      color: color.hex,
      label: `${nextId} — ${color.name}`
    }
  }

  const [state, setState] = createStore<StripState>({
    panels: [],
    focusedIndex: 0,
    scrollOffset: 0,
    viewportWidth: 800,
    viewportHeight: 600
  })

  const actions = {
    addPanel(): Panel {
      const panel = nextPanel()
      const insertIndex = state.panels.length === 0 ? 0 : state.focusedIndex + 1
      const before = state.panels.slice(0, insertIndex)
      const after = state.panels.slice(insertIndex)
      setState('panels', [...before, panel, ...after])
      setState('focusedIndex', insertIndex)
      return panel
    },

    removePanel(): string | null {
      if (state.panels.length === 0) return null
      const removedId = state.panels[state.focusedIndex].id
      const removedIndex = state.focusedIndex
      const newPanels = state.panels.filter((_, i) => i !== removedIndex)
      setState('panels', newPanels)
      if (newPanels.length > 0) {
        setState('focusedIndex', Math.min(removedIndex, newPanels.length - 1))
      } else {
        setState('focusedIndex', 0)
      }
      return removedId
    },

    focusLeft() {
      if (state.focusedIndex > 0) {
        setState('focusedIndex', state.focusedIndex - 1)
      }
    },

    focusRight() {
      if (state.focusedIndex < state.panels.length - 1) {
        setState('focusedIndex', state.focusedIndex + 1)
      }
    },

    jumpTo(index: number) {
      if (index >= 0 && index < state.panels.length) {
        setState('focusedIndex', index)
      }
    },

    setScrollOffset(offset: number) {
      setState('scrollOffset', offset)
    },

    setViewport(width: number, height: number) {
      setState('viewportWidth', width)
      setState('viewportHeight', height)
    }
  }

  return { state, actions }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/ tests/store/
git commit -m "feat: add strip store with panel and focus management"
```

---

### Task 6: Electron Main Process Shell

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/panel.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: Implement Chrome View preload**

`src/preload/index.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  createPanel: (id: string, color: string) => {
    ipcRenderer.send('panel:create', { id, color })
  },
  destroyPanel: (id: string) => {
    ipcRenderer.send('panel:destroy', id)
  },
  updateBounds: (updates: Array<{ panelId: string; bounds: { x: number; y: number; width: number; height: number }; visible: boolean }>) => {
    ipcRenderer.send('panel:update-bounds', updates)
  },
  onWheelEvent: (callback: (data: { deltaX: number }) => void) => {
    ipcRenderer.on('scroll:wheel', (_event, data) => callback(data))
  },
  onShortcut: (callback: (action: { type: string; index?: number }) => void) => {
    ipcRenderer.on('shortcut:action', (_event, action) => callback(action))
  }
})
```

- [ ] **Step 2: Implement panel preload**

`src/preload/panel.ts`:
```typescript
import { ipcRenderer } from 'electron'

window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })
```

- [ ] **Step 3: Update type declarations**

`src/renderer/src/env.d.ts`:
```typescript
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
```

- [ ] **Step 4: Implement main process entry**

`src/main/index.ts`:
```typescript
import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { PanelManager } from './panel-manager'

let mainWindow: BaseWindow
let chromeView: WebContentsView
let panelManager: PanelManager

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false
  })

  chromeView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.contentView.addChildView(chromeView)

  const { width, height } = mainWindow.getContentBounds()
  chromeView.setBounds({ x: 0, y: 0, width, height })

  if (process.env['ELECTRON_RENDERER_URL']) {
    chromeView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chromeView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  panelManager = new PanelManager(mainWindow, chromeView)

  setupIpcHandlers()
  setupShortcuts()

  mainWindow.on('resize', () => {
    const bounds = mainWindow.getContentBounds()
    chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  })

  chromeView.webContents.once('did-finish-load', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    panelManager.destroyAll()
  })
}

function setupIpcHandlers(): void {
  ipcMain.on('panel:create', (_event, data: { id: string; color: string }) => {
    panelManager.createPanel(data.id, data.color)
  })

  ipcMain.on('panel:destroy', (_event, id: string) => {
    panelManager.destroyPanel(id)
  })

  ipcMain.on('panel:update-bounds', (_event, updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>) => {
    panelManager.updateBounds(updates)
  })

  ipcMain.on('panel:wheel', (_event, data: { deltaX: number }) => {
    chromeView.webContents.send('scroll:wheel', data)
  })
}

function setupShortcuts(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Flywheel',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Panels',
      submenu: [
        {
          label: 'Focus Left',
          accelerator: 'Command+Left',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-left' })
        },
        {
          label: 'Focus Right',
          accelerator: 'Command+Right',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-right' })
        },
        { type: 'separator' },
        {
          label: 'New Panel',
          accelerator: 'CommandOrControl+T',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-panel' })
        },
        {
          label: 'Close Panel',
          accelerator: 'CommandOrControl+W',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'close-panel' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Jump to Panel ${i + 1}`,
          accelerator: `CommandOrControl+${i + 1}`,
          click: () => chromeView.webContents.send('shortcut:action', { type: 'jump-to', index: i })
        }))
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 5: Verify app launches**

Run: `npx electron-vite dev`
Expected: Window opens with dark background showing "Flywheel — Phase 1" text. DevTools accessible via View menu. Close via ⌘Q.

- [ ] **Step 6: Commit**

```bash
git add src/main/ src/preload/ src/renderer/src/env.d.ts
git commit -m "feat: implement Electron shell with BaseWindow, IPC, and shortcuts"
```

---

### Task 7: Panel Manager

**Files:**
- Create: `src/main/panel-manager.ts`

- [ ] **Step 1: Implement panel manager**

`src/main/panel-manager.ts`:
```typescript
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
```

- [ ] **Step 2: Verify panel creation**

Run: `npx electron-vite dev`
Expected: App still launches cleanly. No visible panels yet (renderer hasn't been wired to create them).

- [ ] **Step 3: Commit**

```bash
git add src/main/panel-manager.ts
git commit -m "feat: add panel manager for WebContentsView lifecycle"
```

---

### Task 8: Chrome View — Strip Rendering + Panel Integration

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/Strip.tsx`
- Create: `src/renderer/src/components/PanelFrame.tsx`
- Modify: `src/renderer/src/index.tsx`

- [ ] **Step 1: Create PanelFrame component**

`src/renderer/src/components/PanelFrame.tsx`:
```tsx
import type { Rectangle } from '../../../../shared/types'
import { LAYOUT } from '../../../../shared/constants'

interface PanelFrameProps {
  titleBarBounds: Rectangle
  contentBounds: Rectangle
  label: string
  focused: boolean
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH

  return (
    <>
      {/* Focus border — rendered behind panel WCV, peeks out around edges */}
      {props.focused && (
        <div
          style={{
            position: 'absolute',
            left: `${props.contentBounds.x - borderWidth}px`,
            top: `${props.contentBounds.y - borderWidth}px`,
            width: `${props.contentBounds.width + borderWidth * 2}px`,
            height: `${props.contentBounds.height + borderWidth * 2}px`,
            border: `${borderWidth}px solid #6366f1`,
            'border-radius': '4px',
            'box-shadow': '0 0 16px rgba(99, 102, 241, 0.2)',
            'pointer-events': 'none'
          }}
        />
      )}

      {/* Title bar — in the space above the panel WCV */}
      <div
        style={{
          position: 'absolute',
          left: `${props.titleBarBounds.x}px`,
          top: `${props.titleBarBounds.y}px`,
          width: `${props.titleBarBounds.width}px`,
          height: `${props.titleBarBounds.height}px`,
          display: 'flex',
          'align-items': 'center',
          'padding-left': '12px',
          'font-size': '13px',
          'font-weight': props.focused ? '500' : '400',
          color: props.focused ? '#e0e0e0' : '#666',
          background: props.focused ? '#252540' : '#1a1a2e',
          'border-radius': '6px 6px 0 0',
          'user-select': 'none',
          'border-bottom': props.focused ? '2px solid #6366f1' : '1px solid #2a2a3e'
        }}
      >
        {props.label}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create Strip component**

`src/renderer/src/components/Strip.tsx`:
```tsx
import { For } from 'solid-js'
import type { PanelLayout } from '../../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  panels: Array<{ id: string; label: string }>
  focusedIndex: number
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry, index) => {
          const panel = () => props.panels.find((p) => p.id === entry.panelId)
          return (
            <PanelFrame
              titleBarBounds={entry.titleBarBounds}
              contentBounds={entry.contentBounds}
              label={panel()?.label ?? ''}
              focused={index() === props.focusedIndex}
            />
          )
        }}
      </For>
    </div>
  )
}
```

- [ ] **Step 3: Create App component**

`src/renderer/src/App.tsx`:
```tsx
import { createEffect, on, onMount, batch } from 'solid-js'
import { createStripStore } from './store/strip'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { PanelBoundsUpdate } from '../../../shared/types'
import Strip from './components/Strip'

export default function App() {
  const { state, actions } = createStripStore()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  // --- Layout effect: drive panel WCV lifecycle + positioning ---
  createEffect(() => {
    const layout = computeLayout({
      panels: [...state.panels],
      scrollOffset: state.scrollOffset,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight
    })

    const desiredIds = new Set<string>()
    const boundsUpdates: PanelBoundsUpdate[] = []

    for (const entry of layout) {
      if (entry.visibility === 'destroyed') continue

      desiredIds.add(entry.panelId)

      if (!createdPanelIds.has(entry.panelId)) {
        const panel = state.panels.find((p) => p.id === entry.panelId)
        if (panel) {
          window.api.createPanel(entry.panelId, panel.color)
          createdPanelIds.add(entry.panelId)
        }
      }

      boundsUpdates.push({
        panelId: entry.panelId,
        bounds: entry.contentBounds,
        visible: entry.visibility === 'visible'
      })
    }

    for (const id of [...createdPanelIds]) {
      if (!desiredIds.has(id)) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates)
    }
  })

  // --- Animate scroll on keyboard-driven focus changes ---
  createEffect(
    on(
      () => state.focusedIndex,
      (focusedIndex) => {
        currentAnimation?.cancel()
        currentAnimation = null

        const target = computeScrollToCenter(
          focusedIndex,
          state.panels.length,
          state.viewportWidth
        )

        if (Math.abs(state.scrollOffset - target) < 1) {
          actions.setScrollOffset(target)
          return
        }

        currentAnimation = animate({
          from: state.scrollOffset,
          to: target,
          duration: 200,
          easing: easeOut,
          onUpdate: (value) => actions.setScrollOffset(value),
          onComplete: () => {
            currentAnimation = null
          }
        })
      },
      { defer: true }
    )
  )

  // --- Wheel scroll handler ---
  function handleWheel(deltaX: number): void {
    currentAnimation?.cancel()
    currentAnimation = null

    const maxScroll = computeMaxScroll(state.panels.length, state.viewportWidth)
    const newOffset = Math.max(0, Math.min(state.scrollOffset + deltaX, maxScroll))
    actions.setScrollOffset(newOffset)

    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(() => {
      const idx = findMostCenteredPanel(
        state.scrollOffset,
        state.panels.length,
        state.viewportWidth
      )
      if (idx >= 0 && idx !== state.focusedIndex) {
        actions.jumpTo(idx)
      }
    }, 150)
  }

  // --- Shortcut handler ---
  function handleShortcut(action: { type: string; index?: number }): void {
    switch (action.type) {
      case 'focus-left':
        actions.focusLeft()
        break
      case 'focus-right':
        actions.focusRight()
        break
      case 'new-panel':
        actions.addPanel()
        break
      case 'close-panel':
        actions.removePanel()
        break
      case 'jump-to':
        if (action.index !== undefined) {
          actions.jumpTo(action.index)
        }
        break
    }
  }

  // --- Setup IPC listeners + initial state ---
  onMount(() => {
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))

    window.addEventListener('resize', () => {
      actions.setViewport(window.innerWidth, window.innerHeight)
    })

    // Also handle wheel events directly on the Chrome View
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) {
        handleWheel(event.deltaX)
      }
    }, { passive: true })

    batch(() => {
      actions.setViewport(window.innerWidth, window.innerHeight)
      actions.addPanel()
      actions.addPanel()
      actions.addPanel()
      actions.jumpTo(0)
    })
  })

  // --- Computed layout for rendering ---
  const layout = () =>
    computeLayout({
      panels: [...state.panels],
      scrollOffset: state.scrollOffset,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight
    })

  return (
    <>
      <Strip
        layout={layout()}
        panels={[...state.panels]}
        focusedIndex={state.focusedIndex}
      />
    </>
  )
}
```

- [ ] **Step 4: Update index.tsx to use App**

`src/renderer/src/index.tsx`:
```tsx
import { render } from 'solid-js/web'
import './global.css'
import App from './App'

render(() => <App />, document.getElementById('root')!)
```

- [ ] **Step 5: Verify panels appear**

Run: `npx electron-vite dev`
Expected: Window opens with 3 colored panels (Slate Blue, Emerald, Amber) positioned as columns. Each has a title bar above it. First panel has a focus indicator (indigo border). Panels are colored rectangles with dark gaps between them.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/
git commit -m "feat: render strip with panel frames and focus indicator"
```

---

### Task 9: Verify Keyboard Shortcuts + Animated Navigation

Shortcuts were wired in Tasks 6 and 8. This task verifies they work end-to-end.

- [ ] **Step 1: Test keyboard navigation**

Run: `npx electron-vite dev`

Test each shortcut:
- `⌘→` — Focus moves to next panel, strip animates to center it
- `⌘←` — Focus moves to previous panel, strip animates
- `⌘T` — New panel appears to the right of focused panel, focus moves to it
- `⌘W` — Focused panel closes, focus moves to neighbor
- `⌘1` through `⌘3` — Jump to panel by position

Expected: All shortcuts work. Focus indicator (indigo border on title bar + glow around panel) follows the focused panel. Strip scrolls smoothly with ease-out animation (~200ms) when focus changes.

- [ ] **Step 2: Fix any issues found during testing**

If shortcuts don't work, check:
1. Menu accelerators are correctly defined in `src/main/index.ts`
2. IPC messages reach the Chrome View (add `console.log` in shortcut handler)
3. Store actions correctly update state

If animation doesn't work, check:
1. `createEffect(on(...))` runs when `focusedIndex` changes
2. `animate()` calls `requestAnimationFrame` correctly
3. `onUpdate` calls `actions.setScrollOffset()`

- [ ] **Step 3: Commit (if fixes were needed)**

```bash
git add -u
git commit -m "fix: resolve keyboard shortcut issues"
```

---

### Task 10: Verify Trackpad Scrolling

Scrolling was wired in Tasks 6 and 8. This task verifies it works end-to-end.

- [ ] **Step 1: Test trackpad scrolling**

Run: `npx electron-vite dev`

Add several panels with `⌘T` (6+ panels so the strip extends beyond the viewport).

Test:
- Horizontal two-finger swipe on trackpad — strip scrolls
- Momentum scrolling — after lifting fingers, strip continues to coast
- Focus updates after scrolling stops (~150ms debounce)
- Scrolling cancels any in-progress keyboard animation

Expected: Smooth, responsive scrolling. The strip follows the trackpad gesture. Momentum events from macOS are handled naturally. After scroll stops, focus indicator moves to the most-centered panel.

- [ ] **Step 2: Adjust scroll direction if inverted**

If scrolling direction feels inverted (swiping right scrolls left instead of content following fingers), change the sign in `handleWheel` in `src/renderer/src/App.tsx`:

```typescript
// Change this:
const newOffset = Math.max(0, Math.min(state.scrollOffset + deltaX, maxScroll))
// To this:
const newOffset = Math.max(0, Math.min(state.scrollOffset - deltaX, maxScroll))
```

Test again to confirm the direction is correct.

- [ ] **Step 3: Commit (if fixes were needed)**

```bash
git add -u
git commit -m "fix: adjust trackpad scroll behavior"
```

---

### Task 11: Panel Visibility Management

Visibility logic is already in the layout engine (`computeVisibility`) and the layout effect in `App.tsx`. This task verifies the create/destroy lifecycle works correctly.

- [ ] **Step 1: Test visibility management**

Run: `npx electron-vite dev`

Add 8+ panels with `⌘T`. Scroll through the strip.

Test:
- Panels that scroll far off-screen (beyond 1 viewport width) are destroyed (check DevTools memory)
- Panels that scroll back into range are recreated with correct colors
- Panels in the buffer zone (off-screen but within 1 viewport width) are hidden but not destroyed

Expected: Panel `WebContentsView` instances are created and destroyed as needed. Colors are preserved when panels are recreated.

- [ ] **Step 2: Open DevTools and verify**

Open DevTools via View > Toggle Developer Tools. In the console, you can monitor IPC messages by adding temporary logging in `App.tsx`'s layout effect:

```typescript
console.log('Layout update:', boundsUpdates.length, 'visible,',
  [...createdPanelIds].length, 'created')
```

Scroll through panels and verify the created count changes as panels enter/leave the viewport.

- [ ] **Step 3: Remove debug logging and commit**

```bash
git add -u
git commit -m "feat: verify panel visibility lifecycle"
```

---

### Task 12: Scroll Indicators, Hint Bar, and Final Polish

**Files:**
- Create: `src/renderer/src/components/ScrollIndicators.tsx`
- Create: `src/renderer/src/components/HintBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/global.css`

- [ ] **Step 1: Create ScrollIndicators component**

`src/renderer/src/components/ScrollIndicators.tsx`:
```tsx
import { LAYOUT } from '../../../../shared/constants'

interface ScrollIndicatorsProps {
  scrollOffset: number
  maxScroll: number
  viewportWidth: number
  viewportHeight: number
}

export default function ScrollIndicators(props: ScrollIndicatorsProps) {
  const trackTop = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT
  const showLeft = () => props.scrollOffset > 1
  const showRight = () => props.scrollOffset < props.maxScroll - 1
  const thumbWidth = () => {
    if (props.maxScroll <= 0) return props.viewportWidth
    const ratio = props.viewportWidth / (props.viewportWidth + props.maxScroll)
    return Math.max(40, props.viewportWidth * ratio)
  }
  const thumbLeft = () => {
    if (props.maxScroll <= 0) return 0
    const ratio = props.scrollOffset / props.maxScroll
    return ratio * (props.viewportWidth - thumbWidth())
  }

  return (
    <>
      {/* Left fade gradient */}
      {showLeft() && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: `${LAYOUT.STRIP_TOP_PADDING}px`,
            width: '60px',
            height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
            background: 'linear-gradient(to right, rgba(15,15,26,0.9), transparent)',
            'pointer-events': 'none',
            display: 'flex',
            'align-items': 'center',
            'padding-left': '8px',
            'z-index': 10
          }}
        >
          <span style={{ color: '#555', 'font-size': '18px' }}>‹</span>
        </div>
      )}

      {/* Right fade gradient */}
      {showRight() && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: `${LAYOUT.STRIP_TOP_PADDING}px`,
            width: '60px',
            height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
            background: 'linear-gradient(to left, rgba(15,15,26,0.9), transparent)',
            'pointer-events': 'none',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'flex-end',
            'padding-right': '8px',
            'z-index': 10
          }}
        >
          <span style={{ color: '#555', 'font-size': '18px' }}>›</span>
        </div>
      )}

      {/* Scroll track */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: `${trackTop()}px`,
          width: '100%',
          height: `${LAYOUT.SCROLL_TRACK_HEIGHT}px`,
          background: '#1a1a2e'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${thumbLeft()}px`,
            top: 0,
            width: `${thumbWidth()}px`,
            height: '100%',
            background: props.maxScroll > 0 ? '#333' : 'transparent',
            'border-radius': '2px',
            transition: 'background 0.2s'
          }}
        />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create HintBar component**

`src/renderer/src/components/HintBar.tsx`:
```tsx
import { LAYOUT } from '../../../../shared/constants'

interface HintBarProps {
  viewportHeight: number
}

const HINTS = [
  { key: '⌘←', label: 'Focus Left' },
  { key: '⌘→', label: 'Focus Right' },
  { key: '⌘T', label: 'New Panel' },
  { key: '⌘W', label: 'Close' },
  { key: '⌘1-9', label: 'Jump' }
]

export default function HintBar(props: HintBarProps) {
  const top = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: `${top()}px`,
        width: '100%',
        height: `${LAYOUT.HINT_BAR_HEIGHT}px`,
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '24px',
        background: '#1a1a2e',
        'border-top': '1px solid #252540',
        'user-select': 'none',
        'font-size': '12px'
      }}
    >
      {HINTS.map((hint) => (
        <span>
          <span
            style={{
              color: '#888',
              'font-weight': '500',
              background: '#252540',
              padding: '2px 6px',
              'border-radius': '3px',
              'margin-right': '4px',
              'font-family': 'monospace'
            }}
          >
            {hint.key}
          </span>
          <span style={{ color: '#555' }}>{hint.label}</span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx to include new components**

Add imports at the top of `src/renderer/src/App.tsx`:
```typescript
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'
import { computeMaxScroll } from './layout/engine'
```

Replace the `return` statement in `App.tsx`:
```tsx
  const maxScroll = () => computeMaxScroll(state.panels.length, state.viewportWidth)

  return (
    <>
      <Strip
        layout={layout()}
        panels={[...state.panels]}
        focusedIndex={state.focusedIndex}
      />
      <ScrollIndicators
        scrollOffset={state.scrollOffset}
        maxScroll={maxScroll()}
        viewportWidth={state.viewportWidth}
        viewportHeight={state.viewportHeight}
      />
      <HintBar viewportHeight={state.viewportHeight} />
    </>
  )
```

Note: `computeMaxScroll` is already imported from Task 8 — just add the `maxScroll` memo and the new components to the return.

- [ ] **Step 4: Verify everything works together**

Run: `npx electron-vite dev`

Test the complete experience:
1. App launches with 3 colored panels, first focused
2. Keyboard hint bar at the bottom shows shortcuts
3. `⌘→` / `⌘←` moves focus with smooth animation
4. `⌘T` adds a new panel, `⌘W` closes focused panel
5. `⌘1-3` jumps to specific panels
6. Trackpad horizontal scroll moves the strip with momentum
7. After scrolling stops, focus snaps to most-centered panel
8. Fade gradients appear on edges when panels exist off-screen
9. Scroll track at bottom shows viewport position
10. Panels far off-screen are destroyed and recreated on scroll

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ScrollIndicators.tsx src/renderer/src/components/HintBar.tsx src/renderer/src/App.tsx
git commit -m "feat: add scroll indicators, hint bar, and complete Phase 1 integration"
```

- [ ] **Step 6: Run all tests to ensure nothing is broken**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Final commit (if any cleanup needed)**

```bash
git add -u
git commit -m "chore: Phase 1 complete — Electron shell with scrollable strip"
```
