# Panel Chrome In-View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move title bars and nav bars from the chrome view overlay into each panel's own WebContentsView so chrome and content are in the same compositing layer and scroll together without misalignment.

**Architecture:** Terminal panels embed their title bar as HTML inside `terminal/index.html`. Browser panels get TWO sibling WebContentsViews: a 60px "chrome strip" (title bar + nav bar, loads `browser-host.html`) and a content view (loads the URL directly). Both browser views are positioned by the same `updateBounds` batch so they move in lockstep. The chrome view (Solid.js app) only renders non-scrolling elements: focus border, scroll indicators, hint bar, confirm dialog. The main process sends chrome state (position, label, focused, nav state) to each panel's views via IPC.

**Tech Stack:** Electron `WebContentsView`, Solid.js (chrome view), xterm.js (terminals), vanilla DOM (browser chrome strip), inline SVGs (nav icons), existing IPC patterns.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/browser/browser-host.html` | Chrome strip for browser panels: title bar + nav bar (60px tall) |
| `src/browser/browser-host.ts` | Script for browser chrome strip: renders title/nav bar, handles URL editing, sends nav actions via IPC |
| `src/browser/icons.ts` | Inline SVG strings for nav icons (globe, arrow-left, arrow-right, rotate-cw) — panel views can't use lucide-solid |

### Modified files
| File | Changes |
|------|---------|
| `src/terminal/index.html` | Add title bar + spacer divs above the terminal container; adjust terminal sizing to `calc(100% - 60px)` |
| `src/terminal/terminal.ts` | Render title bar text from chrome state IPC; toggle focused class |
| `src/preload/panel.ts` | Add `onChromeState` IPC listener for title bar updates |
| `src/preload/browser.ts` | Add `contextBridge` with nav actions (navigate, goBack, goForward, reload) and `onChromeState` listener |
| `src/main/panel-manager.ts` | Browser panels create TWO views (chrome strip + content); `updateBounds` positions both; `sendChromeState` method sends state to panel views; `ManagedPanel` gains optional `chromeView` field |
| `src/main/index.ts` | Add IPC handlers for browser host nav actions (`browser:navigate-from-host`, etc.); add `panel:send-chrome-state` handler |
| `src/renderer/src/components/PanelFrame.tsx` | Remove title bar, nav bar, spacer. Keep ONLY the focus border |
| `src/renderer/src/components/Strip.tsx` | Remove onNavigate/onGoBack/onGoForward/onReload props; simplify panel type in StripProps |
| `src/renderer/src/App.tsx` | Remove nav callbacks from Strip; send chrome state to panels via IPC on focus/title/URL/nav changes; adjust bounds (panels start at y=8, full height) |
| `src/renderer/src/layout/engine.ts` | `contentBounds` starts at `STRIP_TOP_PADDING` (y=8), full panel height; remove `titleBarBounds` |
| `src/shared/types.ts` | Add `PanelChromeState` type; remove `titleBarBounds` from `PanelLayout` |
| `src/shared/constants.ts` | Add `PANEL_CHROME_HEIGHT: 60` |
| `src/renderer/src/env.d.ts` | Add `sendChromeState` method; remove `onBrowserNavStateChanged` (now handled per-panel) |
| `src/preload/index.ts` | Add `sendChromeState(panelId, state)` to send state to a panel's view |
| `electron.vite.config.ts` | Add `browser-host` renderer entry |
| `tests/layout/engine.test.ts` | Update for new contentBounds (y=8, no titleBarBounds) |

---

### Task 1: Add PanelChromeState type and layout constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add PanelChromeState type and simplify PanelLayout**

In `src/shared/types.ts`, add:

```ts
export interface PanelChromeState {
  panelId: string
  position: number
  label: string
  focused: boolean
  type: 'terminal' | 'placeholder' | 'browser'
  url?: string
  canGoBack?: boolean
  canGoForward?: boolean
}
```

Remove `titleBarBounds` from `PanelLayout`:

```ts
export interface PanelLayout {
  panelId: string
  contentBounds: Rectangle
  visibility: VisibilityState
}
```

- [ ] **Step 2: Add PANEL_CHROME_HEIGHT constant**

In `src/shared/constants.ts`, add to `LAYOUT`:

```ts
PANEL_CHROME_HEIGHT: 60, // TITLE_BAR_HEIGHT(32) + BROWSER_NAV_BAR_HEIGHT(28)
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git -c commit.gpgsign=false commit -m "feat: add PanelChromeState type, remove titleBarBounds from PanelLayout"
```

---

### Task 2: Update layout engine — panels start at y=8, no titleBarBounds

**Files:**
- Modify: `src/renderer/src/layout/engine.ts`
- Modify: `tests/layout/engine.test.ts`

- [ ] **Step 1: Update computeLayout**

In `src/renderer/src/layout/engine.ts`, change `computeLayout`:

```ts
export function computeLayout(input: LayoutInput): PanelLayout[] {
  const { panels, scrollOffset, viewportWidth, viewportHeight } = input
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const panelTop = LAYOUT.STRIP_TOP_PADDING
  const panelHeight = viewportHeight - LAYOUT.STRIP_TOP_PADDING - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT

  return panels.map((panel, index) => {
    const stripX = index * (panelWidth + LAYOUT.PANEL_GAP)
    const screenX = stripX - scrollOffset
    return {
      panelId: panel.id,
      contentBounds: { x: screenX, y: panelTop, width: panelWidth, height: panelHeight },
      visibility: computeVisibility(screenX, panelWidth, viewportWidth)
    }
  })
}
```

`contentBounds.y` is now `STRIP_TOP_PADDING` (8) instead of 40. Height is the full panel height. `titleBarBounds` is removed.

- [ ] **Step 2: Update layout tests**

In `tests/layout/engine.test.ts`:

Replace `'positions title bars above content'` with:

```ts
it('positions panels at strip top padding', () => {
  const layout = computeLayout({ panels: [mkPanel('a')], scrollOffset: 0, viewportWidth: 1000, viewportHeight: 600 })
  expect(layout[0].contentBounds.y).toBe(8)
})
```

Update `'computes content height from viewport'`:

```ts
it('computes panel height from viewport', () => {
  const layout = computeLayout({ panels: [mkPanel('a')], scrollOffset: 0, viewportWidth: 1000, viewportHeight: 600 })
  // 600 - 8(top) - 32(hint) - 4(scroll) = 556
  expect(layout[0].contentBounds.height).toBe(556)
})
```

Remove any `titleBarBounds` assertions.

- [ ] **Step 3: Run tests**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx vitest run tests/layout/engine.test.ts`
Expected: All layout tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/layout/engine.ts tests/layout/engine.test.ts
git -c commit.gpgsign=false commit -m "feat: layout engine — panels start at y=8, remove titleBarBounds"
```

---

### Task 3: Inline SVG icons for browser chrome strip

**Files:**
- Create: `src/browser/icons.ts`

- [ ] **Step 1: Create inline SVG icon module**

Create `src/browser/icons.ts`:

```ts
function svg(paths: string, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

export const ICONS = {
  globe: svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M12 2a14.5 14.5 0 0 1 0 20"/><path d="M2 12h20"/>'),
  arrowLeft: svg('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'),
  arrowRight: svg('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'),
  rotateCw: svg('<path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>', 12),
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/browser/icons.ts
git -c commit.gpgsign=false commit -m "feat: add inline SVG icons for panel chrome strip"
```

---

### Task 4: Terminal panel renders its own title bar

**Files:**
- Modify: `src/terminal/index.html`
- Modify: `src/terminal/terminal.ts`
- Modify: `src/preload/panel.ts`

- [ ] **Step 1: Add onChromeState to panel preload**

In `src/preload/panel.ts`, add to the `contextBridge.exposeInMainWorld('pty', {...})` object:

```ts
onChromeState: (callback: (state: { position: number; label: string; focused: boolean }) => void) => {
  ipcRenderer.on('panel:chrome-state', (_event, state) => callback(state))
},
```

- [ ] **Step 2: Add title bar markup to terminal HTML**

Replace `src/terminal/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: #1a1a2e;
    }
    #panel-titlebar {
      height: 32px; display: flex; align-items: center;
      padding: 0 12px; font-size: 13px; font-weight: 400;
      color: #666; background: #1a1a2e; user-select: none;
      border-bottom: 1px solid #2a2a3e; box-sizing: border-box;
      border-radius: 6px 6px 0 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #panel-titlebar.focused { font-weight: 500; color: #e0e0e0; background: #252540; }
    #panel-spacer {
      height: 28px; background: #1a1a2e;
      border-bottom: 1px solid #2a2a3e; box-sizing: border-box;
    }
    #panel-spacer.focused { background: #252540; border-bottom: 2px solid #6366f1; }
    #terminal {
      width: calc(100% - 16px);
      height: calc(100% - 68px);
      padding: 8px;
    }
  </style>
