# Panel Swap/Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cmd+Shift+Left/Right keyboard shortcuts to swap the focused panel with its neighbor.

**Architecture:** Store-only array swap — mutate the `panels` array and `focusedIndex` in the strip store; the layout engine, rendering, scroll-to-center, and bounds updates all derive from array order automatically. No new IPC, no preload changes.

**Tech Stack:** SolidJS (store), Electron (Menu accelerators), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-24-panel-swap-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/types.ts` | Modify | Add `'swap-left' \| 'swap-right'` to `ShortcutAction` union |
| `src/renderer/src/store/strip.ts` | Modify | Add `swapLeft()`, `swapRight()` store actions |
| `src/main/index.ts` | Modify | Add two Menu accelerator entries in `setupShortcuts()` |
| `src/renderer/src/App.tsx` | Modify | Add two cases in `handleShortcut()` |
| `src/renderer/src/components/HintBar.tsx` | Modify | Add swap hints to `HINTS` array |
| `tests/store/strip.test.ts` | Modify | Add swap test suite |

---

### Task 1: Add swap actions to the store (TDD)

**Files:**
- Test: `tests/store/strip.test.ts`
- Modify: `src/renderer/src/store/strip.ts:59-68`

- [ ] **Step 1: Write failing tests for swapLeft and swapRight**

Add a new `describe('swap')` block at the end of `tests/store/strip.test.ts`:

```typescript
describe('swap', () => {
  it('swapLeft swaps focused panel with left neighbor', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      // p2 is focused at index 1
      actions.swapLeft()
      expect(state.panels[0].id).toBe(p2.id)
      expect(state.panels[1].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapRight swaps focused panel with right neighbor', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      actions.jumpTo(0)
      actions.swapRight()
      expect(state.panels[0].id).toBe(p2.id)
      expect(state.panels[1].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('swapLeft is no-op at leftmost position', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      actions.jumpTo(0)
      actions.swapLeft()
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.panels[1].id).toBe(p2.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapRight is no-op at rightmost position', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      // p2 is focused at index 1 (rightmost)
      actions.swapRight()
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.panels[1].id).toBe(p2.id)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('swap is no-op with single panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.swapLeft()
      actions.swapRight()
      expect(state.panels).toHaveLength(1)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapLeft sets terminalFocused to true', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.blurPanel()
      actions.swapLeft()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('swapRight sets terminalFocused to true', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.jumpTo(0); actions.blurPanel()
      actions.swapRight()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('swapLeft preserves panel identity through three panels', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel(); const p3 = actions.addPanel()
      // focused on p3 at index 2
      actions.swapLeft()
      expect(state.panels.map(p => p.id)).toEqual([p1.id, p3.id, p2.id])
      expect(state.focusedIndex).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: FAIL — `actions.swapLeft is not a function`

- [ ] **Step 3: Implement swapLeft and swapRight in the store**

In `src/renderer/src/store/strip.ts`, add these two actions inside the `actions` object, after `jumpTo` (line 68) and before `setPanelTitle` (line 69):

```typescript
    swapLeft() {
      if (state.focusedIndex > 0) {
        const i = state.focusedIndex
        const newPanels = [...state.panels]
        ;[newPanels[i - 1], newPanels[i]] = [newPanels[i], newPanels[i - 1]]
        setState('panels', newPanels)
        setState('focusedIndex', i - 1)
        setState('terminalFocused', true)
      }
    },
    swapRight() {
      if (state.focusedIndex < state.panels.length - 1) {
        const i = state.focusedIndex
        const newPanels = [...state.panels]
        ;[newPanels[i], newPanels[i + 1]] = [newPanels[i + 1], newPanels[i]]
        setState('panels', newPanels)
        setState('focusedIndex', i + 1)
        setState('terminalFocused', true)
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/store/strip.test.ts src/renderer/src/store/strip.ts
git commit -m "feat: add swapLeft/swapRight store actions with tests"
```

---

### Task 2: Update ShortcutAction type

**Files:**
- Modify: `src/shared/types.ts:30-33`

- [ ] **Step 1: Add swap-left and swap-right to the ShortcutAction type union**

In `src/shared/types.ts`, change line 31 from:

```typescript
  type: 'focus-left' | 'focus-right' | 'new-panel' | 'close-panel' | 'jump-to' | 'blur-panel'
```

to:

```typescript
  type: 'focus-left' | 'focus-right' | 'swap-left' | 'swap-right' | 'new-panel' | 'close-panel' | 'jump-to' | 'blur-panel'
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add swap-left/swap-right to ShortcutAction type"
```

---

### Task 3: Register keyboard shortcuts in main process

**Files:**
- Modify: `src/main/index.ts:157-225`

- [ ] **Step 1: Add two Menu entries after the Focus Right entry**

In `src/main/index.ts`, inside `setupShortcuts()`, add two entries after the `Focus Right` entry (line 177) and before the separator (line 178):

```typescript
        {
          label: 'Swap Left',
          accelerator: 'Command+Shift+Left',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'swap-left' })
        },
        {
          label: 'Swap Right',
          accelerator: 'Command+Shift+Right',
          click: () => chromeView.webContents.send('shortcut:action', { type: 'swap-right' })
        },
```

They go in the same group as Focus Left/Right (before the separator), since swap is a variant of navigation.

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: register Cmd+Shift+Left/Right shortcuts for panel swap"
```

---

### Task 4: Wire shortcuts to store actions in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx:131-144`

- [ ] **Step 1: Add swap-left and swap-right cases in handleShortcut**

In `src/renderer/src/App.tsx`, inside the `handleShortcut` switch statement, add two new cases after the `focus-right` case (line 134):

```typescript
      case 'swap-left': actions.swapLeft(); break
      case 'swap-right': actions.swapRight(); break
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire swap-left/swap-right shortcuts to store actions"
```

---

### Task 5: Add swap hints to the HintBar

**Files:**
- Modify: `src/renderer/src/components/HintBar.tsx:9-16`

- [ ] **Step 1: Add swap hints to the HINTS array**

In `src/renderer/src/components/HintBar.tsx`, add two entries to the `HINTS` array after the Focus Right entry (line 11) and before the New Terminal entry (line 12):

```typescript
  { key: '⌘⇧←', label: 'Swap Left' },
  { key: '⌘⇧→', label: 'Swap Right' },
```

The full `HINTS` array should read:

```typescript
const HINTS = [
  { key: '⌘←', label: 'Focus Left' },
  { key: '⌘→', label: 'Focus Right' },
  { key: '⌘⇧←', label: 'Swap Left' },
  { key: '⌘⇧→', label: 'Swap Right' },
  { key: '⌘T', label: 'New Terminal' },
  { key: '⌘W', label: 'Close' },
  { key: '⌘G', label: 'Blur' },
  { key: '⌘1-9', label: 'Jump' }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx
git commit -m "feat: add swap shortcuts to hint bar"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Run the app**

Run: `npm run dev`

- [ ] **Step 2: Verify swap behavior**

1. Create 3 panels with Cmd+T
2. Focus the middle panel (Cmd+2)
3. Press Cmd+Shift+Right — middle panel should move to rightmost position, focus follows
4. Press Cmd+Shift+Right again — should be a no-op (already rightmost)
5. Press Cmd+Shift+Left — panel moves back one position, focus follows
6. Focus leftmost panel (Cmd+1), press Cmd+Shift+Left — should be a no-op
7. Verify Cmd+1/2/3 jump shortcuts reflect new positions after swap
8. Verify hint bar shows the new swap shortcuts
