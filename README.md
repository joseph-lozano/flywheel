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

Releases are published to [flywheel-releases](https://github.com/joseph-lozano/flywheel-releases) as signed, notarized DMGs.

1. Bump version in `package.json`
2. Commit: `git commit -am "release: v0.x.x"`
3. Tag: `git tag v0.x.x`
4. Push: `git push origin main v0.x.x`

The tag push triggers the release workflow, which builds, signs, notarizes, and publishes the DMG. The tag version must match `package.json` or CI will fail.

Release notes are auto-generated from merged PRs and published to both the main repo and [flywheel-releases](https://github.com/joseph-lozano/flywheel-releases). A cumulative `CHANGELOG.md` is maintained in `flywheel-releases`. Pre-release tags (alpha/beta/rc) are marked as pre-releases.

### Manual test builds

Trigger a test build from any branch (requires the workflow on `main`):

```bash
gh workflow run release.yml --ref <branch-name>
```

The DMG is uploaded as a workflow artifact (not published to releases).

## CI

GitHub Actions with status checks required on `main`:

| Job           | Runners                                        | What                               |
| ------------- | ---------------------------------------------- | ---------------------------------- |
| test          | ubuntu-22.04, ubuntu-24.04                     | `vitest run`                       |
| build         | ubuntu-22.04, ubuntu-24.04, macos-14, macos-15 | `electron-vite build`              |
| check-secrets | ubuntu-24.04                                   | Warns when GH_TOKEN is near expiry |

## Required Secrets

| Secret                        | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `CSC_LINK`                    | Base64-encoded .p12 signing certificate      |
| `CSC_KEY_PASSWORD`            | Certificate password                         |
| `APPLE_ID`                    | Apple ID email                               |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization       |
| `APPLE_TEAM_ID`               | Developer team ID                            |
| `GH_TOKEN`                    | PAT with write access to `flywheel-releases` |

## Tech Stack

- **Electron** with BaseWindow + WebContentsView
- **Solid.js** for the UI
- **xterm.js** with WebGL rendering for terminals
- **node-pty** for shell processes
- **electron-vite** for builds
- **Vitest** for tests
- **electron-builder** for packaging
