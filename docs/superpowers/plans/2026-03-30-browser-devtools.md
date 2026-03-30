# Browser Panel DevTools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chrome DevTools support to browser panels via keyboard shortcut, chrome strip button, and Electron's native `toggleDevTools` API.

**Architecture:** New IPC channel `browser:toggle-devtools` connects three trigger points (keyboard shortcut, chrome strip button, renderer API) to `PanelManager.toggleBrowserDevTools()`, which calls `webContents.toggleDevTools()` on the browser content view. The feature touches 6 files across all 4 Electron contexts.

**Tech Stack:** Electron `webContents.toggleDevTools()`, Lucide wrench SVG icon

---

### Task 1: Add `toggleBrowserDevTools` to PanelManager

**Files:**

- Modify: `src/main/panel-manager.ts:242` (after `goForwardBrowser`)

- [ ] **Step 1: Add the method**

Add after `goForwardBrowser` (line 242):

```typescript
toggleBrowserDevTools(id: string): void {
  const panel = this.panels.get(id);
  if (panel?.type !== "browser") return;
  panel.view.webContents.toggleDevTools();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/panel-manager.ts
git commit -m "feat: add toggleBrowserDevTools method to PanelManager"
```

---

### Task 2: Add IPC handler in main process

**Files:**

- Modify: `src/main/index.ts:182` (after `browser:go-forward` handler)

- [ ] **Step 1: Add the IPC handler**

Add after the `browser:go-forward` handler (line 182):

```typescript
ipcMain.on("browser:toggle-devtools", (_event, data: { panelId: string }) => {
  panelManager.toggleBrowserDevTools(data.panelId);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add browser:toggle-devtools IPC handler"
```

---

### Task 3: Expose `toggleBrowserDevTools` in renderer preload and type declarations

**Files:**

- Modify: `src/preload/index.ts:131` (after `goForwardBrowser`)
- Modify: `src/renderer/src/env.d.ts:51` (after `goForwardBrowser` type)

- [ ] **Step 1: Add to preload**

In `src/preload/index.ts`, add after `goForwardBrowser` (line 131):

```typescript
toggleBrowserDevTools: (panelId: string) => {
  ipcRenderer.send("browser:toggle-devtools", { panelId });
},
```

- [ ] **Step 2: Add to type declarations**

In `src/renderer/src/env.d.ts`, add after `goForwardBrowser(panelId: string): void;` (line 51):

```typescript
toggleBrowserDevTools(panelId: string): void;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat: expose toggleBrowserDevTools in renderer preload API"
```

---

### Task 4: Add keyboard shortcut Cmd+Shift+I

**Files:**

- Modify: `src/main/panel-manager.ts:59-67` (inside `handleShortcutKey`, `input.shift` block)
- Modify: `src/renderer/src/App.tsx:486-624` (inside `handleShortcut` switch)

- [ ] **Step 1: Add shortcut detection in PanelManager**

In `src/main/panel-manager.ts`, inside the `if (input.shift)` block (around line 59-67), add a new case after the existing shift shortcuts:

```typescript
else if (input.key === "i") action = { type: "toggle-devtools" };
```

Add it after the `input.key === ","` line (line 67), so the block becomes:

```typescript
if (input.shift) {
  if (input.key === "ArrowLeft") action = { type: "swap-left" };
  else if (input.key === "ArrowRight") action = { type: "swap-right" };
  else if (input.key === "ArrowUp") action = { type: "prev-project" };
  else if (input.key === "ArrowDown") action = { type: "next-project" };
  else if (input.key === "n") action = { type: "add-project" };
  else if (input.key >= "1" && input.key <= "9")
    action = { type: "switch-project", index: parseInt(input.key) - 1 };
  else if (input.key === "," || input.key === "<") action = { type: "reload-config" };
  else if (input.key === "i") action = { type: "toggle-devtools" };
}
```

- [ ] **Step 2: Handle the shortcut in the renderer**

In `src/renderer/src/App.tsx`, inside the `handleShortcut` switch statement, add a new case after `browser-forward` (after line 536):

