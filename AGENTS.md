# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `mise install` — install the repo-pinned Node.js and pnpm versions
- `pnpm install --frozen-lockfile` — clean install (required before first run; rebuilds node-pty for Electron via postinstall)
- `pnpm dev` — dev server with hot reload
- `pnpm test` — run all tests (`vitest run`)
- `pnpm test:watch` — watch mode
- `pnpm lint` — run ESLint (strict type-checked rules)
- `pnpm format` — format with Prettier (double quotes, semis, organize-imports)
- `pnpm package:dir` — fast unsigned app bundle for local testing
- `pnpm package` — signed + notarized DMG (requires code-signing env vars)
- `pnpm package:linux` — Linux AppImage + deb (runs on Linux host)
- `pnpm package:linux:dir` — fast unsigned Linux app bundle for local testing

## Code Standards

- TypeScript strict mode — no `any` casts without justification
- Solid.js for renderer UI — follow reactive patterns (signals, effects, memos), not React idioms
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- Always create PRs as drafts first (`gh pr create --draft`)
- Squash-merge PRs with `gh pr merge --delete-branch --squash`

## Electron Architecture

- Four isolated contexts: main process (Node.js), renderer (Solid.js), terminal views (xterm.js in WebContentsView), browser host (WebContentsView)
- Four preload scripts with separate IPC surfaces: `index.ts`, `panel.ts`, `browser.ts`, `browser-content.ts`
- All IPC must validate inputs; enforce contextIsolation, never enable nodeIntegration
- node-pty is a native module — `pnpm install --frozen-lockfile` must run to rebuild it for Electron's V8

## Project State

- Alpha, macOS arm64 + Linux x64/arm64 — greenfield rules apply: no migrations needed, wipe old data freely
- Release tags must exactly match `package.json` version
- Design specs and implementation plans live in `docs/superpowers/`

## Creating a Dev Build

To build and install a local dev app for manual testing:

```bash
# 1. Build the unsigned app bundle
pnpm package:dir

# 2. Install to /Applications (always rm -rf first — copying over an existing bundle
#    does not refresh macOS Launch Services and will appear to load an old version)
rm -rf /Applications/FlywheelDev.app
cp -R dist/mac-arm64/Flywheel.app /Applications/FlywheelDev.app
touch /Applications/FlywheelDev.app
```

The `touch` updates the bundle timestamp so launchers (Raycast, Spotlight) re-index it.

**When to build:** After implementing a feature that needs manual verification — e.g., anything involving native dialogs, window lifecycle, or IPC that can't be covered by Vitest unit tests.

**Do not use `pnpm package`** — that requires code-signing credentials and notarization. Use `package:dir` for all local testing.

## Code Review

@REVIEW.md
