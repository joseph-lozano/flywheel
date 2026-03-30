# Sidebar PR Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show clickable PR numbers inline in the sidebar next to each row's PR icon, opening the PR in a browser pane on click.

**Architecture:** Add `prUrl` to the `Row` type and `CheckPrStatusResult`. The PR status fetcher adds `url` to the `gh pr list` fields and returns it alongside status. The sidebar extracts the PR number from the URL for display and opens it in a browser panel on click.

**Tech Stack:** TypeScript, SolidJS, Electron IPC, Vitest

---

## File Map

- **Modify:** `src/shared/types.ts` — Add `prUrl` to `Row` and `CheckPrStatusResult`
- **Modify:** `src/main/pr-status.ts` — Add `url` to gh fields, return `{ status, url }` map
- **Modify:** `src/main/index.ts` — Pass `prUrl` through IPC result
- **Modify:** `src/renderer/src/store/app.ts` — Store `prUrl` in `updatePrStatuses`, account for PR number in sidebar width
- **Modify:** `src/renderer/src/components/Sidebar.tsx` — Render `#N`, handle click to open browser pane
- **Modify:** `tests/main/pr-status.test.ts` — Update tests for new return type

---

### Task 1: Update types

**Files:**

- Modify: `src/shared/types.ts:22-31` (Row interface)
- Modify: `src/shared/types.ts:82-84` (CheckPrStatusResult)

- [ ] **Step 1: Add `prUrl` to `Row` interface**

In `src/shared/types.ts`, add `prUrl` after `prStatus`:

```typescript
export interface Row {
  id: string;
  projectId: string;
  branch: string;
  path: string;
  color: string;
  isDefault: boolean;
  prStatus?: PrStatus;
  prUrl?: string;
}
```

- [ ] **Step 2: Add `prUrl` to `CheckPrStatusResult.updates`**

In `src/shared/types.ts`, update the result type:

```typescript
export interface CheckPrStatusResult {
  updates: { rowId: string; prStatus: PrStatus | undefined; prUrl: string | undefined }[];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add prUrl to Row and CheckPrStatusResult types"
```

---

### Task 2: Update PR status fetcher to return URLs

**Files:**

- Modify: `src/main/pr-status.ts`
- Modify: `tests/main/pr-status.test.ts`

- [ ] **Step 1: Update existing tests to expect `{ status, url }` tuples**

In `tests/main/pr-status.test.ts`, update the test data to include `url` fields and change assertions to check the new return type. The `fetchPrStatuses` return type changes from `Map<string, PrStatus>` to `Map<string, { status: PrStatus; url: string }>`.

Update the mock data in each test to include the `url` field. For example, the "maps open PR to open status" test:

```typescript
it("maps open PR to open status with url", async () => {
  mockExecFile.mockImplementation(
    (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
      const callback = (cb ?? _optsOrCb) as ExecFileCallback;
      if (Array.isArray(args) && args.includes("--version")) {
        callback(null, "gh version 2.40.0\n");
        return;
      }
      callback(
        null,
        JSON.stringify([
          {
            headRefName: "feat-a",
            state: "OPEN",
            isDraft: false,
            updatedAt: "2026-03-26T00:00:00Z",
            url: "https://github.com/owner/repo/pull/42",
          },
        ]),
      );
    },
  );
  const prStatus = createPrStatus();
  const result = await prStatus.fetchPrStatuses("/test/project");
  expect(result.get("feat-a")).toEqual({
    status: "open",
    url: "https://github.com/owner/repo/pull/42",
  });
});
```

Apply the same pattern to all other `fetchPrStatuses` tests:

