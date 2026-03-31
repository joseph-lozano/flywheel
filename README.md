# Flywheel

Development Command Center. A spatial terminal multiplexer built with Electron.

## Prerequisites

- [mise](https://mise.jdx.dev/)
- macOS (Apple Silicon)
- Xcode Command Line Tools (`xcode-select --install`)

## Setup

```bash
mise install
pnpm install --frozen-lockfile
```

The repo pins `node@24` and `pnpm@10` via `mise.toml`. The `postinstall` hook rebuilds `node-pty` for Electron automatically.

## Development

```bash
pnpm dev         # Start dev server with hot reload
pnpm test        # Run tests
pnpm test:watch  # Run tests in watch mode
```

## Building

```bash
pnpm package      # Build signed DMG
pnpm package:dir  # Build unpacked .app (faster, for testing)
```

Local builds sign with your Keychain identity but skip notarization. To test unsigned:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package:dir
```

## Releasing

Releases are published to this repo as signed, notarized DMGs and Linux packages.

### Documenting changes

Run this during a PR to describe what changed:

```bash
pnpm changeset
```

This creates a `.changeset/*.md` file — commit it alongside your PR changes.

### Publishing a release

When ready to cut a release:

```bash
# 1. Bump version and generate CHANGELOG.md from pending changesets
GITHUB_TOKEN=<your-pat> pnpm changeset version

# 2. Review CHANGELOG.md, then commit and tag
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

The tag push triggers the release workflow, which builds, signs, notarizes, and publishes the artifacts. The tag version must match `package.json` or CI will fail. Pre-release tags (alpha/beta/rc) are marked as pre-releases.

> **Note:** `GITHUB_TOKEN` is required by `@changesets/changelog-github` to enrich entries with PR links. Without it, changeset falls back to a plain format.

### Manual test builds

Trigger a test build from any branch (requires the workflow on `main`):

```bash
gh workflow run release.yml --ref <branch-name>
```

The artifacts are uploaded as workflow artifacts (not published to releases).

## CI

GitHub Actions with status checks required on `main`:

| Job   | Runners                                  | What                  |
| ----- | ---------------------------------------- | --------------------- |
| test  | ubuntu-24.04                             | `vitest run`          |
| build | ubuntu-24.04, ubuntu-24.04-arm, macos-15 | `electron-vite build` |

## Required Secrets

| Secret                        | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `CSC_LINK`                    | Base64-encoded .p12 signing certificate |
| `CSC_KEY_PASSWORD`            | Certificate password                    |
| `APPLE_ID`                    | Apple ID email                          |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization  |
| `APPLE_TEAM_ID`               | Developer team ID                       |

## Tech Stack

- **Electron** with BaseWindow + WebContentsView
- **Solid.js** for the UI
- **xterm.js** with WebGL rendering for terminals
- **node-pty** for shell processes
- **electron-vite** for builds
- **Vitest** for tests
- **electron-builder** for packaging
