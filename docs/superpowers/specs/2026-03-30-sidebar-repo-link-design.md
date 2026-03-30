# Sidebar Repo Link

Show a clickable "GitHub" link inline after each project name in the sidebar, opening the repo in a browser pane on the default row.

## Current State

Each project header in the sidebar shows: `[chevron] [project name]`. There's no link to the GitHub repo. The PR status fetcher already calls `gh` per project but doesn't fetch the repo URL.

## Changes

### Data model (`src/shared/types.ts`)

Add `repoUrl?: string` to the `Project` interface. Not persisted to disk — refreshes on poll like `prUrl`.

Add `repoUrl?: string` to `CheckPrStatusResult` so it travels alongside the existing PR status updates.

### Repo URL fetcher (`src/main/pr-status.ts`)

Add a `fetchRepoUrl(projectPath: string): Promise<string | undefined>` function that runs `gh repo view --json url --jq .url`. Returns the URL string or `undefined` if `gh` is unavailable or the project isn't a GitHub repo.

### IPC handler (`src/main/index.ts`)

In the `row:check-pr-status` handler, call `fetchRepoUrl` alongside `fetchPrStatuses`. Return `repoUrl` in the result alongside the existing `updates` array.

Update `CheckPrStatusResult` to include `repoUrl?: string`.

### Store (`src/renderer/src/store/app.ts`)

Add an action to set `repoUrl` on a project. Called from the PR status refresh handler in `App.tsx`.

### Sidebar rendering (`src/renderer/src/components/Sidebar.tsx`)

After the project name `<span>`, render an inline GitHub link when `project.repoUrl` exists:

- Lucide GitHub SVG icon (inlined, 12px) + "GitHub" text label
- Color `#555`, font-size 10px
- Underline on hover
- On click: `stopPropagation`, call a new `onOpenRepoUrl` prop with the URL
- Only shown when `project.repoUrl` is defined

### App.tsx wiring

Add `onOpenRepoUrl` prop to Sidebar. On click, find the project's default row, get its strip, and open the URL in a browser pane via `strip.actions.addPanel("browser", url)` + `window.api.createBrowserPanel(id, url)`.

Store `repoUrl` on the project when PR status results arrive.

## Out of scope

- Persisting `repoUrl` to disk
- Supporting non-GitHub remotes (GitLab, Bitbucket)
- Showing the repo URL as a tooltip
