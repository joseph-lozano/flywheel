import { describe, expect, it } from "vitest";
import { filterDiscoveredWorktrees } from "../../src/main/discover";
import type { BranchPrInfo, Project } from "../../src/shared/types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "test-project",
    path: "/Users/test/project",
    rows: [
      {
        id: "row-default",
        projectId: "proj-1",
        branch: "main",
        path: "/Users/test/project",
        color: "hsl(0, 70%, 60%)",
        isDefault: true,
      },
    ],
    activeRowId: "row-default",
    expanded: true,
    ...overrides,
  };
}

describe("filterDiscoveredWorktrees", () => {
  const project = makeProject();

  const worktrees = [
    { path: "/Users/test/project", branch: "main" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-merged", branch: "feat-merged" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-closed", branch: "feat-closed" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-open", branch: "feat-open" },
    { path: "/Users/test/.flywheel/worktrees/project/feat-no-pr", branch: "feat-no-pr" },
  ];

  it("skips worktrees whose branch has a merged PR", () => {
    const prStatuses = new Map<string, BranchPrInfo>([
      ["feat-merged", { status: "merged", url: "https://example.com/pr/1", number: 1 }],
      ["feat-open", { status: "open", url: "https://example.com/pr/2", number: 2 }],
    ]);

    const rows = filterDiscoveredWorktrees(project, worktrees, prStatuses);
    const branches = rows.map((r) => r.branch);

    expect(branches).not.toContain("feat-merged");
    expect(branches).toContain("feat-closed");
    expect(branches).toContain("feat-open");
    expect(branches).toContain("feat-no-pr");
    expect(rows).toHaveLength(3);
  });

  it("skips worktrees whose branch has a closed or merged PR", () => {
    const prStatuses = new Map<string, BranchPrInfo>([
      ["feat-merged", { status: "merged", url: "https://example.com/pr/1", number: 1 }],
      ["feat-closed", { status: "closed", url: "https://example.com/pr/2", number: 2 }],
      ["feat-open", { status: "draft", url: "https://example.com/pr/3", number: 3 }],
    ]);

    const rows = filterDiscoveredWorktrees(project, worktrees, prStatuses);
    const branches = rows.map((r) => r.branch);

    expect(branches).not.toContain("feat-merged");
    expect(branches).not.toContain("feat-closed");
    expect(branches).toContain("feat-open");
    expect(branches).toContain("feat-no-pr");
    expect(rows).toHaveLength(2);
  });

  it("adds all worktrees when gh is unavailable (empty map)", () => {
    const prStatuses = new Map<string, BranchPrInfo>();

    const rows = filterDiscoveredWorktrees(project, worktrees, prStatuses);
    const branches = rows.map((r) => r.branch);

    expect(branches).toContain("feat-merged");
    expect(branches).toContain("feat-closed");
    expect(branches).toContain("feat-open");
    expect(branches).toContain("feat-no-pr");
    expect(rows).toHaveLength(4);
  });
});
