# Phase 3: Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar for multi-project support — users can add, remove, and switch between projects. Each project gets its own strip of panels that persist in the background.

**Architecture:** The sidebar is a Solid.js component inside the existing chrome view. A new app store manages projects and owns a `Map<projectId, StripState>`. Switching projects hides/shows WebContentsViews — no teardown or reload. `electron-store` persists the project list across restarts.

**Tech Stack:** Solid.js, Electron (`BaseWindow`, `WebContentsView`, `dialog`), `electron-store`, `node-pty`, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-phase3-sidebar-design.md`

---

## Critical Implementation Notes

These corrections override the code snippets in the tasks below. Apply them during implementation.

### 1. `computeVisibility` must account for sidebar (Tasks 3, 14)

The visibility check's left boundary must be `sidebarWidth`, not `0`. Panels partially behind the sidebar should not be "visible".

```typescript
export function computeVisibility(screenX: number, panelWidth: number, viewportWidth: number, sidebarWidth = 0): VisibilityState {
  const panelRight = screenX + panelWidth
  if (panelRight > sidebarWidth && screenX < viewportWidth) return 'visible'
  return 'hidden'
}
```

Pass `sidebarWidth` through from `computeLayout`.

### 2. Scroll-to-center effect must use `on()` with `defer: true` (Task 14)

The existing `createEffect(on(() => state.focusedIndex, ..., { defer: true }))` pattern must be preserved. The plan's App.tsx replaces it with a plain `createEffect`, which fires on mount and on every dependency change (viewport resize, sidebar width, panel count), causing unwanted scroll animations.

Fix: Use `on(() => activeStrip()?.state.focusedIndex, ..., { defer: true })`.

### 3. IPC callbacks must route to the correct strip store by panel ID prefix (Task 14)

Callbacks like `onPtyExit`, `onPanelTitle`, `onBrowserUrlChanged`, etc. must find the correct store by extracting the project ID from the panel ID — not always use `activeStrip()`. A PTY can exit in a background project.

Add a helper:

```typescript
function findStripByPanelId(panelId: string) {
  for (const [projectId, store] of stripStores) {
    if (panelId.startsWith(projectId)) return store
  }
  return null
}
```

Use it in all IPC callbacks instead of `activeStrip()`.

### 4. `handleAddProject` must not go through `handleSwitchProject` (Task 14)

`appStore.actions.addProject()` already sets `activeProjectId`, so `handleSwitchProject`'s `currentId === targetId` guard will early-return. Restructure:

```typescript
async function handleAddProject(): Promise<void> {
  const result = await window.api.addProject()
  if (!result) return
  const currentId = appStore.state.activeProjectId
  if (currentId) {
    const currentStore = stripStores.get(currentId)
    if (currentStore) stripSnapshots.set(currentId, currentStore.getSnapshot())
    window.api.hidePanelsByPrefix(currentId)
  }
  appStore.actions.addProject(result)
  window.api.switchProject(result.id)
}
```

### 5. Newly created strip stores need current viewport dimensions (Task 14)

`getStripStore()` creates stores with default 800x600. After creating or restoring a strip store, call:

```typescript
store.actions.setViewport(window.innerWidth, window.innerHeight)
```

### 6. Confirm-close `showAllPanels` must be scoped to active project (Task 14)

Replace `window.api.showAllPanels()` in `handleConfirmResponse` with:

```typescript
const activeId = appStore.state.activeProjectId
if (activeId) window.api.showPanelsByPrefix(activeId)
```

### 7. Sidebar tooltip: always set title attribute (Task 11)

Remove the character-count check. Always set `title={project.name}`. The browser only shows the tooltip when text is truncated by CSS.

### 8. Project directory validation on startup (Tasks 5, 8)

In the `project:list` IPC handler, check each project path with `fs.existsSync()` and include a `missing: boolean` flag. In the `project:add` handler, check `fs.accessSync(dirPath, fs.constants.R_OK)` before adding. Add `missing?: boolean` to the `Project` interface. Show a warning style (dimmed/italic) in the Sidebar for missing projects.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/main/project-store.ts` | Thin wrapper around `electron-store`. Reads/writes `{ projects, activeProjectId }`. Single source of truth for persistence. |
| `src/renderer/src/store/app.ts` | App-level Solid.js store. Holds `projects[]`, `activeProjectId`, sidebar width. Owns the `Map<projectId, StripStore>`. Handles project switching (stash/restore strip states). |
| `src/renderer/src/components/Sidebar.tsx` | Sidebar UI component. Flat project list, active indicator, "+ Add Project" button, right-click context menu for remove. |
| `tests/store/app.test.ts` | Tests for the app store (project CRUD, switching, strip state stash/restore). |
| `tests/main/project-store.test.ts` | Tests for the project-store persistence wrapper. |

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `Project`, `PersistedState` interfaces. Extend `ShortcutAction` with new action types. |
| `src/shared/constants.ts` | Add `SIDEBAR` constants (min/max width, background color). |
| `src/renderer/src/layout/engine.ts` | Add `sidebarWidth` to `LayoutInput`. All functions use `effectiveWidth = viewportWidth - sidebarWidth`. `computeLayout` adds `sidebarWidth` to `x` coordinates. |
| `src/renderer/src/store/strip.ts` | Accept `projectId` parameter. Generate panel IDs as `${projectId}-panel-${nextId}`. Add `getSnapshot()` and `restore()` methods for stash/restore during project switch. |
| `src/renderer/src/App.tsx` | Major refactor: use app store instead of single strip store. Wire sidebar. Change `onMount` to load projects instead of auto-creating a terminal. Pass `sidebarWidth` to layout. Handle new shortcut actions. |
| `src/renderer/src/components/HintBar.tsx` | Accept `hasProjects` prop. Show different hints based on state. |
| `src/renderer/src/components/ScrollIndicators.tsx` | Accept `sidebarWidth` prop. Offset fade indicators and scroll track to start after sidebar. |
| `src/renderer/src/env.d.ts` | Add new API methods: `addProject`, `removeProject`, `switchProject`, `listProjects`, `createTerminal` with `cwd`, `hideByPrefix`, `showByPrefix`. |
| `src/preload/index.ts` | Add IPC bindings for project channels and `cwd`-aware `createTerminal`. |
| `src/main/index.ts` | Add `electron-store` setup, project IPC handlers (`project:add/remove/switch/list`), new keyboard shortcuts in menu (`Cmd+O`, `Cmd+Shift+1-9`), update `before-input-event` interceptor. |
| `src/main/panel-manager.ts` | Add `hideByPrefix(prefix)` and `showByPrefix(prefix)` methods. Add `destroyByPrefix(prefix)` for project removal. |
| `src/main/pty-manager.ts` | `create()` accepts optional `cwd` parameter, passes to `node-pty` spawn options. Add `killByPrefix(prefix)` for project removal. |
| `tests/layout/engine.test.ts` | Add tests for `sidebarWidth` parameter across all functions. |
| `tests/store/strip.test.ts` | Update `createStripStore()` calls to pass `projectId`. Add tests for `getSnapshot()` and `restore()`. |
| `tests/main/pty-manager.test.ts` | Add tests for `cwd` parameter and `killByPrefix`. |

---

## Task 1: Install electron-store

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install electron-store**

```bash
npm install electron-store
```

- [ ] **Step 2: Verify installation**

```bash
npm ls electron-store
```

Expected: `electron-store@x.x.x` listed under dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-store dependency for project persistence"
```

---

## Task 2: Add shared types and constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add Project and PersistedState types**

> **IMPORTANT: Apply Critical Note #8.** Add `missing?: boolean` to the `Project` interface for directory validation on startup.

In `src/shared/types.ts`, add after the existing `Panel` interface:

```typescript
export interface Project {
  id: string
  name: string
  path: string
}

