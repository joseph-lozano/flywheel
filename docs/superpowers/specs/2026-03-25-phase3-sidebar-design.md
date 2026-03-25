# Phase 3: Sidebar — Design Spec

Multi-project support via a project tree sidebar.

## Goal

Add a sidebar to Flywheel that lets users manage multiple projects and switch between them. Each project gets its own strip of panels (terminals, browsers). Switching projects is instant — panels stay alive in the background.

## Dependencies

- `electron-store` — new dependency for persisting project list and active project ID.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | `electron-store` | Right fit for project list + active ID. Simple key-value API, automatic schema migration. |
| Sidebar visibility | Always visible | Avoids layout-shifting complexity of toggle/overlay. Can add collapse later. |
| Sidebar placement | Inside chrome view (Solid.js component) | Tightly coupled to app state. Avoids extra IPC boundaries. |
| Sidebar width | Responsive, min 180px, max 280px | Auto-sizes to longest project name via CSS `max-content` clamped between min/max. Recalculates reactively when project list changes. |
| Project list | Flat list | Ready for one level of nesting (worktrees in Phase 4). No deep tree. |
| Strip state | Per-project, in-memory | Ephemeral — dies with app session. Session restore deferred to Phase 5. |
| Project switching | Hide/show WebContentsViews | No teardown, no reload. PTYs and browsers stay alive. |
| Add projects | Manual via directory picker | No auto-discovery. `Cmd+Shift+O` shortcut or sidebar button. |
| First visit to project | Empty strip | User opens terminals with `Cmd+T`. Auto-launch config deferred to Phase 5. |

## Data Model

### Persisted (electron-store)

```typescript
interface Project {
  id: string       // uuid
  name: string     // directory basename
  path: string     // absolute path
}

interface PersistedState {
  projects: Project[]
  activeProjectId: string | null
}
```

### In-Memory

```typescript
// One per project, held in Map<projectId, StripState>
// viewportWidth and viewportHeight are shared across all projects (not stashed per-project)
interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  terminalFocused: boolean
}
```

Strip stores are stashed on project switch and restored on return. The `Map` is not persisted. Viewport dimensions are global — set once on the shared store and not snapshotted per project.

## Architecture

### Store Split

- **App store** (new): `projects[]`, `activeProjectId`, `activeProjectPath`, sidebar UI state. Reads/writes `electron-store` for persistence. Owns the `Map<projectId, StripState>`.
- **Strip store** (existing, per-project): `panels[]`, `focusedIndex`, `scrollOffset`, `terminalFocused`. Same interface as today, but instantiated per project.

The app store is the only layer that touches `electron-store`. Strip stores are ephemeral.

### Panel ID Generation

Each `createStripStore` instance accepts a `projectId` parameter. Panel IDs are generated as `${projectId}-panel-${nextId}` (e.g., `abc123-panel-1`). This ensures uniqueness across projects since the main process `PanelManager` holds a flat `Map<string, ManagedPanel>`. Each per-project strip store has its own `nextId` counter.

### Layout Engine Changes

`LayoutInput` gains a `sidebarWidth` field (default 0). All layout functions (`computeLayout`, `computeMaxScroll`, `computeScrollToCenter`, `findMostCenteredPanel`) use `effectiveWidth = viewportWidth - sidebarWidth` for panel sizing and scroll calculations. `computeLayout` adds `sidebarWidth` to panel `x` coordinates so panels are positioned to the right of the sidebar.

### IPC Changes

New channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `project:add` | renderer → main (invoke) | Opens native directory picker. Main validates the path, creates project in `electron-store`, returns project data. Rejects duplicate directories. |
| `project:remove` | renderer → main | Removes project from `electron-store`. Main tears down PTYs and panels for that project. |
| `project:switch` | renderer → main | Updates active project ID in `electron-store`. |
| `project:list` | renderer → main (invoke) | Chrome view requests persisted project list on startup. |

Changed channels:

| Channel | Change |
|---------|--------|
| `pty:create` | Accepts `{ panelId, cwd }`. The renderer sends `cwd: activeProjectPath` from the app store. `PtyManager.create(panelId, cwd)` passes `cwd` to `node-pty` spawn options. Falls back to `$HOME` if `cwd` is not provided. |

### Panel Manager Changes

`PanelManager` gains two new methods:

- `hideByPrefix(prefix: string)` — hides all panels whose ID starts with the given project ID prefix.
- `showByPrefix(prefix: string)` — shows all panels whose ID starts with the given project ID prefix.

These replace the use of `hideAll()` / `showAll()` during project switching. The existing `hideAll()` / `showAll()` remain for the confirm dialog flow.

### Main Process Changes

