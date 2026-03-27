# Worktree PR Status Icons

Replace the static git-branch icon in the sidebar with a pull-request icon whose color reflects the PR state of each worktree's branch. If no PR exists, show no icon.

## Motivation

The sidebar currently shows a colored git-branch icon for every row regardless of PR state. Surfacing PR status at a glance removes the need to check GitHub manually and gives immediate visual feedback on where each branch stands.

## Behavior

| PR state | Icon | Color |
|----------|------|-------|
| No PR | None (no icon) | -- |
| Draft | Pull-request | `#8b949e` (muted gray) |
| Open | Pull-request | `#3fb950` (green) |
| Merged | Pull-request | `#a371f7` (purple) |

- Closed-without-merge PRs are treated as "no PR" (no icon).
- If multiple PRs exist for a branch, the most recent one wins.

## Architecture

### New module: `src/main/pr-status.ts`

Responsible for shelling out to `gh` and returning structured PR status data.

**`ghAvailable(): Promise<boolean>`** -- Spawns `gh --version` once at startup and caches the boolean result. All other functions short-circuit to empty results if `gh` is unavailable.

**`fetchPrStatuses(projectPath: string): Promise<Map<string, PrStatus>>`** -- Runs:

```
gh pr list --json headRefName,state,isDraft,updatedAt --state all --limit 100
```

The `--state all` flag includes open, closed, and merged PRs. The function:

1. Parses the JSON output into an array of PR objects.
2. Filters out closed-without-merge PRs (`state === 'CLOSED'`).
3. Groups remaining PRs by `headRefName`.
4. For each branch, selects the most recent PR (by `updatedAt`).
5. Maps state: `isDraft: true` -> `'draft'`, `state: 'MERGED'` -> `'merged'`, `state: 'OPEN'` and not draft -> `'open'`.
6. Returns `Map<branchName, 'draft' | 'open' | 'merged'>`.

The command is run with `cwd` set to the project path so `gh` resolves the correct repo automatically (no need to parse the remote URL).

### Data model

Add an ephemeral (non-persisted) field to the `Row` interface in `src/shared/types.ts`:

```ts
export interface Row {
  // ... existing fields
  prStatus?: 'draft' | 'open' | 'merged'
}
```

This field is not saved to electron-store. It exists only in the renderer's runtime state. The project-store persistence layer must strip `prStatus` when serializing rows (or simply omit it, since `undefined` fields are dropped by `JSON.stringify`).

### IPC channel: `row:check-pr-status`

**Direction:** renderer -> main (invoke)

**Request:** `{ projectId: string }`

**Response:** `{ updates: { rowId: string; prStatus: 'draft' | 'open' | 'merged' | undefined }[] }`

The handler:

1. Looks up the project's path and rows from the store.
2. Calls `fetchPrStatuses(projectPath)`.
3. Matches each row's `branch` against the returned map.
4. Returns the list of updates.

If `gh` is unavailable, returns `{ updates: [] }` (no changes, existing icons stay as-is -- which on first load means no icons).

### Store action

New action in `src/renderer/src/store/app.ts`:

**`updatePrStatuses(projectId: string, updates: { rowId: string; prStatus: PrStatus | undefined }[])`** -- Batch-updates `prStatus` on matching rows.

### Polling

In `App.tsx`, add a polling mechanism alongside the existing branch-check interval:

- **Interval:** 15 seconds.
- **Start on window focus:** `window.addEventListener('focus', ...)` starts the interval and fires one immediate check.
- **Stop on window blur:** `window.addEventListener('blur', ...)` clears the interval.
- **Scope:** Polls for the active project only.
- **Cleanup:** `onCleanup` clears the interval when the component unmounts.

### Sidebar rendering

In `Sidebar.tsx`, replace the `<GitBranch>` icon with conditional rendering:

- If `row.prStatus` is defined, render a `<PullRequest>` inline SVG component at 14x14, colored per the table above.
- If `row.prStatus` is undefined, render nothing (no icon).

The `PullRequest` SVG component follows the same pattern as the existing `GitBranch` component -- a simple inline SVG with `size` and `color` props.

The `GitBranch` component can be removed if it has no other usages.

## Rate limits

`gh pr list` uses the GitHub GraphQL API: 1 point per call, 5,000 points/hour budget. At 15-second intervals, that's 240 points/hour (4.8%). Pausing on blur reduces this further in practice.

## Edge cases

- **`gh` not installed:** `ghAvailable()` returns false, no icons are ever shown, no errors surfaced.
- **`gh` auth expired:** The `gh` command will fail. `fetchPrStatuses` catches the error and returns an empty map. No icons shown.
- **No remote:** `gh pr list` will error. Same handling -- empty map, no icons.
- **Branch has no PR:** Not in the map, `prStatus` stays undefined, no icon.
- **Rapid project switching:** Each poll targets the active project at invocation time. Switching projects mid-poll is harmless; stale results for the old project are simply ignored since the row IDs won't match.

## Files changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `prStatus?` to `Row` |
| `src/main/pr-status.ts` | New module: `ghAvailable`, `fetchPrStatuses` |
| `src/main/index.ts` | Add `row:check-pr-status` IPC handler |
| `src/renderer/src/store/app.ts` | Add `updatePrStatuses` action |
| `src/renderer/src/App.tsx` | Add PR status polling with focus/blur lifecycle |
| `src/renderer/src/components/Sidebar.tsx` | Replace `GitBranch` with conditional `PullRequest` icon |
| `src/preload/index.ts` | Expose `checkPrStatus` IPC call |
