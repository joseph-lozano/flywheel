# Phase 2: Terminal Panels — Design Spec

## Overview

Replace Phase 1's colored placeholder panels with real terminal emulators. Each panel runs xterm.js connected to a node-pty session in the main process. After this phase, Flywheel is a usable Niri-style terminal multiplexer.

## Decisions Made

| Decision               | Choice                                | Rationale                                                                                                                                                                             |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC architecture       | **Buffered output, unbuffered input** | Battle-tested pattern (Hyper, Terminus). Keystrokes relay immediately for responsiveness. PTY output buffers at ~16ms intervals to handle throughput spikes (e.g., `cat` large file). |
| xterm.js addons        | **fit + webgl + unicode11**           | `fit` auto-sizes rows/cols to panel bounds. `webgl` gives GPU-accelerated rendering (canvas fallback). `unicode11` for proper wide-char handling.                                     |
| Scroll disambiguation  | **Mouse-position-based**              | Scroll events over panel content go to the terminal. Scroll events over chrome (title bars, gaps, hint bar) go to the strip. No modifier keys needed.                                 |
| Panel blur             | **⌘G**                                | Unfocuses the active terminal, returning to "strip mode" where keyboard/scroll controls the strip. Re-focus via click or Enter. Home row position chosen for ergonomics.              |
| Off-screen panels      | **Hide, never destroy**               | `setVisible(false)` when off-screen. PTY stays alive, xterm.js buffer preserved. Simplest approach; optimization deferred (see TODOs).                                                |
| Close behavior         | **Kill immediately, confirm if busy** | `⌘W` on idle shell: kill + remove. If a foreground process is running: show confirmation dialog.                                                                                      |
| Shell exit             | **Auto-remove panel**                 | When the shell process exits (user types `exit`, script finishes), the panel is automatically removed from the strip.                                                                 |
| Terminal appearance    | **Dark default, configurable**        | Dark theme matching chrome UI. Settings for font family, font size, and color scheme. WebGL renderer with canvas fallback.                                                            |
| Panel width            | **Fixed 50%**                         | Same as Phase 1. Per-panel width presets deferred.                                                                                                                                    |
| Shell startup          | **$SHELL in cwd**                     | Launch user's default login shell, inherit environment, start in project working directory. Per-project config deferred to Phase 4.                                                   |
| Link detection         | **Deferred to Phase 3**               | Only useful once browser panels exist to open links into.                                                                                                                             |
| Terminal serialization | **Deferred**                          | No panel destruction means no serialization needed yet. Captured as a TODO for when we optimize panel lifecycle.                                                                      |

## Architecture

### New Component: PTY Manager

A new module in the main process (`src/main/pty-manager.ts`) that manages node-pty sessions. Sits alongside the existing Panel Manager.

```
Main Process
├── Panel Manager (existing)
│   └── WebContentsView lifecycle, setBounds(), show/hide
├── PTY Manager (new)
│   └── node-pty sessions, output buffering, resize, process lifecycle
└── IPC handlers (extended)
    └── New channels for pty:create, pty:input, pty:output, pty:resize, pty:exit
```

### PTY Manager Responsibilities

- **Spawn**: Create a node-pty instance per terminal panel. Shell is `process.env.SHELL` (or `/bin/zsh` fallback). Working directory is the app's cwd (project directory in later phases).
- **Output buffering**: Each PTY gets an output buffer (string accumulator). A single `setInterval` at ~16ms flushes all dirty buffers to their respective renderers via IPC. This prevents IPC flooding during high-throughput output.
- **Input relay**: Keystroke data from the renderer is written to the PTY immediately (no buffering).
- **Resize**: When the renderer reports new cols/rows (after panel reflow), call `pty.resize(cols, rows)`.
- **Exit handling**: When a PTY process exits, notify the chrome view to remove the panel from the strip. Clean up the PTY instance.
- **Close with confirmation**: Expose a method to check if a PTY has a foreground process other than the shell itself. Used by the close confirmation flow.

### Data Flow

**Terminal input (keystroke):**

```
User types in terminal
       │
       ▼
xterm.js onData callback (renderer)
       │
       ▼
Preload API: pty.input(panelId, data)
       │
       ▼
IPC send: 'pty:input'
       │
       ▼
Main process: ptyManager.write(panelId, data)
       │
       ▼
node-pty: pty.write(data)
```

**Terminal output (PTY → screen):**

```
PTY produces output (command result, prompt, etc.)
       │
       ▼
node-pty onData callback (main process)
       │
       ▼
Accumulate in panel's output buffer
       │
       ▼
16ms flush timer fires
       │
       ▼
IPC send to panel renderer: 'pty:output' with buffered data
       │
       ▼
xterm.js: terminal.write(data)
```

