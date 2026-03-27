# Phase 1: Electron Shell + Scrollable Strip — Design Spec

## Overview

The foundation of Flywheel: a working Electron app with the core spatial model — a horizontal strip of panels with free-form trackpad scrolling and keyboard navigation. No real terminals or browsers yet; panels are colored placeholders that prove the layout model works.

## Decisions Made

| Decision           | Choice                   | Rationale                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework | **Solid**                | The Chrome View is entirely custom UI (sidebar, hint bar, scroll indicators, title bars). No complex forms/tables/data grids where React's ecosystem pays off. Solid's fine-grained reactivity is a natural fit for scroll-driven layout updates.                                                                                                     |
| Strip navigation   | **Free-form + keyboard** | Start with free-form trackpad scrolling. Stack Browser's `setBounds()` performance issues involved dozens of views; our 2-6 visible panels are a different load profile. If performance is insufficient, fall back to snap-only (keyboard-driven, animated transitions) — the fallback is trivial since it just removes the wheel event input source. |

### Research Summary

**`WebContentsView` + `setBounds()` performance**: Stack Browser (the most ambitious attempt at `setBounds()`-driven scrolling) found performance insufficient for smooth 60fps scrolling with many views. However, their use case involved dozens of views (topbars, tooltips, modals, content cards). Flywheel repositions 2-3 views in the typical case, 5-6 max on ultrawide. This is a fundamentally different load profile and likely viable.

**Scroll event handling**: Native macOS momentum scrolling works automatically in scrollable DOM containers within a `WebContentsView`. In Phase 1, panels are placeholder colored boxes with no scrollable content, so there is no scroll disambiguation problem — all horizontal wheel events can be forwarded to drive strip scroll. Scroll disambiguation (strip scroll vs panel content scroll) becomes relevant in Phase 2 when real terminals arrive.

**Fallback strategy**: If free-form scrolling proves janky at higher panel counts, the fallback to snap-only navigation (keyboard-driven, animated transitions) is trivial — just remove the wheel event input source. The rendering pipeline (scroll position → panel bounds → `setBounds()` calls) is identical in both modes.

## Architecture

### Electron Concepts for Web Developers

Electron apps have two kinds of processes:

- **Main process** — a Node.js process that creates windows, manages native resources, and coordinates everything. Think of it as the server. It has full OS access (file system, child processes, etc.) but no DOM.
- **Renderer processes** — each `WebContentsView` runs its own Chromium renderer, like a browser tab. This is where your web code (HTML, CSS, JS/Solid) runs. It has a DOM but limited OS access.

They communicate via **IPC** (Inter-Process Communication) — essentially `postMessage`-style messaging with named channels. The renderer sends a message like `"updatePanelBounds"` with data, the main process listens for it and acts.

A **`BaseWindow`** is a native OS window (the actual macOS window frame). It contains one or more **`WebContentsView`** instances — each is essentially an independent browser tab rendered as a rectangle within the window. You position them with `setBounds({ x, y, width, height })`.

### Process Model

```
┌───────────────────────────────────────────────────────┐
│ BaseWindow (native macOS window)                      │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Chrome View (WebContentsView)                   │  │
│  │ Solid app: sidebar, hint bar, scroll            │  │
│  │ indicators, focus glow, panel title bars        │  │
│  │                                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│  │  │ Panel 1  │ │ Panel 2  │ │ Panel 3  │         │  │
│  │  │ (WCV)    │ │ (WCV)    │ │ (WCV)    │         │  │
│  │  │ colored  │ │ colored  │ │ colored  │         │  │
│  │  │ box      │ │ box      │ │ box      │         │  │
│  │  └──────────┘ └──────────┘ └──────────┘         │  │
│  │                                                 │  │
│  │  ⌘← Focus Left  ⌘→ Focus Right  ⌘T New ...      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
└───────────────────────────────────────────────────────┘

WCV = WebContentsView (each is its own renderer process)
```

The Chrome View covers the full window. Panel views are overlaid on top, positioned with `setBounds()`. The Chrome View renders _around_ and _behind_ the panels — title bars above each panel, focus glow behind, hint bar at the bottom, scroll indicators at the edges.

Panel title bars are rendered by the Chrome View in the space above each panel's `WebContentsView`. The panel `WebContentsView` itself only renders the panel content (colored placeholder in Phase 1, terminal/browser content in later phases).

### Data Flow

**Keyboard navigation (⌘→):**

```
User presses ⌘→
       │
       ▼
Chrome View (Solid app in renderer)
  1. Updates focusedIndex
  2. Calculates new scrollOffset (to center focused panel)
  3. Runs animation loop (ease-out, ~200ms):
     - Each frame: computes panel positions from scrollOffset
     - Sends IPC message: { panelId, bounds }[] for visible panels
       │
       ▼
Main Process (Node.js)
  4. Calls panel.setBounds(bounds) for each visible panel
  5. Calls panel.setVisible(true/false) for panels entering/leaving viewport
  6. Destroys panels far off-screen, creates them when they approach
```

**Trackpad scroll:**

