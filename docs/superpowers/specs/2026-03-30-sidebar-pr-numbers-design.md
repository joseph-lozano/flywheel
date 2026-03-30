# Sidebar PR Numbers

Show the PR number inline in the sidebar next to each row's PR icon, and make it clickable to open the PR in a browser pane.

## Current State

Each sidebar row displays: `[PR icon] [branch name]`. The PR icon is colored by status (draft/open/merged/closed) but there's no PR number shown. PR data comes from `gh pr list` via the `prStatus` field on `Row`.

## Changes

### Data model

Add `prUrl?: string` to the `Row` interface. The PR number is extracted from the URL for display (last path segment of `https://github.com/{owner}/{repo}/pull/{number}`).

Update `CheckPrStatusResult.updates` to include `prUrl: string | undefined` alongside the existing `prStatus`.

### PR status fetcher (`src/main/pr-status.ts`)

Add `url` to the `gh pr list --json` fields. Return a map of `branch → { status, url }` instead of `branch → status`.

### IPC handler (`src/main/index.ts`)

Pass `prUrl` through in the `CheckPrStatusResult` updates alongside `prStatus`.

### Store (`src/renderer/src/store/app.ts`)

Update `updatePrStatuses` action to also set `row.prUrl` from the update payload.

### Sidebar rendering (`src/renderer/src/components/Sidebar.tsx`)

Between the PR icon and branch name, render the PR number:

- Extract number from `row.prUrl` (parse last path segment)
- Display as `#N` in the PR status color, matching the icon
- Always visible when a PR exists (no hover-only behavior)
- On click: open the PR URL in a new browser panel on the active row's strip via `strip.actions.addPanel("browser", url)` + `window.api.createBrowserPanel(id, url)`
- `stopPropagation` on the click to avoid triggering row switch
- Subtle underline on hover to indicate clickability

### Sidebar width

The existing dynamic width calculation accounts for content length. Adding `#NNN` (4-5 chars) per row may push some rows wider. The max sidebar width is 280px — verify this still fits comfortably with typical branch names. If needed, bump the max slightly.

## Out of scope

- Persisting `prUrl` to disk (it refreshes on poll like `prStatus`)
- Opening PRs in external browser (always uses in-app browser pane)
- PR title tooltips or other PR metadata display