**Terminal resize:**

```
Window resize / strip layout change
       │
       ▼
Panel bounds change (existing flow)
       │
       ▼
xterm.js fit addon: fitAddon.fit()
       │
       ▼
New cols/rows computed
       │
       ▼
Preload API: pty.resize(panelId, cols, rows)
       │
       ▼
IPC send: 'pty:resize'
       │
       ▼
Main process: pty.resize(cols, rows)
```

**Panel close (⌘W):**

```
User presses ⌘W
       │
       ▼
Main process: check if PTY has foreground process
       │
       ├── No foreground process (idle shell):
       │   Kill PTY, notify chrome view to remove panel
       │
       └── Foreground process running:
           Send confirmation request to chrome view
                  │
                  ▼
           Chrome view shows modal: "Process `npm run dev` is running. Close anyway?"
                  │
                  ├── User confirms: Kill PTY, remove panel
                  └── User cancels: Do nothing
```

**Shell exit (auto-remove):**

```
Shell process exits (user types `exit`, script finishes)
       │
       ▼
node-pty onExit callback (main process)
       │
       ▼
PTY Manager cleans up PTY instance
       │
       ▼
IPC send to chrome view: 'pty:exit' { panelId }
       │
       ▼
Chrome view: remove panel from strip store, notify main process to destroy WebContentsView
```

### New IPC Channels

Added to the existing IPC protocol in `constants.ts`:

| Channel                      | Direction     | Payload                                           | Purpose                                      |
| ---------------------------- | ------------- | ------------------------------------------------- | -------------------------------------------- |
| `pty:create`                 | Chrome → Main | `{ panelId: string }`                             | Spawn a new PTY session for a terminal panel |
| `pty:input`                  | Panel → Main  | `{ panelId: string, data: string }`               | Forward keystroke data to PTY                |
| `pty:output`                 | Main → Panel  | `{ panelId: string, data: string }`               | Buffered PTY output to render                |
| `pty:resize`                 | Panel → Main  | `{ panelId: string, cols: number, rows: number }` | Terminal reflow                              |
| `pty:exit`                   | Main → Chrome | `{ panelId: string, exitCode: number }`           | Shell process exited                         |
| `pty:confirm-close`          | Main → Chrome | `{ panelId: string, processName: string }`        | Ask user to confirm close                    |
| `pty:confirm-close-response` | Chrome → Main | `{ panelId: string, confirmed: boolean }`         | User's response                              |

### Panel Preload Changes

The existing panel preload (`src/preload/panel.ts`) currently only forwards wheel events. For terminal panels, it needs to expose the PTY IPC channels:

```typescript
// Existing: wheel event forwarding (now conditional — see Scroll Disambiguation)
// New: PTY communication
contextBridge.exposeInMainWorld("pty", {
  input: (panelId: string, data: string) => ipcRenderer.send("pty:input", { panelId, data }),
  onOutput: (callback: (data: string) => void) => {
    ipcRenderer.on("pty:output", (_event, payload) => callback(payload.data));
  },
  resize: (panelId: string, cols: number, rows: number) => {
    ipcRenderer.send("pty:resize", { panelId, cols, rows });
  },
  onExit: (callback: (exitCode: number) => void) => {
    ipcRenderer.on("pty:exit", (_event, payload) => callback(payload.exitCode));
  },
});
```

### Chrome Preload Changes

The chrome view preload (`src/preload/index.ts`) needs new methods for PTY lifecycle:

```typescript
// New: PTY lifecycle
createTerminal: (panelId: string) => ipcRenderer.send('pty:create', { panelId }),
onPtyExit: (callback: (data: { panelId: string, exitCode: number }) => void) => {
  ipcRenderer.on('pty:exit', (_event, data) => callback(data))
},
onConfirmClose: (callback: (data: { panelId: string, processName: string }) => void) => {
  ipcRenderer.on('pty:confirm-close', (_event, data) => callback(data))
},
confirmCloseResponse: (panelId: string, confirmed: boolean) => {
  ipcRenderer.send('pty:confirm-close-response', { panelId, confirmed })
}
```

## Scroll Disambiguation

### Mouse-Position-Based Routing

In Phase 1, all wheel events from panel views are forwarded to the chrome view for strip scrolling. In Phase 2, this changes:

- **Vertical scroll over a terminal panel**: Goes to the terminal (xterm.js handles scrollback). The panel preload does NOT forward vertical scroll to the main process.
- **Horizontal scroll over a terminal panel**: Forwarded to the chrome view for strip scrolling. Terminals don't use horizontal scroll.
- **Any scroll over chrome areas** (title bars, gaps between panels, hint bar, scroll indicators): Goes to strip scrolling. This is already handled by the chrome view's own wheel listeners.

