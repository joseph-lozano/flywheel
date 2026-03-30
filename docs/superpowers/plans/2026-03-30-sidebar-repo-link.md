# Sidebar Repo Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clickable "GitHub" link inline after each project name in the sidebar, opening the repo in a browser pane on the project's default row.

**Architecture:** Add `repoUrl` to the `Project` type and `CheckPrStatusResult`. A new `fetchRepoUrl` function calls `gh repo view --json url --jq .url`. The IPC handler calls it alongside `fetchPrStatuses` and returns the URL. The sidebar renders a small GitHub icon + label after the project name, clicking it opens the repo in a browser pane on the default row's strip.

**Tech Stack:** TypeScript, SolidJS, Electron IPC, Vitest

---

## File Map

- **Modify:** `src/shared/types.ts` — Add `repoUrl` to `Project` and `CheckPrStatusResult`
- **Modify:** `src/main/pr-status.ts` — Add `fetchRepoUrl` function
- **Modify:** `tests/main/pr-status.test.ts` — Tests for `fetchRepoUrl`
- **Modify:** `src/main/index.ts` — Call `fetchRepoUrl` in IPC handler, return in result
- **Modify:** `src/renderer/src/store/app.ts` — Add `setRepoUrl` action
- **Modify:** `src/renderer/src/App.tsx` — Store `repoUrl`, wire `onOpenRepoUrl` prop
- **Modify:** `src/renderer/src/components/Sidebar.tsx` — Render GitHub link, add `onOpenRepoUrl` prop

---

### Task 1: Update types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `repoUrl` to `Project` interface**

In `src/shared/types.ts`, add `repoUrl?: string` to the `Project` interface after `expanded`:

```typescript
export interface Project {
  id: string;
  name: string;
  path: string;
  missing?: boolean;
  rows: Row[];
  activeRowId: string;
  expanded: boolean;
  repoUrl?: string;
}
```

- [ ] **Step 2: Add `repoUrl` to `CheckPrStatusResult`**

In `src/shared/types.ts`, update:

```typescript
export interface CheckPrStatusResult {
  updates: { rowId: string; prStatus: PrStatus | undefined; prUrl: string | undefined }[];
  repoUrl?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add repoUrl to Project and CheckPrStatusResult types"
```

---

### Task 2: Add `fetchRepoUrl` with tests

**Files:**

- Modify: `src/main/pr-status.ts`
- Modify: `tests/main/pr-status.test.ts`

- [ ] **Step 1: Write failing tests for `fetchRepoUrl`**

In `tests/main/pr-status.test.ts`, add a new `describe("fetchRepoUrl", ...)` block after the existing `fetchPrStatuses` describe block:

```typescript
describe("fetchRepoUrl", () => {
  it("returns repo URL when gh is available", async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
        const callback = (cb ?? _optsOrCb) as ExecFileCallback;
        if (Array.isArray(args) && args.includes("--version")) {
          callback(null, "gh version 2.40.0\n");
          return;
        }
        callback(null, "https://github.com/owner/repo\n");
      },
    );
    const prStatus = createPrStatus();
    const result = await prStatus.fetchRepoUrl("/test/project");
    expect(result).toBe("https://github.com/owner/repo");
  });

  it("returns undefined when gh is unavailable", async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
        const callback = (cb ?? _optsOrCb) as ExecFileCallback;
        callback(new Error("not found"));
      },
    );
    const prStatus = createPrStatus();
    const result = await prStatus.fetchRepoUrl("/test/project");
    expect(result).toBeUndefined();
  });

  it("returns undefined when gh command fails", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
        const callback = (cb ?? _optsOrCb) as ExecFileCallback;
        callCount++;
        if (callCount === 1) {
          callback(null, "gh version 2.40.0\n");
          return;
        }
        callback(new Error("not a GitHub repo"));
      },
    );
    const prStatus = createPrStatus();
    const result = await prStatus.fetchRepoUrl("/test/project");
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/main/pr-status.test.ts`
Expected: Tests fail because `fetchRepoUrl` doesn't exist yet.

- [ ] **Step 3: Implement `fetchRepoUrl`**

In `src/main/pr-status.ts`, add the `fetchRepoUrl` function inside `createPrStatus()`, after `fetchPrStatuses` and before the `return` statement:

```typescript
async function fetchRepoUrl(projectPath: string): Promise<string | undefined> {
  const available = await ghAvailable();
  if (!available) return undefined;

  return new Promise((resolve) => {
    execFile(
      "gh",
      ["repo", "view", "--json", "url", "--jq", ".url"],
      { cwd: projectPath },
      (err, stdout) => {
        if (err) {
          resolve(undefined);
          return;
        }
        const url = stdout.trim();
        resolve(url || undefined);
      },
    );
  });
}
```

Update the return statement to include `fetchRepoUrl`:

