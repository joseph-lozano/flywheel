# BROWSER Env Var & Open Command Interception — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept URL-opening commands (`BROWSER` env var, `open`, `xdg-open`) inside Flywheel terminal panels so URLs open as browser panels instead of the system browser.

**Architecture:** Shell scripts in `~/.flywheel/bin/` emit a custom OSC 7770 escape sequence to `/dev/tty`. The PTY environment injects `BROWSER` and prepends `PATH` so the scripts are found automatically. xterm.js registers an OSC 7770 handler that routes URLs into the existing `openUrl()` → browser panel pipeline.

**Tech Stack:** Node.js `fs` (script installation), `node-pty` env (PTY injection), xterm.js parser API (OSC handler)

---

## File Structure

| File                             | Action                 | Responsibility                                       |
| -------------------------------- | ---------------------- | ---------------------------------------------------- |
| `src/main/scripts.ts`            | Create                 | Write shell scripts to `~/.flywheel/bin/` at startup |
| `src/main/index.ts`              | Modify (line 558)      | Call `installScripts()` before `createWindow()`      |
| `src/main/pty-manager.ts`        | Modify (lines 32-40)   | Inject `BROWSER`, `PATH`, `FLYWHEEL` into PTY env    |
| `src/terminal/terminal.ts`       | Modify (after line 61) | Register OSC 7770 handler                            |
| `tests/main/scripts.test.ts`     | Create                 | Tests for script installation                        |
| `tests/main/pty-manager.test.ts` | Modify                 | Tests for env injection                              |

---

### Task 1: Script installation module

**Files:**

- Create: `tests/main/scripts.test.ts`
- Create: `src/main/scripts.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/main/scripts.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { installScripts } from "../../src/main/scripts";

describe("installScripts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flywheel-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates bin directory and flywheel-open script", () => {
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
    expect(script).toContain("7770");
    expect(script).toContain("/dev/tty");
  });

  it("makes scripts executable (mode 0o755)", () => {
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const stat = statSync(join(binDir, "flywheel-open"));
    // Check owner-executable bit
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it("writes open wrapper on darwin", () => {
    installScripts(tempDir, "darwin");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "open"), "utf-8");
    expect(script).toContain("/usr/bin/open");
    expect(script).toContain("7770");
  });

  it("writes xdg-open wrapper on linux", () => {
    installScripts(tempDir, "linux");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "xdg-open"), "utf-8");
    expect(script).toContain("/usr/bin/xdg-open");
    expect(script).toContain("7770");
  });

  it("does not write open wrapper on linux", () => {
    installScripts(tempDir, "linux");
    const binDir = join(tempDir, ".flywheel", "bin");
    expect(() => statSync(join(binDir, "open"))).toThrow();
  });

  it("does not write xdg-open wrapper on darwin", () => {
    installScripts(tempDir, "darwin");
    const binDir = join(tempDir, ".flywheel", "bin");
    expect(() => statSync(join(binDir, "xdg-open"))).toThrow();
  });

  it("overwrites existing scripts idempotently", () => {
    installScripts(tempDir);
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
    expect(script).toContain("7770");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/scripts.test.ts`
Expected: FAIL — `installScripts` does not exist yet.

- [ ] **Step 3: Implement the scripts module**

In `src/main/scripts.ts`:

```ts
import { mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

const FLYWHEEL_OPEN = `#!/bin/sh
printf '\\033]7770;%s\\007' "$1" > /dev/tty
`;

const OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    printf '\\033]7770;%s\\007' "$1" > /dev/tty ;;
  *)
    /usr/bin/open "$@" ;;
esac
`;

const XDG_OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    printf '\\033]7770;%s\\007' "$1" > /dev/tty ;;
  *)
    /usr/bin/xdg-open "$@" ;;
esac
`;

export function installScripts(homeDir: string, platform: string = process.platform): void {
  const binDir = join(homeDir, ".flywheel", "bin");
  mkdirSync(binDir, { recursive: true });

  const write = (name: string, content: string): void => {
    const path = join(binDir, name);
    writeFileSync(path, content, "utf-8");
    chmodSync(path, 0o755);
  };

  write("flywheel-open", FLYWHEEL_OPEN);

  if (platform === "darwin") {
    write("open", OPEN_WRAPPER);
  } else if (platform === "linux") {
    write("xdg-open", XDG_OPEN_WRAPPER);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/scripts.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/scripts.ts tests/main/scripts.test.ts
git commit -m "feat: add shell script installation for BROWSER env interception"
```

---

### Task 2: Call installScripts at app startup

**Files:**

- Modify: `src/main/index.ts:1-2` (add import)
- Modify: `src/main/index.ts:558` (call before createWindow)

- [ ] **Step 1: Add import and startup call**

Add to the imports at the top of `src/main/index.ts`:

```ts
import { installScripts } from "./scripts";
import { homedir } from "os";
```

Change the `app.whenReady()` line from:

```ts
app.whenReady().then(createWindow);
```