```typescript
case "toggle-devtools": {
  if (!strip) break;
  const focused = strip.state.panels[strip.state.focusedIndex];
  if (focused.type === "browser") window.api.toggleBrowserDevTools(focused.id);
  break;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main/panel-manager.ts src/renderer/src/App.tsx
git commit -m "feat: add Cmd+Shift+I shortcut to toggle browser DevTools"
```

---

### Task 5: Add wrench icon to shared icons

**Files:**

- Modify: `src/shared/icons.ts`

- [ ] **Step 1: Add the Lucide wrench SVG path**

In `src/shared/icons.ts`, add a new entry to the `ICONS` object before the closing `} as const`:

```typescript
wrench: svg(
  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  12,
),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/icons.ts
git commit -m "feat: add Lucide wrench icon to shared icons"
```

---

### Task 6: Add DevTools button to chrome strip

**Files:**

- Modify: `src/browser/browser-host.html:159` (navbar row, after reload button)
- Modify: `src/browser/browser-host.ts` (wire up button click + set icon)

- [ ] **Step 1: Add `toggleDevTools` to the browserHost preload**

In `src/preload/browser.ts`, add a new method to the `contextBridge.exposeInMainWorld("browserHost", ...)` object, after `reload`:

```typescript
toggleDevTools: () => {
  ipcRenderer.send("browser:toggle-devtools", { panelId });
},
```

- [ ] **Step 2: Update the Window type declaration in browser-host.ts**

In `src/browser/browser-host.ts`, add `toggleDevTools` to the `browserHost` interface in the `declare global` block:

```typescript
interface Window {
  browserHost: {
    panelId: string;
    initialUrl: string;
    navigate: (url: string) => void;
    goBack: () => void;
    goForward: () => void;
    reload: () => void;
    toggleDevTools: () => void;
    closePanel: () => void;
    onChromeState: (
      callback: (state: {
        position: number;
        label: string;
        focused: boolean;
        url: string;
        canGoBack: boolean;
        canGoForward: boolean;
        busy?: boolean;
      }) => void,
    ) => void;
  };
}
```

- [ ] **Step 3: Add button HTML to the navbar**

In `src/browser/browser-host.html`, add a DevTools button after the reload button (line 159) and before the closing `</div>` of the navbar:

```html
<button class="nav-btn" id="btn-reload"></button>
<button class="nav-btn" id="btn-devtools" title="Toggle DevTools"></button>
```

- [ ] **Step 4: Wire up the button in browser-host.ts**

In `src/browser/browser-host.ts`, after the `btnReload` DOM query (line 37), add:

```typescript
const btnDevTools = document.getElementById("btn-devtools") as HTMLButtonElement;
```

After the line `btnReload.innerHTML = ICONS.rotateCw;` (line 49), add:

```typescript
btnDevTools.innerHTML = ICONS.wrench;
```

After the `btnReload` click handler (line 55), add:

```typescript
btnDevTools.addEventListener("click", () => window.browserHost.toggleDevTools());
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Manual test**

Run: `npm run dev`

1. Open a browser panel (Cmd+B), navigate to any URL
2. Click the wrench icon in the navbar — DevTools should open docked at bottom
3. Click wrench again — DevTools should close
4. Press Cmd+Shift+I — DevTools should toggle
5. Focus a terminal panel, press Cmd+Shift+I — nothing should happen

- [ ] **Step 7: Commit**

```bash
git add src/preload/browser.ts src/browser/browser-host.ts src/browser/browser-host.html
git commit -m "feat: add DevTools button to browser chrome strip"
```

---

### Task 7: Add menu item for Toggle DevTools

**Files:**

- Modify: `src/main/index.ts:673-722` (View submenu in `setupShortcuts`)

- [ ] **Step 1: Add menu item**

In `src/main/index.ts`, in the "View" submenu inside `setupShortcuts`, add a new entry after "Browser Forward" and before the separator (after line 696):

```typescript
{
  label: "Toggle Browser DevTools",
  accelerator: "CommandOrControl+Shift+I",
  click: () => {
    chromeView.webContents.send("shortcut:action", { type: "toggle-devtools" });
  },
},
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add Toggle Browser DevTools menu item"
```

---

### Task 8: Run linter and tests

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Fix any lint or test issues**

If lint errors appear, fix them. Common issues: trailing commas, import order.

- [ ] **Step 4: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "chore: fix lint issues from DevTools feature"
```