</head>
<body>
  <div id="panel-titlebar"></div>
  <div id="panel-spacer"></div>
  <div id="terminal"></div>
  <script type="module" src="./terminal.ts"></script>
</body>
</html>
```

Terminal container height: `calc(100% - 68px)` = 100% minus 32px title bar, 28px spacer, 8px padding.

- [ ] **Step 3: Add chrome state handler to terminal.ts**

In `src/terminal/terminal.ts`, update the `window.pty` type declaration to include `onChromeState`:

```ts
onChromeState: (callback: (state: { position: number; label: string; focused: boolean }) => void) => void
```

Then add at the end of the file, after `reportSize()`:

```ts
// Chrome state → title bar
const titleBar = document.getElementById('panel-titlebar')!
const spacer = document.getElementById('panel-spacer')!

window.pty.onChromeState((state) => {
  const pos = state.position <= 9 ? `${state.position} / ` : ''
  titleBar.textContent = `${pos}${state.label}`
  titleBar.classList.toggle('focused', state.focused)
  spacer.classList.toggle('focused', state.focused)
})
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/terminal/index.html src/terminal/terminal.ts src/preload/panel.ts
git -c commit.gpgsign=false commit -m "feat: terminal panel renders its own title bar and spacer"
```

---

### Task 5: Browser host page + browser-content preload split

**Files:**
- Create: `src/browser/browser-host.html`
- Create: `src/browser/browser-host.ts`
- Create: `src/preload/browser-content.ts`
- Modify: `src/preload/browser.ts`
- Modify: `electron.vite.config.ts`

**Important:** The existing `browser.ts` preload is repurposed for the chrome strip host page. A new `browser-content.ts` preload (minimal, wheel-only) must be created in the SAME task to avoid breaking content views between commits.

- [ ] **Step 1: Create browser-content preload (minimal, for untrusted content views)**

Create `src/preload/browser-content.ts`:

```ts
import { ipcRenderer } from 'electron'