The panel preload change is minimal — the existing wheel listener already checks `event.deltaX !== 0`. We keep that behavior (horizontal → strip) and let vertical scroll events be consumed naturally by xterm.js's own scroll handling.

### Blur / Unfocus (⌘G)

`⌘G` is registered as a Menu accelerator (same pattern as existing shortcuts). When triggered:

1. Chrome view receives `shortcut:action` with type `'blur-panel'`
2. Store action: set a `blurred` flag (or set `focusedIndex` to `-1` / a "none" state)
3. The focused panel's terminal loses input focus (no cursor, no key forwarding)
4. Keyboard shortcuts (⌘←, ⌘→, ⌘1-9) continue to work for strip navigation
5. Clicking a panel or pressing Enter re-focuses it

When a panel is focused via ⌘← / ⌘→ / ⌘1-9 / click, the terminal within that panel automatically receives focus (cursor appears, keystrokes forwarded).

## Terminal Panel Renderer

Each terminal panel's WebContentsView loads a minimal HTML page that:

1. Creates an xterm.js `Terminal` instance with the configured theme/font
2. Attaches the `FitAddon`, `WebglAddon` (with canvas fallback), and `Unicode11Addon`
3. Calls `fitAddon.fit()` on load and on resize
4. Wires `terminal.onData` → `pty.input()` (via preload)
5. Wires `pty.onOutput` → `terminal.write()` (via preload)
6. Wires `pty.onExit` → notify chrome view to remove panel
7. Reports cols/rows after each fit → `pty.resize()` (via preload)

### Terminal Content Page

Instead of loading a `data:` URL (as Phase 1 does for colored placeholders), terminal panels load a local HTML file bundled with the app: `src/terminal/index.html`. This file imports xterm.js and sets up the terminal instance.

The terminal page is built by electron-vite alongside the existing renderer and preload entries. It's a separate entry point, not part of the chrome view's Solid app. This requires adding a new renderer entry in `electron.vite.config.ts` (multi-page config) so the terminal HTML/JS is built and output alongside the existing chrome renderer.

### Terminal Theme

Default theme (matches existing chrome dark UI):

```typescript
const defaultTheme = {
  background: "#1a1a2e",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  cursorAccent: "#1a1a2e",
  selectionBackground: "rgba(255, 255, 255, 0.2)",
  black: "#1a1a2e",
  red: "#f43f5e",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#6366f1",
  magenta: "#8b5cf6",
  cyan: "#06b6d4",
  white: "#e0e0e0",
  brightBlack: "#4a4a6a",
  brightRed: "#fb7185",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#818cf8",
  brightMagenta: "#a78bfa",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};
```

Configurable settings (stored in a simple object for now, proper settings UI in later phases):

- `fontFamily`: default `'monospace'`
- `fontSize`: default `14`
- `theme`: default as above

## Panel Manager Changes

The existing Panel Manager creates panels with colored placeholder content. In Phase 2:

- `createPanel` accepts a `type` parameter: `'placeholder'` (legacy, for tests) or `'terminal'`
- Terminal panels load the terminal HTML page instead of a `data:` URL
- Terminal panels use a terminal-specific preload that exposes both wheel forwarding and PTY IPC
- The Panel Manager does not manage PTY sessions — that's the PTY Manager's job

## Store Changes

The Solid store (`src/renderer/src/store/strip.ts`) needs:

- **Panel type**: Each panel in the store gets a `type` field (`'terminal'`). Replaces `color` and `label`.
- **Blur state**: A `terminalFocused` boolean (or similar). When false, the focused panel's terminal doesn't receive input focus.
- **New action**: `blurPanel()` — sets `terminalFocused = false`
- **Updated action**: `focusPanel(index)` — sets `terminalFocused = true` (re-focuses terminal on navigation)
- **New action**: `removePanelById(id)` — removes a panel by ID (for auto-remove on shell exit). The existing `removePanel()` (which removes the focused panel) is updated to delegate to this, ensuring one removal path.
- **Shortcut type update**: Add `'blur-panel'` to the `ShortcutAction` type union

## Keyboard Shortcuts Update

| Shortcut | Phase 1 Action        | Phase 2 Action                                     |
| -------- | --------------------- | -------------------------------------------------- |
| `⌘T`     | New placeholder panel | New terminal panel (spawns shell)                  |
| `⌘W`     | Remove placeholder    | Kill PTY (with confirmation if busy), remove panel |
| `⌘←/→`   | Focus + scroll        | Focus + scroll + terminal focus                    |
| `⌘1-9`   | Jump to panel         | Jump to panel + terminal focus                     |
| `⌘G`     | —                     | **New**: Blur focused terminal, enter strip mode   |

