# flywheel-open /dev/tty Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `flywheel-open` (and the platform `open`/`xdg-open` wrappers) gracefully fall back to the native browser-open command when `/dev/tty` is not available.

**Architecture:** Check `/dev/tty` writability with `[ -w /dev/tty ]` before attempting the OSC sequence redirect. If unavailable, call the real system opener (`open` / `xdg-open`) directly. Update the three shell script constants in `src/main/scripts.ts` and the corresponding tests.

**Tech Stack:** POSIX sh, TypeScript, Vitest

---

## File Map

| File                         | Change                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/scripts.ts`        | Update `FLYWHEEL_OPEN`, `OPEN_WRAPPER`, `XDG_OPEN_WRAPPER` constants with TTY guard + fallback |
| `tests/main/scripts.test.ts` | Update existing TTY assertion; add tests for fallback content                                  |

---

### Task 1: Update `FLYWHEEL_OPEN` script constant

**Files:**

- Modify: `src/main/scripts.ts:4-9`
- Test: `tests/main/scripts.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/main/scripts.test.ts`, add a new test after the existing `"creates bin directory and flywheel-open script"` test:

```typescript
it("flywheel-open falls back when /dev/tty is unavailable", () => {
  installScripts(tempDir);
  const binDir = join(tempDir, ".flywheel", "bin");
  const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
  expect(script).toContain("[ -w /dev/tty ]");
  expect(script).toContain("command -v open");
  expect(script).toContain("command -v xdg-open");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: FAIL — `expected … to contain '[ -w /dev/tty ]'`

- [ ] **Step 3: Update `FLYWHEEL_OPEN` constant in `src/main/scripts.ts`**

Replace lines 4–9:

```typescript
const FLYWHEEL_OPEN = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    elif command -v open > /dev/null 2>&1; then
      open "$1"
    elif command -v xdg-open > /dev/null 2>&1; then
      xdg-open "$1"
    fi ;;
esac
`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: all pass, including the new test.

- [ ] **Step 5: Commit**

```bash
git add src/main/scripts.ts tests/main/scripts.test.ts
git commit -m "fix: guard flywheel-open against missing /dev/tty"
```

---

### Task 2: Update `OPEN_WRAPPER` script constant (macOS)

**Files:**

- Modify: `src/main/scripts.ts:11-18`
- Test: `tests/main/scripts.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/main/scripts.test.ts`, add a new test after the existing `"writes open wrapper on darwin"` test:

```typescript
it("open wrapper falls back to /usr/bin/open when /dev/tty is unavailable", () => {
  installScripts(tempDir, "darwin");
  const binDir = join(tempDir, ".flywheel", "bin");
  const script = readFileSync(join(binDir, "open"), "utf-8");
  expect(script).toContain("[ -w /dev/tty ]");
  // Should call /usr/bin/open as fallback for HTTP URLs too
  const httpBlock = script.slice(script.indexOf("http://"));
  expect(httpBlock).toContain("/usr/bin/open");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: FAIL — `expected … to contain '[ -w /dev/tty ]'`

- [ ] **Step 3: Update `OPEN_WRAPPER` constant in `src/main/scripts.ts`**

Replace lines 11–18:

```typescript
const OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    else
      /usr/bin/open "$1"
    fi ;;
  *)
    /usr/bin/open "$@" ;;
esac
`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/scripts.ts tests/main/scripts.test.ts
git commit -m "fix: guard open wrapper against missing /dev/tty on macOS"
```

---

### Task 3: Update `XDG_OPEN_WRAPPER` script constant (Linux)

**Files:**

- Modify: `src/main/scripts.ts:20-27`
- Test: `tests/main/scripts.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/main/scripts.test.ts`, add a new test after the existing `"writes xdg-open wrapper on linux"` test:

```typescript
it("xdg-open wrapper falls back to /usr/bin/xdg-open when /dev/tty is unavailable", () => {
  installScripts(tempDir, "linux");
  const binDir = join(tempDir, ".flywheel", "bin");
  const script = readFileSync(join(binDir, "xdg-open"), "utf-8");
  expect(script).toContain("[ -w /dev/tty ]");
  // Should call /usr/bin/xdg-open as fallback for HTTP URLs too
  const httpBlock = script.slice(script.indexOf("http://"));
  expect(httpBlock).toContain("/usr/bin/xdg-open");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: FAIL — `expected … to contain '[ -w /dev/tty ]'`

- [ ] **Step 3: Update `XDG_OPEN_WRAPPER` constant in `src/main/scripts.ts`**

Replace lines 20–27:

```typescript
const XDG_OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    else
      /usr/bin/xdg-open "$1"
    fi ;;
  *)
    /usr/bin/xdg-open "$@" ;;
esac
`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/scripts.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/scripts.ts tests/main/scripts.test.ts
git commit -m "fix: guard xdg-open wrapper against missing /dev/tty on Linux"
```

---

### Task 4: Full test suite verification

**Files:** none changed

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass with no regressions.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no lint errors.
