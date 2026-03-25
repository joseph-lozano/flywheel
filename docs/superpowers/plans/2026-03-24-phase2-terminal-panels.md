# Phase 2: Terminal Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder panels with real terminal emulators using xterm.js + node-pty, making Flywheel a daily-drivable terminal multiplexer.

**Architecture:** A new PTY Manager in the main process spawns node-pty sessions and buffers output at ~16ms intervals. Each terminal panel is a WebContentsView running xterm.js, communicating with its PTY via IPC. The existing Panel Manager gains a `type` parameter to distinguish terminal panels from placeholders. Scroll disambiguation is mouse-position-based (vertical over panel → terminal, horizontal → strip).

**Tech Stack:** Electron 41, Solid.js 1.9, xterm.js (`@xterm/xterm`), node-pty, electron-vite 5, TypeScript 5.7, Vitest 4

**Spec:** [`docs/superpowers/specs/2026-03-24-phase2-terminal-panels-design.md`](../specs/2026-03-24-phase2-terminal-panels-design.md)

---

## File Structure

```
src/
├── main/
│   ├── index.ts              (MODIFY: new IPC handlers, ⌘G shortcut, close-confirm flow)
│   ├── panel-manager.ts      (MODIFY: panel type, terminal HTML loading)
│   └── pty-manager.ts         (NEW: PTY lifecycle, output buffering, resize, exit)
├── preload/
│   ├── index.ts              (MODIFY: add PTY lifecycle + confirm-close methods)
│   └── panel.ts              (MODIFY: add PTY IPC, keep horizontal wheel forwarding)
├── terminal/
│   ├── index.html            (NEW: terminal panel HTML entry point)
│   └── terminal.ts           (NEW: xterm.js setup, addon loading, IPC wiring)
├── shared/
│   ├── types.ts              (MODIFY: Panel type field, ShortcutAction union)
│   └── constants.ts          (MODIFY: new IPC channels)
└── renderer/
    └── src/
        ├── App.tsx           (MODIFY: wire blur, close-confirm, pty-exit handlers)
        ├── env.d.ts          (MODIFY: add new API types)
        ├── store/
        │   └── strip.ts      (MODIFY: panel type, blur state, removePanelById)
        └── components/
            ├── HintBar.tsx    (MODIFY: add ⌘G Blur hint)
            └── ConfirmDialog.tsx (NEW: close confirmation modal)

tests/
├── main/
│   └── pty-manager.test.ts    (NEW: PTY manager unit tests)
└── store/
    └── strip.test.ts          (MODIFY: add blur + removePanelById tests)

electron.vite.config.ts        (MODIFY: add terminal renderer entry)
package.json                   (MODIFY: add dependencies)
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install xterm.js packages and node-pty**

Run:
```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-unicode11 node-pty
```

- [ ] **Step 2: Verify installation succeeds**

Run: `npm ls @xterm/xterm node-pty`
Expected: Both packages listed with versions, no `UNMET DEPENDENCY` errors.

Note: `node-pty` is a native module. If the install fails, you may need to install build tools: `xcode-select --install` on macOS. If there are Electron version compatibility issues with node-pty, use `electron-rebuild`: `npx electron-rebuild -m node_modules/node-pty`.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: All 28 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase2): add xterm.js and node-pty dependencies"
```

---

### Task 2: Shared Types and Constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Update Panel type to support terminal panels**

In `src/shared/types.ts`, update the `Panel` interface and `ShortcutAction` type:

```typescript
export interface Panel {
  id: string
  type: 'terminal' | 'placeholder'
  color: string
  label: string
}

export type ShortcutAction = {
  type: 'focus-left' | 'focus-right' | 'new-panel' | 'close-panel' | 'jump-to' | 'blur-panel'
  index?: number
}
```

- [ ] **Step 2: Add new IPC channels to constants**

In `src/shared/constants.ts`, extend `IPC_CHANNELS`:

```typescript
export const IPC_CHANNELS = {
  // Existing
  PANEL_CREATE: 'panel:create',
  PANEL_DESTROY: 'panel:destroy',
  PANEL_UPDATE_BOUNDS: 'panel:update-bounds',
  PANEL_WHEEL: 'panel:wheel',
  SCROLL_WHEEL: 'scroll:wheel',
  SHORTCUT_ACTION: 'shortcut:action',
  // New: PTY
  PTY_CREATE: 'pty:create',
  PTY_INPUT: 'pty:input',
  PTY_OUTPUT: 'pty:output',
  PTY_RESIZE: 'pty:resize',
  PTY_EXIT: 'pty:exit',
  PTY_CONFIRM_CLOSE: 'pty:confirm-close',
  PTY_CONFIRM_CLOSE_RESPONSE: 'pty:confirm-close-response',
  PANEL_CLOSE_REQUEST: 'panel:close-request'
} as const
```

- [ ] **Step 3: Add terminal theme constants**

In `src/shared/constants.ts`, add the default terminal theme:

