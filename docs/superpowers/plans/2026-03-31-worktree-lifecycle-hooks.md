# Worktree Lifecycle Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-project `hooks.onWorktreeCreate` and `hooks.onWorktreeRemove` config options that run shell commands on worktree row creation and removal.

**Architecture:** Extend `FlywheelConfig` with an optional `hooks` object. The startup hook writes a command into the PTY of the auto-created terminal (only for newly created rows, not empty-strip auto-creates). The cleanup hook spawns a background `child_process.exec` before row removal proceeds, with a timeout and toast on failure.

**Tech Stack:** TypeScript, Electron IPC, node-pty, child_process, Vitest

---

### Task 1: Extend FlywheelConfig with hooks type

**Files:**

- Modify: `src/shared/config.ts:1-29`
- Test: `tests/shared/config.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/shared/config.test.ts`, add a test that verifies the default config has no hooks and that hooks merge correctly:

```typescript
describe("hooks config", () => {
  it("DEFAULT_CONFIG has no hooks", () => {
    expect(DEFAULT_CONFIG.hooks).toBeUndefined();
  });

  it("merges hooks from override", () => {
    const override = {
      hooks: {
        onWorktreeCreate: "pnpm install",
        onWorktreeRemove: "git clean -xdf",
      },
    } as Partial<FlywheelConfig>;
    const result = mergeConfigs([override]);
    expect(result.hooks?.onWorktreeCreate).toBe("pnpm install");
    expect(result.hooks?.onWorktreeRemove).toBe("git clean -xdf");
    // preferences still get defaults
    expect(result.preferences.terminal.fontFamily).toBe("monospace");
  });

  it("higher-precedence hooks override lower", () => {
    const local = {
      hooks: { onWorktreeCreate: "npm ci" },
    } as Partial<FlywheelConfig>;
    const project = {
      hooks: { onWorktreeCreate: "pnpm install", onWorktreeRemove: "rm -rf node_modules" },
    } as Partial<FlywheelConfig>;
    const result = mergeConfigs([local, project]);
    expect(result.hooks?.onWorktreeCreate).toBe("npm ci");
    expect(result.hooks?.onWorktreeRemove).toBe("rm -rf node_modules");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/shared/config.test.ts`
Expected: FAIL — `hooks` property doesn't exist on `FlywheelConfig`

- [ ] **Step 3: Add hooks to FlywheelConfig**

In `src/shared/config.ts`, add the optional `hooks` property to the interface:

```typescript
export interface FlywheelConfig {
  preferences: {
    terminal: {
      fontFamily: string;
      fontSize: number;
    };
    browser: {
      defaultZoom: number;
    };
    app: {
      defaultZoom: number;
    };
  };
  hooks?: {
    onWorktreeCreate?: string;
    onWorktreeRemove?: string;
  };
}
```

No changes to `DEFAULT_CONFIG` — hooks are optional and undefined by default.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/shared/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.ts tests/shared/config.test.ts
git commit -m "feat: add hooks type to FlywheelConfig"
```

---

### Task 2: Add hooks validation to ConfigManager

**Files:**

- Modify: `src/main/config-manager.ts:7-20` (RawYamlConfig), `src/main/config-manager.ts:83-114` (validateTypes)
- Test: `tests/main/config-manager.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/main/config-manager.test.ts`, add tests for hooks loading and validation:

```typescript
it("loads hooks from project config", () => {
  mockFiles.set(
    "/some/project/flywheel.yaml",
    "hooks:\n  onWorktreeCreate: pnpm install\n  onWorktreeRemove: git clean -xdf",
  );
  const manager = new ConfigManager();
  manager.load("/some/project");
  expect(manager.get().hooks?.onWorktreeCreate).toBe("pnpm install");
  expect(manager.get().hooks?.onWorktreeRemove).toBe("git clean -xdf");
});

it("drops hooks values with wrong types", () => {
  mockFiles.set(
    "/some/project/flywheel.yaml",
    "hooks:\n  onWorktreeCreate: 123\n  onWorktreeRemove: true",
  );
  const manager = new ConfigManager();
  manager.load("/some/project");
  expect(manager.get().hooks?.onWorktreeCreate).toBeUndefined();
  expect(manager.get().hooks?.onWorktreeRemove).toBeUndefined();
});