// Forward horizontal scroll events to the strip.
// Browser content loads untrusted URLs — no contextBridge, just wheel forwarding.
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })
```

Add to `electron.vite.config.ts` preload inputs:

```ts
'browser-content': resolve(__dirname, 'src/preload/browser-content.ts')
```

- [ ] **Step 2: Extend browser preload with contextBridge (for chrome strip host page)**

Replace `src/preload/browser.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

const params = new URLSearchParams(window.location.search)
const panelId = params.get('panelId') || ''

// Forward horizontal scroll events to the strip
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })

contextBridge.exposeInMainWorld('browserHost', {
  panelId,
  initialUrl: params.get('url') || 'about:blank',
  navigate: (url: string) => {
    ipcRenderer.send('browser:navigate-from-host', { panelId, url })
  },
  goBack: () => {
    ipcRenderer.send('browser:go-back', { panelId })
  },
  goForward: () => {
    ipcRenderer.send('browser:go-forward', { panelId })
  },
  reload: () => {
    ipcRenderer.send('browser:reload', { panelId })
  },
  onChromeState: (callback: (state: {
    position: number; label: string; focused: boolean;
    url: string; canGoBack: boolean; canGoForward: boolean
  }) => void) => {
    ipcRenderer.on('panel:chrome-state', (_event, state) => callback(state))
  }
})
```

Note: `goBack`, `goForward`, `reload` reuse the existing IPC channel names from the main process handlers that already exist. `navigate` uses a new channel `browser:navigate-from-host` to distinguish from the chrome view's `browser:navigate`.

- [ ] **Step 3: Create browser host HTML**

Create `src/browser/browser-host.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 60px;
      overflow: hidden; background: #1a1a2e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #titlebar {
      height: 32px; display: flex; align-items: center;
      padding: 0 12px; font-size: 13px; font-weight: 400;
      color: #666; background: #1a1a2e; user-select: none;
      border-bottom: 1px solid #2a2a3e; box-sizing: border-box;
      border-radius: 6px 6px 0 0;
    }
    #titlebar.focused { font-weight: 500; color: #e0e0e0; background: #252540; }
    #titlebar .pos { flex-shrink: 0; margin-right: 6px; }
    #titlebar .globe { flex-shrink: 0; margin-right: 6px; color: #06b6d4; display: flex; align-items: center; }
    #titlebar .title {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 12px; color: #555;
    }
    #titlebar.focused .title { color: #c0c0c0; }
    #navbar {
      height: 28px; display: flex; align-items: center;
      padding: 0 8px; background: #1e1e36; gap: 4px;
      box-sizing: border-box; border-bottom: 1px solid #2a2a3e;
    }
    #navbar.focused { border-bottom: 2px solid #6366f1; }
    .nav-btn {
      width: 22px; height: 22px; display: flex; align-items: center;
      justify-content: center; border-radius: 4px; cursor: pointer;
      border: none; background: transparent; color: #888; padding: 0; flex-shrink: 0;
    }
    .nav-btn:disabled { color: #444; cursor: default; }
    .nav-sep { width: 1px; height: 16px; background: #333; flex-shrink: 0; }
    #url-display {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: monospace; font-size: 12px; color: #888; cursor: text;
    }
    #url-input {
      flex: 1; background: #1a1a2e; border: 1px solid #3a3a5c;
      border-radius: 3px; color: #e0e0e0; font-size: 12px;
      font-family: monospace; padding: 2px 6px; outline: none; height: 22px;
      display: none;
    }
  </style>
