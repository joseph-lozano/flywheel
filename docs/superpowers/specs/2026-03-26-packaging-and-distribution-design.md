# Packaging & Distribution Design

**Date:** 2026-03-26
**Status:** Draft
**Goal:** Package Flywheel as a signed, notarized macOS DMG with auto-update support, distributed via GitHub Releases.

## Context

Flywheel is at v0.1.0 with four phases complete. The app is functional and ready for internal dogfooding. No packaging infrastructure exists yet — no electron-builder, no code signing, no installers, no auto-update.

This spec covers everything needed to go from `npm run dev` to a distributable DMG that colleagues can download, install, and receive updates for.

## Constraints

- macOS only, Apple Silicon (arm64) only
- Closed-source code repo, public releases repo
- Internal dogfooding audience (company colleagues)
- Pre-1.0: no migration logic needed for updates

## 1. Packaging Tool: electron-builder

Add `electron-builder` as a dev dependency and `electron-updater` as a production dependency.

**Configuration:** `electron-builder.yml` at the repo root.

```yaml
appId: com.flywheel.app
productName: Flywheel
mac:
  target:
    - target: dmg
      arch: arm64
  category: public.app-category.developer-tools
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
dmg:
  sign: true
afterSign: scripts/notarize.js
publish:
  provider: github
  owner: <github-org-or-user> # must match the flywheel-releases repo owner
  repo: flywheel-releases
```

**Build pipeline:** `electron-vite build` (compiles to `out/`) then `electron-builder --mac` (packages into signed DMG).

**npm scripts:**

- `"package": "electron-vite build && electron-builder --mac"` — full build + package
- `"package:dir": "electron-vite build && electron-builder --mac --dir"` — unpacked .app for quick testing

### node-pty Handling

node-pty is a native C++ module. electron-builder rebuilds it for the target Electron version and architecture automatically. It must remain external (not bundled in asar):

```yaml
asarUnpack:
  - "node_modules/node-pty/**"
```

The existing `electron.vite.config.ts` already marks node-pty as external in Rollup — this stays as-is.

## 2. Code Signing & Notarization

### Signing

Uses a "Developer ID Application" certificate from the Apple Developer Program ($99/year). electron-builder picks up the certificate automatically from the macOS Keychain.

**Environment variables (local and CI):**

- `CSC_LINK` — base64-encoded .p12 certificate (CI only; locally it reads from Keychain)
- `CSC_KEY_PASSWORD` — certificate password

### Notarization

Submits the signed app to Apple for malware scanning. Handled via an `afterSign` hook script (`scripts/notarize.js`) that calls `@electron/notarize`.

**Environment variables:**

- `APPLE_ID` — Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from appleid.apple.com
- `APPLE_TEAM_ID` — developer team ID

### Entitlements

Two entitlements files in `build/`:

**`entitlements.mac.plist`** (main app):

- `com.apple.security.cs.allow-jit` — for node-pty/V8
- `com.apple.security.cs.allow-unsigned-executable-memory` — required by Electron
- `com.apple.security.cs.allow-dylib-environment-variables` — for native modules
- `com.apple.security.network.client` — browser panels loading URLs
- `com.apple.security.files.user-selected.read-write` — filesystem access for projects

**`entitlements.mac.inherit.plist`** (helper processes):

- Inherits the main entitlements
- `com.apple.security.inherit` — allows child processes to inherit parent entitlements

## 3. Auto-Update

### Mechanism

`electron-updater` checks GitHub Releases on the `flywheel-releases` public repo for versions newer than the running app.

**Flow:**

1. On app launch, check `flywheel-releases` GitHub Releases for a newer version
2. If found, download the update in the background
3. Show a notification: "Update available — restart to install?"
4. On user confirmation, quit and install the new version

### Integration

Add update checking to the main process (`src/main/index.ts`):