export interface PersistedState {
  projects: Project[]
  activeProjectId: string | null
}
```

- [ ] **Step 2: Extend ShortcutAction with new action types**

In `src/shared/types.ts`, update `ShortcutAction`:

```typescript
export type ShortcutAction = {
  type: 'focus-left' | 'focus-right' | 'swap-left' | 'swap-right' | 'new-panel' | 'new-browser' | 'close-panel' | 'jump-to' | 'blur-panel' | 'reload-browser' | 'browser-back' | 'browser-forward' | 'add-project' | 'switch-project'
  index?: number
}
```

- [ ] **Step 3: Add SIDEBAR constants**

In `src/shared/constants.ts`, add after `LAYOUT`:

```typescript
export const SIDEBAR = {
  MIN_WIDTH: 180,
  MAX_WIDTH: 280,
  BACKGROUND: '#12122a',
  BORDER_COLOR: '#2a2a4a',
  ACCENT_COLOR: '#6366f1',
  ACTIVE_BG: 'rgba(99, 102, 241, 0.15)',
  ITEM_PADDING_V: 6,
  ITEM_PADDING_H: 12,
  HEADER_FONT_SIZE: 11,
  ITEM_FONT_SIZE: 11,
  ADD_FONT_SIZE: 10
} as const
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git commit -m "feat: add Project types and SIDEBAR constants"
```

---

## Task 3: Update layout engine with sidebarWidth

**Files:**
- Modify: `src/renderer/src/layout/engine.ts`
- Modify: `tests/layout/engine.test.ts`

- [ ] **Step 1: Write failing tests for sidebarWidth**

Add a new describe block in `tests/layout/engine.test.ts`:

```typescript
describe('sidebarWidth support', () => {
  const panels = [mkPanel('a'), mkPanel('b'), mkPanel('c')]

  it('computeLayout shifts x coordinates by sidebarWidth', () => {
    const layout = computeLayout({ panels, scrollOffset: 0, viewportWidth: 1000, viewportHeight: 600, sidebarWidth: 200 })
    // effectiveWidth = 800, panelWidth = 400
    // panel 0: stripX=0, screenX=0+200=200
    expect(layout[0].contentBounds.x).toBe(200)
    expect(layout[0].contentBounds.width).toBe(400)
  })

  it('computeLayout uses effective width for panel sizing', () => {
    const layout = computeLayout({ panels: [mkPanel('a')], scrollOffset: 0, viewportWidth: 1000, viewportHeight: 600, sidebarWidth: 200 })
    expect(layout[0].contentBounds.width).toBe(400) // 800 * 0.5
  })

  it('computeMaxScroll uses effective width', () => {
    // effectiveWidth=800, panelWidth=400, 3 panels: 400*3 + 8*2 = 1216, max = 1216-800 = 416
    expect(computeMaxScroll(3, 1000, 200)).toBe(416)
  })

  it('computeScrollToCenter uses effective width', () => {
    expect(computeScrollToCenter(0, 3, 1000, 200)).toBe(0)
  })

  it('findMostCenteredPanel uses effective width', () => {
    expect(findMostCenteredPanel(0, 3, 1000, 200)).toBe(0)
  })

  it('defaults sidebarWidth to 0', () => {
    const layout = computeLayout({ panels: [mkPanel('a')], scrollOffset: 0, viewportWidth: 1000, viewportHeight: 600 })
    expect(layout[0].contentBounds.x).toBe(0)
    expect(layout[0].contentBounds.width).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/layout/engine.test.ts
```

Expected: FAIL — `sidebarWidth` not recognized in `LayoutInput`.

- [ ] **Step 3: Update LayoutInput, computeVisibility, and computeLayout**

> **IMPORTANT: Apply Critical Note #1.** `computeVisibility` must accept `sidebarWidth` and use it as the left boundary. Pass `sidebarWidth` from `computeLayout`.

In `src/renderer/src/layout/engine.ts`:

```typescript
export interface LayoutInput {
  panels: Panel[]
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
  sidebarWidth?: number
}

export function computeLayout(input: LayoutInput): PanelLayout[] {
  const { panels, scrollOffset, viewportWidth, viewportHeight, sidebarWidth = 0 } = input
  const effectiveWidth = viewportWidth - sidebarWidth
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const panelTop = LAYOUT.STRIP_TOP_PADDING
  const panelHeight = viewportHeight - LAYOUT.STRIP_TOP_PADDING - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT

  return panels.map((panel, index) => {
    const stripX = index * (panelWidth + LAYOUT.PANEL_GAP)
    const screenX = stripX - scrollOffset + sidebarWidth
    return {
      panelId: panel.id,
      contentBounds: { x: screenX, y: panelTop, width: panelWidth, height: panelHeight },
      visibility: computeVisibility(screenX, panelWidth, viewportWidth)
    }
  })
}
```

- [ ] **Step 4: Update computeMaxScroll, computeScrollToCenter, findMostCenteredPanel**

All three functions gain an optional `sidebarWidth` parameter (default 0) and use `effectiveWidth`:

```typescript
export function computeMaxScroll(panelCount: number, viewportWidth: number, sidebarWidth = 0): number {
  if (panelCount === 0) return 0
  const effectiveWidth = viewportWidth - sidebarWidth
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const totalStripWidth = panelCount * panelWidth + (panelCount - 1) * LAYOUT.PANEL_GAP
  return Math.max(0, totalStripWidth - effectiveWidth)
}

export function computeScrollToCenter(panelIndex: number, panelCount: number, viewportWidth: number, sidebarWidth = 0): number {
  const effectiveWidth = viewportWidth - sidebarWidth
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const stripX = panelIndex * (panelWidth + LAYOUT.PANEL_GAP)
  const centerOffset = stripX - (effectiveWidth - panelWidth) / 2
  return Math.max(0, Math.min(centerOffset, computeMaxScroll(panelCount, viewportWidth, sidebarWidth)))
}

export function findMostCenteredPanel(scrollOffset: number, panelCount: number, viewportWidth: number, sidebarWidth = 0): number {
  if (panelCount === 0) return -1
  const effectiveWidth = viewportWidth - sidebarWidth
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const viewportCenter = scrollOffset + effectiveWidth / 2
  let closestIndex = 0, closestDistance = Infinity
  for (let i = 0; i < panelCount; i++) {
    const panelCenter = i * (panelWidth + LAYOUT.PANEL_GAP) + panelWidth / 2
    const distance = Math.abs(panelCenter - viewportCenter)
    if (distance < closestDistance) { closestDistance = distance; closestIndex = i }
  }
  return closestIndex
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/layout/engine.test.ts
```

Expected: ALL PASS. Existing tests still pass (sidebarWidth defaults to 0). New tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/layout/engine.ts tests/layout/engine.test.ts
git commit -m "feat: add sidebarWidth to layout engine"
```

---

## Task 4: Update strip store to accept projectId

**Files:**
- Modify: `src/renderer/src/store/strip.ts`
- Modify: `tests/store/strip.test.ts`

- [ ] **Step 1: Write failing tests for projectId and snapshot/restore**

Add to `tests/store/strip.test.ts`:

```typescript
describe('projectId panel ID generation', () => {
  it('prefixes panel IDs with projectId', () => {
    createRoot((dispose) => {
      const store = createStripStore('proj-abc')
      const panel = store.actions.addPanel('terminal')
      expect(panel.id).toMatch(/^proj-abc-panel-/)
      dispose()
    })
  })
})

describe('getSnapshot and restore', () => {
  it('snapshots current state', () => {
    createRoot((dispose) => {
      const store = createStripStore('proj-1')
      store.actions.addPanel('terminal')
      store.actions.addPanel('terminal')
      store.actions.setScrollOffset(100)
      const snapshot = store.getSnapshot()
      expect(snapshot.panels).toHaveLength(2)
      expect(snapshot.scrollOffset).toBe(100)
      expect(snapshot.focusedIndex).toBe(1)
      dispose()
    })
  })

  it('restores from snapshot', () => {
    createRoot((dispose) => {
      const store = createStripStore('proj-1')
      store.actions.addPanel('terminal')
      store.actions.addPanel('terminal')
      store.actions.setScrollOffset(100)
      const snapshot = store.getSnapshot()

      // Create a new store and restore
      const store2 = createStripStore('proj-1')
      store2.restore(snapshot)
      expect(store2.state.panels).toHaveLength(2)
      expect(store2.state.scrollOffset).toBe(100)
      expect(store2.state.focusedIndex).toBe(1)
      dispose()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/store/strip.test.ts
```

Expected: FAIL — `createStripStore` doesn't accept `projectId`.

- [ ] **Step 3: Update createStripStore**

In `src/renderer/src/store/strip.ts`, update the function signature and panel ID generation:

```typescript
export interface StripSnapshot {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  terminalFocused: boolean
}

export function createStripStore(projectId = 'default') {
  let nextId = 0
  let colorIndex = 0

  function nextPanel(): Panel {
    const color = PANEL_COLORS[colorIndex % PANEL_COLORS.length]
    colorIndex++
    nextId++
    return { id: `${projectId}-panel-${nextId}`, type: 'placeholder', color: color.hex, label: color.name }
  }

  // ... rest of existing store code unchanged ...

  function getSnapshot(): StripSnapshot {
    return {
      panels: [...state.panels],
      focusedIndex: state.focusedIndex,
      scrollOffset: state.scrollOffset,
      terminalFocused: state.terminalFocused
    }
  }

  function restore(snapshot: StripSnapshot): void {
    setState('panels', [...snapshot.panels])
    setState('focusedIndex', snapshot.focusedIndex)
    setState('scrollOffset', snapshot.scrollOffset)
    setState('terminalFocused', snapshot.terminalFocused)
  }

  return { state, actions, getSnapshot, restore }
}
```

- [ ] **Step 4: Update existing tests**

In `tests/store/strip.test.ts`, update the `withStore` helper:

```typescript
function withStore(fn: (store: ReturnType<typeof createStripStore>) => void) {
  createRoot((dispose) => { const store = createStripStore('test'); fn(store); dispose() })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/store/strip.test.ts
```

Expected: ALL PASS. Panel IDs now start with `test-panel-` in existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/strip.ts tests/store/strip.test.ts
git commit -m "feat: strip store accepts projectId, adds snapshot/restore"
```

---

## Task 5: Create project-store persistence wrapper

**Files:**
- Create: `src/main/project-store.ts`
- Create: `tests/main/project-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/main/project-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-store
const mockStore = { get: vi.fn(), set: vi.fn() }
vi.mock('electron-store', () => ({ default: vi.fn(() => mockStore) }))

import { ProjectStore } from '../../src/main/project-store'

describe('ProjectStore', () => {
  let store: ProjectStore

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return []
      if (key === 'activeProjectId') return null
      return undefined
    })
    store = new ProjectStore()
  })

  it('getProjects returns empty array initially', () => {
    expect(store.getProjects()).toEqual([])
  })

  it('addProject stores a new project', () => {
    const project = store.addProject('/Users/test/my-project')
    expect(project.name).toBe('my-project')
    expect(project.path).toBe('/Users/test/my-project')
    expect(project.id).toBeTruthy()
    expect(mockStore.set).toHaveBeenCalledWith('projects', [project])
  })

  it('addProject rejects duplicate paths', () => {
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return [{ id: '1', name: 'my-project', path: '/Users/test/my-project' }]
      return null
    })
    store = new ProjectStore()
    expect(store.addProject('/Users/test/my-project')).toBeNull()
  })

  it('removeProject deletes by id', () => {
    const project = { id: 'abc', name: 'test', path: '/test' }
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return [project]
      if (key === 'activeProjectId') return 'abc'
      return null
    })
    store = new ProjectStore()
    store.removeProject('abc')
    expect(mockStore.set).toHaveBeenCalledWith('projects', [])
    expect(mockStore.set).toHaveBeenCalledWith('activeProjectId', null)
  })

  it('setActiveProjectId persists', () => {
    store.setActiveProjectId('proj-1')
    expect(mockStore.set).toHaveBeenCalledWith('activeProjectId', 'proj-1')
  })

  it('getActiveProjectId reads from store', () => {
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'activeProjectId') return 'proj-1'
      return []
    })
    store = new ProjectStore()
    expect(store.getActiveProjectId()).toBe('proj-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/main/project-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ProjectStore**

> **IMPORTANT: Apply Critical Note #8.** Add `fs.existsSync()` checks in `getProjects()` to flag missing directories, and `fs.accessSync()` in `addProject()` to reject unreadable directories.

Create `src/main/project-store.ts`:

```typescript
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import type { Project } from '../shared/types'

interface StoreSchema {
  projects: Project[]
  activeProjectId: string | null
}

export class ProjectStore {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        projects: [],
        activeProjectId: null
      }
    })
  }

  getProjects(): Project[] {
    return this.store.get('projects')
  }

  getActiveProjectId(): string | null {
    return this.store.get('activeProjectId')
  }

  setActiveProjectId(id: string | null): void {
    this.store.set('activeProjectId', id)
  }

  addProject(dirPath: string): Project | null {
    const projects = this.getProjects()
    if (projects.some((p) => p.path === dirPath)) return null

    const project: Project = {
      id: randomUUID(),
      name: basename(dirPath),
      path: dirPath
    }
    this.store.set('projects', [...projects, project])
    return project
  }

  removeProject(id: string): void {
    const projects = this.getProjects()
    this.store.set('projects', projects.filter((p) => p.id !== id))
    if (this.getActiveProjectId() === id) {
      this.setActiveProjectId(null)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/main/project-store.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/project-store.ts tests/main/project-store.test.ts
git commit -m "feat: add ProjectStore persistence wrapper"
```

---

## Task 6: Update PtyManager to accept cwd

**Files:**
- Modify: `src/main/pty-manager.ts`
- Modify: `tests/main/pty-manager.test.ts`

- [ ] **Step 1: Write failing test for cwd**

Add to `tests/main/pty-manager.test.ts` inside the first `describe('PtyManager')` block:

```typescript
  it('passes cwd to node-pty spawn', () => {
    manager.create('panel-1', '/Users/test/my-project')
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cwd: '/Users/test/my-project' })
    )
  })

  it('falls back to process.cwd() when no cwd provided', () => {
    manager.create('panel-1')
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cwd: process.cwd() })
    )
  })
```

Also add a test for `killByPrefix`:

```typescript
  it('killByPrefix kills all PTYs with matching prefix', () => {
    manager.create('proj1-panel-1')
    manager.create('proj1-panel-2')
    manager.create('proj2-panel-1')
    manager.killByPrefix('proj1')
    expect(manager.hasPty('proj1-panel-1')).toBe(false)
    expect(manager.hasPty('proj1-panel-2')).toBe(false)
    expect(manager.hasPty('proj2-panel-1')).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/main/pty-manager.test.ts
```

Expected: FAIL — `create` doesn't accept `cwd`, `killByPrefix` doesn't exist.

- [ ] **Step 3: Update PtyManager.create to accept cwd**

In `src/main/pty-manager.ts`, update the `create` method signature:

```typescript
  create(panelId: string, cwd?: string): void {
    if (this.ptys.has(panelId)) return
    const shell = process.env.SHELL || '/bin/zsh'
    const shellName = basename(shell)
    const ptyProcess = pty.spawn(shell, [], {
      cols: 80, rows: 24,
      cwd: cwd || process.cwd(),
      env: process.env as Record<string, string>
    })
    // ... rest unchanged
  }
```

- [ ] **Step 4: Add killByPrefix method**

```typescript
  killByPrefix(prefix: string): void {
    for (const [panelId, managed] of this.ptys) {
      if (panelId.startsWith(prefix)) {
        managed.disposed = true
        managed.pty.kill()
        this.ptys.delete(panelId)
      }
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/main/pty-manager.test.ts
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/pty-manager.ts tests/main/pty-manager.test.ts
git commit -m "feat: PtyManager accepts cwd, adds killByPrefix"
```

---

## Task 7: Add PanelManager hideByPrefix / showByPrefix / destroyByPrefix

**Files:**
- Modify: `src/main/panel-manager.ts`

- [ ] **Step 1: Add hideByPrefix method**

In `src/main/panel-manager.ts`, add after the existing `hideAll()` method:

```typescript
  hideByPrefix(prefix: string): void {
    for (const panel of this.panels.values()) {
      if (panel.id.startsWith(prefix)) {
        panel.view.setVisible(false)
        if (panel.chromeView) panel.chromeView.setVisible(false)
      }
    }
  }
```

- [ ] **Step 2: Add showByPrefix method**

```typescript
  showByPrefix(prefix: string): void {
    for (const panel of this.panels.values()) {
      if (panel.id.startsWith(prefix)) {
        panel.view.setVisible(true)
        if (panel.chromeView) panel.chromeView.setVisible(true)
      }
    }
  }
```

- [ ] **Step 3: Add destroyByPrefix method**

```typescript
  destroyByPrefix(prefix: string): void {
    for (const id of [...this.panels.keys()]) {
      if (id.startsWith(prefix)) this.destroyPanel(id)
    }
  }
```

- [ ] **Step 4: Add before-input-event handling for new shortcuts**

In `src/main/panel-manager.ts`, inside the `handleShortcutKey` closure in `createPanel`, add to the `if (input.shift)` branch:

```typescript
        else if (input.key === 'o' || input.key === 'O') action = { type: 'add-project' }
        else if (input.key >= '1' && input.key <= '9') action = { type: 'switch-project', index: parseInt(input.key) - 1 }
```

And in the `else` (non-shift) branch, add:

```typescript
        else if (input.key === 'o') action = { type: 'add-project' }
```

Wait — `Cmd+O` (no shift) for add project. The existing handler checks `if (input.shift)` first. We need to add `Cmd+O` in the non-shift branch and `Cmd+Shift+1-9` in the shift branch.

Update the shift branch to:

```typescript
      if (input.shift) {
        if (input.key === 'ArrowLeft') action = { type: 'swap-left' }
        else if (input.key === 'ArrowRight') action = { type: 'swap-right' }
        else if (input.key >= '1' && input.key <= '9') action = { type: 'switch-project', index: parseInt(input.key) - 1 }
      }
```

And add to the non-shift branch:

```typescript
        else if (input.key === 'o') action = { type: 'add-project' }
```

**Note:** This now means `Cmd+Shift+1-9` is intercepted for project switching instead of falling through to panel jumping. Since `Cmd+1-9` (no shift) still works for panel jumping, this is correct — they're distinct shortcuts.

- [ ] **Step 5: Commit**

```bash
git add src/main/panel-manager.ts
git commit -m "feat: PanelManager adds prefix-based hide/show/destroy and new shortcuts"
```

---

## Task 8: Add IPC channels (preload + main process)

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update env.d.ts with new API methods**

Add to the `FlywheelAPI` interface in `src/renderer/src/env.d.ts`:

```typescript
  // Project management
  addProject(): Promise<{ id: string; name: string; path: string } | null>
  removeProject(projectId: string): void
  switchProject(projectId: string): void
  listProjects(): Promise<{ projects: { id: string; name: string; path: string }[]; activeProjectId: string | null }>
  createTerminalWithCwd(panelId: string, cwd: string): void
  hidePanelsByPrefix(prefix: string): void
  showPanelsByPrefix(prefix: string): void
  destroyPanelsByPrefix(prefix: string): void
```

- [ ] **Step 2: Add IPC bindings in preload**

Add to `src/preload/index.ts` inside the `contextBridge.exposeInMainWorld` call:

```typescript
  // Project management
  addProject: (): Promise<{ id: string; name: string; path: string } | null> => {
    return ipcRenderer.invoke('project:add')
  },
  removeProject: (projectId: string) => {
    ipcRenderer.send('project:remove', { projectId })
  },
  switchProject: (projectId: string) => {
    ipcRenderer.send('project:switch', { projectId })
  },
  listProjects: (): Promise<{ projects: { id: string; name: string; path: string }[]; activeProjectId: string | null }> => {
    return ipcRenderer.invoke('project:list')
  },
  createTerminalWithCwd: (panelId: string, cwd: string) => {
    ipcRenderer.send('pty:create', { panelId, cwd })
  },
  hidePanelsByPrefix: (prefix: string) => {
    ipcRenderer.send('panel:hide-by-prefix', { prefix })
  },
  showPanelsByPrefix: (prefix: string) => {
    ipcRenderer.send('panel:show-by-prefix', { prefix })
  },
  destroyPanelsByPrefix: (prefix: string) => {
    ipcRenderer.send('panel:destroy-by-prefix', { prefix })
  },
```

- [ ] **Step 3: Add project IPC handlers in main process**

In `src/main/index.ts`, add `import { ProjectStore } from './project-store'` and `import { dialog } from 'electron'` (add `dialog` to existing electron import), then add `let projectStore: ProjectStore` alongside the other `let` declarations.

In `createWindow()`, add `projectStore = new ProjectStore()` after the `ptyManager` initialization.

In `setupIpcHandlers()`, add:

```typescript
  // Project management
  ipcMain.handle('project:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Add Project'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const project = projectStore.addProject(result.filePaths[0])
    return project
  })

  ipcMain.on('project:remove', (_event, data: { projectId: string }) => {
    ptyManager.killByPrefix(data.projectId)
    panelManager.destroyByPrefix(data.projectId)
    projectStore.removeProject(data.projectId)
  })

  ipcMain.on('project:switch', (_event, data: { projectId: string }) => {
    projectStore.setActiveProjectId(data.projectId)
  })

  ipcMain.handle('project:list', () => {
    return {
      projects: projectStore.getProjects(),
      activeProjectId: projectStore.getActiveProjectId()
    }
  })

  // Prefix-based panel management
  ipcMain.on('panel:hide-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.hideByPrefix(data.prefix)
  })

  ipcMain.on('panel:show-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.showByPrefix(data.prefix)
  })

  ipcMain.on('panel:destroy-by-prefix', (_event, data: { prefix: string }) => {
    panelManager.destroyByPrefix(data.prefix)
  })
```

- [ ] **Step 4: Update pty:create handler to accept cwd**

Change the existing `pty:create` handler:

```typescript
  ipcMain.on('pty:create', (_event, data: { panelId: string; cwd?: string }) => {
    ptyManager.create(data.panelId, data.cwd)
  })
```

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts src/main/index.ts
git commit -m "feat: add project IPC channels and prefix-based panel management"
```

---

## Task 9: Add keyboard shortcuts to Electron menu

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add Projects submenu to setupShortcuts**

In `src/main/index.ts` `setupShortcuts()`, add a new submenu between 'Panels' and 'Edit':

```typescript
    {
      label: 'Projects',
      submenu: [
        {
          label: 'Add Project',
          accelerator: 'CommandOrControl+O',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'add-project' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Switch to Project ${i + 1}`,
          accelerator: `CommandOrControl+Shift+${i + 1}`,
          click: () => chromeView.webContents.send('shortcut:action', { type: 'switch-project', index: i })
        }))
      ]
    },
```

- [ ] **Step 2: Verify app builds**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add Projects menu with Cmd+O and Cmd+Shift+1-9 shortcuts"
```

---

## Task 10: Create app store

**Files:**
- Create: `src/renderer/src/store/app.ts`
- Create: `tests/store/app.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/store/app.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../../src/renderer/src/store/app'
import type { Project } from '../../src/shared/types'

function withAppStore(fn: (store: ReturnType<typeof createAppStore>) => void) {
  createRoot((dispose) => { const store = createAppStore(); fn(store); dispose() })
}

describe('createAppStore', () => {
  it('starts with no projects', () => {
    withAppStore(({ state }) => {
      expect(state.projects).toHaveLength(0)
      expect(state.activeProjectId).toBeNull()
    })
  })
})

describe('project management', () => {
  it('addProject adds to list and sets active', () => {
    withAppStore(({ state, actions }) => {
      const project: Project = { id: 'p1', name: 'test', path: '/test' }
      actions.addProject(project)
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0].id).toBe('p1')
      expect(state.activeProjectId).toBe('p1')
    })
  })

  it('removeProject removes from list', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.removeProject('p1')
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0].id).toBe('p2')
    })
  })

  it('removeProject switches to next project if active was removed', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.switchProject('p1')
      actions.removeProject('p1')
      expect(state.activeProjectId).toBe('p2')
    })
  })

  it('removeProject sets null if last project removed', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.removeProject('p1')
      expect(state.activeProjectId).toBeNull()
    })
  })
})

