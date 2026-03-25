# Dot-Grid Divider with Activity Animation

## Summary

Replace the `/` text divider in panel title bars with a 2×3 dot grid (GripVertical pattern) that animates when the panel is busy. Terminals animate when a foreground process is running; browsers animate while a page is loading.

## Current State

Both terminal and browser title bars display `{position} / {label}` using plain text. The `/` is a literal string character in:
- `src/terminal/terminal.ts` — the `onChromeState` callback where `position / label` is assembled
- `src/browser/browser-host.ts` — the `onChromeState` callback where `posLabel.textContent` is set

There is no visual indication of panel activity in the title bar.

## Design

### Dot-Grid Component

A new shared module `src/browser/dot-grid.ts` exports:

1. **`DOT_GRID_SVG`** — inline SVG string for a 2×3 dot grid (10×14px, `viewBox="0 0 24 24"`, six `<circle>` elements with `r="1.5"`)
2. **`DOT_GRID_CSS`** — CSS string containing idle styling and the sparkle animation keyframes + delays
3. **`setDotGridBusy(container: HTMLElement, busy: boolean)`** — toggles a `busy` class on the container to start/stop animation

This file lives in `src/browser/` alongside `icons.ts` since both terminal and browser panel views can import from there (they share the same build pipeline). Pragmatic choice — `src/shared/` currently only has pure data modules (`types.ts`, `constants.ts`), while this module touches the DOM.

### Visual Spec

**Idle state:**
- Dots filled with `#6366f1` (indigo accent) at `opacity: 0.5`
- Static, no animation

**Busy/loading state — "Scale + Glow Sparkle":**
- Each dot independently animates on a **1.5s** cycle with staggered delays
- At peak: dot scales to **1.5×** and fill shifts to `#a5b4fc` (lighter indigo) at `opacity: 1`
- Easing: `ease-in-out`
- Stagger delays: 0s, 0.5s, 0.22s, 0.82s, 0.37s, 0.67s (for the 6 dots)

### Busy Signal Plumbing

**`PanelChromeState` type** (`src/shared/types.ts`): add `busy?: boolean` field. This type is also duplicated as inline signatures in `panel-manager.ts` (`sendChromeState`), `src/main/index.ts` (the `panel:send-chrome-state` handler), `src/preload/index.ts`, and `src/renderer/src/env.d.ts` — all need the `busy?` field added.

**Browser panels** (`src/main/panel-manager.ts`):
- Hook `webContents.on('did-start-loading')` → send partial chrome state `{ busy: true }` to the chromeStripView, following the existing partial-merge pattern (same as `did-navigate`, `page-title-updated`, etc.)
- Hook `webContents.on('did-stop-loading')` → send partial chrome state `{ busy: false }`
- Initial state: `did-start-loading` fires immediately on the first URL load, so the dot grid will animate during initial page load — this is intentional.

**Terminal panels** (`src/main/index.ts`):
- The `panel:title` IPC from `ptyManager` flows through `src/main/index.ts` (not panel-manager). In the `panel:send-chrome-state` handler in `index.ts`, enrich the state with `busy: ptyManager.isBusy(panelId)` for terminal panels before forwarding to `panelManager.sendChromeState()`.
- **Latency note:** `ptyManager.checkTitles()` polls every `TITLE_CHECK_INTERVAL` flush cycles (currently 60 × 16ms ≈ ~1s, configurable at `pty-manager.ts:18`). This means the busy animation may lag by up to ~1s after a command starts or finishes. This is acceptable for a subtle visual cue — if it feels sluggish in practice, we can lower the interval (e.g. 15 ≈ ~250ms) at the cost of slightly more process polling.
- Initial state: for a fresh shell, `isBusy()` returns `false` (foreground process matches shell name), so the dot grid starts idle. This is correct.

**Panel views** receive `busy` via the existing `onChromeState` callback and call `setDotGridBusy()`.

### Integration

**`src/terminal/index.html`:**
- Add a `<span id="dot-grid">` element in `#panel-titlebar` between position and title

**`src/terminal/terminal.ts`:**
- Import `DOT_GRID_SVG`, `DOT_GRID_CSS`, `setDotGridBusy` from `../browser/dot-grid`
- Inject SVG into the dot-grid span, inject CSS into a `<style>` tag
- In `onChromeState` callback: replace `/ ` text with dot grid, call `setDotGridBusy` with `state.busy`

**`src/browser/browser-host.html`:**
- Replace the `<span class="pos">` content pattern to include a dot-grid span

**`src/browser/browser-host.ts`:**
- Import and use `dot-grid.ts` the same way
- In `onChromeState` callback: call `setDotGridBusy` with `state.busy`

### What This Does NOT Change

- Title bar layout, colors, fonts, or sizing
- Browser navbar (back/forward/reload/URL bar)
- Panel types or store — this is purely a chrome-layer visual change + IPC field addition
- No refactoring of title bar structure between terminal and browser

## File Impact

| File | Change |
|------|--------|
| `src/browser/dot-grid.ts` | **New** — shared dot-grid SVG, CSS, and toggle function (~40 lines) |
| `src/shared/types.ts` | Add `busy?: boolean` to `PanelChromeState` |
| `src/main/panel-manager.ts` | Add `did-start-loading`/`did-stop-loading` hooks for browser panels; add `busy?` to `sendChromeState` signature |
| `src/main/index.ts` | Enrich chrome state with `ptyManager.isBusy()` for terminal panels in `panel:send-chrome-state` handler; add `busy?` to inline type |
| `src/preload/index.ts` | Add `busy?` to chrome state callback type |
| `src/renderer/src/env.d.ts` | Add `busy?` to `FlywheelAPI` chrome state type |
| `src/terminal/index.html` | Add dot-grid span in title bar |
| `src/terminal/terminal.ts` | Import dot-grid, wire up busy toggle |
| `src/browser/browser-host.html` | Add dot-grid span in title bar |
| `src/browser/browser-host.ts` | Import dot-grid, wire up busy toggle |