```
User scrolls horizontally on a panel
       │
       ▼
Main Process intercepts wheel event via webContents.on('input-event')
  1. Detects horizontal wheel delta on a panel view
  2. Forwards delta to Chrome View via IPC
       │
       ▼
Chrome View (Solid app in renderer)
  3. Applies delta to scrollOffset
  4. Recomputes panel positions (via requestAnimationFrame)
  5. Sends IPC message: { panelId, bounds }[] for visible panels
       │
       ▼
Main Process
  6. Calls panel.setBounds(bounds) for each visible panel
  7. Updates visibility as panels enter/leave viewport
```

macOS provides momentum events automatically — after the user lifts their fingers, the OS continues sending decaying wheel events. No custom physics needed.

## Panel Layout Model

- Panels are fixed-width columns: default **50% of viewport width**
- Per-panel size presets (half, third, two-thirds) are deferred — all panels are 50% width in Phase 1
- Panels are positioned left-to-right with an **8px gap** between them
- The strip extends to the right as panels are added
- A `scrollOffset` value (pixels) determines which portion of the strip is visible in the viewport

### Visibility Rules

| Panel position relative to viewport | State                                                       |
| ----------------------------------- | ----------------------------------------------------------- |
| Intersects viewport                 | `WebContentsView` exists, `setVisible(true)`                |
| Within 1 viewport width off-screen  | `WebContentsView` exists, `setVisible(false)` (buffer zone) |
| Beyond buffer zone                  | `WebContentsView` destroyed (memory savings)                |

When a destroyed panel scrolls back into the buffer zone, its `WebContentsView` is recreated. In Phase 1 (colored placeholders) this is instant. In later phases, terminal state will be preserved via serialization.

## Focus & Navigation

One panel is focused at a time, tracked by index.

### Keyboard Shortcuts (macOS)

| Shortcut | Action                                                            |
| -------- | ----------------------------------------------------------------- |
| `⌘ ←`    | Focus previous panel                                              |
| `⌘ →`    | Focus next panel                                                  |
| `⌘ T`    | Add new placeholder panel to the right of focused panel, focus it |
| `⌘ W`    | Close focused panel, focus moves to nearest neighbor              |
| `⌘ 1-9`  | Jump to panel by position                                         |

When focus changes via keyboard, the strip animates to center the newly focused panel:

- Animation: ease-out curve, ~200ms duration
- `setBounds()` called each frame of the animation for visible panels

Trackpad horizontal scroll also moves the strip freely. Focus updates to whichever panel is most centered in the viewport after scrolling stops.

### Focus Indicator

The focused panel gets a visual indicator rendered by the Chrome View (behind the panel's `WebContentsView`):

- Colored border (e.g., 2px accent color)
- Subtle glow/shadow behind the panel

## Scroll Indicators

Rendered by the Chrome View (standard DOM elements):

- **Fade gradients**: on left/right edges of the viewport when panels exist off-screen in that direction. Includes a subtle directional arrow.
- **Scroll track**: a thin horizontal bar at the bottom of the strip area (above the hint bar) showing viewport position relative to total strip width. Moves continuously as the user scrolls.

## Keyboard Hint Bar

A persistent bar at the bottom of the window, Zellij-style. Rendered by the Chrome View.

```
⌘← Focus Left  ⌘→ Focus Right  ⌘T New Panel  ⌘W Close  ⌘1-9 Jump
```

- Shows available shortcuts in the current context
- In Phase 1 the context is static (always showing the same shortcuts)
- Later phases will update hints based on focused panel type (terminal vs browser)

## Main Process Responsibilities

| Responsibility     | Details                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window management  | Creates `BaseWindow`, adds Chrome View, manages panel lifecycle                                                                                                                                                                                                                                      |
| Panel lifecycle    | Creates/destroys panel `WebContentsView` instances based on visibility rules                                                                                                                                                                                                                         |
| Layout execution   | Receives bounds updates from Chrome View via IPC, calls `setBounds()` on panels                                                                                                                                                                                                                      |
| Keyboard shortcuts | Shortcuts are handled via Electron `Menu` accelerators, which intercept key combos at the app level before they reach any panel's renderer. This ensures `⌘T` triggers "new panel" rather than reaching a future terminal. The Chrome View does _not_ use DOM `keydown` listeners for app shortcuts. |

## Phase 1 Scope Boundary

**In scope:**

- Electron `BaseWindow` with Chrome View (Solid)
- Placeholder panels (colored boxes with title label) as `WebContentsView` instances
- Free-form trackpad scrolling with momentum
- Keyboard snap navigation with animated transitions
- Focus tracking with visual indicator
- Keyboard shortcuts: ⌘←/→, ⌘T, ⌘W, ⌘1-9
- Keyboard hint bar
- Scroll indicators (fade edges + scroll track)
- Panel visibility management (hide/destroy off-screen panels)

**Not in scope (later phases):**

- Real terminal content (Phase 2)
- Real browser content (Phase 3)
- Sidebar / project model (Phase 4)
- Scroll disambiguation between strip scroll and panel content scroll (Phase 2 — not needed while panels are placeholders)

## Initial State

The app launches with 3 placeholder panels in sequential colors from a preset palette (e.g., slate blue, emerald, amber). The first panel is focused and centered. Each placeholder displays its panel number and color name as a label.

## TODO

- **Linux modifier key**: Map `⌘` to `Ctrl` or `Super` on Linux. Needs a decision — `Super` avoids conflicts with terminal shortcuts but isn't standard for app shortcuts on Linux. (Phase 7 / cross-platform)
