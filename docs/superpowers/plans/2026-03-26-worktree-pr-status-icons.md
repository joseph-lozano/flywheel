# Worktree PR Status Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a colored pull-request icon next to each worktree row in the sidebar, reflecting the PR state of that branch on GitHub.

**Architecture:** A new `pr-status.ts` module in the main process shells out to `gh pr list` to batch-fetch PR statuses for all branches. The renderer polls this via IPC every 15s while focused, pausing on blur. The sidebar replaces the static git-branch icon with a conditional PR icon colored by state.

**Tech Stack:** Electron IPC, `child_process.execFile` (gh CLI), Solid.js, Vitest

---

## File Structure

| File                                      | Role                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/pr-status.ts`                   | **New.** `ghAvailable()` and `fetchPrStatuses()` — shells out to `gh`                          |
| `tests/main/pr-status.test.ts`            | **New.** Unit tests for PR status module                                                       |
| `src/shared/types.ts`                     | **Modify.** Add `prStatus?` to `Row` interface, add `PrStatus` type, add `CheckPrStatusResult` |
| `src/main/index.ts`                       | **Modify.** Add `row:check-pr-status` IPC handler                                              |
| `src/preload/index.ts`                    | **Modify.** Expose `checkPrStatus` bridge method                                               |
| `src/renderer/src/store/app.ts`           | **Modify.** Add `updatePrStatuses` action                                                      |
| `tests/store/app.test.ts`                 | **Modify.** Add tests for `updatePrStatuses`                                                   |
| `src/renderer/src/App.tsx`                | **Modify.** Add PR status polling with focus/blur lifecycle                                    |
| `src/renderer/src/components/Sidebar.tsx` | **Modify.** Replace `GitBranch` with conditional `PullRequest` icon                            |

---

### Task 1: Add types

**Files:**

- Modify: `src/shared/types.ts:21-28` (Row interface)
- Modify: `src/shared/types.ts:72` (after CheckBranchesResult)

- [ ] **Step 1: Add PrStatus type and update Row interface**

In `src/shared/types.ts`, add the `PrStatus` type alias before the `Row` interface, then add `prStatus?` to `Row`, and add `CheckPrStatusResult` after the existing result types:

```ts
// Add before the Row interface (before line 21)
export type PrStatus = "draft" | "open" | "merged" | "closed";

// Add to the Row interface (after isDefault)
export interface Row {
  id: string;
  projectId: string;
  branch: string;
  path: string;
  color: string;
  isDefault: boolean;
  prStatus?: PrStatus;
}

// Add after CheckBranchesResult (after line 72)
export type CheckPrStatusResult = { updates: { rowId: string; prStatus: PrStatus | undefined }[] };
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (prStatus is optional, existing code unaffected)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add PrStatus type and prStatus field to Row"
```

---

### Task 2: PR status fetcher module with tests

**Files:**

- Create: `src/main/pr-status.ts`
- Create: `tests/main/pr-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/pr-status.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecFile = vi.fn();
vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { createPrStatus } from "../../src/main/pr-status";