to:

```ts
app.whenReady().then(() => {
  installScripts(homedir());
  createWindow();
});
```

- [ ] **Step 2: Verify build succeeds**

Run: `npx electron-vite build`
Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: install browser interception scripts at app startup"
```

---

### Task 3: Inject BROWSER, PATH, FLYWHEEL into PTY env

**Files:**

- Modify: `tests/main/pty-manager.test.ts`
- Modify: `src/main/pty-manager.ts:1-2,32-40`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `tests/main/pty-manager.test.ts`:

```ts
describe("PtyManager environment injection", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPty.onData = vi.fn(() => ({ dispose: vi.fn() }));
    mockPty.onExit = vi.fn(() => ({ dispose: vi.fn() }));
    mockPty.process = defaultShellName;
    manager = new PtyManager(mockSendToPanel, mockSendToChrome);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("sets BROWSER env var to flywheel-open script", () => {
    manager.create("panel-1");
    const env = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env;
    expect(env.BROWSER).toMatch(/\.flywheel\/bin\/flywheel-open$/);
  });

  it("prepends ~/.flywheel/bin to PATH", () => {
    manager.create("panel-1");
    const env = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env;
    expect(env.PATH).toMatch(/\.flywheel\/bin:/);
  });

  it("sets FLYWHEEL=1 marker", () => {
    manager.create("panel-1");
    const env = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env;
    expect(env.FLYWHEEL).toBe("1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: The 3 new tests FAIL — env is currently just `process.env` with no augmentation.

- [ ] **Step 3: Implement env injection**

In `src/main/pty-manager.ts`, add import at the top:

```ts
import { homedir } from "os";
import { join } from "path";
```

Then change the `create` method. Replace:

```ts
const ptyProcess = pty.spawn(shell, [], {
  cols: 80,
  rows: 24,
  cwd: cwd || process.cwd(),
  env: process.env as Record<string, string>,
});
```

with:

```ts
const binDir = join(homedir(), ".flywheel", "bin");
const env = {
  ...process.env,
  BROWSER: join(binDir, "flywheel-open"),
  PATH: `${binDir}:${process.env.PATH}`,
  FLYWHEEL: "1",
} as Record<string, string>;
const ptyProcess = pty.spawn(shell, [], {
  cols: 80,
  rows: 24,
  cwd: cwd || process.cwd(),
  env,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: All tests PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-manager.ts tests/main/pty-manager.test.ts
git commit -m "feat: inject BROWSER, PATH, FLYWHEEL env vars into PTY sessions"
```

---

### Task 4: Register OSC 7770 handler in terminal.ts

**Files:**

- Modify: `src/terminal/terminal.ts` (after line 61)

- [ ] **Step 1: Add OSC handler**

In `src/terminal/terminal.ts`, add the following block after the `terminal.loadAddon(new WebLinksAddon())` line (line 61):

```ts
// OSC 7770 — BROWSER / open wrapper script sends URLs via this sequence.
// The script writes: \033]7770;<url>\007 to /dev/tty, which flows through
// the PTY into xterm.js. We parse it here and open as a browser panel.
terminal.parser.registerOscHandler(7770, (data) => {
  window.pty.openUrl(data);
  return true;
});
```

- [ ] **Step 2: Verify build succeeds**

Run: `npx electron-vite build`
Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/terminal/terminal.ts
git commit -m "feat: register OSC 7770 handler for BROWSER env URL interception"
```

---

### Task 5: Manual smoke test

No automated test can exercise the full PTY → OSC → xterm → IPC → browser panel pipeline. Verify end-to-end manually.

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run dev`

- [ ] **Step 2: Verify scripts were installed**

In the Flywheel terminal panel, run:

```bash
ls -la ~/.flywheel/bin/
```

Expected: `flywheel-open` and `open` (on macOS) or `xdg-open` (on Linux) are present and executable.

- [ ] **Step 3: Verify BROWSER env var is set**

In the Flywheel terminal panel, run:

```bash
echo $BROWSER
```

Expected: Output ends with `.flywheel/bin/flywheel-open`.

- [ ] **Step 4: Verify FLYWHEEL marker**

In the Flywheel terminal panel, run:

```bash
echo $FLYWHEEL
```

Expected: `1`.

- [ ] **Step 5: Test flywheel-open directly**

In the Flywheel terminal panel, run:

```bash
~/.flywheel/bin/flywheel-open "https://example.com"
```

Expected: A new browser panel opens in the current strip showing `example.com`.

- [ ] **Step 6: Test open wrapper**

In the Flywheel terminal panel, run:

```bash
open "https://example.com"
```

Expected: A new browser panel opens (not the system browser).

- [ ] **Step 7: Test open passthrough for non-URLs**

In the Flywheel terminal panel, run:

```bash
open .
```

Expected: macOS Finder opens the current directory (system `open` is called, not intercepted).

- [ ] **Step 8: Run all tests one final time**

Run: `npx vitest run`
Expected: All tests pass.
