# Packaging & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Flywheel as a signed, notarized macOS DMG with auto-update via GitHub Releases, built on Depot CI runners.

**Architecture:** electron-builder packages the electron-vite output into a signed DMG. electron-updater checks a public `flywheel-releases` GitHub repo for new versions. CI uses Depot runners with a matrix of Ubuntu + macOS versions for test/build, and a separate tag-triggered workflow for release packaging.

**Tech Stack:** electron-builder, electron-updater, @electron/notarize, GitHub Actions, Depot runners

---

## Prerequisites (manual, before starting tasks)

These are one-time setup steps the developer must complete outside of code:

1. **Apple Developer Program** — Sign up at https://developer.apple.com ($99/year). Once enrolled:
   - Open Xcode → Settings → Accounts → add your Apple ID
   - In https://developer.apple.com/account/resources/certificates, create a **Developer ID Application** certificate
   - Download and double-click the `.cer` file to install it in your Keychain
   - Export it as a `.p12` file from Keychain Access (right-click the certificate → Export)

2. **App-specific password** — Generate one at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords

3. **flywheel-releases repo** — Create a new **public** GitHub repo (e.g. `your-org/flywheel-releases`). It needs no files — just the empty repo. This is where DMGs and update manifests get published.

4. **GitHub PAT** — Create a fine-grained Personal Access Token with `Contents: Read and write` permission on the `flywheel-releases` repo.

5. **Repository secrets** — In the **private** Flywheel repo, add these secrets under Settings → Secrets and variables → Actions:
   - `CSC_LINK` — base64 of the `.p12` file: `base64 -i certificate.p12 | pbcopy`
   - `CSC_KEY_PASSWORD` — the password you set when exporting the `.p12`
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — the app-specific password from step 2
   - `APPLE_TEAM_ID` — your 10-character team ID (visible at https://developer.apple.com/account → Membership Details)
   - `GH_TOKEN` — the PAT from step 4

6. **Depot** — Install the Depot GitHub App on your org (https://depot.dev/docs/github-actions/overview) so Depot runners are available to your workflows.

---

### Task 1: Install dependencies and add npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install electron-builder and electron-updater**

```bash
cd /Users/joseph/.flywheel/worktrees/flywheel/brave-deer-xag
npm install --save-dev electron-builder @electron/notarize
npm install --save electron-updater
```

- [ ] **Step 2: Add package scripts to package.json**

In `package.json`, add two new scripts after the existing `postinstall` script:

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "test": "vitest run",
  "test:watch": "vitest",
  "postinstall": "npx @electron/rebuild -m node_modules/node-pty",
  "package": "electron-vite build && electron-builder --mac",
  "package:dir": "electron-vite build && electron-builder --mac --dir"
}
```

- [ ] **Step 3: Verify install succeeded**

Run:
```bash
npx electron-builder --version
```

Expected: prints version number (e.g. `26.8.1`)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add electron-builder and electron-updater dependencies"
```

---

### Task 2: Create macOS entitlements files

**Files:**
- Create: `build/entitlements.mac.plist`
- Create: `build/entitlements.mac.inherit.plist`

- [ ] **Step 1: Create the build directory**

```bash
mkdir -p build
```

- [ ] **Step 2: Create the main app entitlements file**

Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dylib-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

These entitlements are required because:
- `allow-jit` and `allow-unsigned-executable-memory` — Electron/V8 JIT compilation
- `allow-dylib-environment-variables` — node-pty native module loading
- `network.client` — browser panels fetching URLs
- `files.user-selected.read-write` — accessing project directories

- [ ] **Step 3: Create the helper process entitlements file**

Create `build/entitlements.mac.inherit.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dylib-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.inherit</key>
    <true/>
</dict>
</plist>
```

This is identical to the main entitlements plus `com.apple.security.inherit`, which allows Electron's helper processes (GPU, renderer, plugin) to inherit the parent app's entitlements.

- [ ] **Step 4: Commit**

```bash
git add build/entitlements.mac.plist build/entitlements.mac.inherit.plist
git commit -m "feat: add macOS entitlements for code signing"
```

---

### Task 3: Create electron-builder configuration

**Files:**
- Create: `electron-builder.yml`
- Create: `scripts/notarize.js`

- [ ] **Step 1: Create electron-builder.yml at the repo root**

```yaml
appId: com.flywheel.app
productName: Flywheel

directories:
  buildResources: build

files:
  - '!src/*'
  - '!docs/*'
  - '!tests/*'
  - '!scripts/*'
  - '!.github/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  - '!{vitest.config.ts,ROADMAP.md}'

asarUnpack:
  - node_modules/node-pty/**

npmRebuild: false

mac:
  target:
    - target: dmg
      arch: arm64
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist

afterSign: scripts/notarize.js

dmg:
  sign: true
  artifactName: ${name}-${version}-arm64.${ext}

publish:
  provider: github
  owner: OWNER
  repo: flywheel-releases
```

**Important:** Replace `OWNER` with your GitHub org or username (must match the owner of the `flywheel-releases` repo).

`npmRebuild: false` because `@electron/rebuild` already runs during `npm ci` via the postinstall script — no need for electron-builder to rebuild again.

The `files` exclusions keep source code, docs, tests, and config files out of the packaged app. electron-builder includes everything by default, so we exclude what's not needed.

`asarUnpack` keeps node-pty outside the asar archive since it's a native module that must be loaded from disk.

- [ ] **Step 2: Create the notarization script**

Create the `scripts/` directory and `scripts/notarize.js`:

```bash
mkdir -p scripts
```

```javascript
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization — APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`

  console.log(`Notarizing ${appPath}...`)

  await notarize({
    appBundleId: 'com.flywheel.app',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  })

  console.log('Notarization complete')
}
```

The script skips notarization when the environment variables aren't set. This means `npm run package` works locally without signing credentials (useful for testing the build pipeline) while CI runs with full signing and notarization.

- [ ] **Step 3: Verify .gitignore already covers dist/**

`.gitignore` already contains `dist/` (electron-builder's output directory). No changes needed — just confirm it's there:

```bash
grep 'dist/' .gitignore
```

Expected: `dist/`

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml scripts/notarize.js
git commit -m "feat: add electron-builder config with signing and notarization"
```

