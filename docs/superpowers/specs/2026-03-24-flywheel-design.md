# Flywheel — Development Command Center

A desktop app that consolidates your entire dev stack — terminals, browsers, AI agents — into a single keyboard-driven interface with Niri-style scrollable window management.

## Problem

Developers juggle dozens of windows across multiple projects: terminal tabs for dev servers, test watchers, shells, and AI agents; browser windows for localhost previews; desktop switching between projects. There's no single surface that organizes all of this per-project with efficient spatial navigation.

## Core Concepts

### Projects

A project is a directory on disk, typically a git repo. Projects are listed in a tree sidebar on the left side of the app. You add projects manually (open a directory) or they're auto-discovered.

Each project can have a config file that defines processes to auto-launch when the project is opened. Without a config, the project opens with a single empty terminal in the project directory.

### Rows (Worktrees)

Each project has a default row tied to its working directory. Additional rows can be created for git worktrees, giving each branch its own independent horizontal strip of windows.

**One row is visible at a time.** Switching rows (via sidebar click, keyboard shortcut, or vertical scroll gesture) replaces the current strip entirely. Rows persist in the background — processes keep running and scroll position is preserved when switching back.

### Windows (Panels)

Windows are arranged as columns in an infinite horizontal strip within each row. The viewport scrolls left/right to reveal windows, Niri-style.

**Key properties:**
- Opening or closing a window never causes other windows to resize
- New windows appear to the right of the currently focused window
- Windows have a fixed default width as a percentage of viewport (configurable preset: half, third, or two-thirds). Per-window resize is a stretch goal.
- Each window has a title bar showing its name, type icon, and process status indicator

### Window Types (MVP)

**Terminal** — A full terminal emulator. Supports interactive programs (shells, Claude Code, vim, etc.). Each terminal runs in the project directory (or worktree directory for worktree rows). MVP uses xterm.js + node-pty, with ghostty-web (libghostty WASM) as an intended upgrade path — the two are API-compatible so swapping is low-risk.

**Browser** — An embedded browser panel via Electron's `WebContentsView`. Loads any URL. Browser panels within the same project share a session by default (shared cookies, localStorage, etc. via `session.fromPartition('persist:project-name')`). Independent sessions can be opted into per panel when needed. Primarily used for localhost dev server previews.

### Link Handling

Links clicked within Flywheel (in terminals via link detection, or in browser panels via navigation interception) open as new browser panels in the current strip rather than launching the system browser. This keeps the workflow contained within the workspace.

## Architecture

### Technology Stack

- **Shell**: Electron with `BaseWindow` + `WebContentsView` (Electron 30+)
- **Terminals**: xterm.js in renderer + node-pty in main process (ghostty-web upgrade path)
- **Browsers**: `WebContentsView` instances with shared project sessions
- **Frontend**: React (or similar) for the chrome (sidebar, row headers, scroll indicators, keyboard hint bar)
- **Config**: Format TBD (YAML, TOML, JSON, or similar)

### Process Model

The app has one `BaseWindow` containing:

1. **Chrome View** — A `WebContentsView` rendering the sidebar, row headers, scroll indicators, keyboard hint bar, and window title bars. This is the main React app. It owns layout logic and keyboard handling.

2. **Panel Views** — Each terminal or browser window is its own `WebContentsView`, positioned as native overlays via `setBounds()`. The Chrome View calculates panel positions based on scroll state and tells the main process to update bounds.

3. **Main Process** — Manages the `BaseWindow`, panel lifecycle (create/destroy `WebContentsView` instances), node-pty sessions for terminals, process supervision, and config loading.

### Data Flow

```
Chrome View (renderer)  ←IPC→  Main Process  ←IPC→  Panel Views
     ↕                              ↕
  Layout/scroll state         node-pty sessions
  Keyboard shortcuts          Process supervisor
  Sidebar state               Config management
```

### Panel Lifecycle

- Panels that scroll off-screen are hidden via `setVisible(false)` to save GPU resources
- Panels far off-screen may be fully destroyed and recreated on scroll for memory efficiency
- Terminal state is preserved via xterm.js serialization when panels are destroyed
- Browser panels reload their URL when recreated (acceptable for localhost dev servers)

## Sidebar

The sidebar uses a tree layout:

```
PROJECTS
▼ flywheel-api
  ● main          ← active row
  ● feat/auth     ← worktree row
▶ web-client      ← collapsed project
▶ shared-lib      ← collapsed project
+ Add Project
```

- Click a project name to expand/collapse its worktree list
- Click a worktree branch to switch to that row
- Each branch shows a colored dot (unique per worktree for quick identification, colors TBD)
- The active row is highlighted in the sidebar

## Config

The project config file lives in the project root. Format TBD — the important thing is what it can express:

- **Named processes** — each with a name, command, and type (terminal or browser)
- **Browser URLs** — a URL to load for browser-type panels
- **Dependency ordering** — a process can declare it should start after another process is ready (e.g., don't open browser until dev server is up). Readiness detection strategy TBD (port listening, stdout match, delay, etc.)
- **Default behavior** — no config file → one empty terminal in the project directory

## Keyboard Navigation

All app-level shortcuts use a modifier key to avoid conflicts with terminal input. Exact bindings are configurable; sensible defaults TBD.

**Conceptual mapping:**
- **Mod+Left/Right** — Move focus between windows in the strip. Focus follows scroll (the strip auto-scrolls to center the focused window).
- **Mod+Up/Down** — Switch between rows (worktrees). Replaces current strip.
- **Mod+T** — New terminal to the right of focused window
- **Mod+B** — New browser panel (prompts for URL)
- **Mod+W** — Close focused window
- **Mod+1-9** — Jump to window by position

### Keyboard Hint Bar

A persistent bar at the bottom of the app (Zellij-style) showing available shortcuts in context. Updates based on current state (e.g., shows different hints when a terminal is focused vs. a browser).

## Scroll Behavior

### Horizontal (within a row)

- The strip scrolls horizontally. Smooth scrolling with momentum.
- Fade indicators on left/right edges show when more windows exist off-screen, with directional arrows.
- A thin scroll track at the bottom of the strip shows viewport position relative to the full strip.
- When focus moves to a window (via keyboard), the strip auto-scrolls to center that window.
- Trackpad horizontal scroll and mouse wheel (with shift) also work.

### Vertical (switching rows)

- Vertical scroll gestures with sufficient intent (not small scrolls) switch between worktree rows.
- This requires the same gesture disambiguation as horizontal scroll — distinguishing app-level navigation from scrolling within a terminal or browser panel. The approach is the same for both axes: scroll events that land on the chrome (outside panel content areas) are app-level navigation; scroll events within a focused panel are forwarded to the panel.

## Process Management

Each terminal window can optionally be tied to a managed process (from the config):

- **Status indicator** in the window title bar: running, warning, crashed, idle (visual treatment TBD)
- **Auto-restart on crash** (configurable, with backoff)
- Processes continue running when their row is not visible
- Closing a managed terminal stops the associated process

## Out of Scope (MVP)

- Window types beyond terminal and browser
- Per-window resize (stretch goal — fixed presets only for MVP)
- Split views within a single column (vertical stacking within a panel)
- Multi-monitor support
- Remote/SSH terminals
- Plugin/extension system
- Collaborative features
- Process auto-detection (requires explicit config for MVP)
- Cross-platform (macOS first, Linux/Windows later)

## Visual Reference

Interactive demo mockup available at `.superpowers/brainstorm/86072-1774384826/full-demo.html`. Open in a browser to see the spatial model, sidebar tree, scrollable strip, keyboard navigation, and Zellij-style hint bar.
