# Skip Merged-PR Worktrees During Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent "Discover Worktrees" from adding worktrees whose PRs have already been merged.

**Architecture:** Add a `fetchPrStatuses` call at the top of the existing `row:discover` IPC handler, then skip worktrees whose branch maps to `'merged'`. Gracefully degrades when `gh` is unavailable (empty map = no filtering).

**Tech Stack:** Electron IPC, Vitest

---

### Task 1: Write tests for merged-PR filtering in discovery

**Files:**

- Create: `tests/main/discover-worktrees.test.ts`

- [ ] **Step 1: Write the test file with three test cases**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import type { Row, Project, PrStatus } from "../../src/shared/types";

// Helpers to build test data
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "test-project",
    path: "/Users/test/project",
    rows: [
      {
        id: "row-default",
        projectId: "proj-1",
        branch: "main",
        path: "/Users/test/project",
        color: "hsl(0, 70%, 60%)",
        isDefault: true,
      },
    ],
    activeRowId: "row-default",
    expanded: true,
    ...overrides,
  };
}

// Simulate the discovery logic extracted from the handler
function discoverNewRows(
  project: Project,
  worktrees: { path: string; branch: string }[],
  prStatuses: Map<string, PrStatus>,
): Row[] {
  const existingPaths = new Set(project.rows.map((r) => r.path));
  const newRows: Row[] = [];

  for (const wt of worktrees) {
    if (existingPaths.has(wt.path)) continue;
    if (wt.path === project.path) continue;
    if (prStatuses.get(wt.branch) === "merged") continue;
    const row: Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: wt.branch,
      path: wt.path,
      color: "hsl(137, 70%, 60%)",
      isDefault: false,
    };
    newRows.push(row);
  }

  return newRows;
}

describe("discover worktrees — merged PR filtering", () => {
  const project = makeProject();

  const worktrees = [
    { path: "/Users/test/project", branch: "main" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-merged", branch: "feat-merged" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-open", branch: "feat-open" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-no-pr", branch: "feat-no-pr" },
  ];

  it("skips worktrees whose branch has a merged PR", () => {
    const prStatuses = new Map<string, PrStatus>([
      ["feat-merged", "merged"],
      ["feat-open", "open"],
    ]);

    const rows = discoverNewRows(project, worktrees, prStatuses);
    const branches = rows.map((r) => r.branch);

    expect(branches).not.toContain("feat-merged");
    expect(branches).toContain("feat-open");
    expect(branches).toContain("feat-no-pr");
    expect(rows).toHaveLength(2);
  });

  it("adds worktrees with open, draft, or closed PRs", () => {
    const prStatuses = new Map<string, PrStatus>([
      ["feat-merged", "open"],
      ["feat-open", "draft"],
      ["feat-no-pr", "closed"],
    ]);

    const rows = discoverNewRows(project, worktrees, prStatuses);
    expect(rows).toHaveLength(3);
  });

  it("adds all worktrees when gh is unavailable (empty map)", () => {
    const prStatuses = new Map<string, PrStatus>();

    const rows = discoverNewRows(project, worktrees, prStatuses);
    expect(rows).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/discover-worktrees.test.ts`
Expected: All 3 tests PASS (these test the target logic directly — they define the contract the handler must satisfy).

Note: Because we're testing extracted logic rather than mocking IPC, these tests pass immediately once written. They serve as a regression suite — if the filter line is accidentally removed from the handler, these tests document the expected behavior.

- [ ] **Step 3: Commit**

```bash
git add tests/main/discover-worktrees.test.ts
git commit -m "test: add discover-worktrees merged PR filtering tests"
```

---

### Task 2: Add merged-PR filter to the discovery handler

**Files:**

- Modify: `src/main/index.ts:397-421`

- [ ] **Step 1: Add the `fetchPrStatuses` call and filter**

Replace the current `row:discover` handler (lines 397–421) with:

```typescript
ipcMain.handle("row:discover", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { rows: [] };

  const worktrees = await worktreeManager.listWorktrees(project.path);
  const prStatuses = await prStatusChecker.fetchPrStatuses(project.path);
  const existingPaths = new Set(project.rows.map((r) => r.path));
  const newRows: Row[] = [];

  for (const wt of worktrees) {
    if (existingPaths.has(wt.path)) continue;
    if (wt.path === project.path) continue; // Skip main worktree
    if (prStatuses.get(wt.branch) === "merged") continue; // Skip merged PRs
    const row: Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: wt.branch,
      path: wt.path,
      color: goldenAngleColor(project.rows.length + newRows.length),
      isDefault: false,
    };
    newRows.push(row);
    projectStore.addRow(project.id, row);
  }

  return { rows: newRows };
});
```

The only changes from the original are:

1. Added `const prStatuses = await prStatusChecker.fetchPrStatuses(project.path)` after listing worktrees
2. Added `if (prStatuses.get(wt.branch) === 'merged') continue` in the filter loop

No new imports needed — `prStatusChecker` is already module-scoped and `fetchPrStatuses` is already its method.

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: skip worktrees with merged PRs during discovery"
```