- "maps draft PR to draft status" — add `url: "https://github.com/owner/repo/pull/43"`, assert `toEqual({ status: "draft", url: "..." })`
- "maps merged PR to merged status" — add `url: "https://github.com/owner/repo/pull/44"`, assert `toEqual({ status: "merged", url: "..." })`
- "maps closed PR to closed status" — add `url: "https://github.com/owner/repo/pull/45"`, assert `toEqual({ status: "closed", url: "..." })`
- "maps closed draft PR to closed status" — add `url: "https://github.com/owner/repo/pull/46"`, assert `toEqual({ status: "closed", url: "..." })`
- "picks most recent PR when multiple exist for same branch" — add `url` to both entries (older: `".../pull/10"`, newer: `".../pull/11"`), assert `toEqual({ status: "open", url: "https://github.com/owner/repo/pull/11" })`
- "returns empty map when gh command fails" and "returns empty map when gh is unavailable" — no changes needed (they check `result.size === 0`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/main/pr-status.test.ts`
Expected: Tests fail because `fetchPrStatuses` still returns `Map<string, PrStatus>` instead of `Map<string, { status, url }>`.

- [ ] **Step 3: Update `GhPrEntry` interface and `fetchPrStatuses` implementation**

In `src/main/pr-status.ts`:

Update the interface to include `url`:

```typescript
interface GhPrEntry {
  headRefName: string;
  state: string;
  isDraft: boolean;
  updatedAt: string;
  url: string;
}
```

Update the `--json` fields to include `url`:

```typescript
        [
          "pr",
          "list",
          "--json",
          "headRefName,state,isDraft,updatedAt,url",
          "--state",
          "all",
          "--limit",
          "100",
        ],
```

Change the return type and result construction. Replace the entire result-building block (from `const result = new Map...` to the end of the loop) with:

```typescript
const result = new Map<string, { status: PrStatus; url: string }>();
for (const [branch, pr] of byBranch) {
  let status: PrStatus;
  if (pr.state === "MERGED") {
    status = "merged";
  } else if (pr.state === "CLOSED") {
    status = "closed";
  } else if (pr.isDraft) {
    status = "draft";
  } else {
    status = "open";
  }
  result.set(branch, { status, url: pr.url });
}
resolve(result);
```

Update the function signature return type:

```typescript
  async function fetchPrStatuses(
    projectPath: string,
  ): Promise<Map<string, { status: PrStatus; url: string }>> {
```

Also update the early returns for unavailable/error cases to `new Map<string, { status: PrStatus; url: string }>()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/main/pr-status.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/pr-status.ts tests/main/pr-status.test.ts
git commit -m "feat: include PR URL in fetchPrStatuses results"
```

---

### Task 3: Update IPC handler to pass `prUrl`

**Files:**

- Modify: `src/main/index.ts:468-479`

- [ ] **Step 1: Update the `row:check-pr-status` handler**

In `src/main/index.ts`, the handler at line 468 currently reads:

```typescript
ipcMain.handle("row:check-pr-status", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { updates: [] };

  const statuses = await prStatusChecker.fetchPrStatuses(project.path);
  const updates = project.rows.map((row) => ({
    rowId: row.id,
    prStatus: statuses.get(row.branch),
  }));

  return { updates };
});
```

Replace with:

```typescript
ipcMain.handle("row:check-pr-status", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { updates: [] };

  const statuses = await prStatusChecker.fetchPrStatuses(project.path);
  const updates = project.rows.map((row) => {
    const pr = statuses.get(row.branch);
    return {
      rowId: row.id,
      prStatus: pr?.status,
      prUrl: pr?.url,
    };
  });

  return { updates };
});
```

- [ ] **Step 2: Run lint to check**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: pass prUrl through IPC in check-pr-status handler"
```

---

### Task 4: Update store to persist `prUrl`

**Files:**

- Modify: `src/renderer/src/store/app.ts:106-121`

- [ ] **Step 1: Update `updatePrStatuses` action signature and implementation**

In `src/renderer/src/store/app.ts`, replace the `updatePrStatuses` action:

```typescript
    updatePrStatuses(
      projectId: string,
      updates: { rowId: string; prStatus: PrStatus | undefined; prUrl: string | undefined }[],
    ): void {
      const updateMap = new Map(updates.map((u) => [u.rowId, u] as const));
      for (const [rowId, update] of updateMap) {
        setState(
          "projects",
          (p) => p.id === projectId,
          "rows",
          (r) => r.id === rowId,
          "prStatus",
          update.prStatus,
        );
        setState(
          "projects",
          (p) => p.id === projectId,
          "rows",
          (r) => r.id === rowId,
          "prUrl",
          update.prUrl,
        );
      }
    },
```

