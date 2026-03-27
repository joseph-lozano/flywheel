# Phase 4: Rows + Worktrees — Design Spec

Multiple rows per project, one visible at a time, for parallel branch work via git worktrees.

## Goal

Add rows to Flywheel so that each project can have multiple independent strips of panels. The default row is the project's main working directory. Additional rows are git worktrees, created instantly via Cmd+N. The sidebar expands from a flat project list to a collapsible tree showing worktree rows under each project. Row switching is instant — panels and processes stay alive in the background.

## Dependencies

- No new npm dependencies. Git CLI (`git worktree` subcommand) is the only external dependency.

## Decisions

| Decision                  | Choice                                         | Rationale                                                                                                                                 |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Row–worktree relationship | Worktree-first with default row                | Default row is the main checkout. Additional rows always create worktrees. Non-git projects get a single row with no ability to add more. |
| Worktree location         | `~/.flywheel/worktrees/<project>/<name>/`      | Centralized, out of the way, doesn't clutter the project directory. Configurable later (Phase 5 config).                                  |
| Worktree base commit      | `origin/HEAD`, fallback to default branch HEAD | Branching from remote HEAD gives the freshest base without needing to pull. Falls back gracefully for repos with no remote.               |
| Row creation UX           | Cmd+N, zero prompts, random name               | Instant creation with `adjective-noun-NNN` name. User renames the branch with `git branch -m` if desired.                                 |
| Sidebar tree              | Colored Lucide git-branch icon per row         | Golden-angle hue spacing for distinct colors. Lucide chevron-down/chevron-right for expand/collapse.                                      |
| Row deletion              | Confirmation with two options                  | "Remove from Flywheel" (sidebar only) vs "Remove and delete from disk" (also runs `git worktree remove`).                                 |
| Worktree discovery        | Manual via right-click menu                    | "Discover Worktrees" runs `git worktree list` and adds found worktrees as rows. Not automatic.                                            |
| Branch rename detection   | Event-driven checks                            | Check on: row switch, window focus, Cmd+N, terminal busy→idle. Match rows by path, update branch name if changed.                         |
| Non-git projects          | Graceful degradation                           | Single default row, no expand/collapse, Cmd+N does nothing. Behaves like Phase 3.                                                         |
| Strip store keying        | By row ID                                      | `stripStores` and `stripSnapshots` maps key on `rowId` instead of `projectId`.                                                            |

## Data Model

### Persisted (electron-store)

```typescript
interface Row {
  id: string; // e.g., "row-abc123"
  projectId: string;
  branch: string; // git branch name, kept in sync
  path: string; // absolute path — default row uses project.path
  color: string; // HSL string from golden-angle generator
  isDefault: boolean; // true for main working directory row
}

interface Project {
  id: string;
  name: string;
  path: string;
  missing?: boolean;
  rows: Row[]; // always has at least one (isDefault: true)
  activeRowId: string; // always points to a valid row
  expanded: boolean; // sidebar expand/collapse state
}
```

When a project is first added, a default row is created automatically:

```typescript
{
  id: generateId(),
  projectId: project.id,
  branch: /* read from git */,
  path: project.path,
  color: goldenAngleColor(0),  // first color in sequence
  isDefault: true
}
```

### In-Memory

```typescript
// One per row, held in Map<rowId, StripState>
interface StripState {
  panels: Panel[];
  focusedIndex: number;
  scrollOffset: number;
  terminalFocused: boolean;
}
```

Panel IDs change from `{projectId}-panel-N` to `{rowId}-panel-N`. Existing prefix-based show/hide/destroy operations work unchanged — just with row ID prefixes instead of project ID prefixes.

## Architecture

### WorktreeManager (new, main process)

Handles all git worktree operations. Isolated from panel/PTY management.

**Responsibilities:**

- Create worktrees: `git worktree add -b <name> <path> <base>`
- Remove worktrees: `git worktree remove <path>`
- List worktrees: `git worktree list --porcelain`
- Resolve base commit: try `origin/HEAD`, fall back to default branch HEAD in the project root
- Generate random names: `adjective-noun-NNN`
- Manage `~/.flywheel/worktrees/` directory structure
- Ensure `~/.flywheel/worktrees/<project>/` directory exists before creating worktrees

**Name generation:**

- Two word lists: ~50 adjectives, ~50 nouns
- Three-digit zero-padded random number
- Example: `brave-eagle-042`, `swift-river-117`, `quiet-pine-803`
- Collision check against existing directory names before creation

### Color Generation

Golden-angle hue rotation for maximally distinct colors:

