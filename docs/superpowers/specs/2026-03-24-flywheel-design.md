# Flywheel — Development Command Center

A desktop app that consolidates your entire dev stack — terminals, browsers, AI agents — into a single keyboard-driven interface with Niri-style scrollable window management.

## Problem

Developers juggle dozens of windows across multiple projects: terminal tabs for dev servers, test watchers, shells, and AI agents; browser windows for localhost previews; desktop switching between projects. There's no single surface that organizes all of this per-project with efficient spatial navigation.

## Core Concepts

### Projects

A project is a directory on disk, typically a git repo. Projects are listed in a tree sidebar on the left side of the app. You add projects manually (open a directory) or they're auto-discovered.

Each project can have a `flywheel.yml` config file that defines processes to auto-launch when the project is opened. Without a config, the project opens with a single empty terminal in the project directory.

### Rows (Worktrees)

Each project has a default row tied to its working directory. Additional rows can be created for git worktrees, giving each branch its own independent horizontal strip of windows.

**One row is visible at a time.** Switching rows (via sidebar click or keyboard shortcut) replaces the current strip entirely. Rows persist in the background — processes keep running and scroll position is preserved when switching back.

### Windows (Panels)

Windows are arranged as columns in an infinite horizontal strip within each row. The viewport scrolls left/right to reveal windows, Niri-style.

**Key properties:**
- Opening or closing a window never causes other windows to resize
- New windows appear to the right of the currently focused window
- Windows have a fixed default width (configurable preset: half, third, or two-thirds of viewport). Per-window resize is a stretch goal.
- Each window has a title bar showing its name, type icon, and process status indicator

### Window Types (MVP)

**Terminal** — A full terminal emulator powered by xterm.js + node-pty. Supports interactive programs (shells, Claude Code, vim, etc.). Each terminal runs in the project directory (or worktree directory for worktree rows).

**Browser** — An embedded browser panel via Electron's `WebContentsView`. Loads any URL. Independent cookies/sessions per panel via `session.fromPartition()`. Primarily used for localhost dev server previews.

## Architecture

### Technology Stack

- **Shell**: Electron with `BaseWindow` + `WebContentsView` (Electron 30+)
- **Terminals**: xterm.js in renderer + node-pty in main process
- **Browsers**: `WebContentsView` instances with independent sessions
- **Frontend**: React (or similar) for the chrome (sidebar, row headers, scroll indicators, keyboard hint bar)
- **Config**: YAML (`flywheel.yml`)

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
- Panels far off-screen (e.g., 3+ panels away) may be fully destroyed and recreated on scroll for memory efficiency
- Terminal state is preserved via xterm.js serialization when panels are destroyed
- Browser panels reload their URL when recreated (acceptable for localhost dev servers)

### Memory Budget

- Each browser `WebContentsView`: ~50-80 MB
- Each terminal `WebContentsView`: ~30-50 MB
- Target: comfortable with 5-10 visible panels, up to 20 total per project with lazy loading
- Aggressive panel destruction for off-screen panels keeps active memory under control

## Sidebar

The sidebar uses a tree layout:

```
PROJECTS
▼ flywheel-api
  ● main          ← active row (blue)
  ● feat/auth     ← worktree row (orange)
▶ web-client      ← collapsed project
▶ shared-lib      ← collapsed project
+ Add Project
```

- Click a project name to expand/collapse its worktree list
- Click a worktree branch to switch to that row
- Each branch shows a colored dot (unique per worktree for quick identification)
- The active row is highlighted in the sidebar

## Config Format

`flywheel.yml` in the project root:

```yaml
name: flywheel-api

processes:
  - name: dev server
    command: npm run dev
    type: terminal

  - name: tests
    command: npm run test:watch
    type: terminal

  - name: app preview
    url: http://localhost:5173
    type: browser
    after: dev server  # waits for process to be ready before opening
```

- `type: terminal` — spawns a terminal running the command
- `type: browser` — opens a browser panel to the URL
- `after` — optional dependency ordering (don't open browser before server is up)
- No config file → one empty terminal in the project directory

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

- The strip scrolls horizontally. Smooth scrolling with momentum.
- Fade indicators on left/right edges show when more windows exist off-screen, with directional arrows.
- A thin scroll track at the bottom of the strip shows viewport position relative to the full strip.
- When focus moves to a window (via keyboard), the strip auto-scrolls to center that window.
- Trackpad horizontal scroll and mouse wheel (with shift) also work.

## Process Management

Each terminal window can optionally be tied to a managed process (from `flywheel.yml`):

- **Status indicator** in the window title bar: green (running), orange (warning), red (crashed), gray (idle/stopped)
- **Auto-restart on crash** (configurable, with backoff)
- Processes continue running when their row is not visible
- Closing a managed terminal stops the associated process

## Out of Scope (MVP)

- Window type beyond terminal and browser (e.g., log viewer, markdown preview)
- Per-window resize (stretch goal — fixed presets only for MVP)
- Split views within a single column (vertical stacking within a panel)
- Multi-monitor support
- Remote/SSH terminals
- Plugin/extension system
- Collaborative features
- Process auto-detection (requires explicit `flywheel.yml` for MVP)
- Cross-platform (macOS first, Linux/Windows later)

## Visual Reference

Interactive demo mockup available at `.superpowers/brainstorm/86072-1774384826/full-demo.html`. Open in a browser to see the spatial model, sidebar tree, scrollable strip, keyboard navigation, and Zellij-style hint bar.
