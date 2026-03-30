# Auto-Create Terminal on Empty Row

## Problem

When a row becomes active and has no panels (e.g., after creating a new worktree, switching to a row where all terminals were closed, or on app startup), the user sees an empty strip and must manually create a terminal. This adds unnecessary friction.

## Rule

Any time a row becomes the active row and has zero panels, automatically create a terminal in it with `cwd` set to the row's path.

## Approach: Reactive Effect

Add a single `createEffect` in `App.tsx` that watches the active strip's panel count. When the count is 0 and there's an active row, it creates a terminal panel using the same code path as the `Cmd+T` shortcut.

### Why reactive over imperative

An imperative approach (inserting terminal creation at each call site — `handleCreateRow`, `handleSwitchRow`, startup) would require touching 3+ locations and risks missing future cases. A reactive effect covers all scenarios with one piece of code, consistent with how the codebase already manages panel lifecycle via effects.

## Covered Scenarios

| Scenario                          | How the effect triggers                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `Cmd+n` (new row)                 | `handleCreateRow` → `handleSwitchRow` → new empty strip store → effect fires  |
| Switch to existing empty row      | `handleSwitchRow` → strip restored with 0 panels → effect fires               |
| App startup with empty active row | Projects loaded → active row set → strip created with 0 panels → effect fires |

## Implementation

### Location

`src/renderer/src/App.tsx`, as a new `createEffect` block alongside the existing layout, scroll, focus, and chrome-state effects.

### Logic

```
createEffect(() => {
  const strip = activeStrip()
  const row = appStore.actions.getActiveRow()
  if (!strip || !row) return
  if (strip.state.panels.length > 0) return

  const panel = strip.actions.addPanel("terminal")
  window.api.createTerminalWithCwd(panel.id, row.path)
})
```

### Guard Rails

- **No double-creation:** `addPanel` is synchronous and immediately makes the panel count 1, so the effect won't re-fire.
- **Same code path:** Uses the identical `addPanel` + `createTerminalWithCwd` pattern as the `"new-panel"` shortcut handler, so the existing layout effect picks up the new panel and creates the WebContentsView as usual.
- **No new IPC:** Reuses existing `pty:create` and `panel:create` channels.

## Testing

- Unit test: given a strip with 0 panels and an active row, verify `addPanel` is called with `"terminal"`.
- Unit test: given a strip with 1+ panels, verify no panel creation occurs.