```typescript
function goldenAngleColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 65%, 65%)`;
}
```

Fixed saturation and lightness tuned for readability on dark backgrounds. Each new row gets the next index in sequence. The default row gets index 0.

### Store Changes

**App store** gains row management:

- `addRow(projectId, row)` — append to project's rows, persist
- `removeRow(projectId, rowId)` — remove from rows, persist. If removed row was active, switch to default row.
- `switchRow(projectId, rowId)` — update `activeRowId`, persist
- `updateBranch(projectId, rowId, newBranch)` — update `row.branch`, persist
- `setExpanded(projectId, expanded)` — toggle sidebar expand/collapse, persist
- `discoverWorktrees(projectId, rows)` — merge discovered rows into project

**Strip store** keying changes:

- `stripStores: Map<rowId, StripState>` (was `Map<projectId, StripState>`)
- `stripSnapshots: Map<rowId, StripSnapshot>` (was `Map<projectId, StripSnapshot>`)
- `findStripByPanelId()` matches on `rowId` prefix (was `projectId`)

### Panel ID Migration

Existing panels use `{projectId}-panel-N`. After Phase 4, all panels use `{rowId}-panel-N`. On first launch after upgrade:

1. For each project, create the default row with a new `rowId`
2. Existing in-memory panels won't exist (app restart), so no panel migration is needed
3. Strip snapshots are ephemeral (in-memory only), so no snapshot migration

This is a clean transition — no persisted panel IDs need updating.

## IPC Changes

### New Channels

| Channel              | Direction                | Payload                              | Purpose                                                                                                                                                                                        |
| -------------------- | ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `row:create`         | renderer → main (invoke) | `{ projectId }`                      | Create worktree + row. Returns `{ row: Row }` or `{ error: string }`.                                                                                                                          |
| `row:remove`         | renderer → main (invoke) | `{ rowId, deleteFromDisk: boolean }` | Remove row. Returns `{ error?: string }`. If `deleteFromDisk`, runs `git worktree remove` — error returned if git refuses (uncommitted changes). Row is still removed from sidebar regardless. |
| `row:discover`       | renderer → main (invoke) | `{ projectId }`                      | Discover existing worktrees via `git worktree list`. Returns `{ rows: Row[] }`.                                                                                                                |
| `row:check-branches` | renderer → main (invoke) | `{ projectId }`                      | Check for branch renames. Returns `{ updates: { rowId: string, branch: string }[] }`.                                                                                                          |

### Changed Channels

| Channel                                         | Change                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pty:create`                                    | No interface change. Renderer now passes `row.path` as `cwd` instead of `project.path`.              |
| `panel:hide-by-prefix` / `panel:show-by-prefix` | No interface change. Prefix is now a `rowId` instead of `projectId`.                                 |
| `project:add`                                   | After creating the project, also creates the default row and returns it as part of the project data. |

### Preload Additions

```typescript
// New methods on window.api
createRow(projectId: string): Promise<{ row: Row } | { error: string }>
removeRow(rowId: string, deleteFromDisk: boolean): Promise<void>
discoverWorktrees(projectId: string): Promise<{ rows: Row[] }>
checkBranches(projectId: string): Promise<{ updates: { rowId: string, branch: string }[] }>
```

## Row Switching Flow

Same pattern as project switching, one level deeper. **Project switching now delegates to row switching** — switching projects means hiding the active row of the old project and showing the active row of the new project. The project-level `hideByPrefix(projectId)` / `showByPrefix(projectId)` calls are replaced by row-level `hideByPrefix(activeRowId)` / `showByPrefix(activeRowId)`.

1. User clicks a row in the sidebar, or presses Cmd+Up/Down
2. Snapshot current row's strip state into `stripSnapshots`
3. Hide current row's panels via `panel:hide-by-prefix(currentRowId)`
4. Update `project.activeRowId` in app store and `electron-store`
5. Look up target row's strip state:
   - If exists: restore strip store, show panels via `panel:show-by-prefix(targetRowId)`, restore scroll position and focus
   - If doesn't exist (first visit): create fresh strip with one terminal panel (cwd = `row.path`)
6. Sidebar updates active row indicator
7. Trigger branch name check (`row:check-branches`)

What stays alive in hidden rows:

- PTYs keep running
- Browser panels keep loaded pages
- Terminal scrollback preserved
- Scroll position and focus restored on return

## Worktree Creation Flow

Triggered by Cmd+N:

1. Validate: project must be a git repo. If not, do nothing (or show brief toast).
2. Generate random name: `adjective-noun-NNN`
3. Resolve base commit:
   - Try `git -C <project.path> rev-parse --verify origin/HEAD`
   - If fails, try `git -C <project.path> rev-parse --verify HEAD`
4. Create directory: `~/.flywheel/worktrees/<project.name>/`
5. Create worktree: `git -C <project.path> worktree add -b <name> ~/.flywheel/worktrees/<project.name>/<name>/ <base>`
6. If git fails, return error (renderer shows toast)
7. Create `Row` object with generated name, path, next golden-angle color
8. Add row to project, set as active, persist
9. Switch to new row (snapshot/restore flow)
10. Auto-create one terminal panel with cwd = new worktree path

## Worktree Discovery Flow

Triggered by right-click → "Discover Worktrees" on a project:

1. Run `git -C <project.path> worktree list --porcelain`
2. Parse output: extract path + branch for each worktree
3. Skip the main worktree (matches `project.path`)
4. Skip any worktrees already tracked in `project.rows`
5. For each new worktree: create a `Row` with discovered branch name, path, next color
6. Add all new rows to project, persist
7. Don't switch — just update the sidebar

## Worktree Removal Flow