describe("createPrStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ghAvailable", () => {
    it("returns true when gh is installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
        cb(null, "gh version 2.40.0\n");
      });
      const prStatus = createPrStatus();
      expect(await prStatus.ghAvailable()).toBe(true);
    });

    it("returns false when gh is not installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
        cb(new Error("command not found"));
      });
      const prStatus = createPrStatus();
      expect(await prStatus.ghAvailable()).toBe(false);
    });

    it("caches the result after first call", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
        cb(null, "gh version 2.40.0\n");
      });
      const prStatus = createPrStatus();
      await prStatus.ghAvailable();
      await prStatus.ghAvailable();
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchPrStatuses", () => {
    it("returns empty map when gh is unavailable", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = cb || _optsOrCb;
          (callback as Function)(new Error("not found"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.size).toBe(0);
    });

    it("maps open PR to open status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
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
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-a")).toBe("open");
    });

    it("maps draft PR to draft status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-b",
                state: "OPEN",
                isDraft: true,
                updatedAt: "2026-03-26T00:00:00Z",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-b")).toBe("draft");
    });

    it("maps merged PR to merged status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-c",
                state: "MERGED",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-c")).toBe("merged");
    });

    it("maps closed PR to closed status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-d",
                state: "CLOSED",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-d")).toBe("closed");
    });

    it("picks most recent PR when multiple exist for same branch", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-e",
                state: "CLOSED",
                isDraft: false,
                updatedAt: "2026-03-25T00:00:00Z",
              },
              {
                headRefName: "feat-e",
                state: "OPEN",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-e")).toBe("open");
    });

    it("returns empty map when gh command fails", async () => {
      let callCount = 0;
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: Function) => {
          const callback = (cb || _optsOrCb) as Function;
          callCount++;
          if (callCount === 1) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(new Error("auth required"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.size).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/pr-status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/main/pr-status.ts`:

```ts
import { execFile } from "child_process";
import type { PrStatus } from "../shared/types";

interface GhPrEntry {
  headRefName: string;
  state: string;
  isDraft: boolean;
  updatedAt: string;
}

export function createPrStatus() {
  let ghCheck: boolean | null = null;

  async function ghAvailable(): Promise<boolean> {
    if (ghCheck !== null) return ghCheck;
    return new Promise((resolve) => {
      execFile("gh", ["--version"], (err) => {
        ghCheck = !err;
        resolve(ghCheck);
      });
    });
  }

  async function fetchPrStatuses(projectPath: string): Promise<Map<string, PrStatus>> {
    const available = await ghAvailable();
    if (!available) return new Map();

    return new Promise((resolve) => {
      execFile(
        "gh",
        [
          "pr",
          "list",
          "--json",
          "headRefName,state,isDraft,updatedAt",
          "--state",
          "all",
          "--limit",
          "100",
        ],
        { cwd: projectPath },
        (err, stdout) => {
          if (err) {
            resolve(new Map());
            return;
          }

          try {
            const prs: GhPrEntry[] = JSON.parse(stdout);
            const byBranch = new Map<string, GhPrEntry>();

            for (const pr of prs) {
              const existing = byBranch.get(pr.headRefName);
              if (!existing || pr.updatedAt > existing.updatedAt) {
                byBranch.set(pr.headRefName, pr);
              }
            }

            const result = new Map<string, PrStatus>();
            for (const [branch, pr] of byBranch) {
              if (pr.isDraft) {
                result.set(branch, "draft");
              } else if (pr.state === "MERGED") {
                result.set(branch, "merged");
              } else if (pr.state === "CLOSED") {
                result.set(branch, "closed");
              } else {
                result.set(branch, "open");
              }
            }
            resolve(result);
          } catch {
            resolve(new Map());
          }
        },
      );
    });
  }

  return { ghAvailable, fetchPrStatuses };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/pr-status.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pr-status.ts tests/main/pr-status.test.ts
git commit -m "feat: add pr-status module with gh CLI integration"
```

---

### Task 3: IPC handler and preload bridge

**Files:**

- Modify: `src/main/index.ts:8` (imports), `src/main/index.ts:437` (after row:check-branches handler)
- Modify: `src/preload/index.ts:2` (imports), `src/preload/index.ts:163` (after checkBranches)

- [ ] **Step 1: Add IPC handler in main process**

In `src/main/index.ts`, add the import at the top (after the WorktreeManager import on line 8):

```ts
import { createPrStatus } from "./pr-status";
```

Add a module-level variable (after the `configManager` declaration on line 22):

```ts
let prStatusChecker: ReturnType<typeof createPrStatus>;
```

In `createWindow()`, instantiate it (after `configManager = new ConfigManager()` on line 75):

```ts
prStatusChecker = createPrStatus();
```

Add the IPC handler inside `setupIpcHandlers()` (after the `row:check-branches` handler, after line 437):

```ts
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

- [ ] **Step 2: Add preload bridge**

In `src/preload/index.ts`, add `CheckPrStatusResult` to the imports on line 2:

```ts
import type {
  Project,
  CreateRowResult,
  RemoveRowResult,
  DiscoverWorktreesResult,
  CheckBranchesResult,
  CheckPrStatusResult,
} from "../shared/types";
```

Add the bridge method after `checkBranches` (after line 160):

```ts
  checkPrStatus: (projectId: string): Promise<CheckPrStatusResult> => {
    return ipcRenderer.invoke('row:check-pr-status', { projectId })
  },
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: add row:check-pr-status IPC handler and preload bridge"
```

---

### Task 4: App store action with tests

**Files:**

- Modify: `src/renderer/src/store/app.ts:100-101` (after updateBranch)
- Modify: `tests/store/app.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/store/app.test.ts`:

```ts
describe("PR status updates", () => {
  it("updatePrStatuses sets prStatus on matching rows", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: "open" }]);
      expect(state.projects[0].rows[0].prStatus).toBe("open");
    });
  });

  it("updatePrStatuses clears prStatus when undefined", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: "open" }]);
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: undefined }]);
      expect(state.projects[0].rows[0].prStatus).toBeUndefined();
    });
  });

  it("updatePrStatuses ignores unknown project", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("unknown", [{ rowId: "p1-row-default", prStatus: "open" }]);
      expect(state.projects[0].rows[0].prStatus).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/app.test.ts`
Expected: FAIL — `updatePrStatuses` is not a function

- [ ] **Step 3: Add the store action**

In `src/renderer/src/store/app.ts`, add the import for PrStatus at the top (modify line 2):

```ts
import type { Project, Row, PrStatus } from "../../../shared/types";
```

Add the action after `updateBranch` (after line 101, before `setExpanded`):

```ts
    updatePrStatuses(projectId: string, updates: { rowId: string; prStatus: PrStatus | undefined }[]): void {
      const idx = state.projects.findIndex((p) => p.id === projectId)
      if (idx < 0) return
      const updateMap = new Map(updates.map(u => [u.rowId, u.prStatus]))
      for (let i = 0; i < state.projects[idx].rows.length; i++) {
        const row = state.projects[idx].rows[i]
        if (updateMap.has(row.id)) {
          setState('projects', idx, 'rows', i, 'prStatus', updateMap.get(row.id))
        }
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/app.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/app.ts tests/store/app.test.ts
git commit -m "feat: add updatePrStatuses action to app store"
```

---

### Task 5: PR status polling in App.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx:73-79` (after refreshBranches), `src/renderer/src/App.tsx:671-682` (onMount focus/interval section)

- [ ] **Step 1: Add refreshPrStatuses helper**

In `src/renderer/src/App.tsx`, add a new helper after `refreshBranches` (after line 79):

```ts
function refreshPrStatuses(projectId: string): void {
  window.api.checkPrStatus(projectId).then((result) => {
    appStore.actions.updatePrStatuses(projectId, result.updates);
  });
}
```

- [ ] **Step 2: Add focus/blur polling lifecycle**

In the `onMount` block, after the branch check interval section (after line 682, `onCleanup(() => clearInterval(branchCheckInterval))`), add:

```ts
// PR status polling — runs every 15s while window is focused
let prStatusInterval: ReturnType<typeof setInterval> | null = null;

function startPrPolling(): void {
  if (prStatusInterval) return;
  const project = appStore.actions.getActiveProject();
  if (project) refreshPrStatuses(project.id);
  prStatusInterval = setInterval(() => {
    const project = appStore.actions.getActiveProject();
    if (project) refreshPrStatuses(project.id);
  }, 15_000);
}

function stopPrPolling(): void {
  if (prStatusInterval) {
    clearInterval(prStatusInterval);
    prStatusInterval = null;
  }
}

// Start polling immediately (app starts focused)
startPrPolling();

window.addEventListener("focus", startPrPolling);
window.addEventListener("blur", stopPrPolling);
onCleanup(() => {
  stopPrPolling();
  window.removeEventListener("focus", startPrPolling);
  window.removeEventListener("blur", stopPrPolling);
});
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: add PR status polling with focus/blur lifecycle"
```

---

### Task 6: Sidebar icon rendering

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx:26-36` (GitBranch component), `src/renderer/src/components/Sidebar.tsx:172` (icon usage)

- [ ] **Step 1: Add PullRequest icon component**

In `src/renderer/src/components/Sidebar.tsx`, add the `PullRequest` component after `GitBranch` (after line 36):

```ts
function PullRequest(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  )
}
```

- [ ] **Step 2: Add PR status color map**

Add after the `PullRequest` component:

```ts
const PR_STATUS_COLORS: Record<string, string> = {
  draft: "#8b949e",
  open: "#3fb950",
  merged: "#a371f7",
  closed: "#f85149",
};
```

- [ ] **Step 3: Replace GitBranch with conditional rendering**

Replace line 172:

```tsx
<GitBranch color={row.color} />
```

With:

```tsx
<Show when={row.prStatus}>
  <PullRequest color={PR_STATUS_COLORS[row.prStatus!]} />
</Show>
```

Add `Show` to the import on line 1 (it's already imported).

- [ ] **Step 4: Remove GitBranch component**

Delete the `GitBranch` function (lines 26-36) since it's no longer used.

- [ ] **Step 5: Verify build and run all tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Build clean, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: replace git-branch icon with PR status icon in sidebar"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify behavior**

Check:

- Rows with no PR show no icon (just branch name text)
- Rows with an open PR show green pull-request icon
- Rows with a draft PR show gray pull-request icon
- Rows with a merged PR show purple pull-request icon
- Rows with a closed PR show red pull-request icon
- Minimize/unfocus the window, wait 20s, verify no network requests (check Activity Monitor or `gh` process list)
- Re-focus the window, verify icons refresh within a few seconds

- [ ] **Step 3: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix: polish PR status icon rendering"
```
