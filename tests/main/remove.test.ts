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
    const removeRow = vi.fn();
    const removeProject = vi.fn();

    const result = await removeProjectTransactional(project, true, {
      removeWorktree,
      cleanupRow,
      removeRow,
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
      removedRowIds: ["row-a"],
    });
    expect(cleanupRow).toHaveBeenCalledTimes(1);
    expect(cleanupRow).toHaveBeenCalledWith("row-a");
    expect(removeRow).toHaveBeenCalledTimes(1);
    expect(removeRow).toHaveBeenCalledWith(project.id, "row-a");
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

  it("removes a project after all worktree deletions succeed", async () => {
    const project = makeProject({
      rows: [
        makeRow({ id: "row-default", branch: "main", path: "/tmp/project", isDefault: true }),
        makeRow({ id: "row-a", branch: "feat-a", path: "/tmp/project/feat-a" }),
        makeRow({ id: "row-b", branch: "feat-b", path: "/tmp/project/feat-b" }),
      ],
    });
    const removeWorktree = vi.fn().mockResolvedValue(undefined);
    const cleanupRow = vi.fn();
    const removeRow = vi.fn();
    const removeProject = vi.fn();

    const result = await removeProjectTransactional(project, true, {
      removeWorktree,
      cleanupRow,
      removeRow,
      removeProject,
    });

    expect(result).toEqual({
      removed: true,
      diskErrors: [],
      removedRowIds: ["row-a", "row-b"],
    });
    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(cleanupRow).toHaveBeenCalledTimes(3);
    expect(cleanupRow).toHaveBeenNthCalledWith(1, "row-a");
    expect(cleanupRow).toHaveBeenNthCalledWith(2, "row-b");
    expect(cleanupRow).toHaveBeenNthCalledWith(3, "row-default");
    expect(removeRow).toHaveBeenCalledTimes(2);
    expect(removeRow).toHaveBeenNthCalledWith(1, project.id, "row-a");
    expect(removeRow).toHaveBeenNthCalledWith(2, project.id, "row-b");
    expect(removeProject).toHaveBeenCalledWith(project.id);
  });

  it("removes a row without touching disk when deleteFromDisk is false", async () => {
    const project = makeProject();
    const row = project.rows[1];
    const removeWorktree = vi.fn();
    const cleanupRow = vi.fn();
    const removeRow = vi.fn();

    const result = await removeRowTransactional(project, row, false, {
      removeWorktree,
      cleanupRow,
      removeRow,
    });

    expect(result).toEqual({ removed: true });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(cleanupRow).toHaveBeenCalledWith(row.id);
    expect(removeRow).toHaveBeenCalledWith(project.id, row.id);
  });

  it("removes a project without touching disk when deleteWorktrees is false", async () => {
    const project = makeProject({
      rows: [
        makeRow({ id: "row-default", branch: "main", path: "/tmp/project", isDefault: true }),
        makeRow({ id: "row-a", branch: "feat-a", path: "/tmp/project/feat-a" }),
      ],
    });
    const removeWorktree = vi.fn();
    const cleanupRow = vi.fn();
    const removeRow = vi.fn();
    const removeProject = vi.fn();

    const result = await removeProjectTransactional(project, false, {
      removeWorktree,
      cleanupRow,
      removeRow,
      removeProject,
    });

    expect(result).toEqual({
      removed: true,
      diskErrors: [],
      removedRowIds: [],
    });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(cleanupRow).toHaveBeenCalledTimes(2);
    expect(cleanupRow).toHaveBeenNthCalledWith(1, "row-default");
    expect(cleanupRow).toHaveBeenNthCalledWith(2, "row-a");
    expect(removeRow).not.toHaveBeenCalled();
    expect(removeProject).toHaveBeenCalledWith(project.id);
  });
});