Triggered by right-click → "Remove Row" on a worktree row:

1. Show confirmation dialog with two buttons:
   - **"Remove from Flywheel"** — sidebar only
   - **"Remove and delete from disk"** — also deletes worktree
2. On confirm:
   a. Kill all PTYs with `rowId` prefix
   b. Destroy all panels with `rowId` prefix
   c. Remove strip store and snapshot for the row
   d. If `deleteFromDisk`: run `git -C <project.path> worktree remove <row.path>`. If git refuses (uncommitted changes), show error toast — still remove from sidebar.
   e. Remove row from `project.rows`, persist
   f. If removed row was active, switch to default row

The default row (isDefault: true) cannot be removed. The context menu does not show "Remove Row" for the default row.

## Branch Rename Detection

**Triggers:**

- Row switch (step 7 in Row Switching Flow)
- Window focus (`BrowserWindow` `focus` event)
- Cmd+N (after creating new row)
- Terminal busy→idle transition (any terminal in the active project's active row)

**Detection logic:**

1. Run `git -C <project.path> worktree list --porcelain`
2. Parse output into `Map<path, branch>`
3. For each row in `project.rows`:
   - Look up row's path in the parsed map
   - If branch name differs from `row.branch`, emit update
4. Return list of `{ rowId, branch }` updates
5. Renderer updates row labels in app store and sidebar

Rows are matched by `path` (stable identifier), not by branch name (which can change).

## Sidebar Changes

### Tree Structure

The sidebar evolves from a flat project list to an expand/collapse tree:

```
PROJECTS
▼ flywheel-api          ← Lucide chevron-down, click to collapse
  ⎇ main                ← colored Lucide git-branch icon, active (highlighted)
  ⎇ brave-eagle-042     ← different color, dimmed
  ⎇ swift-river-117     ← different color, dimmed
▶ web-client             ← Lucide chevron-right, collapsed
```

**Project header row:**

- Lucide `chevron-down` (expanded) or `chevron-right` (collapsed) icon — click to toggle
- Project name — click to switch to this project (activates its active row)
- Active project: white text. Inactive: dimmed.

**Row entries (when expanded):**

- Lucide `git-branch` icon colored with the row's golden-angle color
- Branch name as text
- Active row: highlighted background + white text
- Inactive rows: dimmed text
- Click to switch to this row (also switches project if different)

**Non-git projects:**

- No expand/collapse chevron
- No row entries
- Behaves like Phase 3 — just a project name in the list

### Context Menus

**Right-click on project:**

- Remove Project (existing)
- Discover Worktrees (new — only shown for git projects)

**Right-click on worktree row:**

- Remove Row (opens two-option confirmation dialog)
- Not shown for the default row

### Sidebar Width

Same responsive logic as Phase 3 (180px–280px clamped to longest name), now considering row branch names as well as project names. Indentation of row entries is accounted for in width calculation.

## Keyboard Shortcuts

### New Shortcuts

| Shortcut | Action                                    |
| -------- | ----------------------------------------- |
| Cmd+N    | Create new worktree row in active project |
| Cmd+Up   | Switch to previous row                    |
| Cmd+Down | Switch to next row                        |

### Changed Shortcuts

| Shortcut    | Was         | Now                          |
| ----------- | ----------- | ---------------------------- |
| Cmd+O       | Add project | _(removed)_                  |
| Cmd+Shift+N | _(unused)_  | Add project (replaces Cmd+O) |

### Unchanged Shortcuts

| Shortcut       | Action                      |
| -------------- | --------------------------- |
| Cmd+Shift+Up   | Previous project            |
| Cmd+Shift+Down | Next project                |
| Cmd+Shift+1-9  | Jump to project by position |

### Shortcut Hierarchy

- `Cmd+<key>` — within current project/row (navigate panels, create row)
- `Cmd+Shift+<key>` — across projects (switch project, add project)

### Hint Bar

The hint bar becomes context-aware for rows:

- Single row (default only): existing hints, no row hints
- Multiple rows: adds `Cmd+↑↓ Switch Row`, `Cmd+N New Worktree`

## Edge Cases

- **Not a git repo**: Cmd+N does nothing. "Discover Worktrees" not shown in context menu.
- **Worktree creation fails**: Git may fail if the branch name already exists, the path already exists, or the repo is in a bad state. Show error toast, no row created.
- **Worktree removal fails**: `git worktree remove` refuses if there are uncommitted changes. Show error toast explaining the issue. Row is still removed from the sidebar (user chose to remove it).
- **Discovered worktree path no longer exists**: Mark the row with a `missing` badge (same pattern as missing projects). User can remove it from the sidebar.
- **Project directory missing on startup**: Existing Phase 3 behavior (missing badge). Rows are loaded from persistence but worktree operations will fail gracefully.
- **Concurrent worktree operations**: Serialize git operations per project to avoid race conditions (e.g., Cmd+N pressed rapidly).

## Deferred

- Vertical scroll gesture for row switching (Phase 6 — requires gesture disambiguation spike)
- Configurable worktree location (Phase 5 — config file)
- Session restore for rows across app restarts (Phase 5)
- Editable project names (Phase 5)
