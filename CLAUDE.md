# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- `npm ci` — clean install (required before first run; rebuilds node-pty for Electron via postinstall)
- `npm run dev` — dev server with hot reload
- `npm test` — run all tests (`vitest run`)
- `npm run test:watch` — watch mode
- `npm run lint` — run ESLint (strict type-checked rules)
- `npm run format` — format with Prettier (double quotes, semis, organize-imports)
- `npm run package:dir` — fast unsigned app bundle for local testing
- `npm run package` — signed + notarized DMG (requires code-signing env vars)
- `npm run package:linux` — Linux AppImage + deb (runs on Linux host)
- `npm run package:linux:dir` — fast unsigned Linux app bundle for local testing

## Code Standards

- TypeScript strict mode — no `any` casts without justification
- Solid.js for renderer UI — follow reactive patterns (signals, effects, memos), not React idioms
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- Always create PRs as drafts first (`gh pr create --draft`); mark ready for review only when CI passes and the PR is complete
- Squash-merge PRs with `gh pr merge --delete-branch --squash`

## Electron Architecture

- Four isolated contexts: main process (Node.js), renderer (Solid.js), terminal views (xterm.js in WebContentsView), browser host (WebContentsView)
- Four preload scripts with separate IPC surfaces: `index.ts`, `panel.ts`, `browser.ts`, `browser-content.ts`
- All IPC must validate inputs; enforce contextIsolation, never enable nodeIntegration
- node-pty is a native module — `npm ci` must run to rebuild it for Electron's V8

## Project State

- Alpha (0.1.0-alpha.1), macOS arm64 + Linux x64/arm64 — greenfield rules apply: no migrations needed, wipe old data freely
- Release tags must exactly match `package.json` version
- Design specs and implementation plans live in `docs/superpowers/`

## Code Review

@REVIEW.md
