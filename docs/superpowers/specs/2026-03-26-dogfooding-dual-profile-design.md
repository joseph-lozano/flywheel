# Dogfooding Dual-Profile Design

## Problem

To dogfood Flywheel, we need to run a stable built version alongside one or more `npm run dev` instances from worktrees, simultaneously. Two things conflict today:

1. **electron-store path** — all instances read/write the same `~/Library/Application Support/flywheel/config.json`, so a dev instance with a different schema could corrupt the stable instance's data.
2. **Dev server port** — `electron-vite dev` defaults to port 5173, so two simultaneous dev instances collide.

## Design

### Two profiles: production and dev

Detection is implicit — no flags or env vars needed:

- **Production** (`npm run build` + launch): `import.meta.env.DEV === false`. Uses the default userData path. This is the daily-driver dogfooding instance.
- **Dev** (`npm run dev`): `import.meta.env.DEV === true`. Uses a separate userData path so it can't corrupt production state.

### userData isolation

Electron stores all app data (electron-store config, caches, etc.) under a single `userData` directory. By default this is `~/Library/Application Support/flywheel/`. We shift dev instances to a separate directory so they can't corrupt production state.

In the main process, before any store access:

```ts
if (process.env["ELECTRON_RENDERER_URL"]) {
  app.setPath("userData", app.getPath("userData") + "-dev");
}
```

This means:

- **Production** userData: `~/Library/Application Support/flywheel/` (the default)
- **Dev** userData: `~/Library/Application Support/flywheel-dev/`

electron-store reads/writes within the userData directory automatically, so the store file lands at `flywheel-dev/config.json` for dev instances. All dev instances share this path, which is fine — it's one person on one machine.

We use `process.env['ELECTRON_RENDERER_URL']` because the codebase already uses it as the dev mode signal (electron-vite sets it when running the dev server), and `setPath` must be called in the main process before the app is ready.

### Dev server port auto-selection

In `electron.vite.config.ts`, set `strictPort: false` on the renderer dev server. Vite will automatically try the next available port if 5173 is taken (5174, 5175, etc.) and log which port it chose. This is built-in Vite behavior — no custom code needed.

The Electron main process doesn't need to know the port itself — electron-vite handles this automatically. It starts the Vite dev server first, discovers the actual port, then sets `ELECTRON_RENDERER_URL` to the correct `http://localhost:<port>` before launching the Electron main process. The main process just reads `process.env['ELECTRON_RENDERER_URL']` as it already does today.

```ts
renderer: {
  server: {
    strictPort: false
  },
  // ... existing config
}
```

### Visual indicator: branch name in title bar

Dev instances show the current git branch in the window title so you can tell them apart at a glance.

`WorktreeManager.getDefaultBranch(path)` already resolves the current branch for a given directory via `git rev-parse --abbrev-ref HEAD`. Reuse it in `createWindow()` to get the branch for `process.cwd()`.

Set the window title:

- **Production**: `Flywheel`
- **Dev**: `Flywheel [branch-name]`

## Changes required

### `src/main/index.ts`

1. Before `app.whenReady()`, call `app.setPath('userData', ...)` if in dev mode.
2. In `createWindow()`, set window title to include branch name when in dev mode.

### `electron.vite.config.ts`

1. Add `server: { strictPort: false }` to the renderer config.

### No changes needed

- `project-store.ts` — electron-store automatically follows the userData path, so shifting userData is sufficient.
- `package.json` — no new scripts needed. `npm run dev` and `npm run build` already do the right thing.
- No env vars, no CLI flags, no profile names to remember.

## Scope

This is a small change: ~10 lines of code across two files. No new dependencies, no schema changes, no migration logic.
