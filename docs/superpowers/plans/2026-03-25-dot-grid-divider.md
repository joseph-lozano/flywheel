# Dot-Grid Divider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` text divider in panel title bars with an animated 2×3 dot grid that sparkles when the panel is busy/loading.

**Architecture:** A shared `dot-grid.ts` module provides SVG markup, CSS animations, and a toggle function. Both terminal and browser panel views import it. The main process sends a `busy` field in chrome state updates — derived from `ptyManager.isBusy()` for terminals and `did-start/stop-loading` events for browsers.

**Tech Stack:** Inline SVG, CSS animations, Electron `webContents` events, existing IPC chrome state pattern.

---

## File Structure

### New files

| File                      | Responsibility                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/browser/dot-grid.ts` | Shared dot-grid SVG string, CSS animation string, and `setDotGridBusy()` toggle function (~40 lines) |

### Modified files

| File                            | Changes                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`           | Add `busy?: boolean` to `PanelChromeState`                                                            |
| `src/main/pty-manager.ts`       | Change `TITLE_CHECK_INTERVAL` from 60 to 30 (~0.5s); send `busy` alongside title changes              |
| `src/main/panel-manager.ts`     | Add `did-start-loading`/`did-stop-loading` hooks; add `busy?` to `sendChromeState` signature          |
| `src/main/index.ts`             | Enrich `panel:send-chrome-state` with `ptyManager.isBusy()` for terminals; add `busy?` to inline type |
| `src/preload/index.ts`          | Add `busy?` to `sendChromeState` inline type                                                          |
| `src/renderer/src/env.d.ts`     | Add `busy?` to `FlywheelAPI` chrome state type                                                        |
| `src/terminal/index.html`       | Add `<span>` elements for position, dot-grid, and title in `#panel-titlebar`                          |
| `src/terminal/terminal.ts`      | Import dot-grid, replace `/` divider, wire up busy toggle                                             |
| `src/browser/browser-host.html` | Add `<span id="dot-grid">` between pos and globe                                                      |
| `src/browser/browser-host.ts`   | Import dot-grid, wire up busy toggle                                                                  |

---

### Task 1: Create the dot-grid component

**Files:**

- Create: `src/browser/dot-grid.ts`

- [ ] **Step 1: Create `src/browser/dot-grid.ts`**

```ts
// Shared dot-grid divider for panel title bars.
// Idle: static indigo dots. Busy: scale+glow sparkle animation.

export const DOT_GRID_SVG = `<svg class="dot-grid" width="10" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <circle cx="9" cy="5" r="1.5"/>
  <circle cx="15" cy="5" r="1.5"/>
  <circle cx="9" cy="12" r="1.5"/>
  <circle cx="15" cy="12" r="1.5"/>
  <circle cx="9" cy="19" r="1.5"/>
  <circle cx="15" cy="19" r="1.5"/>
