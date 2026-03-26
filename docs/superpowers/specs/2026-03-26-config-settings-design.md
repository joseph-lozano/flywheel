# Config & Settings Design

Adds a cascading YAML configuration system and per-panel zoom controls. This is the foundation for all future configuration — themes, project behavior (auto-launch panels, process management), and eventually a settings UI.

## Scope

- Cascading YAML config loading and merging
- Terminal font family and font size (configurable defaults)
- Browser default zoom level
- App chrome default zoom level
- Cmd+/- and Cmd+0 zoom keybindings (context-dependent)
- Cmd+Shift+, config reload (plus menu bar item)

### Out of scope

- Terminal color themes / named themes
- UI/app theming (sidebar, hint bar, chrome colors)
- Settings UI (follow-up PR)
- Project behavior config (auto-launch panels, process management — Phase 5)
- File watching / auto-reload

## Config File Format & Cascade

### File locations

Checked in order. First value wins per key (most-local takes precedence):

1. `<project-dir>/flywheel.local.yaml` — personal overrides, gitignored
2. `<project-dir>/flywheel.yaml` — project defaults, committable
3. `$XDG_CONFIG_HOME/flywheel.yaml` — user global (defaults to `~/.config/flywheel.yaml`)

The file system is the namespace — project-dir files are inherently project-scoped, so there's no need for project name/path keys inside a config file.

### Schema

```yaml
preferences:
  terminal:
    fontFamily: "monospace"
    fontSize: 14
  browser:
    defaultZoom: 0
  app:
    defaultZoom: 0
```

The `preferences` namespace holds user taste — things that vary per person. Future project behavior config (auto-launch panels, process definitions, dependencies) will live under separate top-level keys, keeping the two concerns cleanly separated.

### Merge strategy

Deep merge — objects merge recursively, scalars from the highest-precedence file win. Missing keys fall back to the next file in the cascade, then to hard-coded defaults in the app.

### Validation

Unknown keys are silently ignored (forward-compatible). Known keys with wrong types log a warning and fall back to the default value.

## Zoom Mechanics

### Cmd+/- behavior

Context-dependent based on what's focused:

- **Terminal focused:** increase/decrease that terminal's font size (+/-1px per step via xterm.js `options.fontSize`)
- **Browser focused:** zoom that browser's web content (+/-1 zoom level, ~20% per step via Electron's `webContents.setZoomLevel`)
- **No panel focused** (after Cmd+G blur): zoom the app chrome (sidebar, hint bar, title bars) via `webFrame.setZoomLevel` on the chrome renderer

### Cmd+0

Resets the focused panel (or chrome) back to its config default.

### Persistence

All per-panel zoom is ephemeral — lives in memory only. On restart, everything starts at config defaults. This matches the dominant pattern in terminal emulators (iTerm2, Kitty, Alacritty).

### Cmd+Shift+, (config reload)

Triggers re-merge of all YAML files and pushes new defaults to all views. Does NOT reset current per-panel zoom overrides — it updates what "default" means for future panels and for Cmd+0 resets.

Also available as a menu bar item under the app menu.

## Config Loading Architecture

### New module: `src/main/config-manager.ts`

Responsibilities:

- Load and parse YAML files from the three cascade locations
- Deep-merge them (local > project > global > hard-coded defaults)
- Expose the merged config to other main process modules
- Handle reload (re-merge and push to all views)
- Log warnings for invalid YAML or wrong types, fall back to defaults

### Config flow

1. App starts — `ConfigManager.load(projectPath)` reads and merges YAML files for the active project
2. On project switch — ConfigManager reloads with the new project path (project-dir files change, global file stays)
3. Main process modules read config directly (e.g., `PtyManager` reads `terminal.fontSize` when spawning)
4. Chrome renderer gets config at startup via IPC (`window.config.getAll()`)
5. Terminal/browser panels get relevant config via IPC when created
6. On reload (Cmd+Shift+,): ConfigManager re-merges, notifies main process consumers, pushes updates to all active views

### IPC surface

- `config:get-all` — returns merged config (renderer to main)
- `config:reload` — triggers re-merge and push (renderer to main, for the menu/shortcut)
- `config:updated` — pushed to all views after reload (main to renderers)

### New dependency

`yaml` npm package for YAML parsing.

## Keyboard Shortcut Integration

### New shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+= | Zoom in focused panel or app chrome |
| Cmd+- | Zoom out focused panel or app chrome |
| Cmd+0 | Reset zoom to config default |
| Cmd+Shift+, | Reload config from disk |

### Registration

Same pattern as existing shortcuts — registered in `setupShortcuts` in `main/index.ts` as menu accelerators, with `handleShortcutKey` in `panel-manager.ts` intercepting them from focused panels.

### Zoom state tracking

`PanelManager` tracks per-panel zoom offsets in memory (`Map<panelId, number>`). On Cmd+/-, it updates the offset and applies it. On Cmd+0, it clears the offset and applies the config default. On config reload, defaults change but existing offsets are preserved.

### Hint bar

Update to show zoom shortcuts in the appropriate context (panel focused vs no focus).
