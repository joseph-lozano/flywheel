# Worktree Lifecycle Hooks

## Overview

Per-project hooks that run at worktree row creation and removal. Configured in `flywheel.yaml` as a top-level `hooks` key.

## Config Shape

```yaml
hooks:
  onWorktreeCreate: "pnpm install"
  onWorktreeRemove: "rm -rf node_modules"
```

Both fields are optional strings. If absent or empty, no hook runs. Single command string — use shell chaining (`&&`, `;`) for multiple operations, or point to a script.

Lives in project-level `flywheel.yaml` or `flywheel.local.yaml`. If set in global config, applies to all projects. Merged with the existing deep-merge strategy — no special handling.

## Type Changes

Add optional `hooks` to `FlywheelConfig`:

```typescript
export interface FlywheelConfig {
  preferences: { /* existing */ };
  hooks?: {
    onWorktreeCreate?: string;
    onWorktreeRemove?: string;
  };
}
```

Config validation ensures both values are strings if present. Non-string values are logged and stripped, consistent with existing validation behavior.

## Startup Hook (`onWorktreeCreate`)

Runs once when a new worktree row is created. Does not run when a terminal is auto-created because the user switched to an existing row with no active panels.

### Flow

1. `row:create` IPC handler succeeds, returns the new row to the renderer.
2. `handleCreateRow` in `App.tsx` adds the row ID to a `Set<string>` (`newlyCreatedRows`) before calling `handleSwitchRow`.
3. The auto-create-terminal effect (which fires when a strip has 0 panels) checks for the row ID in the set. If present, it removes the ID from the set and passes `runHook: true` in the `pty:create` IPC call.
4. The main process `pty:create` handler looks up `hooks.onWorktreeCreate` from the current config via `ConfigManager`.
5. After the PTY emits its first data (indicating the shell is ready), the main process writes the hook command followed by a newline into the PTY.
6. The user sees the command execute in their terminal as if they typed it.

### Edge Cases

- If the shell produces no output (unlikely but possible), use a timeout fallback (e.g., 500ms after spawn) to write the command.
- The command inherits the user's full shell environment since it runs inside the PTY.

## Cleanup Hook (`onWorktreeRemove`)

Runs when a worktree row is removed, before disk deletion and store removal. Best-effort — failures never block row removal.

### Flow

1. Row removal is triggered (user deletes a worktree row).
2. Main process reads `hooks.onWorktreeRemove` from the current config.
3. Spawns `child_process.exec(command, { cwd: worktreePath, timeout: 10_000 })`.
4. Awaits completion or timeout.
5. On failure or timeout: sends a toast to the renderer with the error message.
6. Regardless of outcome: proceeds with row removal from the store and optional disk deletion.

### Edge Cases

- Timeout: 10 seconds. If exceeded, the child process is killed and the removal proceeds.
- If the worktree path no longer exists on disk when the hook runs, `exec` fails — toast shown, removal continues.
- The cleanup command's environment is the main process environment with `cwd` set to the worktree path.

## What Doesn't Change

- Terminal creation for existing rows (switching to a row with no panels) — no hook runs.
- Existing config merge behavior — untouched.
- PTY spawning logic — the hook is just an input write after spawn, not a change to how PTYs start.
- The `row:create` and row removal IPC handlers' core logic — hooks are additive.