```typescript
export const TERMINAL_DEFAULTS = {
  fontFamily: 'monospace',
  fontSize: 14,
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

- [ ] **Step 4: Fix any type errors in existing code**

The `Panel` interface now requires a `type` field. Update the store's `nextPanel()` function in `src/renderer/src/store/strip.ts` to include `type: 'placeholder'`:

```typescript
function nextPanel(): Panel {
  const color = PANEL_COLORS[colorIndex % PANEL_COLORS.length]
  colorIndex++
  nextId++
  return { id: `panel-${nextId}`, type: 'placeholder', color: color.hex, label: color.name }
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npm test`
Expected: All existing tests still pass (the `type` field doesn't affect layout or store logic).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts src/renderer/src/store/strip.ts
git commit -m "feat(phase2): add terminal types, IPC channels, and theme constants"
```

---

### Task 3: PTY Manager — Core with Tests

**Files:**
- Create: `src/main/pty-manager.ts`
- Create: `tests/main/pty-manager.test.ts`

- [ ] **Step 1: Write failing tests for PTY Manager**

Create `tests/main/pty-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node-pty before importing PtyManager
const mockPty = {
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
  process: 'zsh',
  pid: 12345
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty)
}))

import { PtyManager } from '../../src/main/pty-manager'
import * as nodePty from 'node-pty'

describe('PtyManager', () => {
  let manager: PtyManager
  const mockSendToPanel = vi.fn()
  const mockSendToChrome = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset onData/onExit to capture callbacks
    let onDataCb: ((data: string) => void) | null = null
    let onExitCb: ((exit: { exitCode: number; signal?: number }) => void) | null = null
    mockPty.onData = vi.fn((cb) => { onDataCb = cb; return { dispose: vi.fn() } })
    mockPty.onExit = vi.fn((cb) => { onExitCb = cb; return { dispose: vi.fn() } })
    mockPty.process = 'zsh'
    // Store callbacks for triggering in tests
    ;(mockPty as any)._triggerData = (data: string) => onDataCb?.(data)
    ;(mockPty as any)._triggerExit = (code: number) => onExitCb?.({ exitCode: code })

    manager = new PtyManager(mockSendToPanel, mockSendToChrome)
  })

  afterEach(() => {
    manager.dispose()
  })

  it('creates a PTY session', () => {
    manager.create('panel-1')
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), // shell path
      [],
      expect.objectContaining({
        cols: 80,
        rows: 24,
        cwd: expect.any(String)
      })
    )
  })

  it('ignores duplicate create for same panelId', () => {
    manager.create('panel-1')
    manager.create('panel-1')
    expect(nodePty.spawn).toHaveBeenCalledTimes(1)
  })

  it('writes input to PTY immediately', () => {
    manager.create('panel-1')
    manager.write('panel-1', 'ls\r')
    expect(mockPty.write).toHaveBeenCalledWith('ls\r')
  })

  it('ignores write for unknown panelId', () => {
    manager.write('unknown', 'data')
    expect(mockPty.write).not.toHaveBeenCalled()
  })

  it('resizes PTY', () => {
    manager.create('panel-1')
    manager.resize('panel-1', 120, 40)
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('kills PTY and cleans up', () => {
    manager.create('panel-1')
    manager.kill('panel-1')
    expect(mockPty.kill).toHaveBeenCalled()
  })

  it('returns foreground process name', () => {
    manager.create('panel-1')
    mockPty.process = 'vim'
    expect(manager.getForegroundProcess('panel-1')).toBe('vim')
  })

  it('detects busy PTY (foreground process differs from shell)', () => {
    manager.create('panel-1')
    mockPty.process = 'npm'
    expect(manager.isBusy('panel-1')).toBe(true)
  })

  it('detects idle PTY (foreground process is the shell)', () => {
    manager.create('panel-1')
    // process matches the shell that was spawned
    expect(manager.isBusy('panel-1')).toBe(false)
  })
})

describe('PtyManager output buffering', () => {
  let manager: PtyManager
  const mockSendToPanel = vi.fn()
  const mockSendToChrome = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    let onDataCb: ((data: string) => void) | null = null
    let onExitCb: ((exit: { exitCode: number }) => void) | null = null
    mockPty.onData = vi.fn((cb) => { onDataCb = cb; return { dispose: vi.fn() } })
    mockPty.onExit = vi.fn((cb) => { onExitCb = cb; return { dispose: vi.fn() } })
    mockPty.process = 'zsh'
    ;(mockPty as any)._triggerData = (data: string) => onDataCb?.(data)
    ;(mockPty as any)._triggerExit = (code: number) => onExitCb?.({ exitCode: code })

    manager = new PtyManager(mockSendToPanel, mockSendToChrome)
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('buffers output and flushes on timer', () => {
    manager.create('panel-1')
    ;(mockPty as any)._triggerData('hello ')
    ;(mockPty as any)._triggerData('world')

    // Not flushed yet
    expect(mockSendToPanel).not.toHaveBeenCalled()

    // Advance past flush interval
    vi.advanceTimersByTime(20)

    expect(mockSendToPanel).toHaveBeenCalledWith('panel-1', 'pty:output', {
      panelId: 'panel-1',
      data: 'hello world'
    })
  })

  it('does not flush when buffer is empty', () => {
    manager.create('panel-1')
    vi.advanceTimersByTime(20)
    expect(mockSendToPanel).not.toHaveBeenCalled()
  })
})

describe('PtyManager exit handling', () => {
  let manager: PtyManager
  const mockSendToPanel = vi.fn()
  const mockSendToChrome = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    let onDataCb: ((data: string) => void) | null = null
    let onExitCb: ((exit: { exitCode: number }) => void) | null = null
    mockPty.onData = vi.fn((cb) => { onDataCb = cb; return { dispose: vi.fn() } })
    mockPty.onExit = vi.fn((cb) => { onExitCb = cb; return { dispose: vi.fn() } })
    mockPty.process = 'zsh'
    ;(mockPty as any)._triggerData = (data: string) => onDataCb?.(data)
    ;(mockPty as any)._triggerExit = (code: number) => onExitCb?.({ exitCode: code })

    manager = new PtyManager(mockSendToPanel, mockSendToChrome)
  })

  afterEach(() => {
    manager.dispose()
  })

  it('notifies chrome view on PTY exit', () => {
    manager.create('panel-1')
    ;(mockPty as any)._triggerExit(0)

    expect(mockSendToChrome).toHaveBeenCalledWith('pty:exit', {
      panelId: 'panel-1',
      exitCode: 0
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: FAIL — `PtyManager` module does not exist yet.

- [ ] **Step 3: Implement PTY Manager**

Create `src/main/pty-manager.ts`:

```typescript
import * as pty from 'node-pty'
import { basename } from 'path'

interface ManagedPty {
  panelId: string
  pty: pty.IPty
  buffer: string
  shellName: string
  disposed: boolean
}

type SendToPanelFn = (panelId: string, channel: string, data: unknown) => void
type SendToChromeFn = (channel: string, data: unknown) => void

const FLUSH_INTERVAL_MS = 16

export class PtyManager {
  private ptys = new Map<string, ManagedPty>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private sendToPanel: SendToPanelFn
  private sendToChrome: SendToChromeFn

  constructor(sendToPanel: SendToPanelFn, sendToChrome: SendToChromeFn) {
    this.sendToPanel = sendToPanel
    this.sendToChrome = sendToChrome
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
  }

  create(panelId: string): void {
    if (this.ptys.has(panelId)) return

    const shell = process.env.SHELL || '/bin/zsh'
    const shellName = basename(shell)
    const ptyProcess = pty.spawn(shell, [], {
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>
    })

    const managed: ManagedPty = {
      panelId,
      pty: ptyProcess,
      buffer: '',
      shellName,
      disposed: false
    }

    ptyProcess.onData((data: string) => {
      if (!managed.disposed) {
        managed.buffer += data
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (!managed.disposed) {
        // Flush any remaining output before notifying exit
        if (managed.buffer.length > 0) {
          this.sendToPanel(panelId, 'pty:output', { panelId, data: managed.buffer })
          managed.buffer = ''
        }
        this.sendToChrome('pty:exit', { panelId, exitCode })
        this.ptys.delete(panelId)
      }
    })

    this.ptys.set(panelId, managed)
  }

  write(panelId: string, data: string): void {
    const managed = this.ptys.get(panelId)
    if (!managed) return
    managed.pty.write(data)
  }

  resize(panelId: string, cols: number, rows: number): void {
    const managed = this.ptys.get(panelId)
    if (!managed) return
    managed.pty.resize(cols, rows)
  }

  kill(panelId: string): void {
    const managed = this.ptys.get(panelId)
    if (!managed) return
    managed.disposed = true
    managed.pty.kill()
    this.ptys.delete(panelId)
  }

  getForegroundProcess(panelId: string): string | null {
    const managed = this.ptys.get(panelId)
    if (!managed) return null
    return managed.pty.process
  }

  isBusy(panelId: string): boolean {
    const managed = this.ptys.get(panelId)
    if (!managed) return false
    const fg = basename(managed.pty.process)
    return fg !== managed.shellName
  }

  private flush(): void {
    for (const managed of this.ptys.values()) {
      if (managed.buffer.length > 0 && !managed.disposed) {
        this.sendToPanel(managed.panelId, 'pty:output', {
          panelId: managed.panelId,
          data: managed.buffer
        })
        managed.buffer = ''
      }
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    for (const managed of this.ptys.values()) {
      managed.disposed = true
      managed.pty.kill()
    }
    this.ptys.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: All PTY Manager tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/main/pty-manager.ts tests/main/pty-manager.test.ts
git commit -m "feat(phase2): add PTY Manager with output buffering and tests"
```

---

### Task 4: Store Updates — Blur State and removePanelById

**Files:**
- Modify: `src/renderer/src/store/strip.ts`
- Modify: `tests/store/strip.test.ts`

- [ ] **Step 1: Write failing tests for new store actions**

Add to `tests/store/strip.test.ts`:

```typescript
describe('terminalFocused (blur)', () => {
  it('starts with terminalFocused true', () => {
    withStore(({ state }) => {
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('blurPanel sets terminalFocused to false', () => {
    withStore(({ state, actions }) => {
      actions.blurPanel()
      expect(state.terminalFocused).toBe(false)
    })
  })

  it('focusLeft re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.blurPanel()
      actions.focusLeft()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('focusRight re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.jumpTo(0)
      actions.blurPanel()
      actions.focusRight()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('jumpTo re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.blurPanel()
      actions.jumpTo(0)
      expect(state.terminalFocused).toBe(true)
    })
  })
})

describe('removePanelById', () => {
  it('removes panel by id', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel()
      const p2 = actions.addPanel()
      actions.removePanelById(p1.id)
      expect(state.panels).toHaveLength(1)
      expect(state.panels[0].id).toBe(p2.id)
    })
  })

  it('adjusts focusedIndex when removing before focused', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel()
      actions.addPanel()
      actions.addPanel()
      actions.jumpTo(2)
      actions.removePanelById(p1.id)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('clamps focusedIndex when removing focused panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      const p2 = actions.addPanel()
      // p2 is focused (index 1)
      actions.removePanelById(p2.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('returns null for unknown id', () => {
    withStore(({ actions }) => {
      expect(actions.removePanelById('nonexistent')).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: FAIL — `terminalFocused`, `blurPanel`, `removePanelById` don't exist.

- [ ] **Step 3: Update the store**

Update `src/renderer/src/store/strip.ts`:

```typescript
import { createStore } from 'solid-js/store'
import type { Panel } from '../../../shared/types'
import { PANEL_COLORS } from '../../../shared/constants'

export interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
  terminalFocused: boolean
}

export function createStripStore() {
  let nextId = 0
  let colorIndex = 0

  function nextPanel(): Panel {
    const color = PANEL_COLORS[colorIndex % PANEL_COLORS.length]
    colorIndex++
    nextId++
    return { id: `panel-${nextId}`, type: 'placeholder', color: color.hex, label: color.name }
  }

  const [state, setState] = createStore<StripState>({
    panels: [], focusedIndex: 0, scrollOffset: 0, viewportWidth: 800, viewportHeight: 600,
    terminalFocused: true
  })

  const actions = {
    addPanel(panelType: 'terminal' | 'placeholder' = 'terminal'): Panel {
      const panel = nextPanel()
      panel.type = panelType
      const insertIndex = state.panels.length === 0 ? 0 : state.focusedIndex + 1
      const before = state.panels.slice(0, insertIndex)
      const after = state.panels.slice(insertIndex)
      setState('panels', [...before, panel, ...after])
      setState('focusedIndex', insertIndex)
      setState('terminalFocused', true)
      return panel
    },
    removePanelById(id: string): string | null {
      const index = state.panels.findIndex((p) => p.id === id)
      if (index === -1) return null
      const newPanels = state.panels.filter((_, i) => i !== index)
      setState('panels', newPanels)
      if (newPanels.length === 0) {
        setState('focusedIndex', 0)
      } else if (index <= state.focusedIndex) {
        setState('focusedIndex', Math.max(0, Math.min(state.focusedIndex - (index < state.focusedIndex ? 1 : 0), newPanels.length - 1)))
      }
      return id
    },
    removePanel(): string | null {
      if (state.panels.length === 0) return null
      return actions.removePanelById(state.panels[state.focusedIndex].id)
    },
    blurPanel() { setState('terminalFocused', false) },
    focusLeft() {
      if (state.focusedIndex > 0) {
        setState('focusedIndex', state.focusedIndex - 1)
        setState('terminalFocused', true)
      }
    },
    focusRight() {
      if (state.focusedIndex < state.panels.length - 1) {
        setState('focusedIndex', state.focusedIndex + 1)
        setState('terminalFocused', true)
      }
    },
    jumpTo(index: number) {
      if (index >= 0 && index < state.panels.length) {
        setState('focusedIndex', index)
        setState('terminalFocused', true)
      }
    },
    setScrollOffset(offset: number) { setState('scrollOffset', offset) },
    setViewport(width: number, height: number) { setState('viewportWidth', width); setState('viewportHeight', height) }
  }

  return { state, actions }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: All store tests pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/strip.ts tests/store/strip.test.ts
git commit -m "feat(phase2): add blur state and removePanelById to strip store"
```

---

### Task 5: Terminal Renderer Entry Point

**Files:**
- Create: `src/terminal/index.html`
- Create: `src/terminal/terminal.ts`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Create terminal HTML entry point**

Create `src/terminal/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #1a1a2e;
    }
    #terminal {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script type="module" src="./terminal.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create terminal TypeScript setup**

Create `src/terminal/terminal.ts`:

```typescript
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    pty: {
      input: (panelId: string, data: string) => void
      onOutput: (callback: (data: string) => void) => void
      resize: (panelId: string, cols: number, rows: number) => void
      onExit: (callback: (exitCode: number) => void) => void
      getPanelId: () => string
    }
  }
}

const panelId = window.pty.getPanelId()

const terminal = new Terminal({
  fontFamily: 'monospace',
  fontSize: 14,
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
  },
  allowProposedApi: true
})

const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.loadAddon(new Unicode11Addon())
terminal.unicode.activeVersion = '11'

const container = document.getElementById('terminal')!
terminal.open(container)

// Try WebGL, fall back to canvas
try {
  terminal.loadAddon(new WebglAddon())
} catch {
  console.warn('WebGL addon failed, using canvas renderer')
}

fitAddon.fit()

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
```

- [ ] **Step 3: Update electron-vite config for multi-page renderer**

Update `electron.vite.config.ts`:

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          panel: resolve(__dirname, 'src/preload/panel.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [solidPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          terminal: resolve(__dirname, 'src/terminal/index.html')
        }
      }
    }
  }
})
```

Note: `node-pty` is externalized from the main process build because it's a native addon that can't be bundled by Vite/Rollup. Electron loads it directly from `node_modules` at runtime.

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: Build completes without errors. Check `out/renderer/` contains both the chrome view and terminal HTML/JS.

- [ ] **Step 5: Commit**

```bash
git add src/terminal/index.html src/terminal/terminal.ts electron.vite.config.ts
git commit -m "feat(phase2): add terminal renderer entry point with xterm.js"
```

---

### Task 6: Panel Preload — PTY IPC

**Files:**
- Modify: `src/preload/panel.ts`

- [ ] **Step 1: Update panel preload with PTY IPC**

Replace `src/preload/panel.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Horizontal scroll → strip (existing behavior, unchanged)
// Vertical scroll → consumed by xterm.js natively (no forwarding needed)
window.addEventListener('wheel', (event) => {
  if (event.deltaX !== 0) {
    ipcRenderer.send('panel:wheel', { deltaX: event.deltaX })
  }
}, { passive: true })

// PTY communication
contextBridge.exposeInMainWorld('pty', {
  input: (panelId: string, data: string) => {
    ipcRenderer.send('pty:input', { panelId, data })
  },
  onOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('pty:output', (_event, payload: { data: string }) => callback(payload.data))
  },
  resize: (panelId: string, cols: number, rows: number) => {
    ipcRenderer.send('pty:resize', { panelId, cols, rows })
  },
  onExit: (callback: (exitCode: number) => void) => {
    ipcRenderer.on('pty:exit', (_event, payload: { exitCode: number }) => callback(payload.exitCode))
  },
  getPanelId: (): string => {
    // Panel ID is passed as a query parameter when the terminal HTML is loaded
    const params = new URLSearchParams(window.location.search)
    return params.get('panelId') || ''
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/panel.ts
git commit -m "feat(phase2): add PTY IPC to panel preload"
```

---

### Task 7: Chrome Preload — PTY Lifecycle Methods

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: Add PTY lifecycle and confirm-close methods to chrome preload**

Update `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Existing panel management
  createPanel: (id: string, color: string) => {
    ipcRenderer.send('panel:create', { id, color })
  },
  createTerminalPanel: (id: string) => {
    ipcRenderer.send('panel:create', { id, type: 'terminal' })
  },
  destroyPanel: (id: string) => {
    ipcRenderer.send('panel:destroy', id)
  },
  updateBounds: (updates: Array<{ panelId: string; bounds: { x: number; y: number; width: number; height: number }; visible: boolean }>) => {
    ipcRenderer.send('panel:update-bounds', updates)
  },
  onWheelEvent: (callback: (data: { deltaX: number }) => void) => {
    ipcRenderer.on('scroll:wheel', (_event, data) => callback(data))
  },
  onShortcut: (callback: (action: { type: string; index?: number }) => void) => {
    ipcRenderer.on('shortcut:action', (_event, action) => callback(action))
  },
  getDebugStats: (): Promise<{ panelViewCount: number; mainMemoryMB: number; heapUsedMB: number }> => {
    return ipcRenderer.invoke('debug:stats')
  },

  // New: PTY lifecycle
  createTerminal: (panelId: string) => {
    ipcRenderer.send('pty:create', { panelId })
  },
  onPtyExit: (callback: (data: { panelId: string; exitCode: number }) => void) => {
    ipcRenderer.on('pty:exit', (_event, data) => callback(data))
  },

  // New: Close with busy-check
  closePanel: (panelId: string) => {
    ipcRenderer.send('panel:close-request', { panelId })
  },
  onConfirmClose: (callback: (data: { panelId: string; processName: string }) => void) => {
    ipcRenderer.on('pty:confirm-close', (_event, data) => callback(data))
  },
  confirmCloseResponse: (panelId: string, confirmed: boolean) => {
    ipcRenderer.send('pty:confirm-close-response', { panelId, confirmed })
  }
})
```

- [ ] **Step 2: Update type declarations**

Update `src/renderer/src/env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface FlywheelAPI {
  createPanel(id: string, color: string): void
  createTerminalPanel(id: string): void
  destroyPanel(id: string): void
  updateBounds(updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>): void
  onWheelEvent(callback: (data: { deltaX: number }) => void): void
  onShortcut(callback: (action: { type: string; index?: number }) => void): void
  getDebugStats(): Promise<{ panelViewCount: number; mainMemoryMB: number; heapUsedMB: number }>

  // PTY lifecycle
  createTerminal(panelId: string): void
  onPtyExit(callback: (data: { panelId: string; exitCode: number }) => void): void

  // Close with busy-check
  closePanel(panelId: string): void
  onConfirmClose(callback: (data: { panelId: string; processName: string }) => void): void
  confirmCloseResponse(panelId: string, confirmed: boolean): void
}

declare global {
  interface Window {
    api: FlywheelAPI
  }
}

export {}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(phase2): add PTY lifecycle and confirm-close to chrome preload"
```

---

### Task 8: Panel Manager — Terminal Panel Support

**Files:**
- Modify: `src/main/panel-manager.ts`

- [ ] **Step 1: Update Panel Manager to support terminal panels**

Update `src/main/panel-manager.ts`:

```typescript
import { WebContentsView, BaseWindow } from 'electron'
import { join } from 'path'

interface ManagedPanel {
  id: string
  type: 'terminal' | 'placeholder'
  view: WebContentsView
}

export class PanelManager {
  private panels = new Map<string, ManagedPanel>()
  private window: BaseWindow
  private chromeView: WebContentsView

  constructor(window: BaseWindow, chromeView: WebContentsView) {
    this.window = window
    this.chromeView = chromeView
  }

  createPanel(id: string, options: { type: 'terminal' } | { type?: 'placeholder'; color: string }): void {
    if (this.panels.has(id)) return

    const panelType = options.type || 'placeholder'

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        sandbox: false
      }
    })

    if (panelType === 'terminal') {
      // Load the terminal renderer HTML with panelId as query param
      if (process.env['ELECTRON_RENDERER_URL']) {
        // Dev mode: terminal is served at /terminal/index.html
        view.webContents.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/terminal/index.html?panelId=${id}`)
      } else {
        view.webContents.loadFile(join(__dirname, '../renderer/terminal/index.html'), {
          query: { panelId: id }
        })
      }
    } else {
      const color = 'color' in options ? options.color : '#333'
      view.setBackgroundColor(color)
      view.webContents.loadURL(
        `data:text/html,<html><body style="margin:0;background:${encodeURIComponent(color)};height:100vh"></body></html>`
      )
    }

    this.window.contentView.addChildView(view)
    this.panels.set(id, { id, type: panelType, view })
  }

  destroyPanel(id: string): void {
    const panel = this.panels.get(id)
    if (!panel) return
    this.window.contentView.removeChildView(panel.view)
    panel.view.webContents.close()
    this.panels.delete(id)
  }

  updateBounds(updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>): void {
    for (const update of updates) {
      const panel = this.panels.get(update.panelId)
      if (!panel) continue
      if (update.visible) {
        panel.view.setBounds(update.bounds)
        panel.view.setVisible(true)
      } else {
        panel.view.setVisible(false)
      }
    }
  }

  getPanelView(id: string): WebContentsView | null {
    return this.panels.get(id)?.view || null
  }

  get panelCount(): number {
    return this.panels.size
  }

  destroyAll(): void {
    for (const id of [...this.panels.keys()]) {
      this.destroyPanel(id)
    }
  }
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/panel-manager.ts
git commit -m "feat(phase2): add terminal panel type to Panel Manager"
```

---

### Task 9: Main Process — IPC Handlers and Shortcuts

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Wire up PTY Manager and new IPC handlers**

Update `src/main/index.ts`:

```typescript
import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { PanelManager } from './panel-manager'
import { PtyManager } from './pty-manager'

let mainWindow: BaseWindow
let chromeView: WebContentsView
let panelManager: PanelManager
let ptyManager: PtyManager

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Flywheel'
  })

  chromeView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.contentView.addChildView(chromeView)

  const { width, height } = mainWindow.getContentBounds()
  chromeView.setBounds({ x: 0, y: 0, width, height })

  if (process.env['ELECTRON_RENDERER_URL']) {
    chromeView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chromeView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  panelManager = new PanelManager(mainWindow, chromeView)

  // PTY Manager: sends output to panel renderers, exit notifications to chrome
  ptyManager = new PtyManager(
    (panelId, channel, data) => {
      const view = panelManager.getPanelView(panelId)
      if (view) view.webContents.send(channel, data)
    },
    (channel, data) => {
      chromeView.webContents.send(channel, data)
    }
  )

  setupIpcHandlers()
  setupShortcuts()

  mainWindow.on('resize', () => {
    const bounds = mainWindow.getContentBounds()
    chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  })

  chromeView.webContents.once('did-finish-load', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => {
    ptyManager.dispose()
    panelManager.destroyAll()
  })
}

function setupIpcHandlers(): void {
  // Existing panel handlers
  ipcMain.on('panel:create', (_event, data: { id: string; color?: string; type?: string }) => {
    if (data.type === 'terminal') {
      panelManager.createPanel(data.id, { type: 'terminal' })
    } else {
      panelManager.createPanel(data.id, { color: data.color || '#333' })
    }
  })

  ipcMain.on('panel:destroy', (_event, id: string) => {
    ptyManager.kill(id) // Clean up PTY if it exists
    panelManager.destroyPanel(id)
  })

  ipcMain.on('panel:update-bounds', (_event, updates: Array<{
    panelId: string
    bounds: { x: number; y: number; width: number; height: number }
    visible: boolean
  }>) => {
    panelManager.updateBounds(updates)
  })

  ipcMain.on('panel:wheel', (_event, data: { deltaX: number }) => {
    chromeView.webContents.send('scroll:wheel', data)
  })

  ipcMain.handle('debug:stats', () => {
    const mem = process.memoryUsage()
    return {
      panelViewCount: panelManager.panelCount,
      mainMemoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024)
    }
  })

  // New: PTY handlers
  ipcMain.on('pty:create', (_event, data: { panelId: string }) => {
    ptyManager.create(data.panelId)
  })

  ipcMain.on('pty:input', (_event, data: { panelId: string; data: string }) => {
    ptyManager.write(data.panelId, data.data)
  })

  ipcMain.on('pty:resize', (_event, data: { panelId: string; cols: number; rows: number }) => {
    ptyManager.resize(data.panelId, data.cols, data.rows)
  })

  // Close confirmation flow
  ipcMain.on('panel:close-request', (_event, data: { panelId: string }) => {
    if (ptyManager.isBusy(data.panelId)) {
      const processName = ptyManager.getForegroundProcess(data.panelId) || 'unknown'
      chromeView.webContents.send('pty:confirm-close', {
        panelId: data.panelId,
        processName
      })
    } else {
      // Not busy — kill immediately
      ptyManager.kill(data.panelId)
      panelManager.destroyPanel(data.panelId)
      chromeView.webContents.send('pty:exit', { panelId: data.panelId, exitCode: 0 })
    }
  })

  ipcMain.on('pty:confirm-close-response', (_event, data: { panelId: string; confirmed: boolean }) => {
    if (data.confirmed) {
      ptyManager.kill(data.panelId)
      panelManager.destroyPanel(data.panelId)
      chromeView.webContents.send('pty:exit', { panelId: data.panelId, exitCode: -1 })
    }
  })
}

function setupShortcuts(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Flywheel',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Panels',
      submenu: [
        {
          label: 'Focus Left',
          accelerator: 'Command+Left',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-left' })
        },
        {
          label: 'Focus Right',
          accelerator: 'Command+Right',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'focus-right' })
        },
        { type: 'separator' },
        {
          label: 'New Terminal',
          accelerator: 'CommandOrControl+T',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'new-panel' })
        },
        {
          label: 'Close Panel',
          accelerator: 'CommandOrControl+W',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'close-panel' })
        },
        {
          label: 'Blur Panel',
          accelerator: 'CommandOrControl+G',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'blur-panel' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Jump to Panel ${i + 1}`,
          accelerator: `CommandOrControl+${i + 1}`,
          click: () => chromeView.webContents.send('shortcut:action', { type: 'jump-to', index: i })
        }))
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(phase2): wire PTY Manager and new IPC handlers in main process"
```

---

### Task 10: App.tsx — Terminal Panel Creation, Blur, Close Confirm, PTY Exit

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Update App.tsx to handle terminal panels and new actions**

This replaces the entire App.tsx. Key changes from Phase 1:
- `addPanel('terminal')` creates terminal-type panels (uses the type parameter added in Task 4)
- Layout effect uses `panel.type` to decide between `createTerminalPanel` and `createPanel`
- Close uses `window.api.closePanel()` which goes through the main process busy-check (added in Task 9)
- PTY exit listener auto-removes panels when shell exits
- Confirm close dialog wired via `onConfirmClose` / `confirmCloseResponse`
- Blur via `actions.blurPanel()` on `'blur-panel'` shortcut
- Starts with 1 terminal panel instead of 12 placeholders

Update `src/renderer/src/App.tsx`:

```typescript
import { createEffect, createSignal, on, onMount, batch } from 'solid-js'
import { createStripStore } from './store/strip'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { PanelBoundsUpdate } from '../../../shared/types'
import Strip from './components/Strip'
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'
import ConfirmDialog from './components/ConfirmDialog'

export default function App() {
  const { state, actions } = createStripStore()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  const [confirmClose, setConfirmClose] = createSignal<{ panelId: string; processName: string } | null>(null)

  // Layout effect: creates/destroys WebContentsViews based on store state
  createEffect(() => {
    const layout = computeLayout({
      panels: [...state.panels],
      scrollOffset: state.scrollOffset,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight
    })

    const desiredIds = new Set<string>()
    const boundsUpdates: PanelBoundsUpdate[] = []

    for (const entry of layout) {
      if (entry.visibility === 'destroyed') continue
      desiredIds.add(entry.panelId)
      if (!createdPanelIds.has(entry.panelId)) {
        const panel = state.panels.find((p) => p.id === entry.panelId)
        if (panel) {
          if (panel.type === 'terminal') {
            window.api.createTerminalPanel(entry.panelId)
          } else {
            window.api.createPanel(entry.panelId, panel.color)
          }
          createdPanelIds.add(entry.panelId)
        }
      }
      boundsUpdates.push({
        panelId: entry.panelId,
        bounds: entry.contentBounds,
        visible: entry.visibility === 'visible'
      })
    }

    for (const id of [...createdPanelIds]) {
      if (!desiredIds.has(id)) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates)
    }
  })

  // Scroll animation on focus change
  createEffect(
    on(
      () => state.focusedIndex,
      (focusedIndex) => {
        currentAnimation?.cancel()
        currentAnimation = null
        const target = computeScrollToCenter(focusedIndex, state.panels.length, state.viewportWidth)
        if (Math.abs(state.scrollOffset - target) < 1) {
          actions.setScrollOffset(target)
          return
        }
        currentAnimation = animate({
          from: state.scrollOffset, to: target, duration: 200, easing: easeOut,
          onUpdate: (value) => actions.setScrollOffset(value),
          onComplete: () => { currentAnimation = null }
        })
      },
      { defer: true }
    )
  )

  function handleWheel(deltaX: number): void {
    currentAnimation?.cancel()
    currentAnimation = null
    const maxScroll = computeMaxScroll(state.panels.length, state.viewportWidth)
    const newOffset = Math.max(0, Math.min(state.scrollOffset + deltaX, maxScroll))
    actions.setScrollOffset(newOffset)
    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(() => {
      const idx = findMostCenteredPanel(state.scrollOffset, state.panels.length, state.viewportWidth)
      if (idx >= 0 && idx !== state.focusedIndex) actions.jumpTo(idx)
    }, 150)
  }

  function handleClosePanel(): void {
    if (state.panels.length === 0) return
    const focusedPanel = state.panels[state.focusedIndex]
    if (!focusedPanel) return

    if (focusedPanel.type === 'terminal') {
      // Let main process decide: kill immediately or ask for confirmation
      window.api.closePanel(focusedPanel.id)
    } else {
      const removedId = actions.removePanel()
      if (removedId) {
        window.api.destroyPanel(removedId)
        createdPanelIds.delete(removedId)
      }
    }
  }

  function handleShortcut(action: { type: string; index?: number }): void {
    switch (action.type) {
      case 'focus-left': actions.focusLeft(); break
      case 'focus-right': actions.focusRight(); break
      case 'new-panel': {
        const panel = actions.addPanel('terminal')
        window.api.createTerminal(panel.id)
        break
      }
      case 'close-panel': handleClosePanel(); break
      case 'blur-panel': actions.blurPanel(); break
      case 'jump-to': if (action.index !== undefined) actions.jumpTo(action.index); break
    }
  }

  function handleConfirmResponse(confirmed: boolean): void {
    const data = confirmClose()
    if (data) {
      window.api.confirmCloseResponse(data.panelId, confirmed)
      if (confirmed) {
        actions.removePanelById(data.panelId)
        createdPanelIds.delete(data.panelId)
      }
      setConfirmClose(null)
    }
  }

  onMount(() => {
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))
    window.addEventListener('resize', () => actions.setViewport(window.innerWidth, window.innerHeight))
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) handleWheel(event.deltaX)
    }, { passive: true })

    // Listen for PTY exits (shell exited on its own, or force-closed after confirmation)
    window.api.onPtyExit((data) => {
      actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    // Listen for close confirmation requests (busy terminal)
    window.api.onConfirmClose((data) => {
      setConfirmClose(data)
    })

    batch(() => {
      actions.setViewport(window.innerWidth, window.innerHeight)
      const panel = actions.addPanel('terminal')
      window.api.createTerminal(panel.id)
      actions.jumpTo(0)
    })
  })

  const layout = () => computeLayout({
    panels: [...state.panels],
    scrollOffset: state.scrollOffset,
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight
  })

  const maxScroll = () => computeMaxScroll(state.panels.length, state.viewportWidth)

  return (
    <>
      <Strip layout={layout()} panels={[...state.panels]} focusedIndex={state.focusedIndex} />
      <ScrollIndicators
        scrollOffset={state.scrollOffset} maxScroll={maxScroll()}
        viewportWidth={state.viewportWidth} viewportHeight={state.viewportHeight}
      />
      <HintBar viewportHeight={state.viewportHeight} panelCount={state.panels.length} />
      {confirmClose() && (
        <ConfirmDialog
          processName={confirmClose()!.processName}
          onConfirm={() => handleConfirmResponse(true)}
          onCancel={() => handleConfirmResponse(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: All tests pass. (Existing `addPanel()` tests call without args, which defaults to `'terminal'` — the tests don't care about the type field.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/store/strip.ts
git commit -m "feat(phase2): wire terminal panel creation, blur, close, and PTY exit in App"
```

---

### Task 11: Confirm Dialog Component

**Files:**
- Create: `src/renderer/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: Create the confirm dialog component**

Create `src/renderer/src/components/ConfirmDialog.tsx`:

```typescript
interface ConfirmDialogProps {
  processName: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  // Handle keyboard: Enter = confirm, Escape = cancel
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      props.onConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onCancel()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'z-index': '1000'
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      ref={(el) => el.focus()}
    >
      <div style={{
        background: '#252540',
        'border-radius': '8px',
        padding: '24px',
        'max-width': '400px',
        'box-shadow': '0 8px 32px rgba(0, 0, 0, 0.5)',
        border: '1px solid #3a3a5c'
      }}>
        <p style={{
          color: '#e0e0e0',
          margin: '0 0 20px 0',
          'font-size': '14px',
          'line-height': '1.5'
        }}>
          Process <code style={{
            background: '#1a1a2e',
            padding: '2px 6px',
            'border-radius': '3px',
            color: '#f59e0b'
          }}>{props.processName}</code> is running. Close anyway?
        </p>
        <div style={{ display: 'flex', gap: '12px', 'justify-content': 'flex-end' }}>
          <button
            onClick={props.onCancel}
            style={{
              background: '#1a1a2e',
              color: '#888',
              border: '1px solid #3a3a5c',
              padding: '6px 16px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '13px'
            }}
          >Cancel <span style={{ color: '#555', 'font-size': '11px' }}>Esc</span></button>
          <button
            onClick={props.onConfirm}
            style={{
              background: '#f43f5e',
              color: '#fff',
              border: 'none',
              padding: '6px 16px',
              'border-radius': '4px',
              cursor: 'pointer',
              'font-size': '13px'
            }}
          >Close <span style={{ color: 'rgba(255,255,255,0.6)', 'font-size': '11px' }}>Enter</span></button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ConfirmDialog.tsx
git commit -m "feat(phase2): add close confirmation dialog component"
```

---

### Task 12: HintBar — Add Blur Hint

**Files:**
- Modify: `src/renderer/src/components/HintBar.tsx`

- [ ] **Step 1: Add ⌘G Blur to the hint bar**

In `src/renderer/src/components/HintBar.tsx`, update the `HINTS` array:

```typescript
const HINTS = [
  { key: '\u2318\u2190', label: 'Focus Left' },
  { key: '\u2318\u2192', label: 'Focus Right' },
  { key: '\u2318T', label: 'New Terminal' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u2318G', label: 'Blur' },
  { key: '\u23181-9', label: 'Jump' }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx
git commit -m "feat(phase2): add blur hint to keyboard hint bar"
```

---

### Task 13: Strip Component — Update for Panel Type

**Files:**
- Modify: `src/renderer/src/components/Strip.tsx`

- [ ] **Step 1: Update Strip to handle terminal panels (no label for terminals)**

In `src/renderer/src/components/Strip.tsx`, update the `StripProps` interface and label logic:

```typescript
import { For } from 'solid-js'
import type { PanelLayout } from '../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  panels: Array<{ id: string; type: string; label: string }>
  focusedIndex: number
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry, index) => {
          const panel = () => props.panels.find((p) => p.id === entry.panelId)
          const panelIndex = () => props.panels.findIndex((p) => p.id === entry.panelId)
          const label = () => {
            const pos = panelIndex() + 1
            const p = panel()
            const name = p?.type === 'terminal' ? 'Terminal' : (p?.label ?? '')
            return pos <= 9 ? `${pos} — ${name}` : name
          }
          return (
            <PanelFrame
              titleBarBounds={entry.titleBarBounds}
              contentBounds={entry.contentBounds}
              label={label()}
              focused={index() === props.focusedIndex}
            />
          )
        }}
      </For>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Strip.tsx
git commit -m "feat(phase2): update Strip component for terminal panel labels"
```

---

### Task 14: Integration Testing — Full Round Trip

**Files:**
- (No new files — manual testing)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All unit tests pass.

- [ ] **Step 2: Run the app in dev mode**

Run: `npm run dev`
Expected:
- App launches with one terminal panel
- Terminal shows a shell prompt (your default shell)
- You can type commands and see output
- ⌘T opens a new terminal panel
- ⌘← / ⌘→ navigates between panels
- ⌘G blurs the focused panel (cursor disappears, strip scrollable)
- Click on panel re-focuses it
- ⌘W closes the focused panel
- Typing `exit` in a terminal auto-removes the panel
- Horizontal trackpad scroll moves the strip
- Vertical scroll in a terminal scrolls the terminal scrollback

- [ ] **Step 3: Test edge cases**

Test these scenarios manually:
- Open 5+ terminals, scroll the strip, verify off-screen panels hide and reappear
- Run `cat /dev/urandom | head -c 10000 | xxd` to test high-throughput output buffering
- Run `vim` or `nano` to test interactive TUI rendering
- Resize the window — terminals should reflow (columns/rows update)
- ⌘1-9 jump navigation works

- [ ] **Step 4: Fix any issues found during testing**

Address any bugs discovered. Common issues to watch for:
- Terminal not receiving focus after ⌘← / ⌘→ (may need `webContents.focus()` call)
- Resize not triggering fit addon (ResizeObserver may need DOM ready timing)
- WebGL addon failing (should fall back to canvas gracefully)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(phase2): address integration testing issues"
```

---

### Task 15: Cleanup and Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 3: Run app and smoke test**

Run: `npm run dev`
Verify the complete feature set:
- Terminal panels spawn with real shells
- Keystroke input is responsive (no visible latency)
- High-throughput output renders smoothly
- TUI apps (vim, htop) render correctly
- ⌘T / ⌘W / ⌘← / ⌘→ / ⌘1-9 / ⌘G all work
- Scroll disambiguation works (vertical over terminal → scrollback, horizontal → strip)
- Shell exit auto-removes panel
- Close confirmation for busy processes
- Window resize causes terminal reflow
- Hint bar shows all shortcuts including ⌘G Blur

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "feat(phase2): terminal panels complete — Phase 2 milestone"
```