- Manages `electron-store` reads/writes for project list
- Opens the native directory picker dialog on `project:add`
- Passes `cwd` to `node-pty` on terminal creation
- Hides/shows panel groups by project ID prefix on project switch
- `Cmd+Shift+O` is added to the Electron application menu under a new "Projects" submenu, forwarded via `shortcut:action` to the chrome view (consistent with existing shortcut pattern)

The main process does not need to know about the sidebar itself — it's entirely within the chrome view.

### Startup Change

The existing `onMount` in `App.tsx` auto-creates a terminal on launch. This is removed. On startup:
1. Load project list from `electron-store` via `project:list`
2. If an active project exists, restore its (empty) strip — no auto-created panels
3. If no projects exist, show the first-launch empty state

## Sidebar UI

### Component

A Solid.js component rendered inside the chrome view's `App.tsx`, positioned as a left column alongside the existing strip.

### Header

Layers/stack SVG icon + "Projects" in title case, styled in the app's accent color (#6366f1).

### Project List

- Flat list of project names (directory basenames)
- Active project: left accent border + highlighted background
- Inactive projects: dimmed text, no border
- Click to switch projects
- Right-click context menu for remove

### Responsive Width

- Sidebar auto-sizes to fit the longest project name (CSS `max-content` clamped)
- Minimum width: 180px
- Maximum width: 280px
- Names that exceed the cap get truncated with `text-overflow: ellipsis`
- Tooltip/popover on hover shows the full name for truncated entries
- Width recalculates reactively when projects are added/removed

### Add Project

- Pinned at bottom of sidebar
- Subtle top border separating it from the project list
- Click opens native directory picker
- Keyboard shortcut: `Cmd+Shift+O`

### Remove Project

- Right-click context menu on project name
- Kills all PTYs for that project
- Destroys all panels for that project
- Removes from `electron-store`
- If removed project was active, switch to the next project (or empty state if none remain)

## Project Switching Flow

1. User clicks a project in the sidebar
2. Snapshot current strip store state into `Map<projectId, StripState>`
3. Hide current project's panels via `PanelManager.hideByPrefix(currentProjectId)`
4. Update `activeProjectId` in app store and `electron-store`
5. Look up target project's strip state in the map
   - If exists: restore strip store, show its panels via `PanelManager.showByPrefix(targetProjectId)`, restore scroll position and focus
   - If doesn't exist (first visit): create fresh empty strip store, no panels
6. Sidebar updates active indicator

What stays alive in the background:
- PTYs keep running (processes don't stop)
- Browser panels keep their loaded pages in memory
- Terminal scrollback is preserved
- Scroll position and focus are restored on return

## Edge Cases

- **Duplicate directory**: If the user tries to add a project whose path is already in the list, the add is rejected (directory picker closes, no duplicate created).
- **Missing directory on startup**: If a persisted project path no longer exists on disk, show a warning badge on that project in the sidebar. The user can still select it (strip will be empty) or remove it.
- **Permission error**: If the selected directory is not readable, surface an error to the user and don't add it.

## Empty States

### First Launch (no projects)

- Sidebar shows header and "+ Add Project" button only
- Strip area is empty
- Hint bar shows `Cmd+Shift+O Add Project`

### Project with No Panels

- Sidebar shows project as active
- Strip area is blank
- Hint bar shows `Cmd+T New Terminal`, `Cmd+B New Browser`

### All Projects Removed

- Returns to first-launch state

### Hint Bar Context

The `HintBar` component becomes context-aware. It receives state (`hasProjects`, `hasPanels`) and renders different hint sets:
- No projects: `Cmd+Shift+O Add Project`
- Project active, no panels: `Cmd+T New Terminal`, `Cmd+B New Browser`
- Project active, has panels: existing hints (navigate, close, move, etc.)

## New Keyboard Shortcuts

| Shortcut | Action | Registration |
|----------|--------|-------------|
| `Cmd+Shift+O` | Add project (open directory picker) | Electron menu → "Projects" submenu, forwarded via `shortcut:action` |

Keyboard shortcut for switching between projects is deferred — mouse-click switching is sufficient for Phase 3. Phase 4 adds `Cmd+Up/Down` for row switching; project switching shortcuts can be designed alongside that.

## Existing Code Changes

- **`placeholder` panel type**: Left as-is. Not removed in Phase 3. It's unused in practice but removing it is unrelated cleanup.

## Deferred

- Editable project names (Phase 5)
- Session restore — persist open panels across app restarts (Phase 5)
- Config-driven auto-launch of terminals/browsers (Phase 5)
- Worktree rows nested under projects (Phase 4)
- Sidebar collapse/minimize
- Keyboard shortcut for project switching
