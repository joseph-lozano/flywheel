# Panel Swap/Move Feature Design

## Overview

Add keyboard shortcuts to swap the focused panel with its neighbor, allowing users to reorder panels without recreating them.

## Shortcuts

| Shortcut | Action | Boundary behavior |
|----------|--------|-------------------|
| Cmd+Shift+Left | Swap focused panel with left neighbor | No-op at leftmost position |
| Cmd+Shift+Right | Swap focused panel with right neighbor | No-op at rightmost position |

Both shortcuts work in terminal-focused and strip (blurred) modes, matching the behavior of Cmd+Left/Right navigation.

## Design: Store-Only Array Swap

Panel position is derived from array index. Swapping two elements in the `panels` array and updating `focusedIndex` is sufficient — the layout engine, rendering, scroll-to-center, and bounds updates all derive from array order automatically.

### Store Actions (`strip.ts`)

Two new actions on the strip store:

- **`swapLeft()`** — if `focusedIndex > 0`: swap `panels[focusedIndex]` with `panels[focusedIndex - 1]`, decrement `focusedIndex`. Otherwise no-op.
- **`swapRight()`** — if `focusedIndex < panels.length - 1`: swap `panels[focusedIndex]` with `panels[focusedIndex + 1]`, increment `focusedIndex`. Otherwise no-op.

Single-panel state is naturally a no-op for both directions (fails both index guards).

### Keybinding Registration (`main/index.ts`)

Two new entries in the Electron Menu accelerator table:

- `Command+Shift+Left` → sends `shortcut:action` IPC with type `swap-left`
- `Command+Shift+Right` → sends `shortcut:action` IPC with type `swap-right`

### Shortcut Handling (`App.tsx`)

Two new cases in `handleShortcut()`:

- `swap-left` → `state.swapLeft()`
- `swap-right` → `state.swapRight()`

### Hint Bar (`HintBar.tsx`)

Add swap shortcuts to the hint bar for discoverability.

## What Does NOT Change

- **`Panel` type** — no new fields
- **Layout engine** — already derives position from array index
- **Rendering pipeline** — Strip/PanelFrame read from computed layout
- **IPC / preload** — no new channels; swap is a store-only mutation
- **Scroll behavior** — existing scroll-to-center effect handles repositioning after swap
- **Cmd+1-9 jump shortcuts** — numbers reflect position, not panel identity; naturally correct after swap

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Single panel, either direction | No-op |
| Leftmost panel, swap left | No-op |
| Rightmost panel, swap right | No-op |
| Two panels, swap | Panels exchange positions, focus follows |

## Files to Modify

1. `src/renderer/src/store/strip.ts` — add `swapLeft()`, `swapRight()` actions
2. `src/main/index.ts` — add two Menu accelerator entries
3. `src/renderer/src/App.tsx` — add two cases in `handleShortcut()`
4. `src/renderer/src/components/HintBar.tsx` — add swap hints
