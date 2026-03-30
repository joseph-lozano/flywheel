# Quit Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a native confirmation dialog whenever the user quits Flywheel (Cmd+Q, app menu, or red close button), on both macOS and Linux.

**Architecture:** Intercept `mainWindow.on('close')` with `e.preventDefault()`, show `dialog.showMessageBox`, and only proceed if the user confirms. A boolean guard flag prevents the dialog from appearing twice when `app.quit()` re-triggers the close event.

**Tech Stack:** Electron `dialog`, `BaseWindow`, `app` — all already imported in `src/main/index.ts`. No new files, no new IPC, no renderer changes.

---

### Task 1: Add the quit confirmation handler

**Files:**
- Modify: `src/main/index.ts` — replace the existing `mainWindow.on("close", ...)` handler

**Context:** The current `close` handler (around line 99) just disposes PTYs and panels. We need to intercept the event before cleanup, show a dialog, and only clean up + quit if the user confirms. Both quit paths (Cmd+Q and the red button) fire `mainWindow.on('close')`, so this one handler covers both.

- [ ] **Step 1: Add the `allowQuit` flag**

Add one line at the top of `createWindow()`, directly before the `mainWindow = new BaseWindow(...)` call (around line 41):

```typescript
let allowQuit = false;
```

- [ ] **Step 2: Replace the `close` handler**

Find the current handler (around line 99):

```typescript
  mainWindow.on("close", () => {
    ptyManager.dispose();
    panelManager.destroyAll();
  });
```

Replace it with:

```typescript
  mainWindow.on("close", (e) => {
    if (allowQuit) {
      ptyManager.dispose();
      panelManager.destroyAll();
      return;
    }

    e.preventDefault();

    void dialog
      .showMessageBox(mainWindow, {
        type: "question",
        message: "Quit Flywheel?",
        detail: "Any running terminal processes will be terminated.",
        buttons: ["Cancel", "Quit"],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) {
          allowQuit = true;
          app.quit();
        }
      });
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no errors. `dialog` and `app` are already imported at line 2.

- [ ] **Step 4: Smoke-test manually**

```bash
npm run dev
```

- Press Cmd+Q (macOS) or close via the window menu → dialog should appear.
- Click Cancel → app stays open.
- Press Cmd+Q again → dialog appears again.
- Click Quit → app closes cleanly.
- Click the red/close button → dialog appears; Cancel keeps app open; Quit closes it.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: confirm before quitting the app"
```
