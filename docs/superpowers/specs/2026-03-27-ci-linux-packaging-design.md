# CI Matrix Expansion & Linux Packaging

## Goal

Restructure the CI pipeline to validate Linux packaging on every PR, add arm64 Linux coverage, trim redundant runners, and configure electron-builder for Linux targets (AppImage + deb).

## Current State

- **test job**: matrix of ubuntu-22.04, ubuntu-24.04 (redundant — unit tests are platform-agnostic)
- **build job**: matrix of ubuntu-22.04, ubuntu-24.04, macos-14, macos-15 — runs bare `electron-vite build` (no packaging validation)
- **release job**: macos-15 only, runs `electron-builder --mac`, publishes DMG
- **electron-builder.yml**: mac section only, no linux config
- **package.json scripts**: `package` and `package:dir` hardcoded to `--mac`

## Design

### 1. CI Workflow (`ci.yml`)

#### test job — single runner, no matrix

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

Unit tests are pure JS/TS — no platform-specific behavior to validate across runners.

#### build job — 3-entry matrix with real packaging

| Runner | Platform flag | Artifacts produced |
|--------|--------------|-------------------|
| `macos-15` | `--mac` | DMG (arm64) |
| `ubuntu-24.04` | `--linux` | AppImage (x64), deb (x64) |
| `ubuntu-24.04-arm` | `--linux` | AppImage (arm64), deb (arm64) |

Each entry runs `electron-builder` with `--publish never` so CI never pushes to the release repo.

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

#### check-secrets job — unchanged

### 2. electron-builder.yml — add linux section

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

electron-builder auto-selects the host architecture when building. The CI matrix ensures x64 builds run on `ubuntu-24.04` and arm64 builds run on `ubuntu-24.04-arm`, so each runner only builds its native arch despite both being listed in the config.

### 3. package.json scripts

Add platform-aware scripts alongside the existing mac-specific ones:

```json
"package:linux": "electron-vite build && electron-builder --linux",
"package:linux:dir": "electron-vite build && electron-builder --linux --dir"
```

Keep existing `package` and `package:dir` (mac) unchanged.

### 4. Release workflow (`release.yml`)

Add a Linux packaging job alongside the existing macOS job:

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
    - run: npx electron-vite build
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

The existing macOS job gets renamed to `package-mac` for clarity. No changes to its logic.

## Out of Scope

- **Distro coverage** (Fedora, Arch) — Ubuntu covers the build toolchain; revisit when distributing .rpm
- **Wayland/X11 testing** — requires E2E tests and virtual display servers; no E2E tests exist yet
- **Snap/Flatpak** — sandboxing complexity with PTY access; not needed during alpha
- **macOS x64** — project targets Apple Silicon only
- **Linux code signing** — not standard for Linux desktop apps

## Risks

- **node-pty on arm64**: native compilation via node-gyp on arm64 runners may surface build issues not seen on x64. This is exactly the kind of thing we want to catch.
- **electron-builder arm64 quirks**: electron-builder downloads the correct Electron binary for the host arch, but arm64 Linux support is newer — may need `electronDownload` config if issues arise.
