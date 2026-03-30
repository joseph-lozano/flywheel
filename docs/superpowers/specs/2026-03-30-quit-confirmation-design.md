# Quit Confirmation Design

**Date:** 2026-03-30
**Status:** Approved

## Overview

Show a native confirmation dialog whenever the user tries to quit Flywheel — whether via Cmd+Q, the app menu, or the red close button. Works on macOS and Linux.

## Behaviour

The dialog always appears on quit, regardless of whether any terminals are busy. The user must explicitly confirm before the app closes.

Dialog content:

```
Quit Flywheel?
Any running terminal processes will be terminated.

[Cancel]  [Quit]
```

"Cancel" is the default button so pressing Enter does not accidentally quit.

## Implementation

All changes are in `src/main/index.ts`.

### Quit paths

Two OS-level quit paths both converge at `mainWindow.on('close')`:

- **Cmd+Q / app menu Quit** (macOS): fires `app.on('before-quit')`, then each window receives a `close` event.
- **Red button / WM close** (Linux, and macOS red button): fires `mainWindow.on('close')` directly — `before-quit` does not fire first.

Intercepting `close` on the main window handles both paths uniformly.

### Guard flag

A module-level `let allowQuit = false` flag prevents re-entrancy. Once the user confirms, the flag is set to true before calling `app.quit()`, so the subsequent `close` event passes through without showing the dialog again.

### Updated `close` handler

```
mainWindow.on('close', async (e) => {
  if (allowQuit) {
    // confirmed — run existing cleanup and let the window close
    ptyManager.dispose();
    panelManager.destroyAll();
    return;
  }

  e.preventDefault();

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    message: 'Quit Flywheel?',
    detail: 'Any running terminal processes will be terminated.',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,   // Cancel is default
    cancelId: 0,
  });

  if (response === 1) {  // Quit
    allowQuit = true;
    app.quit();
  }
  // response === 0 (Cancel): do nothing
});
```

### No other changes needed

- `app.on('window-all-closed')` stays as-is — it only fires after the window actually closes, which only happens after confirmation.
- No renderer, preload, or IPC changes required.

## Testing

- Cmd+Q on macOS: dialog appears, Cancel aborts, Quit exits.
- Red button on macOS: dialog appears, Cancel aborts, Quit exits.
- Linux window close (WM_DELETE_WINDOW): dialog appears, Cancel aborts, Quit exits.
- Clicking Quit in the app menu: dialog appears.
- After confirming, app closes cleanly with PTYs disposed.
