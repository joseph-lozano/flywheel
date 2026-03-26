# Dogfooding Dual-Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow running a stable production build alongside dev instances without data corruption or port conflicts.

**Architecture:** Three small changes — shift userData path for dev instances, enable Vite auto-port selection, and show branch name in dev window titles. All detection is implicit via `ELECTRON_RENDERER_URL`.

**Tech Stack:** Electron, electron-vite, Vite

---

### Task 1: Dev userData isolation

**Files:**
- Modify: `src/main/index.ts:558` (before `app.whenReady()`)

- [ ] **Step 1: Add userData path shift before app.whenReady()**

In `src/main/index.ts`, add the dev userData redirect immediately before the existing `app.whenReady().then(createWindow)` line:

```ts
// Isolate dev instances to a separate userData directory
// so they can't corrupt production electron-store data
if (process.env['ELECTRON_RENDERER_URL']) {
  app.setPath('userData', app.getPath('userData') + '-dev')
}

app.whenReady().then(createWindow)
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, then check that the dev store was created:

```bash
ls ~/Library/Application\ Support/flywheel-dev/
```

Expected: directory exists (may contain `config.json` if you added a project).

Run `npm run build && npx electron .` from a clean terminal. Check that production data is separate:

```bash
ls ~/Library/Application\ Support/flywheel/
```

Expected: directory exists with its own `config.json`, independent of the dev one.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: isolate dev userData to prevent production data corruption"
```

---

### Task 2: Dev server auto-port selection

**Files:**
- Modify: `electron.vite.config.ts:25-37` (renderer config)

- [ ] **Step 1: Add strictPort: false to renderer server config**

In `electron.vite.config.ts`, add a `server` block to the existing `renderer` config:

```ts
renderer: {
  root: resolve(__dirname, 'src'),
  plugins: [solidPlugin()],
  server: {
    strictPort: false
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        terminal: resolve(__dirname, 'src/terminal/index.html'),
        'browser-host': resolve(__dirname, 'src/browser/browser-host.html')
      }
    }
  }
}
```

- [ ] **Step 2: Verify manually**

Start first dev instance:

```bash
npm run dev
```

Note the port in the terminal output (should be 5173).

In a second terminal, from a different worktree, start another dev instance:

```bash
npm run dev
```

Expected: second instance starts on port 5174 (or next available) without error. Both Electron windows open and function independently.

- [ ] **Step 3: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat: auto-select available port for dev server"
```

---

### Task 3: Branch name in dev window title

**Files:**
- Modify: `src/main/index.ts:19-25` (`createWindow` function)

- [ ] **Step 1: Make createWindow async and add branch detection**

Change `createWindow` to async and use `WorktreeManager.getDefaultBranch()` to detect the branch for dev instances. In `src/main/index.ts`, replace the `createWindow` function signature and the `BaseWindow` constructor:

```ts
async function createWindow(): Promise<void> {
  let title = 'Flywheel'
  if (process.env['ELECTRON_RENDERER_URL']) {
    try {
      const branch = await worktreeManager.getDefaultBranch(process.cwd())
      title = `Flywheel [${branch}]`
    } catch {
      title = 'Flywheel [dev]'
    }
  }

  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false,
    title
  })
```

However, `worktreeManager` is currently created inside `createWindow` at line 58. We need to instantiate it before we use it for the title. Move the instantiation before the title detection:

```ts
async function createWindow(): Promise<void> {
  worktreeManager = new WorktreeManager()

  let title = 'Flywheel'
  if (process.env['ELECTRON_RENDERER_URL']) {
    try {
      const branch = await worktreeManager.getDefaultBranch(process.cwd())
      title = `Flywheel [${branch}]`
    } catch {
      title = 'Flywheel [dev]'
    }
  }

  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false,
    title
  })
```

And remove the duplicate `worktreeManager = new WorktreeManager()` from its original location (currently line 58).

- [ ] **Step 2: Verify manually**

Run `npm run dev` from a worktree checkout. The window title should show `Flywheel [branch-name]` (e.g., `Flywheel [dogfooding-dual-profile]`).

Run `npm run build && npx electron .`. The window title should show just `Flywheel`.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: show branch name in dev window title"
```