</head>
<body>
  <div id="titlebar">
    <span class="pos" id="pos-label"></span>
    <span class="globe" id="globe-icon"></span>
    <span class="title" id="title-label">about:blank</span>
  </div>
  <div id="navbar">
    <button class="nav-btn" id="btn-back" disabled></button>
    <button class="nav-btn" id="btn-forward" disabled></button>
    <div class="nav-sep"></div>
    <span id="url-display">about:blank</span>
    <input type="text" id="url-input">
    <button class="nav-btn" id="btn-reload"></button>
  </div>
  <script type="module" src="./browser-host.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Create browser host script**

Create `src/browser/browser-host.ts`:

```ts
import { ICONS } from './icons'

declare global {
  interface Window {
    browserHost: {
      panelId: string
      initialUrl: string
      navigate: (url: string) => void
      goBack: () => void
      goForward: () => void
      reload: () => void
      onChromeState: (callback: (state: {
        position: number; label: string; focused: boolean;
        url: string; canGoBack: boolean; canGoForward: boolean
      }) => void) => void
    }
  }
}

const titlebar = document.getElementById('titlebar')!
const navbar = document.getElementById('navbar')!
const posLabel = document.getElementById('pos-label')!
const globeIcon = document.getElementById('globe-icon')!
const titleLabel = document.getElementById('title-label')!
const btnBack = document.getElementById('btn-back') as HTMLButtonElement
const btnForward = document.getElementById('btn-forward') as HTMLButtonElement
const btnReload = document.getElementById('btn-reload') as HTMLButtonElement
const urlDisplay = document.getElementById('url-display')!
const urlInput = document.getElementById('url-input') as HTMLInputElement

// Set icons
globeIcon.innerHTML = ICONS.globe
btnBack.innerHTML = ICONS.arrowLeft
btnForward.innerHTML = ICONS.arrowRight
btnReload.innerHTML = ICONS.rotateCw

// Nav button handlers
btnBack.addEventListener('click', () => window.browserHost.goBack())
btnForward.addEventListener('click', () => window.browserHost.goForward())
btnReload.addEventListener('click', () => window.browserHost.reload())

// URL bar editing
let editing = false

urlDisplay.addEventListener('click', () => {
  editing = true
  urlInput.value = urlDisplay.textContent || ''
  urlDisplay.style.display = 'none'
  urlInput.style.display = 'block'
  requestAnimationFrame(() => urlInput.focus())
})

function normalizeUrl(raw: string): string {
  if (raw.match(/^https?:\/\//)) return raw
  const isLocal = raw.match(/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/)
  return isLocal ? `http://${raw}` : `https://${raw}`
}

function commitUrl(): void {
  const raw = urlInput.value.trim()
  editing = false
  urlInput.style.display = 'none'
  urlDisplay.style.display = 'block'
  if (raw) window.browserHost.navigate(normalizeUrl(raw))
}

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitUrl() }
  else if (e.key === 'Escape') {
    editing = false
    urlInput.style.display = 'none'
    urlDisplay.style.display = 'block'
  }
})

urlInput.addEventListener('blur', () => { if (editing) commitUrl() })

// Chrome state updates from main process — merges partial updates
let currentState = {
  position: 0, label: '', focused: false,
  url: 'about:blank', canGoBack: false, canGoForward: false
}

