# GitHub Actions Superpowers Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate superpowers plugin into GitHub Actions for structured code review and autonomous issue-to-draft-PR workflows.

**Architecture:** Three separate workflow files, each with a single responsibility. The code review and auto-PR workflows both install the superpowers plugin via the official marketplace. The interactive workflow remains unchanged.

**Tech Stack:** GitHub Actions, `anthropics/claude-code-action@v1`, `superpowers@claude-plugins-official`, Prettier (npx)

---

### Task 1: Update Code Review Workflow

**Files:**

- Modify: `.github/workflows/claude-code-review.yml`

- [ ] **Step 1: Replace the entire contents of `.github/workflows/claude-code-review.yml`**

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

jobs:
  claude-review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Claude Code Review
        id: claude-review
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: "https://github.com/anthropics/claude-plugins-official"
          plugins: "superpowers@claude-plugins-official"
          prompt: "/superpowers:requesting-code-review"
```

- [ ] **Step 2: Verify the YAML is valid**

Run: `npx yaml-lint .github/workflows/claude-code-review.yml || echo "install yaml-lint" && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-code-review.yml'))"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-code-review.yml
git commit -m "feat: switch code review to superpowers requesting-code-review skill"
```

---

### Task 2: Create Autonomous Issue-to-Draft-PR Workflow

**Files:**

- Create: `.github/workflows/claude-auto-pr.yml`

- [ ] **Step 1: Create `.github/workflows/claude-auto-pr.yml` with the following contents**

```yaml
name: Claude Auto PR

on:
  issues:
    types: [labeled]

jobs:
  claude-auto-pr:
    if: github.event.label.name == 'claude-auto-pr'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Auto PR
        id: claude-auto-pr
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: "https://github.com/anthropics/claude-plugins-official"
          plugins: "superpowers@claude-plugins-official"
          prompt: |
            Read issue #${{ github.event.issue.number }}: ${{ github.event.issue.title }}

            ${{ github.event.issue.body }}

            Use superpowers:writing-plans to create an implementation plan, then superpowers:executing-plans to implement it. Do not ask clarifying questions — make reasonable decisions autonomously. When complete, create a draft PR against main that closes this issue.
```

- [ ] **Step 2: Verify the YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/claude-auto-pr.yml'))"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-auto-pr.yml
git commit -m "feat: add claude-auto-pr workflow for autonomous issue-to-draft-PR"
```

---

### Task 3: Format All Workflow Files with Prettier

**Files:**

- Modify: `.github/workflows/claude-code-review.yml`
- Modify: `.github/workflows/claude-auto-pr.yml`
- Modify: `.github/workflows/claude.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Format all workflow YAML files with Prettier**

Run: `npx prettier --write '.github/workflows/*.yml'`

Expected: Prettier formats the files (may adjust quoting, indentation, trailing newlines).

- [ ] **Step 2: Review the diff to confirm formatting-only changes**

Run: `git diff .github/workflows/`

Expected: Only whitespace/quoting/formatting changes — no behavioral modifications.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "style: format GitHub Actions workflow files with Prettier"
```
