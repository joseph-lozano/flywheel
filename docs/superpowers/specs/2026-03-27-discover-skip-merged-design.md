# Design: Skip Merged-PR Worktrees During Discovery

**Date:** 2026-03-27
**Status:** Approved

## Problem

When a user runs "Discover Worktrees", all git worktrees on disk are added to the sidebar — including those whose PRs have already been merged. These stale worktrees clutter the sidebar and are rarely useful since their work is already integrated.

## Solution

Filter out worktrees with merged PRs during discovery by checking PR statuses before adding new rows.

## Approach

Use the existing `prStatusChecker.fetchPrStatuses()` infrastructure (bulk `gh pr list` call) inside the `row:discover` IPC handler.

### Modified Flow

1. Fetch all git worktrees via `worktreeManager.listWorktrees()` (unchanged)
2. Fetch PR statuses via `prStatusChecker.fetchPrStatuses(project.path)` — returns `Map<branch, PrStatus>`
3. In the filter loop, after skipping already-tracked paths and the main worktree, also skip any worktree whose branch maps to `'merged'`
4. Remaining worktrees are added as rows (unchanged)

### Graceful Degradation

If `gh` CLI is unavailable or the `fetchPrStatuses` call fails, it returns an empty map. In that case, no filtering occurs and discovery works exactly as it does today. This is acceptable — the feature is a convenience, not a correctness requirement.

### Scope Boundaries

- **Only affects discovery.** Worktrees already tracked in the sidebar are never removed or hidden by this change, even if their PR is merged.
- **Only filters `merged` status.** Worktrees with `closed` (but not merged), `draft`, `open`, or no PR are still added.
- **Toast message unchanged.** "Discovered N worktree(s)" reflects the count after filtering. No separate notification for skipped worktrees.

## Files Changed

| File                | Change                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts` | Import `prStatusChecker`, add `fetchPrStatuses` call and merged-branch filter in `row:discover` handler |
| `tests/main/`       | Add tests for: merged PR skipped, open/no PR added, gh unavailable fallback                             |

## Testing

Three cases to cover:

1. **Worktree with merged PR is skipped** — mock `fetchPrStatuses` to return `'merged'` for a branch, verify that worktree is not in the returned rows
2. **Worktree with open/no PR is added** — mock returns `'open'` or empty map, verify worktree is included
3. **gh unavailable** — mock returns empty map, verify all worktrees are added (no filtering)
