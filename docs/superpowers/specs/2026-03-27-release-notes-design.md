# Release Notes Design

## Goal

Automate release notes so they appear on both the main repo and `flywheel-releases` GitHub Releases pages, with a cumulative changelog in `flywheel-releases`.

## How It Works

When a `v*` tag is pushed, `release.yml` adds a new job that runs after packaging completes:

### 1. Create release on the main repo

Use `gh release create $TAG --generate-notes` on the main (`flywheel`) repo. GitHub auto-generates the release body from PRs merged since the previous tag.

### 2. Copy release body to `flywheel-releases`

The electron-builder `--publish always` step already creates a release on `flywheel-releases` with the binary artifacts. After that completes, use the GitHub API to read the main repo release body and update the `flywheel-releases` release body to match.

### 3. Update CHANGELOG.md in `flywheel-releases`

Clone `flywheel-releases`, prepend the new version's notes under a `## vX.Y.Z` heading, commit, and push.

## Workflow Changes

A single new job `release-notes` is added to `release.yml`:

- **Runs after**: `package-mac` and `package-linux` (needs block ensures binaries are published first)
- **Condition**: only on tag pushes (`startsWith(github.ref, 'refs/tags/v')`)
- **Permissions**: needs `contents: write` on the main repo (for `GITHUB_TOKEN`)
- **Uses**: `GITHUB_TOKEN` for main repo operations (steps 1-2), `GH_TOKEN` PAT for `flywheel-releases` operations (steps 3-4)

### Steps

1. `gh release create $TAG --generate-notes --repo joseph-lozano/flywheel` — creates the main repo release. If the tag contains `-alpha`, `-beta`, or `-rc`, add `--prerelease`.
2. `gh release view $TAG --repo joseph-lozano/flywheel --json body -q .body` — captures the generated notes
3. `gh release edit $TAG --repo joseph-lozano/flywheel-releases --notes "$BODY"` — updates the releases repo release body
4. Clone `flywheel-releases`, prepend `## $TAG` + notes to `CHANGELOG.md`, commit, push

## CHANGELOG.md Format

```markdown
# Changelog

## v0.2.0

<!-- GitHub-generated notes pasted as-is -->

## v0.1.0

<!-- GitHub-generated notes pasted as-is -->
```

No reformatting — GitHub's generated format is used directly.

## What Stays the Same

- Tag-based release trigger
- electron-builder packaging and publishing
- Version verification step
- Code signing and notarization
- Manual `workflow_dispatch` builds (release-notes job is skipped)

## Edge Cases

- **Pre-release tags** (e.g., `v0.1.0-alpha.1`): `--generate-notes` works with any tag format — it finds the previous tag regardless of naming and generates notes from commits between them
- **First release (no previous tag)**: `--generate-notes` uses the full commit history, which is fine
- **CHANGELOG.md doesn't exist yet**: the script creates it with a `# Changelog` header
- **electron-builder hasn't created the release yet**: the `needs` dependency on packaging jobs ensures it has
