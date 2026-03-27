# Terminal File Drop Design

## Problem

Dropping files onto Flywheel's terminal panes does nothing. xterm.js has no built-in drag-and-drop support. Other terminal emulators (Ghostty, iTerm2, WezTerm, VS Code's integrated terminal) handle this by pasting the shell-escaped file path as text into the PTY, which lets CLI tools like Claude Code detect image paths and attach them automatically.

## Design

### Drop Handler

Add DOM event listeners to `terminal.element` in `src/terminal/terminal.ts`, after `terminal.open(container)`.

Three events:

- **`dragover`** — call `preventDefault()` to allow the drop. Add a CSS class to the terminal container for visual feedback.
- **`drop`** — extract file paths from `e.dataTransfer.files` using Electron's `.path` property. Shell-escape each path. Join multiple paths with spaces. Call `terminal.paste(escaped)`, which automatically wraps in bracketed paste markers (`\x1b[200~`...`\x1b[201~`) if the running program has enabled mode 2004.
- **`dragleave`** — remove the visual feedback CSS class.

No IPC is needed. `terminal.paste()` fires `onData`, which is already wired to `window.pty.input()`.

### Shell Escaping

A `shellEscape(path: string): string` function, private to `src/terminal/terminal.ts`.

Strategy: backslash-escape individual shell metacharacters, matching Ghostty's approach. This handles all characters uniformly, including paths containing single quotes.

Characters to escape: ``\ " ' $ ` * ? | ( ) ; & < > # ~ { } [ ] !`` and space.

Example: `/Users/joe/My Photos/image (1).png` becomes `/Users/joe/My\ Photos/image\ \(1\).png`

Multiple files are joined with a single space.

### Visual Feedback

When `dragover` fires, add a CSS class to the terminal container (`#terminal`) that applies a subtle indicator — a 2px `#6366f1` inset border matching the existing focus ring. Remove it on `dragleave` or `drop`.

No animation, no file type icons, no preview.

### Files Changed

- `src/terminal/terminal.ts` — drop handler + shell-escape function
- `src/terminal/index.html` — CSS for the drag-over visual indicator (if not inlined)

## Non-goals

- **Browser pane drag-and-drop** — needs separate investigation into why DOM drag events are suppressed in sandboxed WebContentsView
- **Clipboard image paste** — already working
- **Inline image display** — would require `@xterm/addon-image`
- **Configurable escaping strategy** — backslash escaping covers all cases
- **Drag-out from terminal** — out of scope

## Testing

- **Unit test** for `shellEscape` — pure function, no Electron runtime. Cover: paths with spaces, single quotes, dollar signs, backticks, multiple special characters, no-op for clean paths.
- **Manual test** — drop single file, drop multiple files, drop file with spaces/special chars, verify bracketed paste wrapping in a shell with mode 2004 enabled (e.g. zsh).
