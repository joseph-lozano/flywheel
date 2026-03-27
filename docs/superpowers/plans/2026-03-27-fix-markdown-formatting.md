# Fix Markdown Formatting CI Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Prettier formatting failures on two markdown docs so CI passes on main.

**Architecture:** Run `prettier --write` on the two failing files and commit the result.

**Tech Stack:** Prettier (already configured in the project)

---

### Task 1: Fix formatting and commit

**Files:**

- Modify: `docs/superpowers/plans/2026-03-27-ci-linux-packaging.md`
- Modify: `docs/superpowers/specs/2026-03-27-ci-linux-packaging-design.md`

- [ ] **Step 1: Fix formatting on the two failing files**

Run: `npx prettier --write docs/superpowers/plans/2026-03-27-ci-linux-packaging.md docs/superpowers/specs/2026-03-27-ci-linux-packaging-design.md`

Expected: `docs/superpowers/plans/2026-03-27-ci-linux-packaging.md 42ms` (files reformatted)

- [ ] **Step 2: Verify format check passes**

Run: `npm run format:check`

Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Commit the fixed files**

```bash
git add docs/superpowers/plans/2026-03-27-ci-linux-packaging.md docs/superpowers/specs/2026-03-27-ci-linux-packaging-design.md
git commit -m "fix: apply Prettier formatting to ci-linux-packaging docs"
```
