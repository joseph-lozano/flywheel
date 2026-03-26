# Config & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cascading YAML config system and per-panel zoom controls so users can customize terminal fonts, default zoom levels, and resize panels at runtime with Cmd+/-.

**Architecture:** A `ConfigManager` in the main process loads, merges, and serves YAML config files from three cascade locations. Zoom shortcuts (Cmd+/-, Cmd+0) route through the existing shortcut system, acting on the focused panel or app chrome. Per-panel zoom state is ephemeral in-memory. Config reload via Cmd+Shift+, re-merges files and pushes updates to all views.

**Tech Stack:** Electron IPC, `yaml` npm package, xterm.js `options.fontSize`, Electron `webContents.setZoomLevel` / `webFrame.setZoomLevel`, Vitest.

---

### Task 1: Add `yaml` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install yaml package**

```bash
npm install yaml
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('yaml')"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add yaml package for config parsing"
```

---

### Task 2: Config types and defaults

**Files:**
- Create: `src/shared/config.ts`
- Test: `tests/shared/config.test.ts`

- [ ] **Step 1: Write the test for config types and defaults**

```typescript
// tests/shared/config.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, mergeConfigs } from '../../src/shared/config'
import type { FlywheelConfig } from '../../src/shared/config'

describe('config defaults', () => {
  it('DEFAULT_CONFIG has expected shape', () => {
    expect(DEFAULT_CONFIG.preferences.terminal.fontFamily).toBe('monospace')
    expect(DEFAULT_CONFIG.preferences.terminal.fontSize).toBe(14)
    expect(DEFAULT_CONFIG.preferences.browser.defaultZoom).toBe(0)
    expect(DEFAULT_CONFIG.preferences.app.defaultZoom).toBe(0)
  })
})

describe('mergeConfigs', () => {
  it('returns defaults when no overrides provided', () => {
    const result = mergeConfigs([])
    expect(result).toEqual(DEFAULT_CONFIG)
  })

  it('overrides scalar values from higher-precedence config', () => {
    const override: Partial<FlywheelConfig> = {
      preferences: {
        terminal: { fontFamily: 'JetBrains Mono', fontSize: 18 },
        browser: { defaultZoom: 0 },
        app: { defaultZoom: 0 }
      }
    }
    const result = mergeConfigs([override])
    expect(result.preferences.terminal.fontFamily).toBe('JetBrains Mono')
    expect(result.preferences.terminal.fontSize).toBe(18)
  })

  it('deep merges partial overrides', () => {
    const override = {
      preferences: {
        terminal: { fontSize: 20 }
      }
    }
    const result = mergeConfigs([override as any])
    expect(result.preferences.terminal.fontSize).toBe(20)
    expect(result.preferences.terminal.fontFamily).toBe('monospace') // from default
    expect(result.preferences.browser.defaultZoom).toBe(0) // from default
  })

  it('first config in array takes precedence', () => {
    const local = { preferences: { terminal: { fontSize: 20 } } }
    const project = { preferences: { terminal: { fontSize: 16 } } }
    const result = mergeConfigs([local as any, project as any])
    expect(result.preferences.terminal.fontSize).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/shared/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement config types and merge**

```typescript
// src/shared/config.ts
export interface FlywheelConfig {
  preferences: {
    terminal: {
      fontFamily: string
      fontSize: number
    }
    browser: {
      defaultZoom: number
    }
    app: {
      defaultZoom: number
    }
  }
}

export const DEFAULT_CONFIG: FlywheelConfig = {
  preferences: {
    terminal: {
      fontFamily: 'monospace',
      fontSize: 14
    },
    browser: {
      defaultZoom: 0
    },
    app: {
      defaultZoom: 0
    }
  }
}

