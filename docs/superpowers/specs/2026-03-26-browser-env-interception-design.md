# BROWSER Env Var & Open Command Interception

Intercept URL-opening commands inside Flywheel terminal panels so that URLs open as browser panels in the same workspace instead of the system browser.

## Problem

When a dev tool like `vite` or `npm start` tries to open a browser (via the `BROWSER` env var or by calling `open`/`xdg-open`), the URL opens in the system's default browser. The user loses context by leaving Flywheel.

## Solution

Three layers that feed into the existing browser panel pipeline:

1. **Shell scripts** in `~/.flywheel/bin/` emit a custom OSC escape sequence to `/dev/tty`
2. **PTY environment** injects `BROWSER` and prepends `PATH` so the scripts are found automatically
3. **OSC parser** in xterm.js handles OSC 7770 and routes the URL into `openUrl()` -> existing IPC pipeline

## Shell scripts

Written to `~/.flywheel/bin/` at app startup. Overwritten on every launch.

### `flywheel-open`

The canonical opener. `BROWSER` env var points here.

```sh
#!/bin/sh
printf '\033]7770;%s\007' "$1" > /dev/tty
```

### `open` (macOS only)

Wrapper that intercepts URL arguments and passes everything else to `/usr/bin/open`.

```sh
#!/bin/sh
case "$1" in
  http://*|https://*)
    printf '\033]7770;%s\007' "$1" > /dev/tty ;;
  *)
    /usr/bin/open "$@" ;;
esac
```

### `xdg-open` (Linux only)

Same pattern, delegates non-URL arguments to `/usr/bin/xdg-open`.

```sh
#!/bin/sh
case "$1" in
  http://*|https://*)
    printf '\033]7770;%s\007' "$1" > /dev/tty ;;
  *)
    /usr/bin/xdg-open "$@" ;;
esac
```

### Platform detection

`process.platform === 'darwin'` writes `open`. `process.platform === 'linux'` writes `xdg-open`. `flywheel-open` is always written.

## PTY environment injection

In `pty-manager.ts`, when spawning a PTY, augment the env:

- `BROWSER` = `{homedir}/.flywheel/bin/flywheel-open`
- `PATH` = `{homedir}/.flywheel/bin:{original PATH}`
- `FLYWHEEL` = `1` (marker so scripts can detect they're inside Flywheel)

Paths resolved at PTY creation time using `os.homedir()`.

## OSC parser

In `terminal.ts`, register a custom OSC 7770 handler:

```ts
terminal.parser.registerOscHandler(7770, (data) => {
  window.pty.openUrl(data);
  return true;
});
```

The `data` parameter is the URL string between the OSC opener (`\033]7770;`) and the terminator (`\007`). Feeds into the existing `openUrl` -> `browser:open-url-from-terminal` -> `browser:open-url` -> `activeStrip().addPanel('browser', url)` pipeline.

## Script installation lifecycle

At app startup in `main/index.ts`, after `app.whenReady()`, before creating the window:

1. `mkdirSync('~/.flywheel/bin/', { recursive: true })`
2. Write `flywheel-open` and the platform-appropriate wrapper
3. `chmodSync(path, 0o755)` on all scripts

## Why `/dev/tty`

The `BROWSER` script is spawned as a child process by dev tools. Many tools (including the `open` npm package used by vite) redirect stdout to `/dev/null`. Writing to `/dev/tty` bypasses any stdout redirection and goes directly to the controlling terminal (the PTY), ensuring xterm.js always receives the OSC sequence.

## Scope

This spec covers the new entry point only. The existing URL-opening pipeline (`activeStrip()` routing) has a known limitation where URLs always open in the currently visible row rather than the row the terminal belongs to. That is tracked separately in #10.

## Files changed

| File                       | Change                                            |
| -------------------------- | ------------------------------------------------- |
| `src/main/index.ts`        | Script installation at startup                    |
| `src/main/pty-manager.ts`  | Inject `BROWSER`, `PATH`, `FLYWHEEL` into PTY env |
| `src/terminal/terminal.ts` | Register OSC 7770 handler                         |
