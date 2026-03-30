# Browser Panel DevTools

Add Chrome DevTools support to browser panels via Electron's native `openDevTools` API. DevTools docks inside the browser content view (bottom dock mode).

## Scope

- Toggle DevTools on a browser panel's content webContents
- Keyboard shortcut: Cmd+Shift+I
- Chrome strip button: Lucide wrench icon next to reload
- No hint bar entry
- No context menu (separate effort)

## Architecture

### IPC

New handler in main process:

- `browser:toggle-devtools` — receives `{panelId}`, calls `webContents.toggleDevTools()` on the content view

### PanelManager

New method:

- `toggleBrowserDevTools(id: string)` — looks up the managed panel, verifies it's a browser type, calls `panel.view.webContents.toggleDevTools()` with no mode argument (Electron defaults to last-used dock position, initially bottom)

### Keyboard Shortcut

In `PanelManager.createPanel()`, the existing `before-input-event` handler gains a new case:

- `meta + shift + i` → emit `shortcut:action` with `{type: "toggle-devtools"}`

In renderer `App.tsx`, `handleShortcut` routes `"toggle-devtools"` to `window.api.toggleBrowserDevTools(panelId)` on the focused browser panel. No-op if the focused panel is not a browser.

### Preload: `browser.ts`

Expose new method on `window.browserHost`:

- `toggleDevTools()` — sends `browser:toggle-devtools` with the panel's ID

### Preload: `index.ts`

Expose new method on `window.api`:

- `toggleBrowserDevTools(panelId: string)` — sends `browser:toggle-devtools`

### Chrome Strip UI: `browser-host.html` / `browser-host.ts`

Add a wrench icon button to the navbar row, positioned after the reload button. On click, calls `window.browserHost.toggleDevTools()`.

Icon: Lucide wrench SVG, same size and style as existing back/forward/reload icons.

## Non-Goals

- Context menu with "Inspect Element" (separate effort)
- DevTools as a separate Flywheel panel (CDP approach)
- Programmatic control of DevTools dock position or size
- Hint bar entry for the shortcut