- [ ] **Step 2: Account for PR number in sidebar width calculation**

In `src/renderer/src/store/app.ts`, update `computeSidebarWidth`. The current row length calculation is:

```typescript
longestName = Math.max(longestName, r.branch.length + 3);
```

Change to account for PR number (e.g. `#42` = 3 chars + 1 space = 4 extra chars):

```typescript
const prExtra = r.prUrl ? 5 : 0;
longestName = Math.max(longestName, r.branch.length + 3 + prExtra);
```

The `5` accounts for a space + `#` + up to 3-digit number. This is approximate (matching the existing heuristic style).

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/app.ts
git commit -m "feat: store prUrl and account for PR number in sidebar width"
```

---

### Task 5: Render PR number in sidebar with click-to-open

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx:69-85` (props interface)
- Modify: `src/renderer/src/components/Sidebar.tsx:265-286` (row rendering)

- [ ] **Step 1: Add `onOpenPrUrl` callback to `SidebarProps`**

In `src/renderer/src/components/Sidebar.tsx`, add the new prop:

```typescript
interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  sidebarWidth: number;
  viewportHeight: number;
  onSwitchProject: (id: string) => void;
  onSwitchRow: (projectId: string, rowId: string) => void;
  onAddProject: () => void;
  onRemoveProject: (id: string, deleteWorktrees: boolean) => void;
  onToggleExpanded: (projectId: string) => void;
  onCreateRow: (projectId: string) => void;
  onRemoveRow: (rowId: string, deleteFromDisk: boolean) => void;
  onDiscoverWorktrees: (projectId: string) => void;
  onOpenPrUrl?: (url: string) => void;
  onModalShow?: () => void;
  onModalHide?: () => void;
  onBlurPanels?: () => void;
}
```

- [ ] **Step 2: Add PR number rendering between the icon and branch name**

In `src/renderer/src/components/Sidebar.tsx`, replace the block from the `<Show when={row.prStatus}` (line 265) through the closing `</span>` for the branch name (line 286) with:

```tsx
                          <Show
                            when={row.prStatus}
                            fallback={
                              <Show when={row.isDefault}>
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                  <circle
                                    cx="5"
                                    cy="5"
                                    r="4"
                                    fill={isActiveRow() ? "#e0e0e0" : "#666"}
                                  />
                                </svg>
                              </Show>
                            }
                          >
                            <PullRequest
                              color={row.prStatus ? PR_STATUS_COLORS[row.prStatus] : undefined}
                            />
                            <Show when={row.prUrl}>
                              <span
                                style={{
                                  color: row.prStatus
                                    ? PR_STATUS_COLORS[row.prStatus]
                                    : undefined,
                                  "font-size": "11px",
                                  "font-weight": "600",
                                  cursor: "pointer",
                                  "text-decoration": "none",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.textDecoration = "underline";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.textDecoration = "none";
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onOpenPrUrl?.(row.prUrl!);
                                }}
                              >
                                #{row.prUrl!.split("/").pop()}
                              </span>
                            </Show>
                          </Show>
                          <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>
                            {row.branch}
                          </span>
```

- [ ] **Step 3: Wire up `onOpenPrUrl` in App.tsx**

In `src/renderer/src/App.tsx`, find the `<Sidebar` JSX (around line 862) and add the new prop after the existing props. Add it near the other `on*` handlers:

```tsx
        onOpenPrUrl={(url) => {
          const s = activeStrip();
          if (s) {
            const panel = s.actions.addPanel("browser", url);
            window.api.createBrowserPanel(panel.id, url);
          }
        }}
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat: show clickable PR number in sidebar rows"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Build and run dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify PR numbers appear**

Open a project with branches that have open PRs. Verify:

- PR number shows as `#N` between the icon and branch name
- Color matches the PR status (green for open, gray for draft, purple for merged, red for closed)
- Rows without PRs show no number
- Sidebar width accommodates the extra text without truncating branch names

- [ ] **Step 3: Verify click opens browser pane**

Click a PR number in the sidebar. Verify:

- A new browser panel opens with the GitHub PR page
- Clicking the number does NOT also switch the active row
- The browser panel loads correctly
