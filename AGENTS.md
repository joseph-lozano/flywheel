# AGENTS.md

Agent-specific instructions for this repository. These complement CLAUDE.md.

## Creating a Dev Build

To build and install a local dev app for manual testing:

```bash
# 1. Build the unsigned app bundle
npm run package:dir

# 2. Install to /Applications (always rm -rf first — copying over an existing bundle
#    does not refresh macOS Launch Services and will appear to load an old version)
rm -rf /Applications/FlywheelDev.app
cp -R dist/mac-arm64/Flywheel.app /Applications/FlywheelDev.app
touch /Applications/FlywheelDev.app
```

The `touch` updates the bundle timestamp so launchers (Raycast, Spotlight) re-index it.

**When to build:** After implementing a feature that needs manual verification — e.g., anything involving native dialogs, window lifecycle, or IPC that can't be covered by Vitest unit tests.

**Do not use `npm run package`** — that requires code-signing credentials and notarization. Use `package:dir` for all local testing.
