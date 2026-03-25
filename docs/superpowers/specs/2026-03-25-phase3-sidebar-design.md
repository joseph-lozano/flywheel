# Phase 3: Sidebar — Design Spec

Multi-project support via a project tree sidebar.

## Goal

Add a sidebar to Flywheel that lets users manage multiple projects and switch between them. Each project gets its own strip of panels (terminals, browsers). Switching projects is instant — panels stay alive in the background.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | `electron-store` | Right fit for project list + active ID. Simple key-value API, automatic schema migration. |
| Sidebar visibility | Always visible | Avoids layout-shifting complexity of toggle/overlay. Can add collapse later. |
| Sidebar placement | Inside chrome view (Solid.js component) | Tightly coupled to app state. Avoids extra IPC boundaries. |
| Sidebar width | Responsive, max 280px | Auto-sizes to longest project name. No truncation below cap. |
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
interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  terminalFocused: boolean
}
```

Strip stores are stashed on project switch and restored on return. The `Map` is not persisted.

## Architecture

### Store Split

- **App store** (new): `projects[]`, `activeProjectId`, sidebar UI state. Reads/writes `electron-store` for persistence. Owns the `Map<projectId, StripState>`.
- **Strip store** (existing, per-project): `panels[]`, `focusedIndex`, `scrollOffset`, `terminalFocused`. Same interface as today, but instantiated per project.

The app store is the only layer that touches `electron-store`. Strip stores are ephemeral.

### Layout Engine Changes

The layout engine receives a new input: `sidebarWidth`. Panel `x` coordinates shift right by `sidebarWidth`, and the effective viewport width becomes `viewportWidth - sidebarWidth` for panel sizing and scroll calculations.

### IPC Changes

New channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `project:add` | renderer → main | Opens native directory picker. Main creates project in `electron-store`, returns project data. |
| `project:remove` | renderer → main | Removes project from `electron-store`. Main tears down PTYs and panels for that project. |
| `project:switch` | renderer → main | Updates active project ID in `electron-store`. |
| `project:list` | renderer → main (invoke) | Chrome view requests persisted project list on startup. |

Changed channels:

| Channel | Change |
|---------|--------|
| `pty:create` | Accepts `cwd` parameter. Spawns shell in the active project's root instead of `$HOME`. |

### Panel Ownership

Panel IDs are tagged with project ID (e.g., `proj1-panel-3`) so the panel manager can hide/show the correct set when switching projects.

### Main Process Changes

Minimal. The main process:
- Manages `electron-store` reads/writes for project list
- Opens the native directory picker dialog on `project:add`
- Passes `cwd` to `node-pty` on terminal creation
- Hides/shows panel groups on project switch

The main process does not need to know about the sidebar itself — it's entirely within the chrome view.

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

- Sidebar auto-sizes to fit the longest project name
- Maximum width: 280px
- Names that exceed the cap get truncated with `text-overflow: ellipsis`
- Tooltip/popover on hover shows the full name for truncated entries

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
3. Hide all WebContentsViews for the current project (`setVisible(false)`)
4. Update `activeProjectId` in app store and `electron-store`
5. Look up target project's strip state in the map
   - If exists: restore strip store, show its panels, restore scroll position and focus
   - If doesn't exist (first visit): create fresh empty strip store, no panels
6. Sidebar updates active indicator

What stays alive in the background:
- PTYs keep running (processes don't stop)
- Browser panels keep their loaded pages in memory
- Terminal scrollback is preserved
- Scroll position and focus are restored on return

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

## New Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+O` | Add project (open directory picker) |

## Deferred

- Editable project names (Phase 5)
- Session restore — persist open panels across app restarts (Phase 5)
- Config-driven auto-launch of terminals/browsers (Phase 5)
- Worktree rows nested under projects (Phase 4)
- Sidebar collapse/minimize
