# GitHub Actions Superpowers Integration Design

## Goal

Integrate the superpowers plugin into GitHub Actions workflows so that:

1. PR code reviews use the superpowers requesting-code-review skill
2. Labeling an issue `claude-auto-pr` triggers Claude to autonomously plan, implement, and open a draft PR

## Dependencies

- `anthropics/claude-code-action@v1`
- `superpowers@claude-plugins-official` plugin (via `https://github.com/anthropics/claude-plugins-official` marketplace)
- Prettier (dev dependency or npx) for formatting workflow files

## Decisions

| Decision                | Choice                                   | Rationale                                                                                          |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Autonomous trigger      | `claude-auto-pr` label                   | Clear intent signal, visible on issue, cleanly separated from interactive `@claude` workflow       |
| Autonomous pipeline     | Plan → execute (skip brainstorming)      | Issues are small; brainstorming is designed for dialogue and adds overhead without a human partner |
| PR type from autonomous | Draft PR                                 | Gives the user a chance to review before code review triggers                                      |
| Code review trigger     | All non-draft PRs                        | Draft PRs (including Claude's auto-PRs) are excluded until manually promoted                       |
| Interactive workflow    | Unchanged                                | No need to add superpowers to conversational `@claude` usage                                       |
| Plugin delivery         | `plugin_marketplaces` + `plugins` params | Official plugin system, stays in sync with upstream skill updates                                  |

## Workflow Architecture

Three workflow files, cleanly separated by purpose:

### 1. `claude-code-review.yml` — Automated Code Review

**Trigger:** `pull_request` events (opened, synchronize, ready_for_review, reopened), filtered to skip draft PRs.

**Permissions:** `contents: read`, `pull-requests: write`, `issues: read`, `id-token: write`

**Behavior:**

- Installs superpowers plugin via marketplace
- Prompts Claude to invoke the `requesting-code-review` skill
- The skill dispatches a code-reviewer subagent with structured severity categories (Critical, Important, Minor)
- Review output is posted as PR comments

**Changes from current:**

- Replaces `code-review@claude-code-plugins` plugin with `superpowers@claude-plugins-official`
- Replaces marketplace URL from `https://github.com/anthropics/claude-code.git` to `https://github.com/anthropics/claude-plugins-official`
- Adds `if: github.event.pull_request.draft == false` filter

### 2. `claude-auto-pr.yml` — Autonomous Issue → Draft PR (new file)

**Trigger:** `issues` event with `labeled` type, filtered to `claude-auto-pr` label.

**Permissions:** `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write`

**Behavior:**

- Installs superpowers plugin via marketplace
- Reads the issue title and body
- Prompts Claude to:
  1. Use `superpowers:writing-plans` to create an implementation plan from the issue
  2. Use `superpowers:executing-plans` to implement the plan
  3. Create a draft PR against `main`, linking to the issue
- Claude makes all decisions autonomously (no clarifying questions, no waiting for approval)

**Prompt structure:**

```
Read issue #<number>: <title>

<body>

Use superpowers:writing-plans to create an implementation plan, then
superpowers:executing-plans to implement it. Do not ask clarifying
questions — make reasonable decisions autonomously. When complete, create
a draft PR against main that references this issue.
```

### 3. `claude.yml` — Interactive (unchanged)

No modifications. Continues to handle `@claude` mentions in issues, PR comments, and reviews.

## Workflow Lifecycle

```
Issue created
    │
    ├── User adds `claude-auto-pr` label
    │       │
    │       ▼
    │   claude-auto-pr.yml triggers
    │       │
    │       ▼
    │   Claude: plan → implement → draft PR
    │       │
    │       ▼
    │   User reviews draft PR
    │       │
    │       ▼
    │   User marks PR "ready for review"
    │       │
    │       ▼
    │   claude-code-review.yml triggers
    │       │
    │       ▼
    │   Superpowers code review runs
    │
    └── User comments @claude on issue/PR
            │
            ▼
        claude.yml triggers (interactive)
```

## Formatting

All three workflow YAML files will be formatted with Prettier after implementation.