it("keeps valid hook when sibling has wrong type", () => {
  mockFiles.set(
    "/some/project/flywheel.yaml",
    'hooks:\n  onWorktreeCreate: "pnpm install"\n  onWorktreeRemove: 42',
  );
  const manager = new ConfigManager();
  manager.load("/some/project");
  expect(manager.get().hooks?.onWorktreeCreate).toBe("pnpm install");
  expect(manager.get().hooks?.onWorktreeRemove).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/main/config-manager.test.ts`
Expected: FAIL — hooks values aren't validated (non-string values pass through)

- [ ] **Step 3: Add hooks to RawYamlConfig and validation**

In `src/main/config-manager.ts`, extend the `RawYamlConfig` interface:

```typescript
interface RawYamlConfig {
  preferences?: {
    terminal?: {
      fontFamily?: unknown;
      fontSize?: unknown;
    };
    browser?: {
      defaultZoom?: unknown;
    };
    app?: {
      defaultZoom?: unknown;
    };
  };
  hooks?: {
    onWorktreeCreate?: unknown;
    onWorktreeRemove?: unknown;
  };
}
```

Add hook validation at the end of the `validateTypes` method:

```typescript
const hooks = obj.hooks;
if (hooks && typeof hooks === "object") {
  if (hooks.onWorktreeCreate !== undefined && typeof hooks.onWorktreeCreate !== "string") {
    console.warn(`Invalid hooks.onWorktreeCreate in ${path}, expected string`);
    delete hooks.onWorktreeCreate;
  }
  if (hooks.onWorktreeRemove !== undefined && typeof hooks.onWorktreeRemove !== "string") {
    console.warn(`Invalid hooks.onWorktreeRemove in ${path}, expected string`);
    delete hooks.onWorktreeRemove;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/main/config-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/config-manager.ts tests/main/config-manager.test.ts
git commit -m "feat: validate hooks in ConfigManager"
```

---

### Task 3: Add startup hook injection to PtyManager

**Files:**

- Modify: `src/main/pty-manager.ts:35-75` (create method)
- Test: `tests/main/pty-manager.test.ts`

- [ ] **Step 1: Read the existing PtyManager test**

Read `tests/main/pty-manager.test.ts` to understand the mock structure for node-pty before writing new tests.

- [ ] **Step 2: Write the failing test**

Add tests to `tests/main/pty-manager.test.ts` for the startup hook:

```typescript
describe("startup hook", () => {
  it("writes hook command to PTY after first data when runHook is provided", () => {
    manager.create("panel-1", "/tmp/cwd", "pnpm install");
    // Simulate first data from shell
    const onDataCallback = mockSpawn.mock.results[0].value._onDataCallback;
    onDataCallback("$ ");
    // Flush to process the data
    vi.advanceTimersByTime(16);
    expect(mockSpawn.mock.results[0].value.write).toHaveBeenCalledWith("pnpm install\n");
  });

  it("does not write hook command when runHook is undefined", () => {
    manager.create("panel-1", "/tmp/cwd");
    const onDataCallback = mockSpawn.mock.results[0].value._onDataCallback;
    onDataCallback("$ ");
    vi.advanceTimersByTime(16);
    expect(mockSpawn.mock.results[0].value.write).not.toHaveBeenCalled();
  });

  it("writes hook command only once even with multiple data events", () => {
    manager.create("panel-1", "/tmp/cwd", "pnpm install");
    const onDataCallback = mockSpawn.mock.results[0].value._onDataCallback;
    onDataCallback("$ ");
    onDataCallback("more output");
    vi.advanceTimersByTime(16);
    expect(mockSpawn.mock.results[0].value.write).toHaveBeenCalledTimes(1);
  });
});
```

Note: The exact mock shape depends on what's already in the test file. Adapt `mockSpawn.mock.results[0].value` to match the existing mock structure. The key assertions are: (1) `write` is called with `"pnpm install\n"` after first data, (2) not called without a hook, (3) called only once.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- tests/main/pty-manager.test.ts`
Expected: FAIL — `create` doesn't accept a third argument

- [ ] **Step 4: Add hook parameter to PtyManager.create**

In `src/main/pty-manager.ts`, modify the `create` method signature and add hook injection logic:

```typescript
create(panelId: string, cwd?: string, hookCommand?: string): void {
  if (this.ptys.has(panelId)) return;
  const shell = process.env.SHELL ?? "/bin/zsh";
  const shellName = basename(shell);
  const binDir = join(homedir(), ".flywheel", "bin");
  const env = {
    ...process.env,
    BROWSER: join(binDir, "flywheel-open"),
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FLYWHEEL: "1",
  } as Record<string, string>;
  const ptyProcess = pty.spawn(shell, ["-l"], {
    cols: 80,
    rows: 24,
    cwd: cwd ?? process.cwd(),
    env,
  });

  let hookFired = false;

  const managed: ManagedPty = {
    panelId,
    pty: ptyProcess,
    buffer: "",
    shellName,
    lastTitle: shellName,
    disposed: false,
  };
  ptyProcess.onData((data: string) => {
    if (!managed.disposed) managed.buffer += data;
    // Fire startup hook on first data (shell is ready)
    if (hookCommand && !hookFired) {
      hookFired = true;
      ptyProcess.write(hookCommand + "\n");
    }
  });
  ptyProcess.onExit(({ exitCode }) => {
    if (!managed.disposed) {
      if (managed.buffer.length > 0) {
        this.sendToPanel(panelId, "pty:output", { panelId, data: managed.buffer });
        managed.buffer = "";
      }
      this.sendToChrome("pty:exit", { panelId, exitCode });
      this.ptys.delete(panelId);
    }
  });
  this.ptys.set(panelId, managed);
  this.sendToChrome("panel:title", { panelId, title: shellName });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- tests/main/pty-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/pty-manager.ts tests/main/pty-manager.test.ts
git commit -m "feat: add startup hook injection to PtyManager.create"
```

---

### Task 4: Wire startup hook through IPC and renderer

**Files:**

- Modify: `src/main/index.ts:184-186` (pty:create handler)
- Modify: `src/preload/index.ts:189-191` (createTerminalWithCwd)
- Modify: `src/renderer/src/App.tsx:174-182` (handleCreateRow), `src/renderer/src/App.tsx:375-383` (auto-create effect)

- [ ] **Step 1: Update the pty:create IPC handler to pass hookCommand**

In `src/main/index.ts`, modify the `pty:create` handler to read the hook from config when requested:

```typescript
ipcMain.on("pty:create", (_event, data: { panelId: string; cwd?: string; runHook?: boolean }) => {
  let hookCommand: string | undefined;
  if (data.runHook) {
    hookCommand = configManager.get().hooks?.onWorktreeCreate;
  }
  ptyManager.create(data.panelId, data.cwd, hookCommand);
});
```

- [ ] **Step 2: Update the preload API to support runHook flag**

In `src/preload/index.ts`, add a new method alongside `createTerminalWithCwd`:

```typescript
createTerminalWithCwd: (panelId: string, cwd: string, runHook?: boolean) => {
  ipcRenderer.send("pty:create", { panelId, cwd, runHook });
},
```

- [ ] **Step 3: Add newlyCreatedRows set and update handleCreateRow in App.tsx**

In `src/renderer/src/App.tsx`, add a `Set<string>` near the top of the `App` function (next to `createdPanelIds`):

```typescript
const newlyCreatedRows = new Set<string>();
```

Update `handleCreateRow` to mark the row as newly created:

```typescript
async function handleCreateRow(projectId: string): Promise<void> {
  const result = await window.api.createRow(projectId);
  if ("error" in result) {
    showToast(result.error);
    return;
  }
  newlyCreatedRows.add(result.row.id);
  appStore.actions.addRow(projectId, result.row);
  void handleSwitchRow(projectId, result.row.id);
}
```

- [ ] **Step 4: Update auto-create terminal effect to pass runHook**

In `src/renderer/src/App.tsx`, modify the auto-create terminal effect:

```typescript
createEffect(() => {
  const strip = activeStrip();
  const row = appStore.actions.getActiveRow();
  if (!strip || !row) return;
  if (strip.state.panels.length > 0) return;

  const runHook = newlyCreatedRows.delete(row.id);
  const panel = strip.actions.addPanel("terminal");
  window.api.createTerminalWithCwd(panel.id, row.path, runHook || undefined);
});
```

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/App.tsx
git commit -m "feat: wire startup hook through IPC and renderer"
```

---

### Task 5: Add cleanup hook to row removal

**Files:**

- Create: `src/main/hooks.ts`
- Test: `tests/main/hooks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/hooks.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { runCleanupHook } from "../../src/main/hooks";

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

import { exec } from "child_process";

const mockExec = vi.mocked(exec);

describe("runCleanupHook", () => {
  it("runs the command with cwd and timeout", async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      (callback as (error: Error | null, result: { stdout: string; stderr: string }) => void)(
        null,
        { stdout: "", stderr: "" },
      );
      return {} as ReturnType<typeof exec>;
    });

    const result = await runCleanupHook("git clean -xdf", "/tmp/worktree");
    expect(mockExec).toHaveBeenCalledWith(
      "git clean -xdf",
      expect.objectContaining({ cwd: "/tmp/worktree", timeout: 10_000 }),
      expect.any(Function),
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns error message on failure", async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      (callback as (error: Error | null) => void)(new Error("command failed"));
      return {} as ReturnType<typeof exec>;
    });

    const result = await runCleanupHook("bad-command", "/tmp/worktree");
    expect(result).toEqual({ ok: false, error: "command failed" });
  });

  it("returns error on undefined command", async () => {
    const result = await runCleanupHook(undefined, "/tmp/worktree");
    expect(result).toEqual({ ok: true });
    expect(mockExec).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/main/hooks.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement runCleanupHook**

Create `src/main/hooks.ts`:

```typescript
import { exec } from "child_process";

const CLEANUP_TIMEOUT_MS = 10_000;

export function runCleanupHook(
  command: string | undefined,
  cwd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!command) return Promise.resolve({ ok: true });

  return new Promise((resolve) => {
    exec(command, { cwd, timeout: CLEANUP_TIMEOUT_MS }, (error) => {
      if (error) {
        resolve({ ok: false, error: error.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/main/hooks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/hooks.ts tests/main/hooks.test.ts
git commit -m "feat: add runCleanupHook utility"
```

---

### Task 6: Wire cleanup hook into row removal flow

**Files:**

- Modify: `src/main/index.ts:549-575` (row:remove handler)

- [ ] **Step 1: Import runCleanupHook and wire into row:remove handler**

In `src/main/index.ts`, add the import:

```typescript
import { runCleanupHook } from "./hooks";
```

Modify the `row:remove` handler to run the cleanup hook before removal:

```typescript
ipcMain.handle("row:remove", async (_event, data: { rowId: string; deleteFromDisk: boolean }) => {
  const projects = projectStore.getProjects();
  let targetProject: Project | undefined;
  let targetRow: Row | undefined;

  for (const p of projects) {
    const row = p.rows.find((r) => r.id === data.rowId);
    if (row) {
      targetProject = p;
      targetRow = row;
      break;
    }
  }

  // Run cleanup hook before removal
  if (targetRow) {
    const hookCommand = configManager.get().hooks?.onWorktreeRemove;
    const hookResult = await runCleanupHook(hookCommand, targetRow.path);
    if (!hookResult.ok) {
      chromeView.webContents.send("toast", {
        message: `Cleanup hook failed: ${hookResult.error}`,
        type: "error",
      });
    }
  }

  return await removeRowTransactional(targetProject, targetRow, data.deleteFromDisk, {
    removeWorktree: (projectPath, worktreePath) => {
      return worktreeManager.removeWorktree(projectPath, worktreePath);
    },
    cleanupRow: (rowId) => {
      ptyManager.killByPrefix(rowId);
      panelManager.destroyByPrefix(rowId);
    },
    removeRow: (projectId, rowId) => {
      projectStore.removeRow(projectId, rowId);
    },
  });
});
```

- [ ] **Step 2: Add toast IPC listener in the renderer**

Check if the renderer already handles a `toast` IPC event. If not, add a listener in `App.tsx` `onMount`:

```typescript
window.api.onToast?.((data) => {
  showToast(data.message, data.type);
});
```

And in `src/preload/index.ts`, add the toast listener:

```typescript
onToast: (callback: (data: { message: string; type: "error" | "info" }) => void) => {
  ipcRenderer.on("toast", (_event, data: { message: string; type: "error" | "info" }) => {
    callback(data);
  });
},
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/hooks.ts src/preload/index.ts src/renderer/src/App.tsx
git commit -m "feat: wire cleanup hook into row removal flow"
```

---

### Task 7: Add flywheel.yaml to git and final verification

**Files:**

- Stage: `flywheel.yaml`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit flywheel.yaml**

```bash
git add flywheel.yaml
git commit -m "chore: add project flywheel.yaml with lifecycle hooks"
```