describe('project switching', () => {
  it('switchProject changes activeProjectId', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.switchProject('p1')
      expect(state.activeProjectId).toBe('p1')
    })
  })

  it('getActiveProject returns current project', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'test', path: '/test' })
      expect(actions.getActiveProject()?.id).toBe('p1')
    })
  })

  it('getActiveProject returns null when no active', () => {
    withAppStore(({ actions }) => {
      expect(actions.getActiveProject()).toBeNull()
    })
  })
})

describe('sidebar width', () => {
  it('computes sidebar width from longest project name', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'short', path: '/short' })
      // Width depends on character measurement; just verify it's within bounds
      expect(state.sidebarWidth).toBeGreaterThanOrEqual(180)
      expect(state.sidebarWidth).toBeLessThanOrEqual(280)
    })
  })

  it('returns 180 (min) when no projects', () => {
    withAppStore(({ state }) => {
      expect(state.sidebarWidth).toBe(180)
    })
  })
})

describe('loadProjects', () => {
  it('loads project list and active project', () => {
    withAppStore(({ state, actions }) => {
      const projects: Project[] = [
        { id: 'p1', name: 'a', path: '/a' },
        { id: 'p2', name: 'b', path: '/b' }
      ]
      actions.loadProjects(projects, 'p2')
      expect(state.projects).toHaveLength(2)
      expect(state.activeProjectId).toBe('p2')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/store/app.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement createAppStore**

Create `src/renderer/src/store/app.ts`:

```typescript
import { createStore } from 'solid-js/store'
import type { Project } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

export interface AppState {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
}

function computeSidebarWidth(projects: Project[]): number {
  if (projects.length === 0) return SIDEBAR.MIN_WIDTH
  // Approximate: 7px per character (monospace 11px) + padding
  const longestName = Math.max(...projects.map((p) => p.name.length))
  const estimated = longestName * 7 + SIDEBAR.ITEM_PADDING_H * 2 + 2 + 12 // padding + border + extra
  return Math.max(SIDEBAR.MIN_WIDTH, Math.min(estimated, SIDEBAR.MAX_WIDTH))
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    projects: [],
    activeProjectId: null,
    sidebarWidth: SIDEBAR.MIN_WIDTH
  })

  const actions = {
    loadProjects(projects: Project[], activeProjectId: string | null): void {
      setState('projects', projects)
      setState('activeProjectId', activeProjectId)
      setState('sidebarWidth', computeSidebarWidth(projects))
    },

    addProject(project: Project): void {
      setState('projects', [...state.projects, project])
      setState('activeProjectId', project.id)
      setState('sidebarWidth', computeSidebarWidth([...state.projects]))
    },

    removeProject(id: string): void {
      const newProjects = state.projects.filter((p) => p.id !== id)
      setState('projects', newProjects)
      if (state.activeProjectId === id) {
        setState('activeProjectId', newProjects.length > 0 ? newProjects[0].id : null)
      }
      setState('sidebarWidth', computeSidebarWidth(newProjects))
    },

    switchProject(id: string): void {
      if (state.projects.some((p) => p.id === id)) {
        setState('activeProjectId', id)
      }
    },

    getActiveProject(): Project | null {
      if (!state.activeProjectId) return null
      return state.projects.find((p) => p.id === state.activeProjectId) || null
    }
  }

  return { state, actions }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/store/app.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/app.ts tests/store/app.test.ts
git commit -m "feat: add app store for project management"
```

---

## Task 11: Create Sidebar component

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Create the Sidebar component**

> **IMPORTANT: Apply Critical Note #7.** Always set `title={project.name}` on project items — do NOT use a character-count check. The browser only shows the tooltip when text is actually truncated by CSS.
> **IMPORTANT: Apply Critical Note #8.** Add dimmed/italic styling for projects where `project.missing === true`.

Create `src/renderer/src/components/Sidebar.tsx`:

```tsx
import { For, createSignal } from 'solid-js'
import type { Project } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
  viewportHeight: number
  onSwitchProject: (id: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
}

export default function Sidebar(props: SidebarProps) {
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; projectId: string } | null>(null)
  const [hoveredId, setHoveredId] = createSignal<string | null>(null)

  function handleContextMenu(e: MouseEvent, projectId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  function handleRemove() {
    const menu = contextMenu()
    if (menu) {
      props.onRemoveProject(menu.projectId)
      setContextMenu(null)
    }
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${props.sidebarWidth}px`,
        height: `${props.viewportHeight}px`,
        background: SIDEBAR.BACKGROUND,
        'border-right': `1px solid ${SIDEBAR.BORDER_COLOR}`,
        display: 'flex',
        'flex-direction': 'column',
        'font-family': 'monospace',
        'font-size': `${SIDEBAR.ITEM_FONT_SIZE}px`,
        'user-select': 'none',
        'z-index': '20'
      }}
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div style={{
        color: SIDEBAR.ACCENT_COLOR,
        'font-weight': 'bold',
        'font-size': `${SIDEBAR.HEADER_FONT_SIZE}px`,
        padding: '12px 12px 8px',
        display: 'flex',
        'align-items': 'center',
        gap: '6px'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SIDEBAR.ACCENT_COLOR} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        Projects
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <For each={props.projects}>
          {(project) => (
            <div
              style={{
                padding: `${SIDEBAR.ITEM_PADDING_V}px ${SIDEBAR.ITEM_PADDING_H}px`,
                color: project.id === props.activeProjectId ? '#e0e0e0' : '#666',
                background: project.id === props.activeProjectId ? SIDEBAR.ACTIVE_BG : 'transparent',
                'border-left': project.id === props.activeProjectId
                  ? `2px solid ${SIDEBAR.ACCENT_COLOR}`
                  : '2px solid transparent',
                cursor: 'pointer',
                'white-space': 'nowrap',
                overflow: 'hidden',
                'text-overflow': 'ellipsis'
              }}
              title={project.name.length > 30 ? project.name : undefined}
              onClick={() => props.onSwitchProject(project.id)}
              onContextMenu={(e) => handleContextMenu(e, project.id)}
              onMouseEnter={() => setHoveredId(project.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {project.name}
            </div>
          )}
        </For>
      </div>

      {/* Add Project button */}
      <div
        style={{
          padding: '8px 12px',
          color: '#555',
          'font-size': `${SIDEBAR.ADD_FONT_SIZE}px`,
          'border-top': `1px solid ${SIDEBAR.BORDER_COLOR}`,
          cursor: 'pointer'
        }}
        onClick={props.onAddProject}
      >
        + Add Project
      </div>

      {/* Context menu */}
      {contextMenu() && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu()!.x}px`,
            top: `${contextMenu()!.y}px`,
            background: '#1a1a2e',
            border: `1px solid ${SIDEBAR.BORDER_COLOR}`,
            'border-radius': '4px',
            padding: '4px 0',
            'z-index': '100',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          <div
            style={{
              padding: '6px 16px',
              color: '#f43f5e',
              'font-size': '11px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={handleRemove}
          >
            Remove Project
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component"
```

---

## Task 12: Update HintBar for context awareness

**Files:**
- Modify: `src/renderer/src/components/HintBar.tsx`

- [ ] **Step 1: Update HintBar props and hints**

Replace the contents of `src/renderer/src/components/HintBar.tsx`. The key changes are: accept `hasProjects` prop, show different hint sets based on state, and accept `sidebarWidth` for positioning.

```tsx
import { createSignal, onMount, onCleanup } from 'solid-js'
import { LAYOUT } from '../../../shared/constants'

interface HintBarProps {
  viewportHeight: number
  panelCount: number
  hasProjects: boolean
  sidebarWidth: number
}

const PANEL_HINTS = [
  { key: '\u2318\u2190', label: 'Focus Left' },
  { key: '\u2318\u2192', label: 'Focus Right' },
  { key: '\u2318\u21e7\u2190', label: 'Swap Left' },
  { key: '\u2318\u21e7\u2192', label: 'Swap Right' },
  { key: '\u2318T', label: 'New Terminal' },
  { key: '\u2318B', label: 'New Browser' },
  { key: '\u2318[', label: 'Back' },
  { key: '\u2318]', label: 'Forward' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u2318G', label: 'Blur' },
  { key: '\u23181-9', label: 'Jump' },
  { key: '\u2318\u21e71-9', label: 'Switch Project' }
]

const NO_PROJECT_HINTS = [
  { key: '\u2318O', label: 'Add Project' }
]

export default function HintBar(props: HintBarProps) {
  const top = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT

  const hints = () => props.hasProjects ? PANEL_HINTS : NO_PROJECT_HINTS

  const [stats, setStats] = createSignal({
    panelViewCount: 0,
    mainMemoryMB: 0,
    heapUsedMB: 0
  })

  onMount(() => {
    async function poll() {
      try {
        setStats(await window.api.getDebugStats())
      } catch (e) {
        console.error('debug:stats failed', e)
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    onCleanup(() => clearInterval(id))
  })

  const dimStyle = { color: '#444', 'font-size': '11px' } as const
  const valStyle = { color: '#666', 'font-size': '11px', 'font-family': 'monospace' } as const

  return (
    <div style={{
      position: 'absolute', left: `${props.sidebarWidth}px`, top: `${top()}px`,
      width: `calc(100% - ${props.sidebarWidth}px)`,
      height: `${LAYOUT.HINT_BAR_HEIGHT}px`, display: 'flex', 'align-items': 'center',
      background: '#1a1a2e', 'border-top': '1px solid #252540',
      'user-select': 'none', 'font-size': '12px', 'padding-left': '16px', 'padding-right': '16px'
    }}>
      {/* Shortcuts — center */}
      <div style={{ flex: 1, display: 'flex', 'justify-content': 'center', gap: '24px' }}>
        {hints().map((hint) => (
          <span>
            <span style={{
              color: '#888', 'font-weight': '500', background: '#252540',
              padding: '2px 6px', 'border-radius': '3px', 'margin-right': '4px',
              'font-family': 'monospace'
            }}>{hint.key}</span>
            <span style={{ color: '#555' }}>{hint.label}</span>
          </span>
        ))}
      </div>

      {/* Debug stats — right */}
      <div style={{ display: 'flex', gap: '12px', 'flex-shrink': 0 }}>
        <span>
          <span style={dimStyle}>panels </span>
          <span style={valStyle}>{props.panelCount}</span>
        </span>
        <span>
          <span style={dimStyle}>views </span>
          <span style={valStyle}>{stats().panelViewCount}</span>
        </span>
        <span>
          <span style={dimStyle}>main </span>
          <span style={valStyle}>{stats().mainMemoryMB}MB</span>
        </span>
        <span>
          <span style={dimStyle}>heap </span>
          <span style={valStyle}>{stats().heapUsedMB}MB</span>
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx
git commit -m "feat: context-aware HintBar with project hints"
```

---

## Task 13: Update ScrollIndicators for sidebar offset

**Files:**
- Modify: `src/renderer/src/components/ScrollIndicators.tsx`

- [ ] **Step 1: Add sidebarWidth prop**

Update `ScrollIndicatorsProps`:

```typescript
interface ScrollIndicatorsProps {
  scrollOffset: number
  maxScroll: number
  viewportWidth: number
  viewportHeight: number
  sidebarWidth: number
}
```

- [ ] **Step 2: Offset positioning by sidebarWidth**

Update the left fade indicator's `left` to `${props.sidebarWidth}px`.

Update the scroll track container's `left` to `${props.sidebarWidth}px` and `width` to `calc(100% - ${props.sidebarWidth}px)`.

Update `thumbLeft` to account for the effective width:

```typescript
  const effectiveWidth = () => props.viewportWidth - props.sidebarWidth
  const thumbWidth = () => {
    if (props.maxScroll <= 0) return effectiveWidth()
    const ratio = effectiveWidth() / (effectiveWidth() + props.maxScroll)
    return Math.max(40, effectiveWidth() * ratio)
  }
  const thumbLeft = () => {
    if (props.maxScroll <= 0) return 0
    const ratio = props.scrollOffset / props.maxScroll
    return ratio * (effectiveWidth() - thumbWidth())
  }
```

Also update the left fade `left` position and height calc to use `props.sidebarWidth`, and update the right fade and scroll track to use `effectiveWidth()`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ScrollIndicators.tsx
git commit -m "feat: ScrollIndicators accounts for sidebar width"
```

---

## Task 14: Refactor App.tsx — wire everything together

**Files:**
- Modify: `src/renderer/src/App.tsx`

This is the largest task. The App component needs to:
1. Create an app store + manage per-project strip stores
2. Render the Sidebar component
3. Handle project switching (stash/restore strip state, hide/show panels)
4. Pass sidebarWidth to layout engine, HintBar, ScrollIndicators
5. Handle new shortcut actions (add-project, switch-project)
6. Change onMount to load projects instead of auto-creating a terminal

- [ ] **Step 1: Replace App.tsx**

> **CRITICAL: Apply ALL of the following Critical Notes when implementing this task. The code below is a starting template — you MUST apply these corrections:**
> - **Critical Note #1**: Pass `sidebarWidth` to `computeVisibility` in layout calls.
> - **Critical Note #2**: Scroll-to-center effect MUST use `on(() => activeStrip()?.state.focusedIndex, ..., { defer: true })`, NOT a plain `createEffect`.
> - **Critical Note #3**: ALL IPC callbacks (`onPtyExit`, `onPanelTitle`, `onBrowserUrlChanged`, `onBrowserTitleChanged`, `onBrowserOpenUrl`, `onPanelClosed`, `onPanelFocused`) must route to the correct strip store via `findStripByPanelId(panelId)`, NOT `activeStrip()`.
> - **Critical Note #4**: `handleAddProject` must NOT go through `handleSwitchProject`. Restructure to stash/hide/add/switch inline.
> - **Critical Note #5**: `getStripStore()` must call `store.actions.setViewport(window.innerWidth, window.innerHeight)` after creating a new store.
> - **Critical Note #6**: In `handleConfirmResponse`, replace `window.api.showAllPanels()` with `window.api.showPanelsByPrefix(appStore.state.activeProjectId)`.

Rewrite `src/renderer/src/App.tsx`. The key structural changes:

```tsx
import { createEffect, createSignal, on, onMount, batch } from 'solid-js'
import { createAppStore } from './store/app'
import { createStripStore } from './store/strip'
import type { StripSnapshot } from './store/strip'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { PanelBoundsUpdate } from '../../../shared/types'
import { LAYOUT } from '../../shared/constants'
import Strip from './components/Strip'
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'
import ConfirmDialog from './components/ConfirmDialog'
import Sidebar from './components/Sidebar'

export default function App() {
  const appStore = createAppStore()
  const stripStores = new Map<string, ReturnType<typeof createStripStore>>()
  const stripSnapshots = new Map<string, StripSnapshot>()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  const [confirmClose, setConfirmClose] = createSignal<{ panelId: string; processName: string } | null>(null)

  // Get or create strip store for a project
  function getStripStore(projectId: string) {
    let store = stripStores.get(projectId)
    if (!store) {
      store = createStripStore(projectId)
      // Restore snapshot if one exists
      const snapshot = stripSnapshots.get(projectId)
      if (snapshot) store.restore(snapshot)
      stripStores.set(projectId, store)
    }
    return store
  }

  // Active strip store (reactive — changes when activeProjectId changes)
  const activeStrip = () => {
    const id = appStore.state.activeProjectId
    if (!id) return null
    return getStripStore(id)
  }

  // Layout effect — recomputes when strip state or sidebar changes
  createEffect(() => {
    const strip = activeStrip()
    if (!strip) {
      // No active project — hide everything
      for (const id of [...createdPanelIds]) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
      return
    }

    const layout = computeLayout({
      panels: [...strip.state.panels],
      scrollOffset: strip.state.scrollOffset,
      viewportWidth: strip.state.viewportWidth,
      viewportHeight: strip.state.viewportHeight,
      sidebarWidth: appStore.state.sidebarWidth
    })

    const desiredIds = new Set<string>()
    const boundsUpdates: PanelBoundsUpdate[] = []

    for (const entry of layout) {
      if (entry.visibility === 'destroyed') continue
      desiredIds.add(entry.panelId)
      if (!createdPanelIds.has(entry.panelId)) {
        const panel = strip.state.panels.find((p) => p.id === entry.panelId)
        if (panel) {
          if (panel.type === 'terminal') {
            window.api.createTerminalPanel(entry.panelId)
          } else if (panel.type === 'browser') {
            window.api.createBrowserPanel(entry.panelId, panel.url || 'about:blank')
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

    // Only destroy panels belonging to the active project that are no longer needed
    const activePrefix = appStore.state.activeProjectId || ''
    for (const id of [...createdPanelIds]) {
      if (id.startsWith(activePrefix) && !desiredIds.has(id)) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates)
    }
  })

  // Scroll-to-center effect
  createEffect(() => {
    const strip = activeStrip()
    if (!strip) return
    // Track focusedIndex changes
    const focusedIndex = strip.state.focusedIndex
    const viewportWidth = strip.state.viewportWidth
    const panelCount = strip.state.panels.length
    const sidebarWidth = appStore.state.sidebarWidth

    currentAnimation?.cancel()
    currentAnimation = null
    const target = computeScrollToCenter(focusedIndex, panelCount, viewportWidth, sidebarWidth)
    if (Math.abs(strip.state.scrollOffset - target) < 1) {
      strip.actions.setScrollOffset(target)
      return
    }
    currentAnimation = animate({
      from: strip.state.scrollOffset, to: target, duration: 200, easing: easeOut,
      onUpdate: (value) => strip.actions.setScrollOffset(value),
      onComplete: () => { currentAnimation = null }
    })
  })

  // Focus effect
  createEffect(() => {
    const strip = activeStrip()
    if (!strip || strip.state.panels.length === 0) return
    const panel = strip.state.panels[strip.state.focusedIndex]
    if (!panel) return

    if (strip.state.terminalFocused && (panel.type === 'terminal' || (panel.type === 'browser' && panel.url !== 'about:blank'))) {
      window.api.focusPanel(panel.id)
    } else if (strip.state.terminalFocused && panel.type === 'browser' && panel.url === 'about:blank') {
      window.api.focusPanelChrome(panel.id)
    } else {
      window.api.blurAllPanels()
    }
  })

  // Chrome state effect
  createEffect(() => {
    const strip = activeStrip()
    if (!strip) return
    const panels = [...strip.state.panels]
    const focusedIndex = strip.state.focusedIndex
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]
      window.api.sendChromeState(panel.id, {
        position: i + 1,
        label: panel.label,
        focused: i === focusedIndex && strip.state.terminalFocused,
        type: panel.type,
        url: panel.url,
        canGoBack: panel.canGoBack,
        canGoForward: panel.canGoForward
      })
    }
  })

  function handleWheel(deltaX: number): void {
    const strip = activeStrip()
    if (!strip) return
    currentAnimation?.cancel()
    currentAnimation = null
    const maxScroll = computeMaxScroll(strip.state.panels.length, strip.state.viewportWidth, appStore.state.sidebarWidth)
    const newOffset = Math.max(0, Math.min(strip.state.scrollOffset + deltaX, maxScroll))
    strip.actions.setScrollOffset(newOffset)
    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(() => {
      if (!strip) return
      const idx = findMostCenteredPanel(strip.state.scrollOffset, strip.state.panels.length, strip.state.viewportWidth, appStore.state.sidebarWidth)
      if (idx >= 0 && idx !== strip.state.focusedIndex) strip.actions.jumpTo(idx)
    }, 150)
  }

  function handleClosePanel(): void {
    const strip = activeStrip()
    if (!strip || strip.state.panels.length === 0) return
    const focusedPanel = strip.state.panels[strip.state.focusedIndex]
    if (!focusedPanel) return

    if (focusedPanel.type === 'terminal' || focusedPanel.type === 'browser') {
      window.api.closePanel(focusedPanel.id)
    } else {
      const removedId = strip.actions.removePanel()
      if (removedId) {
        window.api.destroyPanel(removedId)
        createdPanelIds.delete(removedId)
      }
    }
  }

  async function handleAddProject(): Promise<void> {
    const result = await window.api.addProject()
    if (result) {
      handleSwitchProject(result.id, () => {
        appStore.actions.addProject(result)
      })
    }
  }

  function handleSwitchProject(targetId: string, beforeSwitch?: () => void): void {
    const currentId = appStore.state.activeProjectId
    if (currentId === targetId) return

    // Stash current strip state
    if (currentId) {
      const currentStore = stripStores.get(currentId)
      if (currentStore) {
        stripSnapshots.set(currentId, currentStore.getSnapshot())
      }
      window.api.hidePanelsByPrefix(currentId)
    }

    if (beforeSwitch) beforeSwitch()

    // Switch
    appStore.actions.switchProject(targetId)
    window.api.switchProject(targetId)

    // Show target panels
    window.api.showPanelsByPrefix(targetId)
  }

  function handleRemoveProject(projectId: string): void {
    window.api.removeProject(projectId)
    stripStores.delete(projectId)
    stripSnapshots.delete(projectId)
    // Remove created panel IDs for this project
    for (const id of [...createdPanelIds]) {
      if (id.startsWith(projectId)) createdPanelIds.delete(id)
    }
    appStore.actions.removeProject(projectId)
  }

  function handleShortcut(action: { type: string; index?: number }): void {
    const strip = activeStrip()

    switch (action.type) {
      case 'add-project': handleAddProject(); break
      case 'switch-project': {
        if (action.index !== undefined && action.index < appStore.state.projects.length) {
          handleSwitchProject(appStore.state.projects[action.index].id)
        }
        break
      }
      case 'focus-left': strip?.actions.focusLeft(); break
      case 'focus-right': strip?.actions.focusRight(); break
      case 'swap-left': strip?.actions.swapLeft(); break
      case 'swap-right': strip?.actions.swapRight(); break
      case 'new-panel': {
        if (!strip) break
        const activeProject = appStore.actions.getActiveProject()
        const panel = strip.actions.addPanel('terminal')
        if (activeProject) {
          window.api.createTerminalWithCwd(panel.id, activeProject.path)
        } else {
          window.api.createTerminal(panel.id)
        }
        break
      }
      case 'new-browser': {
        if (!strip) break
        const panel = strip.actions.addPanel('browser', 'about:blank')
        window.api.createBrowserPanel(panel.id, panel.url || 'about:blank')
        break
      }
      case 'reload-browser': {
        const focused = strip?.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.reloadBrowser(focused.id)
        break
      }
      case 'browser-back': {
        const focused = strip?.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.goBackBrowser(focused.id)
        break
      }
      case 'browser-forward': {
        const focused = strip?.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.goForwardBrowser(focused.id)
        break
      }
      case 'close-panel': handleClosePanel(); break
      case 'blur-panel': strip?.actions.blurPanel(); break
      case 'jump-to': if (action.index !== undefined) strip?.actions.jumpTo(action.index); break
    }
  }

  function handleConfirmResponse(confirmed: boolean): void {
    const data = confirmClose()
    if (data) {
      window.api.confirmCloseResponse(data.panelId, confirmed)
      if (confirmed) {
        activeStrip()?.actions.removePanelById(data.panelId)
        createdPanelIds.delete(data.panelId)
      }
      setConfirmClose(null)
      window.api.showAllPanels()
    }
  }

  onMount(async () => {
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))
    window.addEventListener('resize', () => {
      activeStrip()?.actions.setViewport(window.innerWidth, window.innerHeight)
    })
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) handleWheel(event.deltaX)
    }, { passive: true })

    window.api.onPtyExit((data) => {
      activeStrip()?.actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    window.api.onConfirmClose((data) => {
      window.api.hideAllPanels()
      setConfirmClose(data)
    })

    window.api.onPanelTitle((data) => {
      activeStrip()?.actions.setPanelTitle(data.panelId, data.title)
    })

    window.api.onPanelFocused((data) => {
      const strip = activeStrip()
      if (!strip) return
      const idx = strip.state.panels.findIndex((p) => p.id === data.panelId)
      if (idx >= 0 && idx !== strip.state.focusedIndex) strip.actions.jumpTo(idx)
    })

    window.api.onBrowserUrlChanged((data) => {
      const strip = activeStrip()
      if (!strip) return
      batch(() => {
        strip.actions.setPanelUrl(data.panelId, data.url)
        strip.actions.setPanelNavState(data.panelId, data.canGoBack, data.canGoForward)
      })
    })

    window.api.onBrowserTitleChanged((data) => {
      activeStrip()?.actions.setPanelTitle(data.panelId, data.title)
    })

    window.api.onBrowserOpenUrl((data) => {
      const strip = activeStrip()
      if (!strip) return
      const panel = strip.actions.addPanel('browser', data.url)
      window.api.createBrowserPanel(panel.id, data.url)
    })

    window.api.onPanelClosed((data) => {
      activeStrip()?.actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    // Load projects from persistence
    const { projects, activeProjectId } = await window.api.listProjects()
    batch(() => {
      appStore.actions.loadProjects(projects, activeProjectId)
      activeStrip()?.actions.setViewport(window.innerWidth, window.innerHeight)
    })
  })

  const strip = () => activeStrip()
  const sidebarWidth = () => appStore.state.sidebarWidth

  const layout = () => {
    const s = strip()
    if (!s) return []
    return computeLayout({
      panels: [...s.state.panels],
      scrollOffset: s.state.scrollOffset,
      viewportWidth: s.state.viewportWidth,
      viewportHeight: s.state.viewportHeight,
      sidebarWidth: sidebarWidth()
    })
  }

  const maxScroll = () => {
    const s = strip()
    if (!s) return 0
    return computeMaxScroll(s.state.panels.length, s.state.viewportWidth, sidebarWidth())
  }

  const panelChromeHeights = () => {
    const map = new Map<string, number>()
    const s = strip()
    if (!s) return map
    for (const p of s.state.panels) {
      map.set(p.id, p.type === 'browser' ? LAYOUT.PANEL_CHROME_HEIGHT : LAYOUT.TITLE_BAR_HEIGHT)
    }
    return map
  }

  return (
    <>
      <Sidebar
        projects={appStore.state.projects}
        activeProjectId={appStore.state.activeProjectId}
        sidebarWidth={sidebarWidth()}
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        onSwitchProject={(id) => handleSwitchProject(id)}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />
      <Strip
        layout={layout()}
        focusedPanelId={strip()?.state.panels[strip()!.state.focusedIndex]?.id}
        panelChromeHeights={panelChromeHeights()}
      />
      <ScrollIndicators
        scrollOffset={strip()?.state.scrollOffset || 0}
        maxScroll={maxScroll()}
        viewportWidth={strip()?.state.viewportWidth || window.innerWidth}
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        sidebarWidth={sidebarWidth()}
      />
      <HintBar
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        panelCount={strip()?.state.panels.length || 0}
        hasProjects={appStore.state.projects.length > 0}
        sidebarWidth={sidebarWidth()}
      />
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

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: refactor App.tsx for multi-project support"
```

---

## Task 15: Manual integration test

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: ALL PASS.

- [ ] **Step 2: Run dev mode and test manually**

```bash
npm run dev
```

Test the following scenarios:

1. **First launch**: Sidebar visible with "Projects" header and "+ Add Project" button. Strip is empty. Hint bar shows `Cmd+O Add Project`.
2. **Add project**: Press `Cmd+O` or click "+ Add Project". Directory picker opens. Select a directory. Project appears in sidebar as active.
3. **Open terminal**: Press `Cmd+T`. Terminal opens with shell in the project's root directory. Verify with `pwd`.
4. **Add second project**: `Cmd+O` again, select a different directory. Second project appears, becomes active.
5. **Switch projects**: Click first project in sidebar. First project's strip reappears with its terminals still running. Click back to second project.
6. **Keyboard switching**: `Cmd+Shift+1` jumps to first project, `Cmd+Shift+2` jumps to second.
7. **Remove project**: Right-click a project, click "Remove Project". Project disappears, panels are destroyed.
8. **Sidebar width**: Add a project with a long directory name. Sidebar width should grow. Remove it. Sidebar should shrink.
9. **Window resize**: Resize the window. Panels reflow correctly, sidebar stays fixed width.
10. **Hint bar**: With projects, hints include "Switch Project". Without projects, just "Add Project".

- [ ] **Step 3: Fix any issues found**

Address bugs discovered during manual testing.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "Phase 3: Sidebar with multi-project support"
```