```typescript
return { ghAvailable, fetchPrStatuses, fetchRepoUrl };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/main/pr-status.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/pr-status.ts tests/main/pr-status.test.ts
git commit -m "feat: add fetchRepoUrl to pr-status module"
```

---

### Task 3: Update IPC handler

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Call `fetchRepoUrl` in the `row:check-pr-status` handler**

In `src/main/index.ts`, find the `row:check-pr-status` handler (around line 496). It currently reads:

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

Replace with:

```typescript
ipcMain.handle("row:check-pr-status", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { updates: [] };

  const [statuses, repoUrl] = await Promise.all([
    prStatusChecker.fetchPrStatuses(project.path),
    prStatusChecker.fetchRepoUrl(project.path),
  ]);
  const updates = project.rows.map((row) => {
    const pr = statuses.get(row.branch);
    return {
      rowId: row.id,
      prStatus: pr?.status,
      prUrl: pr?.url,
    };
  });

  return { updates, repoUrl };
});
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: fetch and return repoUrl in check-pr-status handler"
```

---

### Task 4: Update store and App.tsx wiring

**Files:**

- Modify: `src/renderer/src/store/app.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add `setRepoUrl` action to app store**

In `src/renderer/src/store/app.ts`, add a new action after `updatePrStatuses`:

```typescript
    setRepoUrl(projectId: string, repoUrl: string | undefined): void {
      setState(
        "projects",
        (p) => p.id === projectId,
        "repoUrl",
        repoUrl,
      );
    },
```

- [ ] **Step 2: Update `refreshPrStatuses` in App.tsx to store `repoUrl`**

In `src/renderer/src/App.tsx`, find the `refreshPrStatuses` function (around line 91):

```typescript
function refreshPrStatuses(projectId: string): void {
  void window.api.checkPrStatus(projectId).then((result) => {
    appStore.actions.updatePrStatuses(projectId, result.updates);
  });
}
```

Replace with:

```typescript
function refreshPrStatuses(projectId: string): void {
  void window.api.checkPrStatus(projectId).then((result) => {
    appStore.actions.updatePrStatuses(projectId, result.updates);
    appStore.actions.setRepoUrl(projectId, result.repoUrl);
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/app.ts src/renderer/src/App.tsx
git commit -m "feat: store repoUrl on project from PR status results"
```

---

### Task 5: Render GitHub link in sidebar with click-to-open

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add GitHub icon component and `onOpenRepoUrl` prop**

In `src/renderer/src/components/Sidebar.tsx`, add a new `GitHub` icon component after the existing `PullRequest` component (around line 60):

```tsx
function GitHub(props: { size?: number; color?: string }) {
  return (
    <svg
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "currentColor"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
```

Add `onOpenRepoUrl` to `SidebarProps`:

```typescript
  onOpenRepoUrl?: (projectId: string, url: string) => void;
```

- [ ] **Step 2: Render the GitHub link after the project name**

In `src/renderer/src/components/Sidebar.tsx`, find the project name span (around line 227):

```tsx
<span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>{project.name}</span>
```

Replace with:

```tsx
                  <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>
                    {project.name}
                  </span>
                  <Show when={project.repoUrl}>
                    {(repoUrl) => (
                      <span
                        style={{
                          display: "inline-flex",
                          "align-items": "center",
                          gap: "3px",
                          "margin-left": "4px",
                          color: "#555",
                          "font-size": "10px",
                          cursor: "pointer",
                          "text-decoration": "none",
                          "flex-shrink": 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onOpenRepoUrl?.(project.id, repoUrl());
                        }}
                      >
                        <GitHub />
                        GitHub
                      </span>
                    )}
                  </Show>
```

- [ ] **Step 3: Wire up `onOpenRepoUrl` in App.tsx**

In `src/renderer/src/App.tsx`, find the `<Sidebar` JSX (around line 850) and add the `onOpenRepoUrl` prop near the other `on*` handlers:

```tsx
        onOpenRepoUrl={(projectId, url) => {
          const project = appStore.state.projects.find((p) => p.id === projectId);
          if (!project) return;
          const defaultRow = project.rows.find((r) => r.isDefault);
          if (!defaultRow) return;
          const s = getStripStore(defaultRow.id);
          const panel = s.actions.addPanel("browser", url);
          window.api.createBrowserPanel(panel.id, url);
        }}
```

- [ ] **Step 4: Run lint and tests**

Run: `npm run lint`
Expected: No errors.

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat: add clickable GitHub repo link to sidebar project headers"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Build and run dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify GitHub link appears**

Open a project backed by a GitHub repo. Verify:

- "GitHub" label with icon appears inline after the project name
- Color is muted (#555), font-size is small (10px)
- Underlines on hover
- Projects without a GitHub remote show no link

- [ ] **Step 3: Verify click opens browser pane on default row**

Click the GitHub link. Verify:

- A new browser panel opens with the GitHub repo page
- The panel opens on the default (main) row's strip, not the currently active row
- Clicking does NOT trigger project switch