---

### Task 4: Verify local unsigned build

This task produces no committed code — it verifies that the packaging pipeline works.

- [ ] **Step 1: Run an unsigned build**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir
```

`CSC_IDENTITY_AUTO_DISCOVERY=false` tells electron-builder to skip code signing. `package:dir` produces an unpacked `.app` directory (faster than building a DMG).

Expected: completes without errors. Output in `dist/mac-arm64/Flywheel.app/`.

- [ ] **Step 2: Verify the .app structure**

```bash
ls dist/mac-arm64/Flywheel.app/Contents/
```

Expected: `Frameworks/`, `Info.plist`, `MacOS/`, `Resources/`

- [ ] **Step 3: Verify node-pty is unpacked from asar**

```bash
ls dist/mac-arm64/Flywheel.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/
```

Expected: directory exists with `build/`, `lib/`, `package.json`, etc.

- [ ] **Step 4: Launch the app**

```bash
open dist/mac-arm64/Flywheel.app
```

Expected: Flywheel launches, terminals work (node-pty loaded correctly), browser panels load URLs.

- [ ] **Step 5: Verify DMG build**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package
```

Expected: `dist/flywheel-0.1.0-arm64.dmg` is created.

- [ ] **Step 6: Clean up**

```bash
rm -rf dist/
```

---

### Task 5: Add auto-updater to main process

**Files:**
- Create: `src/main/auto-updater.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the auto-updater module**

Create `src/main/auto-updater.ts`:

```typescript
import { autoUpdater } from 'electron-updater'
import { dialog } from 'electron'

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to install?`,
        buttons: ['Restart', 'Later']
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err.message)
  })

  autoUpdater.checkForUpdatesAndNotify()
}
```

This module:
- Downloads updates automatically in the background
- Shows a dialog when a download finishes asking to restart
- Logs errors silently (no user-facing error UI — appropriate for dogfooding)
- Calls `checkForUpdatesAndNotify()` which checks GitHub Releases for a version newer than `package.json`'s version

- [ ] **Step 2: Wire auto-updater into the main process**

In `src/main/index.ts`, add the import at the top with the other imports:

```typescript
import { initAutoUpdater } from './auto-updater'
```

Then replace the `app.whenReady()` line at the bottom of the file. Change:

```typescript
app.whenReady().then(createWindow)
```

to:

```typescript
app.whenReady().then(async () => {
  await createWindow()

  // Only check for updates in production builds
  if (!process.env['ELECTRON_RENDERER_URL']) {
    initAutoUpdater()
  }
})
```

The `ELECTRON_RENDERER_URL` check ensures the auto-updater only runs in production. In dev mode (`electron-vite dev`), this env var is set, so the updater is skipped.

- [ ] **Step 3: Verify dev mode still works**

```bash
npm run dev
```

Expected: app launches in dev mode, no update-related errors in the console. The auto-updater should NOT run (check the terminal — no "checking for updates" log).

- [ ] **Step 4: Commit**

```bash
git add src/main/auto-updater.ts src/main/index.ts
git commit -m "feat: add auto-updater checking GitHub Releases on launch"
```

---

### Task 6: Migrate CI to Depot runners with build matrix

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Rewrite ci.yml with Depot runners and matrix strategy**

Replace the entire contents of `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        os: [depot-ubuntu-22.04, depot-ubuntu-24.04]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    strategy:
      matrix:
        os: [depot-ubuntu-22.04, depot-ubuntu-24.04, depot-macos-14, depot-macos-15]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-vite build
```

Changes from the previous ci.yml:
- `ubuntu-latest` → Depot runners for both test and build
- Test runs on two Ubuntu versions (22.04, 24.04)
- Build runs on four runners (2 Ubuntu + 2 macOS) to catch platform-specific compilation issues, especially with node-pty native module
- Tests stay Linux-only (platform-agnostic Vitest tests; cheaper than macOS minutes)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: migrate to Depot runners with Ubuntu + macOS build matrix"
```

---

### Task 7: Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  package:
    runs-on: depot-macos-15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Build
        run: npx electron-vite build

      - name: Package and publish
        run: npx electron-builder --mac --publish always
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

How this works:
- Triggers only when you push a tag matching `v*` (e.g. `git tag v0.1.0 && git push origin v0.1.0`)
- Runs on Depot macOS 15 (Apple Silicon) — required for arm64 native module builds and `codesign`/`notarytool`
- `electron-vite build` compiles TypeScript to `out/`
- `electron-builder --mac --publish always` packages into a signed DMG, notarizes with Apple, and publishes the DMG + `latest-mac.yml` to the `flywheel-releases` repo's GitHub Releases
- `GH_TOKEN` is a PAT with write access to `flywheel-releases` (the default `GITHUB_TOKEN` only has access to the current repo)

**To ship a release:**
```bash
# 1. Bump version in package.json
# 2. Commit
git add package.json
git commit -m "release: v0.1.1"
# 3. Tag and push
git tag v0.1.1
git push origin main v0.1.1
```

The tag push triggers the workflow. A few minutes later, the DMG appears on `flywheel-releases`'s Releases page.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow for signed macOS DMG"
```