- Import `autoUpdater` from `electron-updater`
- Call `autoUpdater.checkForUpdatesAndNotify()` after the app is ready
- Handle `update-available`, `update-downloaded`, and `error` events
- Show a dialog or notification for user-facing update prompts

### Release Artifacts

electron-builder produces alongside the DMG:

- `latest-mac.yml` — manifest with version, file name, hash, and download URL
- The DMG itself

Both are uploaded to the GitHub Release. electron-updater reads `latest-mac.yml` to determine if an update is available.

## 4. Distribution: flywheel-releases Repo

A separate **public** GitHub repo (`flywheel-releases`) holds only GitHub Releases — no source code.

**Purpose:**

- electron-updater can hit the GitHub Releases API without authentication
- Colleagues download the DMG from the Releases page
- Code stays private in the main repo

**Release flow:**

1. Bump version in `package.json`
2. Commit and tag: `git tag v0.1.1`
3. Push tag: `git push origin v0.1.1`
4. CI builds, signs, notarizes, and publishes DMG + manifest to `flywheel-releases`

## 5. CI/CD: GitHub Actions on Depot Runners

### Migrate Existing CI

Move the current test + build jobs from GitHub-hosted runners to Depot runners.

### CI Matrix (PRs and pushes to main)

| Runner             | test | build |
| ------------------ | ---- | ----- |
| depot-ubuntu-22.04 | yes  | yes   |
| depot-ubuntu-24.04 | yes  | yes   |
| depot-macos-14     |      | yes   |
| depot-macos-15     |      | yes   |

Tests stay Linux-only (cheaper, platform-agnostic Vitest tests). Builds run on all four runners to catch platform-specific compilation issues, especially with node-pty.

### Packaging Workflow (tag push only)

**Trigger:** Push of a tag matching `v*` (e.g., `v0.1.0`).
**Runner:** `depot-macos-15`

**Steps:**

1. Checkout code
2. Setup Node.js 22
3. `npm ci`
4. Import signing certificate into temporary Keychain (from `CSC_LINK` secret)
5. `npm run package` (electron-vite build + electron-builder --mac --publish always)
6. electron-builder publishes DMG + `latest-mac.yml` to `flywheel-releases`

### Required Secrets

| Secret                        | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `CSC_LINK`                    | Base64-encoded .p12 signing certificate           |
| `CSC_KEY_PASSWORD`            | Certificate password                              |
| `APPLE_ID`                    | Apple ID email                                    |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization            |
| `APPLE_TEAM_ID`               | Developer team ID                                 |
| `GH_TOKEN`                    | PAT with write access to `flywheel-releases` repo |

Depot runner auth is handled via the Depot GitHub App integration (no separate `DEPOT_TOKEN` needed if the app is installed on the org).

## 6. App Icon

electron-builder requires an `icon.icns` file in `build/`. This needs to be created before the first build. A placeholder icon is fine for dogfooding — it can be replaced later.

## 7. Version Management

Versioning follows semver in `package.json`. The release workflow is driven by git tags:

- `package.json` version is the source of truth
- Git tags trigger CI packaging
- electron-updater compares the running app's version against `latest-mac.yml`

No automated version bumping — manual bump in `package.json`, commit, tag, push.

## Files to Add/Modify

**New files:**

- `electron-builder.yml` — packaging configuration
- `build/entitlements.mac.plist` — main app entitlements
- `build/entitlements.mac.inherit.plist` — helper process entitlements
- `build/icon.icns` — app icon (placeholder for now)
- `scripts/notarize.js` — afterSign notarization hook
- `.github/workflows/release.yml` — tag-triggered packaging workflow

**Modified files:**

- `package.json` — add electron-builder, electron-updater, new scripts
- `.github/workflows/ci.yml` — migrate to Depot runners, add macOS build matrix
- `src/main/index.ts` — add auto-update check on launch
- `.gitignore` — add `dist/` (electron-builder output directory)