window.browserHost.onChromeState((partial) => {
  currentState = { ...currentState, ...partial }
  const s = currentState
  posLabel.textContent = s.position <= 9 ? `${s.position} /` : ''
  titleLabel.textContent = s.url || 'about:blank'
  titlebar.classList.toggle('focused', s.focused)
  navbar.classList.toggle('focused', s.focused)
  btnBack.disabled = !s.canGoBack
  btnForward.disabled = !s.canGoForward
  if (!editing) urlDisplay.textContent = s.url || 'about:blank'
})

// Auto-focus URL input if initial URL is about:blank
if (window.browserHost.initialUrl === 'about:blank') {
  requestAnimationFrame(() => {
    urlDisplay.style.display = 'none'
    urlInput.style.display = 'block'
    urlInput.focus()
  })
}
```

- [ ] **Step 5: Add browser-host to build config**

In `electron.vite.config.ts`, add to the renderer `rollupOptions.input`:

```ts
'browser-host': resolve(__dirname, 'src/browser/browser-host.html')
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -10`
Expected: Build succeeds with `browser-host` and `browser-content` entries.

- [ ] **Step 7: Commit**

```bash
git add src/browser/browser-host.html src/browser/browser-host.ts src/preload/browser.ts src/preload/browser-content.ts electron.vite.config.ts
git -c commit.gpgsign=false commit -m "feat: browser chrome strip with title bar, nav bar, URL editing, and content preload split"
```

---

### Task 6: PanelManager — two views per browser panel, chrome state IPC

**Files:**
- Modify: `src/main/panel-manager.ts`

- [ ] **Step 1: Add chromeView field to ManagedPanel**

Update the interface:

```ts
interface ManagedPanel {
  id: string
  type: 'terminal' | 'placeholder' | 'browser'
  view: WebContentsView
  chromeView?: WebContentsView  // browser panels only: title bar + nav bar strip
}
```

- [ ] **Step 2: Update createPanel for browser panels — two views**

Replace the browser branch in `createPanel` (the `} else if (panelType === 'browser') {` block):

```ts
} else if (panelType === 'browser') {
  const url = 'url' in options ? options.url : 'about:blank'

  // Chrome strip view — title bar + nav bar (trusted host page)
  const chromeStripView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/browser.js'),
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    chromeStripView.webContents.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/browser-host/index.html?panelId=${id}&url=${encodeURIComponent(url)}`
    )
  } else {
    chromeStripView.webContents.loadFile(
      join(__dirname, '../renderer/browser-host/index.html'),
      { query: { panelId: id, url } }
    )
  }
  this.window.contentView.addChildView(chromeStripView)

  // Content view — loads the actual URL (sandboxed, minimal wheel-only preload)
  // The main `view` variable already created above is used for this.
  view.webContents.loadURL(url)

  // Intercept target="_blank" / window.open → open as new strip panel
  view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    this.chromeView.webContents.send('browser:open-url', { url: targetUrl })
    return { action: 'deny' }
  })

  // Track URL changes → update chrome strip + chrome view
  const emitNavState = (_event: unknown, navUrl: string): void => {
    this.chromeView.webContents.send('browser:url-changed', { panelId: id, url: navUrl })
    chromeStripView.webContents.send('panel:chrome-state', {
      url: navUrl,
      canGoBack: view.webContents.navigationHistory.canGoBack(),
      canGoForward: view.webContents.navigationHistory.canGoForward()
    })
  }
  view.webContents.on('did-navigate', emitNavState)
  view.webContents.on('did-navigate-in-page', emitNavState)

  // Store with chrome strip reference
  this.panels.set(id, { id, type: panelType, view, chromeView: chromeStripView })
```

Note: the `view` (content) still uses the existing preload (`browser.js`). But wait — in this new architecture, `browser.js` now has `contextBridge` for the browser HOST page, not the content page. We need a SEPARATE minimal preload for the content view. Actually, the content view previously used `browser.js` which only forwarded wheel events. Now `browser.js` has `contextBridge` for the host page. We need to split these.

Add a new entry in `createPanel` for the content view preload. The content view should use a minimal preload (wheel forwarding only). Since the current `browser.js` is being repurposed for the host page, create the content view WITHOUT a preload that exposes `contextBridge` — just use the same wheel forwarding. Actually, the simplest approach: create a new preload file `browser-content.ts` that only does wheel forwarding (like the old `browser.ts`).

- [ ] **Step 3: Create browser-content preload**

Create `src/preload/browser-content.ts`:

```ts
import { ipcRenderer } from 'electron'

// Forward horizontal scroll events to the strip.
// Browser content loads untrusted URLs — no contextBridge, just wheel forwarding.
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })
```

Add to `electron.vite.config.ts` preload inputs:

```ts
'browser-content': resolve(__dirname, 'src/preload/browser-content.ts')
```

Update the content view creation in `createPanel` to use this preload:

```ts
const preloadFile = panelType === 'browser' ? '../preload/browser-content.js' : '../preload/panel.js'
```

Wait, this changes the preload selection logic. Currently:

```ts
const preloadFile = panelType === 'browser' ? '../preload/browser.js' : '../preload/panel.js'
```

Now `browser.js` is for the chrome strip, and `browser-content.js` is for the content view. Update:

```ts
const preloadFile = panelType === 'browser' ? '../preload/browser-content.js' : '../preload/panel.js'
```

The chrome strip view (created above) uses `../preload/browser.js`.

- [ ] **Step 4: Update destroyPanel to destroy chrome strip view**

```ts
destroyPanel(id: string): void {
  const panel = this.panels.get(id)
  if (!panel) return
  this.window.contentView.removeChildView(panel.view)
  panel.view.webContents.close()
  if (panel.chromeView) {
    this.window.contentView.removeChildView(panel.chromeView)
    panel.chromeView.webContents.close()
  }
  this.panels.delete(id)
}
```

- [ ] **Step 5: Update updateBounds to position both views**

Note: Add `import { LAYOUT } from '../../shared/constants'` (or equivalent path from `src/main/`) to panel-manager.ts if not already imported.

```ts
updateBounds(updates: Array<{
  panelId: string
  bounds: { x: number; y: number; width: number; height: number }
  visible: boolean
}>): void {
  for (const update of updates) {
    const panel = this.panels.get(update.panelId)
    if (!panel) continue
    if (update.visible) {
      if (panel.chromeView) {
        // Browser panel: chrome strip at top, content below
        const chromeHeight = LAYOUT.PANEL_CHROME_HEIGHT
        panel.chromeView.setBounds({
          x: update.bounds.x,
          y: update.bounds.y,
          width: update.bounds.width,
          height: chromeHeight
        })
        panel.chromeView.setVisible(true)
        panel.view.setBounds({
          x: update.bounds.x,
          y: update.bounds.y + chromeHeight,
          width: update.bounds.width,
          height: update.bounds.height - chromeHeight
        })
      } else {
        // Terminal/placeholder: single view, full bounds
        panel.view.setBounds(update.bounds)
      }
      panel.view.setVisible(true)
    } else {
      panel.view.setVisible(false)
      if (panel.chromeView) panel.chromeView.setVisible(false)
    }
  }
}
```

- [ ] **Step 6: Add sendChromeState method**

```ts
sendChromeState(id: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean
}): void {
  const panel = this.panels.get(id)
  if (!panel) return
  if (panel.chromeView) {
    panel.chromeView.webContents.send('panel:chrome-state', state)
  }
  panel.view.webContents.send('panel:chrome-state', state)
}
```

- [ ] **Step 7: Update focusPanel equivalent — browser panels focus the content view, not the chrome strip**

The existing `getPanelView` is used by `panel:focus` in `index.ts` to focus a panel. For browser panels, we want to focus the content view (not the chrome strip). The current `getPanelView` returns `panel.view`, which IS the content view. So this works without changes.

- [ ] **Step 8: Extract before-input-event handler, apply to both views**

The shortcut interception handler (currently an inline callback on `view.webContents`) must also be applied to the chrome strip view. Extract it into a named function at the top of `createPanel`, BEFORE the type-specific branches:

```ts
const handleShortcutKey = (event: Electron.Event, input: Electron.Input): void => {
  if (input.type !== 'keyDown' || !input.meta) return
  let action: { type: string; index?: number } | null = null
  if (input.shift) {
    if (input.key === 'ArrowLeft') action = { type: 'swap-left' }
    else if (input.key === 'ArrowRight') action = { type: 'swap-right' }
  } else {
    if (input.key === 'ArrowLeft') action = { type: 'focus-left' }
    else if (input.key === 'ArrowRight') action = { type: 'focus-right' }
    else if (input.key === 't') action = { type: 'new-panel' }
    else if (input.key === 'b') action = { type: 'new-browser' }
    else if (input.key === 'w') action = { type: 'close-panel' }
    else if (input.key === 'g') action = { type: 'blur-panel' }
    else if (input.key === 'r') action = { type: 'reload-browser' }
    else if (input.key === '[') action = { type: 'browser-back' }
    else if (input.key === ']') action = { type: 'browser-forward' }
    else if (input.key >= '1' && input.key <= '9') action = { type: 'jump-to', index: parseInt(input.key) - 1 }
  }
  if (action) {
    event.preventDefault()
    this.chromeView.webContents.send('shortcut:action', action)
  }
}
```

Then replace the existing inline `before-input-event` handler with:

```ts
view.webContents.on('before-input-event', handleShortcutKey)
```

And for browser panels, also add:

```ts
chromeStripView.webContents.on('before-input-event', handleShortcutKey)
```

- [ ] **Step 9: Update panels.set — browser branch does its own set**

The browser branch now calls `this.panels.set(id, { id, type: panelType, view, chromeView: chromeStripView })` inside its branch (to include the chromeView field). Update the code AFTER the if/else branches: the existing `this.panels.set(id, { id, type: panelType, view })` at the bottom of `createPanel` should only run for non-browser panels. Wrap it:

```ts
if (panelType !== 'browser') {
  this.panels.set(id, { id, type: panelType, view })
}
```

- [ ] **Step 10: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/main/panel-manager.ts src/preload/browser-content.ts electron.vite.config.ts
git -c commit.gpgsign=false commit -m "feat: browser panels use two views (chrome strip + content), send chrome state"
```

---

### Task 7: Main process IPC — browser host nav actions, chrome state forwarding

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add browser host navigation IPC handler**

In `setupIpcHandlers()`, add:

```ts
// Browser host chrome strip → navigate
ipcMain.on('browser:navigate-from-host', (_event, data: { panelId: string; url: string }) => {
  panelManager.navigateBrowser(data.panelId, data.url)
})
```

The existing `browser:go-back`, `browser:go-forward`, and `browser:reload` handlers already exist and can be reused by the browser host (it sends the same IPC channel names).

- [ ] **Step 2: Add chrome state forwarding IPC handler**

```ts
// Chrome view → send chrome state to a panel's views
ipcMain.on('panel:send-chrome-state', (_event, data: {
  panelId: string; position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean
}) => {
  panelManager.sendChromeState(data.panelId, data)
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git -c commit.gpgsign=false commit -m "feat: add IPC for browser host navigation and chrome state forwarding"
```

---

### Task 8: Chrome view — strip down to focus border only, send chrome state

**Files:**
- Modify: `src/renderer/src/components/PanelFrame.tsx`
- Modify: `src/renderer/src/components/Strip.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: Strip PanelFrame down to focus border only**

Replace `src/renderer/src/components/PanelFrame.tsx`:

```tsx
import type { Rectangle } from '../../../shared/types'
import { LAYOUT } from '../../../shared/constants'

interface PanelFrameProps {
  contentBounds: Rectangle
  focused: boolean
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH

  return (
    <>
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
    </>
  )
}
```

- [ ] **Step 2: Simplify Strip**

Replace `src/renderer/src/components/Strip.tsx`:

```tsx
import { For } from 'solid-js'
import type { PanelLayout } from '../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  focusedPanelId: string | undefined
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry) => (
          <PanelFrame
            contentBounds={entry.contentBounds}
            focused={entry.panelId === props.focusedPanelId}
          />
        )}
      </For>
    </div>
  )
}
```

- [ ] **Step 3: Add sendChromeState to chrome preload**

In `src/preload/index.ts`, add to the api object:

```ts
sendChromeState: (panelId: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean
}) => {
  ipcRenderer.send('panel:send-chrome-state', { panelId, ...state })
},
```

- [ ] **Step 4: Update env.d.ts**

In `src/renderer/src/env.d.ts`, add `sendChromeState` to FlywheelAPI:

```ts
sendChromeState(panelId: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean
}): void
```

Remove `onBrowserNavStateChanged` (no longer needed — nav state goes directly to the browser chrome strip via the main process).

Also remove `navigateBrowser`, `goBackBrowser`, `goForwardBrowser`, `reloadBrowser` from FlywheelAPI — navigation is now handled by the browser host page directly via IPC. Keep `onBrowserUrlChanged` (chrome view still tracks URLs for the store).

- [ ] **Step 5: Update App.tsx — send chrome state, remove overlay logic**

Major changes to `src/renderer/src/App.tsx`:

1. Remove the `LAYOUT` import (no longer needed for bounds adjustment).
2. Remove nav-related callback props from `<Strip>`.
3. Remove `handleNavigate` function.
4. Remove `onBrowserNavStateChanged` listener.
5. Remove bounds adjustment (no more `isBrowser ? adjusted : entry.contentBounds`).
6. Add a `createEffect` that sends chrome state to all panels whenever focus, titles, or URLs change.
7. Simplify Strip props to just `layout` and `focusedPanelId`.
8. Remove `navigateBrowser`/`goBackBrowser`/`goForwardBrowser`/`reloadBrowser` from shortcut handler — the browser host handles these directly now.

For the chrome state effect, add after the existing effects:

```ts
// Send chrome state to each panel's own view(s) whenever relevant state changes
createEffect(() => {
  const panels = [...state.panels]
  const focusedIndex = state.focusedIndex
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    window.api.sendChromeState(panel.id, {
      position: i + 1,
      label: panel.label,
      focused: i === focusedIndex && state.terminalFocused,
      type: panel.type,
      url: panel.url,
      canGoBack: panel.canGoBack,
      canGoForward: panel.canGoForward
    })
  }
})
```

Update `handleShortcut`:
- **KEEP** `'reload-browser'`, `'browser-back'`, `'browser-forward'` cases. They are still needed because: keyboard shortcuts pressed in the browser CONTENT view are intercepted by `before-input-event`, sent to the chrome view as `shortcut:action`, and the chrome view dispatches them via `window.api.reloadBrowser()` etc. The same flow works for the browser chrome strip's `before-input-event`.
- Remove `handleNavigate` function (URL editing is now in the browser host page).

Update Strip rendering:

```tsx
<Strip
  layout={layout()}
  focusedPanelId={state.panels[state.focusedIndex]?.id}
/>
```

- [ ] **Step 6: Remove unused preload methods**

In `src/preload/index.ts`:
- Remove `navigateBrowser` (URL editing is now in the browser host, which sends `browser:navigate-from-host` directly).
- **Keep** `reloadBrowser`, `goBackBrowser`, `goForwardBrowser` — still called by `handleShortcut` in the chrome view.

In `src/renderer/src/env.d.ts`:
- Remove `navigateBrowser` from FlywheelAPI.
- Remove `onBrowserNavStateChanged` (nav state goes directly to browser chrome strip via main process).
- **Keep** `reloadBrowser`, `goBackBrowser`, `goForwardBrowser`.

- [ ] **Step 7: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 8: Run all tests**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/PanelFrame.tsx src/renderer/src/components/Strip.tsx src/renderer/src/App.tsx src/preload/index.ts src/renderer/src/env.d.ts
git -c commit.gpgsign=false commit -m "feat: chrome view renders focus border only, sends chrome state to panels"
```

---

### Task 9: Final integration — verify build, tests, manual testing

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 3: Commit any fixups**

---

## Manual Testing Checklist

1. **Terminal title bar**: Open a terminal. Verify it shows "1 / zsh" in its own title bar (rendered inside the panel, not as an overlay). Scroll — the title bar should move perfectly in sync with the terminal content.

2. **Browser chrome strip**: Press Cmd+B. Verify the browser panel has a title bar + nav bar rendered as part of the panel. The URL bar should auto-focus for about:blank. Type a URL and press Enter — the content should load below the nav bar.

3. **Scroll alignment**: Open 3+ panels (mix of terminals and browsers). Scroll horizontally. Title bars, nav bars, and content should move perfectly together with zero misalignment.

4. **Focus state**: Click between panels. The focused panel's title bar should highlight (brighter text, different background). The indigo focus border (from the chrome view) should wrap around the panel.

5. **Back/forward**: Navigate to a page, click a link, then press Cmd+[ to go back. The back button in the nav bar should become enabled after navigating.

6. **Keyboard shortcuts**: Verify Cmd+T (new terminal), Cmd+B (new browser), Cmd+W (close), Cmd+R (reload), Cmd+[ (back), Cmd+] (forward) all work from both terminal and browser panels.

7. **Panel swap**: Cmd+Shift+Left/Right should swap panels. Title bars should update their position numbers.

8. **Terminal link detection**: In a terminal, run `echo https://example.com`. Click the URL — it should open as a new browser panel.

9. **Hint bar**: The hint bar at the bottom should still show all shortcuts correctly.
