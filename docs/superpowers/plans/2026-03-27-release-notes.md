# Release Notes Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate release notes on both repos with a cumulative changelog in flywheel-releases.

**Architecture:** Add a `release-notes` job to `release.yml` that runs after packaging, creates a GitHub Release on the main repo with auto-generated notes, copies the body to the flywheel-releases release, and updates a CHANGELOG.md in flywheel-releases.

**Tech Stack:** GitHub Actions, `gh` CLI

---

### Task 1: Add the `release-notes` job to `release.yml`

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add the `release-notes` job**

Append the following job to the end of `.github/workflows/release.yml`:

```yaml
  release-notes:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [package-mac, package-linux]
    runs-on: ubuntu-24.04
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Determine tag
        id: tag
        run: echo "version=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"

      - name: Create release on main repo
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${{ steps.tag.outputs.version }}"
          PRERELEASE=""
          if echo "$TAG" | grep -qE '-(alpha|beta|rc)'; then
            PRERELEASE="--prerelease"
          fi
          gh release create "$TAG" --generate-notes $PRERELEASE

      - name: Copy release notes to flywheel-releases
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          TAG="${{ steps.tag.outputs.version }}"
          BODY=$(gh release view "$TAG" --repo joseph-lozano/flywheel --json body -q .body)
          gh release edit "$TAG" --repo joseph-lozano/flywheel-releases --notes "$BODY"

      - name: Update CHANGELOG.md in flywheel-releases
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          TAG="${{ steps.tag.outputs.version }}"
          BODY=$(gh release view "$TAG" --repo joseph-lozano/flywheel --json body -q .body)

          git clone "https://x-access-token:${GH_TOKEN}@github.com/joseph-lozano/flywheel-releases.git" flywheel-releases-repo
          cd flywheel-releases-repo

          if [ ! -f CHANGELOG.md ]; then
            echo "# Changelog" > CHANGELOG.md
          fi

          # Create new entry
          {
            echo "# Changelog"
            echo ""
            echo "## $TAG"
            echo ""
            echo "$BODY"
            echo ""
            # Append everything after the first line (the old "# Changelog" header)
            tail -n +2 CHANGELOG.md
          } > CHANGELOG.tmp
          mv CHANGELOG.tmp CHANGELOG.md

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add CHANGELOG.md
          git commit -m "docs: update changelog for $TAG"
          git push
```

- [ ] **Step 2: Verify the workflow YAML is valid**

Run:
```bash
cd /Users/joseph/.flywheel/worktrees/flywheel/fast-snow-yzu && npx yaml-lint .github/workflows/release.yml || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

Expected: no errors.

- [ ] **Step 3: Lint**

Run:
```bash
cd /Users/joseph/.flywheel/worktrees/flywheel/fast-snow-yzu && npm run lint && npm run format
```

Expected: passes with no changes.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add automated release notes to release workflow"
```