function deepMerge(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

/**
 * Merge config layers. First element has highest precedence.
 * Falls back to DEFAULT_CONFIG for any missing values.
 */
export function mergeConfigs(layers: Partial<FlywheelConfig>[]): FlywheelConfig {
  let result: FlywheelConfig = structuredClone(DEFAULT_CONFIG)
  // Apply in reverse order so first element wins
  for (let i = layers.length - 1; i >= 0; i--) {
    result = deepMerge(result, layers[i])
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/shared/config.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.ts tests/shared/config.test.ts
git commit -m "feat: add config types, defaults, and merge logic"
```

---

### Task 3: ConfigManager (main process)

**Files:**
- Create: `src/main/config-manager.ts`
- Test: `tests/main/config-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/config-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'

// Mock fs
const mockFiles = new Map<string, string>()
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    readFileSync: vi.fn((path: string) => {
      const content = mockFiles.get(path)
      if (content === undefined) throw new Error(`ENOENT: ${path}`)
      return content
    }),
    existsSync: vi.fn((path: string) => mockFiles.has(path))
  }
})

import { ConfigManager } from '../../src/main/config-manager'
import { DEFAULT_CONFIG } from '../../src/shared/config'

describe('ConfigManager', () => {
  beforeEach(() => {
    mockFiles.clear()
    // Reset XDG
    delete process.env.XDG_CONFIG_HOME
  })

  it('returns defaults when no config files exist', () => {
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get()).toEqual(DEFAULT_CONFIG)
  })

  it('loads global config from XDG_CONFIG_HOME', () => {
    process.env.XDG_CONFIG_HOME = '/home/user/.config'
    mockFiles.set('/home/user/.config/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 20')
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get().preferences.terminal.fontSize).toBe(20)
    expect(manager.get().preferences.terminal.fontFamily).toBe('monospace')
  })

  it('loads global config from ~/.config when XDG not set', () => {
    mockFiles.set(join(process.env.HOME || '', '.config', 'flywheel.yaml'), 'preferences:\n  terminal:\n    fontSize: 18')
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get().preferences.terminal.fontSize).toBe(18)
  })

  it('project config overrides global', () => {
    process.env.XDG_CONFIG_HOME = '/home/user/.config'
    mockFiles.set('/home/user/.config/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 20')
    mockFiles.set('/some/project/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 16')
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get().preferences.terminal.fontSize).toBe(16)
  })

  it('local config overrides project config', () => {
    mockFiles.set('/some/project/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 16')
    mockFiles.set('/some/project/flywheel.local.yaml', 'preferences:\n  terminal:\n    fontSize: 22')
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get().preferences.terminal.fontSize).toBe(22)
  })

  it('reload re-reads files', () => {
    mockFiles.set('/some/project/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 16')
    const manager = new ConfigManager()
    manager.load('/some/project')
    expect(manager.get().preferences.terminal.fontSize).toBe(16)

    mockFiles.set('/some/project/flywheel.yaml', 'preferences:\n  terminal:\n    fontSize: 24')
    manager.reload()
    expect(manager.get().preferences.terminal.fontSize).toBe(24)
  })

  it('handles invalid YAML gracefully', () => {
    mockFiles.set('/some/project/flywheel.yaml', ': invalid: yaml: [')
    const manager = new ConfigManager()
    manager.load('/some/project')
    // Should fall back to defaults
    expect(manager.get()).toEqual(DEFAULT_CONFIG)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/config-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ConfigManager**

```typescript
// src/main/config-manager.ts
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import { DEFAULT_CONFIG, mergeConfigs } from '../shared/config'
import type { FlywheelConfig } from '../shared/config'

export class ConfigManager {
  private config: FlywheelConfig = structuredClone(DEFAULT_CONFIG)
  private projectPath: string | null = null

  load(projectPath: string): void {
    this.projectPath = projectPath
    this.config = this.buildConfig()
  }

  reload(): void {
    this.config = this.buildConfig()
  }

  get(): FlywheelConfig {
    return this.config
  }

  private buildConfig(): FlywheelConfig {
    const layers: Partial<FlywheelConfig>[] = []

    // Local config (highest precedence)
    if (this.projectPath) {
      const local = this.readYaml(join(this.projectPath, 'flywheel.local.yaml'))
      if (local) layers.push(local)
    }

    // Project config
    if (this.projectPath) {
      const project = this.readYaml(join(this.projectPath, 'flywheel.yaml'))
      if (project) layers.push(project)
    }

    // Global config (lowest precedence)
    const globalPath = this.getGlobalConfigPath()
    if (globalPath) {
      const global = this.readYaml(globalPath)
      if (global) layers.push(global)
    }

    return mergeConfigs(layers)
  }

  private getGlobalConfigPath(): string {
    const xdgHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || '', '.config')
    return join(xdgHome, 'flywheel.yaml')
  }

  private readYaml(path: string): Partial<FlywheelConfig> | null {
    if (!existsSync(path)) return null
    try {
      const content = readFileSync(path, 'utf-8')
      const parsed = parseYaml(content)
      if (parsed && typeof parsed === 'object') return parsed
      return null
    } catch (e) {
      console.warn(`Failed to parse config file ${path}:`, e)
      return null
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/config-manager.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/config-manager.ts tests/main/config-manager.test.ts
git commit -m "feat: add ConfigManager with cascading YAML loading"
```

---

### Task 4: Wire ConfigManager into main process and IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: No new types needed in shared/types.ts**

The IPC payloads use the `FlywheelConfig` type from `src/shared/config.ts` directly. No separate payload type needed.

- [ ] **Step 2: Add ConfigManager to main/index.ts**

At the top of `src/main/index.ts`, add the import:

```typescript
import { ConfigManager } from './config-manager'
```

Add to the module-level declarations (after the `let worktreeManager` line):

```typescript
let configManager: ConfigManager
```

In `createWindow()`, after `worktreeManager = new WorktreeManager()`, add:

```typescript
configManager = new ConfigManager()
```

- [ ] **Step 3: Add config IPC handlers in setupIpcHandlers**

Add at the end of `setupIpcHandlers()` in `src/main/index.ts`:

```typescript
  // Config management
  ipcMain.handle('config:get-all', () => {
    return configManager.get()
  })

  ipcMain.on('config:reload', () => {
    const project = projectStore.getProjects().find(
      p => p.id === projectStore.getActiveProjectId()
    )
    if (project) {
      configManager.load(project.path)
    } else {
      configManager.reload()
    }
    const config = configManager.get()
    chromeView.webContents.send('config:updated', config)
    panelManager.broadcastConfig(config.preferences)
  })
```

- [ ] **Step 4: Load config on project switch**

In `setupIpcHandlers()`, update the existing `'project:switch'` handler:

```typescript
  ipcMain.on('project:switch', (_event, data: { projectId: string }) => {
    projectStore.setActiveProjectId(data.projectId)
    const project = projectStore.getProjects().find(p => p.id === data.projectId)
    if (project) {
      configManager.load(project.path)
      chromeView.webContents.send('config:updated', configManager.get())
      panelManager.broadcastConfig(configManager.get().preferences)
    }
  })
```

- [ ] **Step 5: Load config on initial project load**

In `createWindow()`, after `setupShortcuts()`, add this block so the initial project's config is loaded once the chrome view is ready:

```typescript
  chromeView.webContents.once('did-finish-load', () => {
    // Load config for the active project (if any)
    const activeId = projectStore.getActiveProjectId()
    if (activeId) {
      const project = projectStore.getProjects().find(p => p.id === activeId)
      if (project) configManager.load(project.path)
    }
  })
```

Note: Merge this into the existing `chromeView.webContents.once('did-finish-load', ...)` block that already calls `mainWindow.show()`.

- [ ] **Step 6: Add config APIs to preload/index.ts**

Add to the `contextBridge.exposeInMainWorld('api', { ... })` object in `src/preload/index.ts`:

```typescript
  // Config
  getConfig: (): Promise<FlywheelConfig> => {
    return ipcRenderer.invoke('config:get-all')
  },
  reloadConfig: () => {
    ipcRenderer.send('config:reload')
  },
  onConfigUpdated: (callback: (config: FlywheelConfig) => void) => {
    ipcRenderer.on('config:updated', (_event, config) => callback(config))
  },
```

Add the import at the top of `src/preload/index.ts`:

```typescript
import type { FlywheelConfig } from '../shared/config'
```

- [ ] **Step 7: Add broadcastConfig to PanelManager**

Add this method to the `PanelManager` class in `src/main/panel-manager.ts`:

```typescript
  broadcastConfig(preferences: { terminal: { fontFamily: string; fontSize: number }; browser: { defaultZoom: number }; app: { defaultZoom: number } }): void {
    for (const panel of this.panels.values()) {
      if (panel.type === 'terminal') {
        panel.view.webContents.send('config:updated', preferences)
      }
    }
  }
```

- [ ] **Step 8: Verify build compiles**

```bash
npx electron-vite build
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/main/index.ts src/main/panel-manager.ts src/preload/index.ts src/shared/types.ts
git commit -m "feat: wire ConfigManager into main process with IPC"
```

---

### Task 5: Terminal reads config for font settings

**Files:**
- Modify: `src/terminal/terminal.ts`
- Modify: `src/preload/panel.ts`

- [ ] **Step 1: Add config IPC to panel preload**

In `src/preload/panel.ts`, add to the `contextBridge.exposeInMainWorld('pty', { ... })` object:

```typescript
  getConfig: (): Promise<{ terminal: { fontFamily: string; fontSize: number } }> => {
    return ipcRenderer.invoke('config:get-all').then((config: any) => config.preferences)
  },
  onConfigUpdated: (callback: (config: any) => void) => {
    ipcRenderer.on('config:updated', (_event, config) => callback(config))
  },
```

- [ ] **Step 2: Add config:get-all handler for terminal panels**

The `config:get-all` handler is already registered in Task 4. Terminal panels use the same main process handler via IPC invoke.

- [ ] **Step 3: Update terminal.ts to use config**

Replace the terminal initialization section of `src/terminal/terminal.ts` (from `const panelId` through `reportSize()`):

```typescript
const panelId = window.pty.getPanelId()

let terminal: Terminal
let fitAddon: FitAddon

async function initTerminal(): Promise<void> {
  const config = await window.pty.getConfig()

  terminal = new Terminal({
    fontFamily: config.terminal.fontFamily,
    fontSize: config.terminal.fontSize,
    theme: TERMINAL_DEFAULTS.theme,
    allowProposedApi: true,
    scrollback: 5000
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new Unicode11Addon())
  terminal.unicode.activeVersion = '11'

  const container = document.getElementById('terminal')!
  terminal.open(container)

  // Try WebGL, fall back to canvas
  try {
    terminal.loadAddon(new WebglAddon())
  } catch (e) {
    console.warn('WebGL addon failed, using canvas renderer:', e)
  }

  fitAddon.fit()

  // Link detection — open URLs as browser panels instead of system browser
  terminal.loadAddon(new WebLinksAddon((_event, url) => {
    window.pty.openUrl(url)
  }))

  // Wire input: terminal → PTY
  terminal.onData((data) => {
    window.pty.input(panelId, data)
  })

  // Wire output: PTY → terminal
  window.pty.onOutput((data) => {
    terminal.write(data)
  })

  // Wire exit: PTY exited
  window.pty.onExit((_exitCode) => {
    terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
  })

  // Wire resize: terminal → PTY
  function reportSize(): void {
    window.pty.resize(panelId, terminal.cols, terminal.rows)
  }

  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit()
    reportSize()
  })
  resizeObserver.observe(container)

  // Initial size report
  reportSize()

  // Config reload — update font settings
  window.pty.onConfigUpdated((config: any) => {
    if (config.terminal) {
      terminal.options.fontFamily = config.terminal.fontFamily
      terminal.options.fontSize = config.terminal.fontSize
      fitAddon.fit()
    }
  })

  // Chrome state → title bar with dot-grid divider
  const posLabel = document.getElementById('pos-label')!
  const dotGridWrap = document.getElementById('dot-grid')!
  const titleLabel = document.getElementById('title-label')!

  initDotGrid(dotGridWrap)

  const titleBar = document.getElementById('panel-titlebar')!

  window.pty.onChromeState((state) => {
    posLabel.textContent = state.position <= 9 ? `${state.position}` : ''
    titleLabel.textContent = state.label
    titleBar.classList.toggle('focused', state.focused)
    setDotGridBusy(dotGridWrap, !!state.busy)
  })
}

initTerminal()
```

- [ ] **Step 4: Update the Window.pty type declaration**

Update the `declare global` block in `src/terminal/terminal.ts`:

```typescript
declare global {
  interface Window {
    pty: {
      input: (panelId: string, data: string) => void
      onOutput: (callback: (data: string) => void) => void
      resize: (panelId: string, cols: number, rows: number) => void
      onExit: (callback: (exitCode: number) => void) => void
      getPanelId: () => string
      openUrl: (url: string) => void
      onChromeState: (callback: (state: { position: number; label: string; focused: boolean; busy?: boolean }) => void) => void
      getConfig: () => Promise<{ terminal: { fontFamily: string; fontSize: number } }>
      onConfigUpdated: (callback: (config: any) => void) => void
    }
  }
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npx electron-vite build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/terminal/terminal.ts src/preload/panel.ts
git commit -m "feat: terminal reads font config from ConfigManager"
```

---

### Task 6: Zoom shortcuts — menu and before-input-event routing

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/panel-manager.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add zoom action types to ShortcutAction**

In `src/shared/types.ts`, update the `ShortcutAction` type to include zoom actions:

```typescript
export type ShortcutAction = {
  type: 'focus-left' | 'focus-right' | 'swap-left' | 'swap-right' | 'new-panel' | 'new-browser' | 'close-panel' | 'jump-to' | 'blur-panel' | 'reload-browser' | 'browser-back' | 'browser-forward' | 'add-project' | 'switch-project' | 'prev-project' | 'next-project' | 'new-row' | 'prev-row' | 'next-row' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'reload-config'
  index?: number
}
```

- [ ] **Step 2: Add menu shortcuts in setupShortcuts**

In `src/main/index.ts`, add a new `Config` menu to the template array in `setupShortcuts()`, before the `Edit` menu:

```typescript
    {
      label: 'Config',
      submenu: [
        {
          label: 'Reload Config',
          accelerator: 'Command+Shift+,',
          click: () => ipcMain.emit('config:reload')
        }
      ]
    },
```

Add zoom items to the existing `View` submenu, before the `forceReload` role:

```typescript
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'Command+=',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'zoom-in' })
        },
        {
          label: 'Zoom Out',
          accelerator: 'Command+-',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'zoom-out' })
        },
        {
          label: 'Reset Zoom',
          accelerator: 'Command+0',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'zoom-reset' })
        },
        { type: 'separator' },
```

- [ ] **Step 3: Remove Cmd+0 from the Ctrl+1-9 jump-to range**

In `setupShortcuts()`, the jump-to-panel array currently generates entries for 1-9. This conflicts with Cmd+0 for zoom reset. However, the range starts at `1` (`Array.from({ length: 9 }, (_, i) => ...)`), so `0` is already excluded. No change needed.

- [ ] **Step 4: Add zoom key interception in handleShortcutKey**

In `src/main/panel-manager.ts`, inside the `handleShortcutKey` function's non-shift `else` block, add zoom key handling. Add these lines before the closing brace of the non-shift block (after the `input.key === 'n'` line):

```typescript
        else if (input.key === '=' || input.key === '+') action = { type: 'zoom-in' }
        else if (input.key === '-') action = { type: 'zoom-out' }
        else if (input.key === '0') action = { type: 'zoom-reset' }
```

Also add to the `input.shift` block:

```typescript
        else if (input.key === ',' || input.key === '<') { ipcMain.emit('config:reload'); event.preventDefault(); return }
```

Wait — `ipcMain` is not available in panel-manager. Instead, route it through the chrome view like other shortcuts:

```typescript
        else if (input.key === ',' || input.key === '<') action = { type: 'reload-config' }
```

- [ ] **Step 5: Verify build compiles**

```bash
npx electron-vite build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/panel-manager.ts src/shared/types.ts
git commit -m "feat: add zoom and config reload keyboard shortcuts"
```

---

### Task 7: Zoom action handlers in the chrome renderer

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add zoom IPC methods to preload/index.ts**

Add to the `contextBridge.exposeInMainWorld('api', { ... })` object in `src/preload/index.ts`:

```typescript
  // Zoom
  zoomPanel: (panelId: string, direction: 'in' | 'out' | 'reset', defaultValue?: number) => {
    ipcRenderer.send('panel:zoom', { panelId, direction, defaultValue })
  },
  zoomApp: (direction: 'in' | 'out' | 'reset', defaultValue?: number) => {
    const { webFrame } = require('electron')
    if (direction === 'in') {
      webFrame.setZoomLevel(webFrame.getZoomLevel() + 1)
    } else if (direction === 'out') {
      webFrame.setZoomLevel(webFrame.getZoomLevel() - 1)
    } else {
      webFrame.setZoomLevel(defaultValue ?? 0)
    }
  },
```

- [ ] **Step 2: Add panel:zoom IPC handler in main process**

Add to `setupIpcHandlers()` in `src/main/index.ts`:

```typescript
  ipcMain.on('panel:zoom', (_event, data: { panelId: string; direction: 'in' | 'out' | 'reset'; defaultValue?: number }) => {
    panelManager.zoomPanel(data.panelId, data.direction, data.defaultValue, configManager.get())
  })
```

- [ ] **Step 3: Add zoomPanel method to PanelManager**

Add to `src/main/panel-manager.ts`:

```typescript
  private terminalFontSizes = new Map<string, number>()

  zoomPanel(id: string, direction: 'in' | 'out' | 'reset', defaultValue: number | undefined, config: import('../shared/config').FlywheelConfig): void {
    const panel = this.panels.get(id)
    if (!panel) return

    if (panel.type === 'terminal') {
      const currentSize = this.terminalFontSizes.get(id) ?? config.preferences.terminal.fontSize
      let newSize: number
      if (direction === 'in') newSize = currentSize + 1
      else if (direction === 'out') newSize = Math.max(6, currentSize - 1)
      else newSize = config.preferences.terminal.fontSize
      this.terminalFontSizes.set(id, newSize)
      panel.view.webContents.send('terminal:set-font-size', { fontSize: newSize })
    } else if (panel.type === 'browser') {
      const wc = panel.view.webContents
      if (direction === 'in') wc.setZoomLevel(wc.getZoomLevel() + 1)
      else if (direction === 'out') wc.setZoomLevel(wc.getZoomLevel() - 1)
      else wc.setZoomLevel(config.preferences.browser.defaultZoom)
    }
  }
```

Add the import for `FlywheelConfig` at the top of `src/main/panel-manager.ts`:

```typescript
import type { FlywheelConfig } from '../shared/config'
```

- [ ] **Step 4: Handle zoom shortcuts in App.tsx**

In `src/renderer/src/App.tsx`, add to the `handleShortcut` function's switch statement:

```typescript
      case 'zoom-in': {
        if (!strip || !strip.state.terminalFocused) {
          window.api.zoomApp('in')
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex]
          if (focused) window.api.zoomPanel(focused.id, 'in')
        }
        break
      }
      case 'zoom-out': {
        if (!strip || !strip.state.terminalFocused) {
          window.api.zoomApp('out')
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex]
          if (focused) window.api.zoomPanel(focused.id, 'out')
        }
        break
      }
      case 'zoom-reset': {
        if (!strip || !strip.state.terminalFocused) {
          window.api.zoomApp('reset')
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex]
          if (focused) window.api.zoomPanel(focused.id, 'reset')
        }
        break
      }
      case 'reload-config': {
        window.api.reloadConfig()
        showToast('Config reloaded', 'info')
        break
      }
```

- [ ] **Step 5: Handle terminal:set-font-size in terminal.ts**

Add to `src/terminal/terminal.ts`, inside the `initTerminal` function (after the `onConfigUpdated` listener):

```typescript
  // Zoom control from main process
  window.pty.onSetFontSize((data: { fontSize: number }) => {
    terminal.options.fontSize = data.fontSize
    fitAddon.fit()
  })
```

Add to the `Window.pty` type declaration:

```typescript
      onSetFontSize: (callback: (data: { fontSize: number }) => void) => void
```

Add to `src/preload/panel.ts`:

```typescript
  onSetFontSize: (callback: (data: { fontSize: number }) => void) => {
    ipcRenderer.on('terminal:set-font-size', (_event, data) => callback(data))
  },
```

- [ ] **Step 6: Clean up font size tracking on panel destroy**

In `src/main/panel-manager.ts`, add to `destroyPanel()` before `this.panels.delete(id)`:

```typescript
    this.terminalFontSizes.delete(id)
```

- [ ] **Step 7: Verify build compiles**

```bash
npx electron-vite build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.tsx src/preload/index.ts src/preload/panel.ts src/terminal/terminal.ts src/main/index.ts src/main/panel-manager.ts
git commit -m "feat: implement Cmd+/- zoom for terminals, browsers, and app chrome"
```

---

### Task 8: Update hint bar with zoom shortcuts

**Files:**
- Modify: `src/renderer/src/components/HintBar.tsx`

- [ ] **Step 1: Add zoom hint**

In `src/renderer/src/components/HintBar.tsx`, add a zoom hint to the `PANEL_HINTS` array:

```typescript
const PANEL_HINTS = [
  { key: '\u2318T', label: 'Terminal' },
  { key: '\u2318B', label: 'Browser' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u2318G', label: 'Blur' },
  { key: '\u2318+/-', label: 'Zoom' }
]
```

- [ ] **Step 2: Add config reload hint**

Add to the `PANEL_HINTS` or create a general hint section — since reload applies everywhere, add it to all hint sets. The simplest approach: add it alongside zoom:

```typescript
const PANEL_HINTS = [
  { key: '\u2318T', label: 'Terminal' },
  { key: '\u2318B', label: 'Browser' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u2318G', label: 'Blur' },
  { key: '\u2318+/-', label: 'Zoom' },
  { key: '\u2318\u21e7,', label: 'Reload Config' }
]
```

- [ ] **Step 3: Verify build compiles**

```bash
npx electron-vite build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx
git commit -m "feat: add zoom and config reload hints to hint bar"
```

---

### Task 9: Update constants.ts to use config defaults

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Remove redundant terminal defaults from constants.ts**

The `TERMINAL_DEFAULTS` in `constants.ts` currently has `fontFamily` and `fontSize` that are now controlled by config. Keep only the `theme` object (which is not yet configurable). Update `src/shared/constants.ts`:

Replace `TERMINAL_DEFAULTS`:

```typescript
export const TERMINAL_DEFAULTS = {
  theme: {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
    cursor: '#e0e0e0',
    cursorAccent: '#1a1a2e',
    selectionBackground: 'rgba(255, 255, 255, 0.2)',
    black: '#1a1a2e',
    red: '#f43f5e',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#6366f1',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#e0e0e0',
    brightBlack: '#4a4a6a',
    brightRed: '#fb7185',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#818cf8',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  }
} as const
```

This removes `fontFamily` and `fontSize` from `TERMINAL_DEFAULTS` since those now come from `config.ts`.

- [ ] **Step 2: Verify no other code references TERMINAL_DEFAULTS.fontFamily or fontSize**

```bash
npx vitest run
```

Expected: All existing tests pass. If any reference the removed properties, update them.

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "refactor: remove font settings from TERMINAL_DEFAULTS (now in config)"
```

---

### Task 10: Add .gitignore entry for local config

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add flywheel.local.yaml to .gitignore**

Add to `.gitignore`:

```
flywheel.local.yaml
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore flywheel.local.yaml"
```

---

### Task 11: Run all tests and verify

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run build**

```bash
npx electron-vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server:

```bash
npm run dev
```

Verify:
1. App starts normally with default font settings
2. Create a `flywheel.yaml` in a project dir with `preferences: { terminal: { fontSize: 20 } }` — reload config with Cmd+Shift+, — new terminals should use font size 20
3. Cmd+= on a focused terminal increases font size
4. Cmd+- on a focused terminal decreases font size
5. Cmd+0 resets to config default
6. Cmd+= with no panel focused zooms the app chrome
7. Cmd+= on a focused browser zooms the browser content
8. Hint bar shows zoom and reload config shortcuts
