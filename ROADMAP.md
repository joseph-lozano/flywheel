# Flywheel Roadmap

Phases are built in order — each builds on the previous. Every phase gets its own spec, plan, and implementation cycle.

See [design spec](docs/superpowers/specs/2026-03-24-flywheel-design.md) for the full vision.

## Phase 1: Electron Shell + Scrollable Strip ✅

The foundation. A working Electron app with the core spatial model — before any real terminals or browsers.

**Research / Decisions (resolved):**
- ✅ Frontend framework: **Solid** — custom UI throughout, no need for React's ecosystem; fine-grained reactivity fits scroll-driven updates
- ✅ `WebContentsView` + `setBounds()` performance: Stack Browser's issues involved dozens of views; our 2-6 visible panels are a different load profile. Start with free-form scrolling, fall back to snap-only if perf is insufficient.
- ✅ Scroll event handling: In Phase 1, panels are placeholders with no scrollable content, so all horizontal wheel events can be forwarded to drive strip scroll. macOS provides momentum events natively — no custom physics needed.

**Scope:**
- Electron `BaseWindow` with a Chrome View ([spec: Process Model, L53-61](docs/superpowers/specs/2026-03-24-flywheel-design.md#L53-L61))
- Horizontal strip of **placeholder panels** (colored boxes with title bars) positioned via `setBounds()`
- Horizontal scrolling with momentum (free-form trackpad scroll + keyboard snap navigation). Fade indicators, scroll track ([spec: Scroll Behavior, L126-132](docs/superpowers/specs/2026-03-24-flywheel-design.md#L126-L132))
- Panel focus tracking with visual indicator (border + glow)
- Keyboard navigation: Mod+Left/Right to move focus, Mod+1-9 to jump ([spec: Keyboard Navigation, L108-118](docs/superpowers/specs/2026-03-24-flywheel-design.md#L108-L118))
- Keyboard hint bar ([spec: Keyboard Hint Bar, L120-122](docs/superpowers/specs/2026-03-24-flywheel-design.md#L120-L122))
- Add/remove placeholder panels via keyboard shortcuts
- Fixed-width panels as percentage of viewport ([spec: Windows, L27-31](docs/superpowers/specs/2026-03-24-flywheel-design.md#L27-L31))
- Panel hiding for off-screen panels ([spec: Panel Lifecycle, L73-78](docs/superpowers/specs/2026-03-24-flywheel-design.md#L73-L78))

**Milestone**: An Electron app where you can scroll through, focus, add, and remove placeholder panels with keyboard shortcuts. Proves the Niri-style layout works in Electron.

## Phase 2: Terminal Panels

Replace placeholders with real terminals. After this, Flywheel is a usable Niri-style terminal multiplexer.

**Research / Decisions needed first:**
- Spike: xterm.js in a `WebContentsView` — confirm IPC latency between main process (node-pty) and renderer (xterm.js) is acceptable for interactive use (vim, typing latency)
- Decision: xterm.js addon selection — WebGL renderer vs Canvas renderer, search addon, unicode11 addon
- Evaluate ghostty-web maturity at this point — if stable enough, may start with it instead of xterm.js

**Scope:**
- xterm.js + node-pty integration ([spec: Terminal, L35](docs/superpowers/specs/2026-03-24-flywheel-design.md#L35))
- Each terminal panel is a `WebContentsView` running xterm.js
- Main process manages node-pty sessions, pipes I/O via IPC
- Terminal lifecycle: create, destroy, serialize/restore state ([spec: Panel Lifecycle, L73-78](docs/superpowers/specs/2026-03-24-flywheel-design.md#L73-L78))
- Link detection in terminal output ([spec: Link Handling, L39-41](docs/superpowers/specs/2026-03-24-flywheel-design.md#L39-L41))
- Mod+T to open a new terminal ([spec: L115](docs/superpowers/specs/2026-03-24-flywheel-design.md#L115))
- Mod+W to close focused terminal ([spec: L117](docs/superpowers/specs/2026-03-24-flywheel-design.md#L117))

**Milestone**: A keyboard-driven, horizontally-scrollable terminal multiplexer. Daily-drivable.

## Phase 2.5: Minimal Browser Panels

Basic browser panels alongside terminals. Complex browser features are deferred to Phase 6.

**Scope:**
- `WebContentsView` loading a URL ([spec: Browser, L37](docs/superpowers/specs/2026-03-24-flywheel-design.md#L37))
- Address bar in title bar + Enter to navigate
- Mod+B to open a new browser panel ([spec: L116](docs/superpowers/specs/2026-03-24-flywheel-design.md#L116))

**Deferred to Phase 6:** Navigation interception (links open as new panels), configurable session sharing, auth flow handling, terminal link detection opening browser panels.

**Milestone**: Terminals and basic browsers side-by-side in the scrollable strip. You can open a localhost preview next to your dev server terminal.

## Phase 3: Sidebar

The project tree sidebar — broken out as its own focused phase before rows and config.

**Research / Decisions needed first:**
- Decision: where to persist app-level state (project list, window positions) — SQLite, JSON file, electron-store, etc.

**Scope:**
- Tree sidebar with project list ([spec: Sidebar, L80-97](docs/superpowers/specs/2026-03-24-flywheel-design.md#L80-L97))
- Add/remove projects via directory picker
- Expand/collapse project tree
- Switch between projects via sidebar

**Milestone**: Multi-project support. Open Flywheel and switch between projects from the sidebar.

## Phase 4: Rows + Worktrees

Multiple rows per project, one visible at a time, for parallel branch work. The sidebar (from Phase 3) provides the UI for switching rows.

**Research / Decisions needed first:**
- Research: git worktree CLI integration — what's needed to create, list, and remove worktrees programmatically
- Decision: should creating a new row auto-create a git worktree, or can rows exist independently?

**Scope:**
- Row model: each project can have multiple rows ([spec: Rows, L17-21](docs/superpowers/specs/2026-03-24-flywheel-design.md#L17-L21))
- Row switching via sidebar click and Mod+Up/Down ([spec: L114](docs/superpowers/specs/2026-03-24-flywheel-design.md#L114))
- Row persistence: processes keep running in background, scroll position preserved
- Git worktree integration: create/manage worktrees from the app
- Each worktree row opens terminals in the worktree directory

**Deferred to Phase 6:** Vertical scroll gesture for row switching (requires gesture disambiguation spike).

**Milestone**: Work on `main` and `feat/auth` simultaneously, each with their own dev stack, switching with a sidebar click or keyboard shortcut.

## Phase 5: Config + Process Management

Config-driven project setup and process supervision — the "Solo for your dev stack" layer.

**Research / Decisions needed first:**
- Decision: config file format — YAML, TOML, JSON, or something else
- Decision: config file name — `flywheel.yml`, `flywheel.toml`, `.flywheel`, etc.
- Decision: readiness detection strategy for `after` dependencies — port listening, stdout pattern match, fixed delay, or pluggable
- Research: crash detection and restart semantics — how to distinguish intentional exit (Ctrl+C) from crash, backoff strategy
- Decision: visual treatment for status indicators (colors, icons, animations)

**Scope:**
- Project config file loading and parsing ([spec: Config, L99-106](docs/superpowers/specs/2026-03-24-flywheel-design.md#L99-L106))
- Config-driven panel creation on project open
- Auto-launch processes from config on project open ([spec: Config, L99-106](docs/superpowers/specs/2026-03-24-flywheel-design.md#L99-L106))
- Dependency ordering: `after` field with readiness detection ([spec: Config, L105](docs/superpowers/specs/2026-03-24-flywheel-design.md#L105))
- Auto-restart on crash with backoff ([spec: L144](docs/superpowers/specs/2026-03-24-flywheel-design.md#L144))
- Status indicators in panel title bars ([spec: Process Management, L139-146](docs/superpowers/specs/2026-03-24-flywheel-design.md#L139-L146))
- Closing a managed terminal stops the process ([spec: L146](docs/superpowers/specs/2026-03-24-flywheel-design.md#L146))
- Re-evaluate panel destruction for off-screen panels — currently disabled (all panels stay as hidden WCVs). Profile memory with many real terminals/browsers to decide buffer zone size and destruction strategy.

**Milestone**: Define your stack in a config file, open the project, everything spins up in order. Crashes auto-recover. The full Flywheel MVP.

## Phase 6: Full Browser Features

The deferred complex browser capabilities and vertical scroll gesture for row switching.

**Research / Decisions needed first:**
- Spike: `WebContentsView` navigation interception — confirm `will-navigate` and `new-window` events reliably catch all link clicks for redirection into the strip
- Decision: session sharing default — per-project vs per-worktree as the default partition scope
- Research: how to handle auth flows (OAuth redirects, popups) within an embedded `WebContentsView`
- Spike: vertical scroll gesture disambiguation — build a prototype that distinguishes intentional row-switch gestures from terminal/browser scrolling. Test with real terminals running vim, less, etc. This is the hardest UX problem in the app.

**Scope:**
- Navigation interception: links open as new panels in the strip ([spec: Link Handling, L39-41](docs/superpowers/specs/2026-03-24-flywheel-design.md#L39-L41))
- Configurable session sharing: per-project, per-worktree, or per-panel ([spec: Browser, L37](docs/superpowers/specs/2026-03-24-flywheel-design.md#L37))
- Terminal link detection opening browser panels ([spec: Link Handling, L39-41](docs/superpowers/specs/2026-03-24-flywheel-design.md#L39-L41))
- Auth flow handling within embedded `WebContentsView`
- Vertical scroll gesture for row switching with intent detection ([spec: Vertical scroll, L134-137](docs/superpowers/specs/2026-03-24-flywheel-design.md#L134-L137))

**Milestone**: Full browser integration — links flow between terminals and browsers, sessions are shared intelligently, and rows can be switched with a vertical scroll gesture.

## Phase 7: Release + Distribution

Package, sign, and distribute Flywheel as a real macOS app.

**Research / Decisions needed first:**
- Research: Apple Developer Program enrollment and certificate types (Developer ID vs Mac App Store)
- Research: Electron packaging tools — electron-builder vs electron-forge, and what each handles (signing, notarization, DMG creation, auto-update)
- Decision: distribution channel — direct download (Developer ID + notarization) vs Mac App Store vs both
- Decision: auto-update strategy — electron-updater, Sparkle, or manual

**Scope:**
- Code signing with Apple Developer certificate
- Notarization via Apple's notary service
- DMG or universal `.app` bundle packaging
- Auto-update mechanism (electron-updater or similar)

**Milestone**: A signed, notarized `.dmg` that anyone can download and run on macOS without security warnings.