The hint bar updates to show `⌘G Blur` instead of no blur option.

## Confirmation Dialog

When `⌘W` targets a panel with a running foreground process:

1. Main process detects foreground process via `pty.process` (node-pty provides the foreground process name). Note: `pty.process` can sometimes return the shell itself rather than a foreground child; compare against the original shell name as a fallback heuristic.
2. Sends `pty:confirm-close` to chrome view with the process name
3. Chrome view renders a minimal modal overlay:
   - Dark semi-transparent backdrop
   - "Process `{name}` is running. Close anyway?"
   - Two buttons: "Cancel" (⌘. or Esc) and "Close" (Enter)
4. Response sent back via `pty:confirm-close-response`
5. If confirmed, PTY is killed and panel removed

This is a simple Solid component rendered by the chrome view — not a native dialog.

## Dependencies

New npm packages:

| Package                  | Purpose                         |
| ------------------------ | ------------------------------- |
| `node-pty`               | PTY spawning in main process    |
| `@xterm/xterm`           | Terminal emulator in renderer   |
| `@xterm/addon-fit`       | Auto-size terminal to container |
| `@xterm/addon-webgl`     | GPU-accelerated rendering       |
| `@xterm/addon-unicode11` | Wide character support          |

`node-pty` is a native module — requires node-gyp or prebuild-install. electron-vite handles native module resolution for Electron's Node version.

## File Structure (new/changed files)

```
src/
├── main/
│   ├── index.ts              (modified: new IPC handlers, ⌘G shortcut)
│   ├── panel-manager.ts      (modified: panel type, terminal HTML loading)
│   └── pty-manager.ts         (NEW: PTY lifecycle, buffering, resize)
├── preload/
│   ├── index.ts              (modified: new chrome PTY lifecycle methods)
│   └── panel.ts              (modified: PTY IPC + conditional wheel forwarding)
├── terminal/
│   ├── index.html            (NEW: terminal panel entry point)
│   └── terminal.ts           (NEW: xterm.js setup, addon loading, IPC wiring)
├── shared/
│   ├── types.ts              (modified: Panel type field, ShortcutAction union)
│   └── constants.ts          (modified: new IPC channels)
└── renderer/
    └── src/
        ├── store/
        │   └── strip.ts      (modified: panel type, blur state, removePanel action)
        └── components/
            ├── HintBar.tsx    (modified: show ⌘G Blur)
            └── ConfirmDialog.tsx (NEW: close confirmation modal)
```

## Testing Strategy

- **PTY Manager unit tests**: Spawn, write, read, resize, exit handling. Mock node-pty for unit tests.
- **Output buffering tests**: Verify buffering accumulates data and flushes at intervals.
- **Store tests**: New actions (blurPanel, removePanel), panel type handling.
- **Integration test**: Verify full round-trip: keystroke → PTY → buffered output → xterm.js render. This requires a real PTY (not mocked) and may be slower.
- **Existing tests**: Layout engine tests should pass unchanged (layout doesn't depend on panel type).

## Phase 2 Scope Boundary

**In scope:**

- xterm.js + node-pty integration
- PTY Manager with buffered output
- Scroll disambiguation (mouse-position-based)
- Panel blur/unfocus (⌘G)
- Terminal appearance (dark theme, configurable font/size/scheme)
- Close confirmation for busy terminals
- Auto-remove on shell exit
- Resize/reflow handling

**Not in scope (later phases):**

- Link detection in terminal output (Phase 3)
- Terminal state serialization/restore (optimization TODO)
- Per-panel width presets (deferred)
- Per-project shell config / environment (Phase 4)
- Panel destruction for memory optimization (deferred)

## TODOs for Future Phases

- **Terminal serialization**: When panel destruction is implemented (for memory optimization), serialize xterm.js scrollback buffer before destroying, restore when panel re-enters viewport. Requires keeping PTY alive while view is destroyed, or re-creating PTY and replaying output.
- **Link detection**: Wire xterm.js link provider to open URLs as browser panels (Phase 3).
- **Ghostty-web evaluation**: If libghostty WASM matures sufficiently, evaluate as xterm.js replacement. API-compatible, so swap should be low-risk.
- **File drag-and-drop into terminal**: Handle `drop` events on terminal panels to write file paths into PTY stdin (enables dragging images into Claude Code sessions). xterm.js has no native drop support; requires custom event handling. Ghostty-web upgrade would also help here.
- **Kitty graphics protocol**: Inline image rendering in terminal. Not supported by xterm.js — requires ghostty-web or a custom addon.