</svg>`;

export const DOT_GRID_CSS = `
.dot-grid-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin: 0 5px;
  color: #6366f1;
  opacity: 0.5;
}
.dot-grid circle {
  transform-origin: var(--cx) var(--cy);
}
.dot-grid circle:nth-child(1) { --cx: 9px; --cy: 5px; }
.dot-grid circle:nth-child(2) { --cx: 15px; --cy: 5px; }
.dot-grid circle:nth-child(3) { --cx: 9px; --cy: 12px; }
.dot-grid circle:nth-child(4) { --cx: 15px; --cy: 12px; }
.dot-grid circle:nth-child(5) { --cx: 9px; --cy: 19px; }
.dot-grid circle:nth-child(6) { --cx: 15px; --cy: 19px; }
.dot-grid-wrap.busy { opacity: 1; }
.dot-grid-wrap.busy circle {
  animation: dot-sparkle 1.5s ease-in-out infinite;
}
.dot-grid-wrap.busy circle:nth-child(1) { animation-delay: 0s; }
.dot-grid-wrap.busy circle:nth-child(2) { animation-delay: 0.5s; }
.dot-grid-wrap.busy circle:nth-child(3) { animation-delay: 0.22s; }
.dot-grid-wrap.busy circle:nth-child(4) { animation-delay: 0.82s; }
.dot-grid-wrap.busy circle:nth-child(5) { animation-delay: 0.37s; }
.dot-grid-wrap.busy circle:nth-child(6) { animation-delay: 0.67s; }
@keyframes dot-sparkle {
  0%, 100% { opacity: 0.2; fill: #6366f1; transform: scale(1); }
  30% { opacity: 1; fill: #a5b4fc; transform: scale(1.5); }
  60% { opacity: 0.2; fill: #6366f1; transform: scale(1); }
}
`;

export function setDotGridBusy(wrap: HTMLElement, busy: boolean): void {
  wrap.classList.toggle("busy", busy);
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build completes (new file isn't imported yet, but should have no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add src/browser/dot-grid.ts
git commit -m "feat: add shared dot-grid divider component"
```

---

### Task 2: Add `busy` to type signatures

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/main/panel-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: Add `busy?` to `PanelChromeState` in types.ts**

In `src/shared/types.ts`, add `busy?: boolean` to the `PanelChromeState` interface after `canGoForward`:

```ts
export interface PanelChromeState {
  panelId: string;
  position: number;
  label: string;
  focused: boolean;
  type: "terminal" | "placeholder" | "browser";
  url?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  busy?: boolean;
}
```

- [ ] **Step 2: Add `busy?` to `sendChromeState` in panel-manager.ts**

In `src/main/panel-manager.ts`, update the `sendChromeState` method signature (line 252):

```ts
sendChromeState(id: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
}): void {
```

- [ ] **Step 3: Add `busy?` to `panel:send-chrome-state` handler in index.ts**

In `src/main/index.ts`, update the inline type in the `panel:send-chrome-state` handler (line 140):

```ts
ipcMain.on('panel:send-chrome-state', (_event, data: {
  panelId: string; position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
}) => {
```

- [ ] **Step 4: Add `busy?` to `sendChromeState` in preload/index.ts**

In `src/preload/index.ts`, update the inline type in `sendChromeState` (line 88):

```ts
sendChromeState: (panelId: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
}) => {
```

- [ ] **Step 5: Add `busy?` to `FlywheelAPI` in env.d.ts**

In `src/renderer/src/env.d.ts`, update the `sendChromeState` type (line 43):

```ts
sendChromeState(panelId: string, state: {
  position: number; label: string; focused: boolean;
  type: string; url?: string; canGoBack?: boolean; canGoForward?: boolean; busy?: boolean
}): void
```

- [ ] **Step 6: Run tests and build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx vitest run && npx electron-vite build 2>&1 | tail -5`
Expected: All tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/panel-manager.ts src/main/index.ts src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat: add busy field to PanelChromeState type signatures"
```

---

### Task 3: Wire busy signal — browser loading

**Files:**

- Modify: `src/main/panel-manager.ts`

- [ ] **Step 1: Add `did-start-loading` and `did-stop-loading` hooks**

In `src/main/panel-manager.ts`, inside the `createPanel` browser branch, after the `page-title-updated` handler (after line 131), add:

```ts
// Loading state → animate dot grid in chrome strip
view.webContents.on("did-start-loading", () => {
  chromeStripView.webContents.send("panel:chrome-state", { busy: true });
});
view.webContents.on("did-stop-loading", () => {
  chromeStripView.webContents.send("panel:chrome-state", { busy: false });
});
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main/panel-manager.ts
git commit -m "feat: send busy state on browser loading events"
```

---

### Task 4: Wire busy signal — terminal process

**Files:**

- Modify: `src/main/pty-manager.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Change `TITLE_CHECK_INTERVAL` to 30**

In `src/main/pty-manager.ts`, line 18, change:

```ts
const TITLE_CHECK_INTERVAL = 30; // check every ~30 flushes (~0.5s)
```

- [ ] **Step 2: Send busy alongside title in `checkTitles`**

No changes needed to `checkTitles()` — the `panel:title` message triggers a `sendChromeState` round-trip from the renderer, and `index.ts` enriches that with `ptyManager.isBusy()` in the next step. The busy signal flows through chrome state, not the title message.

- [ ] **Step 3: Enrich chrome state with busy in index.ts**

In `src/main/index.ts`, update the `panel:send-chrome-state` handler to enrich terminal panels with `busy`. Replace the handler:

```ts
// Chrome view → send chrome state to a panel's views
ipcMain.on(
  "panel:send-chrome-state",
  (
    _event,
    data: {
      panelId: string;
      position: number;
      label: string;
      focused: boolean;
      type: string;
      url?: string;
      canGoBack?: boolean;
      canGoForward?: boolean;
      busy?: boolean;
    },
  ) => {
    // Enrich terminal panels with busy state from PTY
    if (data.type === "terminal") {
      data.busy = ptyManager.isBusy(data.panelId);
    }
    panelManager.sendChromeState(data.panelId, data);
  },
);
```

- [ ] **Step 4: Verify build succeeds**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-manager.ts src/main/index.ts
git commit -m "feat: send terminal busy state via chrome state IPC"
```

---

### Task 5: Integrate dot-grid into terminal title bar

**Files:**

- Modify: `src/terminal/index.html`
- Modify: `src/terminal/terminal.ts`

- [ ] **Step 1: Add title bar structure in index.html**

In `src/terminal/index.html`, replace the `<div id="panel-titlebar"></div>` (line 27) with:

```html
<div id="panel-titlebar">
  <span id="pos-label"></span>
  <span id="dot-grid"></span>
  <span id="title-label"></span>
</div>
```

- [ ] **Step 2: Add CSS for title bar children in index.html**

In `src/terminal/index.html`, add these rules inside the existing `<style>` block, after the `#panel-titlebar.focused` rule (after line 18):

```css
#pos-label {
  flex-shrink: 0;
}
#title-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Update terminal.ts to use dot-grid**

In `src/terminal/terminal.ts`, add the imports at the top (after the existing imports):

```ts
import { DOT_GRID_SVG, DOT_GRID_CSS, setDotGridBusy } from "../browser/dot-grid";
```

Replace the chrome state section at the bottom of the file (the `titleBar`, `onChromeState` block, lines 82-89) with:

```ts
// Chrome state → title bar with dot-grid divider
const posLabel = document.getElementById("pos-label")!;
const dotGridWrap = document.getElementById("dot-grid")!;
const titleLabel = document.getElementById("title-label")!;

// Inject dot-grid SVG and CSS
dotGridWrap.className = "dot-grid-wrap";
dotGridWrap.innerHTML = DOT_GRID_SVG;
const style = document.createElement("style");
style.textContent = DOT_GRID_CSS;
document.head.appendChild(style);

const titleBar = document.getElementById("panel-titlebar")!;

window.pty.onChromeState((state) => {
  posLabel.textContent = state.position <= 9 ? `${state.position}` : "";
  dotGridWrap.style.display = state.position <= 9 ? "" : "none";
  titleLabel.textContent = state.label;
  titleBar.classList.toggle("focused", state.focused);
  setDotGridBusy(dotGridWrap, !!state.busy);
});
```

- [ ] **Step 4: Add `busy` to the `onChromeState` callback type in terminal.ts**

In the `Window.pty` type declaration, update `onChromeState`:

```ts
onChromeState: (callback: (state: { position: number; label: string; focused: boolean; busy?: boolean }) => void) => void
```

- [ ] **Step 5: Verify build succeeds**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/terminal/index.html src/terminal/terminal.ts
git commit -m "feat: replace / divider with animated dot-grid in terminal title bar"
```

---

### Task 6: Integrate dot-grid into browser title bar

**Files:**

- Modify: `src/browser/browser-host.html`
- Modify: `src/browser/browser-host.ts`

- [ ] **Step 1: Add dot-grid span in browser-host.html**

In `src/browser/browser-host.html`, update the `#titlebar` div (line 52) to add a dot-grid span between pos and globe:

```html
<div id="titlebar">
  <span class="pos" id="pos-label"></span>
  <span id="dot-grid"></span>
  <span class="globe" id="globe-icon"></span>
  <span class="title" id="title-label">about:blank</span>
</div>
```

- [ ] **Step 2: Update browser-host.ts to use dot-grid**

In `src/browser/browser-host.ts`, add import at the top (after `import { ICONS } from './icons'`):

```ts
import { DOT_GRID_SVG, DOT_GRID_CSS, setDotGridBusy } from "./dot-grid";
```

After the existing element selectors (after line 29), add:

```ts
const dotGridWrap = document.getElementById("dot-grid")!;

// Inject dot-grid SVG and CSS
dotGridWrap.className = "dot-grid-wrap";
dotGridWrap.innerHTML = DOT_GRID_SVG;
const dotGridStyle = document.createElement("style");
dotGridStyle.textContent = DOT_GRID_CSS;
document.head.appendChild(dotGridStyle);
```

In the `onChromeState` callback (line 84), update the `posLabel` line and add the busy toggle. Replace:

```ts
posLabel.textContent = s.position <= 9 ? `${s.position} /` : "";
```

With:

```ts
posLabel.textContent = s.position <= 9 ? `${s.position}` : "";
dotGridWrap.style.display = s.position <= 9 ? "" : "none";
setDotGridBusy(dotGridWrap, !!s.busy);
```

- [ ] **Step 3: Add `busy` to `currentState` and the `onChromeState` type**

In `src/browser/browser-host.ts`, update `currentState` (line 79) to include `busy`:

```ts
let currentState = {
  position: 0,
  label: "",
  focused: false,
  url: "about:blank",
  canGoBack: false,
  canGoForward: false,
  busy: false,
};
```

And update the `Window.browserHost.onChromeState` callback type in the `declare global` block to include `busy`:

```ts
onChromeState: (callback: (state: {
  position: number; label: string; focused: boolean;
  url: string; canGoBack: boolean; canGoForward: boolean;
  busy?: boolean
}) => void) => void
```

- [ ] **Step 4: Verify build succeeds**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/browser/browser-host.html src/browser/browser-host.ts
git commit -m "feat: replace / divider with animated dot-grid in browser title bar"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Verify build**

Run: `cd /Users/joseph/Workspace/flywheel/.claude/worktrees/phase-2.5-browser-panels && npx electron-vite build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 3: Commit any fixups if needed**

---

## Manual Testing

After implementation, verify:

1. **Terminal idle**: Open a terminal. Title bar shows `1 ⬡ zsh` (dot grid static, indigo, 50% opacity).
2. **Terminal busy**: Run `sleep 5`. Dot grid animates (scale+glow sparkle at 1.5s cycle). Stops when command finishes.
3. **Browser loading**: Press Cmd+B, navigate to a URL. Dot grid animates while page loads, stops when loaded.
4. **Browser idle**: After page loads, dot grid is static.
5. **Position > 9**: Open 10+ panels. Panels 10+ should hide the position number and dot grid entirely.
6. **Focus/unfocus**: Dot grid color dims when panel is unfocused.
