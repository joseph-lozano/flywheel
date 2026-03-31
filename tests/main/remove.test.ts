import { describe, expect, it, vi } from "vitest";
import { removeProjectTransactional, removeRowTransactional } from "../../src/main/remove";
import type { Project, Row } from "../../src/shared/types";

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    projectId: "project-1",
    branch: "feat-1",
    path: "/tmp/project/feat-1",
    color: "hsl(0, 65%, 65%)",
    isDefault: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  const defaultRow = makeRow({
    id: "row-default",
    branch: "main",
    path: "/tmp/project",
    isDefault: true,
  });

  return {
    id: "project-1",
    name: "project",
    path: "/tmp/project",
    rows: [defaultRow, makeRow()],
    activeRowId: defaultRow.id,
    expanded: true,
    ...overrides,
  };
}

describe("transactional removals", () => {
  it("keeps a row in state when deleting its worktree fails", async () => {
    const project = makeProject();
    const row = project.rows[1];
    const removeWorktree = vi.fn().mockRejectedValue(new Error("worktree busy"));
    const cleanupRow = vi.fn();
    const removeRow = vi.fn();

    const result = await removeRowTransactional(project, row, true, {
      removeWorktree,
      cleanupRow,
      removeRow,
    });

    expect(result).toEqual({
      removed: false,
      diskError: {
        rowId: row.id,
        branch: row.branch,
        path: row.path,
        message: "worktree busy",
      },
    });
    expect(cleanupRow).not.toHaveBeenCalled();
    expect(removeRow).not.toHaveBeenCalled();
  });

  it("keeps a project in state when any worktree delete fails", async () => {
    const project = makeProject({
      rows: [
        makeRow({ id: "row-default", branch: "main", path: "/tmp/project", isDefault: true }),
        makeRow({ id: "row-a", branch: "feat-a", path: "/tmp/project/feat-a" }),
        makeRow({ id: "row-b", branch: "feat-b", path: "/tmp/project/feat-b" }),
      ],
    });
    const removeWorktree = vi
      .fn<(projectPath: string, worktreePath: string) => Promise<void>>()
      .mockImplementation((_projectPath, worktreePath) => {
        if (worktreePath.endsWith("feat-b")) {
          return Promise.reject(new Error("permission denied"));
        }
        return Promise.resolve();
      });
    const cleanupRow = vi.fn();
    const removeProject = vi.fn();

    const result = await removeProjectTransactional(project, true, {
      removeWorktree,
      cleanupRow,
      removeProject,
    });

    expect(result).toEqual({
      removed: false,
      diskErrors: [
        {
          rowId: "row-b",
          branch: "feat-b",
          path: "/tmp/project/feat-b",
          message: "permission denied",
        },
      ],
    });
    expect(cleanupRow).not.toHaveBeenCalled();
    expect(removeProject).not.toHaveBeenCalled();
  });

  it("cleans up and removes a row after a successful delete", async () => {
    const project = makeProject();
    const row = project.rows[1];
    const removeWorktree = vi.fn().mockResolvedValue(undefined);
    const cleanupRow = vi.fn();
    const removeRow = vi.fn();

    const result = await removeRowTransactional(project, row, true, {
      removeWorktree,
      cleanupRow,
      removeRow,
    });

    expect(result).toEqual({ removed: true });
    expect(cleanupRow).toHaveBeenCalledWith(row.id);
    expect(removeRow).toHaveBeenCalledWith(project.id, row.id);
  });
});
