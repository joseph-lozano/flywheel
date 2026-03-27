# CI Matrix Expansion & Linux Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure CI to validate Linux packaging (AppImage + deb) on every PR, add arm64 Linux coverage, and trim redundant runners.

**Architecture:** Four config files change: `electron-builder.yml` gets a `linux` section, `package.json` gets Linux scripts, `ci.yml` collapses to single-runner tests + 3-entry build matrix with real packaging, `release.yml` adds a Linux packaging job alongside macOS.

**Tech Stack:** GitHub Actions, electron-builder 26.x, electron-vite 5.x

---

### Task 1: Add Linux targets to electron-builder.yml

**Files:**
- Modify: `electron-builder.yml:20-42`

- [ ] **Step 1: Add linux, appImage, and deb sections**

Append the following after the existing `dmg` section (before `publish`):

```yaml
linux:
  target:
    - target: AppImage
      arch:
        - x64
        - arm64
    - target: deb
      arch:
        - x64
        - arm64
  category: Development

appImage:
  artifactName: ${name}-${version}-${arch}.${ext}

deb:
  artifactName: ${name}-${version}-${arch}.${ext}
```

The full file should now read:

```yaml
appId: com.flywheel.app
productName: Flywheel

directories:
  buildResources: build

files:
  - '!src/**/*'
  - '!docs/**/*'
  - '!tests/**/*'
  - '!scripts/**/*'
  - '!.github/**/*'
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

linux:
  target:
    - target: AppImage
      arch:
        - x64
        - arm64
    - target: deb
      arch:
        - x64
        - arm64
  category: Development

appImage:
  artifactName: ${name}-${version}-${arch}.${ext}

deb:
  artifactName: ${name}-${version}-${arch}.${ext}

publish:
  provider: github
  owner: joseph-lozano
  repo: flywheel-releases
```

Note: `scripts/notarize.js` already guards on `electronPlatformName !== 'darwin'`, so `afterSign` is safe for Linux builds.

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add Linux AppImage and deb targets to electron-builder"
```

---

### Task 2: Add Linux package scripts to package.json

**Files:**
- Modify: `package.json:6-14` (scripts section)

- [ ] **Step 1: Add package:linux and package:linux:dir scripts**

Add two new scripts after the existing `package:dir` entry:

```json
"package:linux": "electron-vite build && electron-builder --linux",
"package:linux:dir": "electron-vite build && electron-builder --linux --dir"
```

The full scripts section should read:

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "test": "vitest run",
  "test:watch": "vitest",
  "postinstall": "npx @electron/rebuild -m node_modules/node-pty",
  "package": "electron-vite build && electron-builder --mac",
  "package:dir": "electron-vite build && electron-builder --mac --dir",
  "package:linux": "electron-vite build && electron-builder --linux",
  "package:linux:dir": "electron-vite build && electron-builder --linux --dir"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat: add package:linux scripts"
```

---

### Task 3: Restructure CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace test job — single runner, no matrix**

Replace the entire `test` job (lines 21-34) with:

```yaml
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Replace build job — 3-entry matrix with packaging**

Replace the entire `build` job (lines 36-49) with:

```yaml
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-15
            platform: mac
          - os: ubuntu-24.04
            platform: linux
          - os: ubuntu-24.04-arm
            platform: linux
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-vite build
      - run: npx electron-builder --${{ matrix.platform }} --publish never
```

The full `ci.yml` should now read:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-secrets:
    runs-on: ubuntu-24.04
    steps:
      - name: Check for expiring secrets
        run: |
          TODAY=$(date -u +%Y-%m-%d)
          if [[ "$TODAY" > "2026-05-31" ]]; then
            echo "::error::GH_TOKEN expires 2026-06-24. Rotate it now and update the secret."
            exit 1
          fi

  test:
    runs-on: ubuntu-24.04
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
      fail-fast: false
      matrix:
        include:
          - os: macos-15
            platform: mac
          - os: ubuntu-24.04
            platform: linux
          - os: ubuntu-24.04-arm
            platform: linux
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-vite build
      - run: npx electron-builder --${{ matrix.platform }} --publish never
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: restructure CI — single-runner tests, 3-entry build matrix with packaging"
```

---

### Task 4: Add Linux job to release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Rename existing job from `package` to `package-mac`**

Change line 10 from `package:` to `package-mac:`. No other changes to the macOS job.

- [ ] **Step 2: Add package-linux job**

Append the following job after `package-mac`:

```yaml
  package-linux:
    strategy:
      matrix:
        include:
          - os: ubuntu-24.04
            arch: x64
          - os: ubuntu-24.04-arm
            arch: arm64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Verify tag matches package.json version
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          TAG_VERSION="${GITHUB_REF#refs/tags/v}"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::Tag v$TAG_VERSION does not match package.json version $PKG_VERSION"
            exit 1
          fi

      - name: Build
        run: npx electron-vite build

      - name: Package and publish
        run: npx electron-builder --linux --publish ${{ startsWith(github.ref, 'refs/tags/v') && 'always' || 'never' }}
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}

      - name: Upload test artifact
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: flywheel-test-linux-${{ matrix.arch }}
          path: |
            dist/*.AppImage
            dist/*.deb
```

The full `release.yml` should now read:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  package-mac:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Verify tag matches package.json version
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          TAG_VERSION="${GITHUB_REF#refs/tags/v}"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::Tag v$TAG_VERSION does not match package.json version $PKG_VERSION"
            exit 1
          fi

      - name: Install Apple intermediate certificate
        run: curl -sO https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer && sudo security import DeveloperIDG2CA.cer -k /Library/Keychains/System.keychain && rm DeveloperIDG2CA.cer

      - name: Build
        run: npx electron-vite build

      - name: Package and publish
        run: npx electron-builder --mac --publish ${{ startsWith(github.ref, 'refs/tags/v') && 'always' || 'never' }}
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}

      - name: Upload test artifact
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: flywheel-test-dmg
          path: dist/*.dmg

  package-linux:
    strategy:
      matrix:
        include:
          - os: ubuntu-24.04
            arch: x64
          - os: ubuntu-24.04-arm
            arch: arm64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Verify tag matches package.json version
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          TAG_VERSION="${GITHUB_REF#refs/tags/v}"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::Tag v$TAG_VERSION does not match package.json version $PKG_VERSION"
            exit 1
          fi

      - name: Build
        run: npx electron-vite build

      - name: Package and publish
        run: npx electron-builder --linux --publish ${{ startsWith(github.ref, 'refs/tags/v') && 'always' || 'never' }}
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}

      - name: Upload test artifact
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: flywheel-test-linux-${{ matrix.arch }}
          path: |
            dist/*.AppImage
            dist/*.deb
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add Linux packaging job to release workflow"
```

---

### Task 5: Update CLAUDE.md with new scripts

**Files:**
- Modify: `CLAUDE.md:11-12`

- [ ] **Step 1: Add Linux package commands to Build & Run section**

After the existing `npm run package` line, add:

```markdown
- `npm run package:linux` — Linux AppImage + deb (runs on Linux host)
- `npm run package:linux:dir` — fast unsigned Linux app bundle for local testing
```

- [ ] **Step 2: Update Project State section**

Change line 30 from:

```markdown
- Alpha (0.1.0-alpha.1), macOS arm64 only — greenfield rules apply: no migrations needed, wipe old data freely
```

to:

```markdown
- Alpha (0.1.0-alpha.1), macOS arm64 + Linux x64/arm64 — greenfield rules apply: no migrations needed, wipe old data freely
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Linux packaging commands and update platform support"
```
