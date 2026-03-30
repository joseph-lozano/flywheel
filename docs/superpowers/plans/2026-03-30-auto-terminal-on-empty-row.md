# Auto-Create Terminal on Empty Row — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create a terminal whenever a row becomes active and has zero panels.

**Architecture:** A single Solid.js `createEffect` in `App.tsx` watches the active strip's panel count. When it's 0 and there's an active row, it creates a terminal via the same code path as the `Cmd+T` shortcut (`addPanel` + `createTerminalWithCwd`). The existing layout effect then picks up the new panel and creates the WebContentsView.

**Tech Stack:** Solid.js, TypeScript, Vitest

---

## File Map

| File                        | Action                                        | Responsibility                         |
| --------------------------- | --------------------------------------------- | -------------------------------------- |
| `src/renderer/src/App.tsx`  | Modify (~line 368, after chrome-state effect) | Add auto-terminal `createEffect`       |
| `tests/store/strip.test.ts` | Modify (add test block)                       | Test the auto-creation condition logic |

---

### Task 1: Add test for auto-terminal creation condition

The effect's logic is: "if strip has 0 panels and there's an active row, add a terminal panel." We can't easily test the `createEffect` in isolation (it depends on `window.api`), but we can test that `addPanel("terminal")` on an empty strip produces exactly one terminal panel — confirming the precondition and postcondition the effect relies on.

**Files:**

- Modify: `tests/store/strip.test.ts`

- [ ] **Step 1: Write test for auto-creation precondition**

Add this test block at the end of `tests/store/strip.test.ts`:

```typescript
describe("auto-terminal precondition", () => {
  it("empty strip gets one terminal panel via addPanel", () => {
    withStore(({ state, actions }) => {
      expect(state.panels).toHaveLength(0);
      const panel = actions.addPanel("terminal");
      expect(state.panels).toHaveLength(1);
      expect(panel.type).toBe("terminal");
      expect(panel.label).toBe("");
      expect(state.terminalFocused).toBe(true);
    });
  });

  it("addPanel on non-empty strip does not reset existing panels", () => {
    withStore(({ state, actions }) => {
      actions.addPanel("terminal");
      actions.addPanel("terminal");
      expect(state.panels).toHaveLength(2);
      actions.addPanel("terminal");
      expect(state.panels).toHaveLength(3);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- tests/store/strip.test.ts`
Expected: All tests PASS (these test existing `addPanel` behavior — they should pass without changes).

- [ ] **Step 3: Commit**

```bash
git add tests/store/strip.test.ts
git commit -m "test: add auto-terminal precondition tests for strip store"
```

---

### Task 2: Add auto-terminal createEffect to App.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx:368` (after chrome-state effect, before wheel handler)

- [ ] **Step 1: Add the auto-terminal effect**

Insert the following `createEffect` block in `src/renderer/src/App.tsx` after the chrome-state effect (after line 367, before the `// --- Wheel handler ---` comment):

```typescript
// --- Auto-create terminal in empty rows ---

createEffect(() => {
  const strip = activeStrip();
  const row = appStore.actions.getActiveRow();
  if (!strip || !row) return;
  if (strip.state.panels.length > 0) return;

  const panel = strip.actions.addPanel("terminal");
  window.api.createTerminalWithCwd(panel.id, row.path);
});
```

This mirrors the `"new-panel"` shortcut handler at lines 518-527, using the same `addPanel` + `createTerminalWithCwd` code path.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass (the new effect doesn't affect unit tests since they don't mount `App`).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: auto-create terminal when switching to empty row"
```

---

### Task 3: Manual smoke test

- [ ] **Step 1: Start dev server and verify all three scenarios**

Run: `npm run dev`

Test each scenario:

1. **New row (`Cmd+n`):** Create a new row. Verify a terminal appears automatically with `cwd` in the new worktree's directory.
2. **Switch to empty row:** Close all terminals in a row, switch away, switch back. Verify a terminal appears automatically.
3. **App startup:** Quit the app while on a row with no terminals. Relaunch. Verify a terminal appears automatically.

- [ ] **Step 2: Verify no double-creation**

In each scenario above, confirm only ONE terminal is created (not two or more). Check that the panel strip shows exactly one panel after the auto-creation.
