import type { Project, RemoveProjectResult, RemoveRowResult, Row } from "../shared/types";

interface ProjectRemovalDependencies {
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>;
  cleanupRow: (rowId: string) => void;
  removeProject: (projectId: string) => void;
}

interface RowRemovalDependencies {
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>;
  cleanupRow: (rowId: string) => void;
  removeRow: (projectId: string, rowId: string) => void;
}

function toDiskRemovalError(row: Row, error: unknown) {
  return {
    rowId: row.id,
    branch: row.branch,
    path: row.path,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function removeProjectTransactional(
  project: Project | undefined,
  deleteWorktrees: boolean,
  dependencies: ProjectRemovalDependencies,
): Promise<RemoveProjectResult> {
  if (!project) {
    return {
      removed: false,
      error: "Project not found",
      diskErrors: [],
    };
  }

  const diskErrors = [];
  if (deleteWorktrees) {
    for (const row of project.rows) {
      if (row.isDefault) continue;
      try {
        await dependencies.removeWorktree(project.path, row.path);
      } catch (error) {
        diskErrors.push(toDiskRemovalError(row, error));
      }
    }
  }

  if (diskErrors.length > 0) {
    return {
      removed: false,
      diskErrors,
    };
  }

  for (const row of project.rows) {
    dependencies.cleanupRow(row.id);
  }
  dependencies.removeProject(project.id);

  return {
    removed: true,
    diskErrors: [],
  };
}

export async function removeRowTransactional(
  project: Project | undefined,
  row: Row | undefined,
  deleteFromDisk: boolean,
  dependencies: RowRemovalDependencies,
): Promise<RemoveRowResult> {
  if (!project || !row) {
    return {
      removed: false,
      error: "Row not found",
    };
  }

  if (row.isDefault) {
    return {
      removed: false,
      error: "Cannot remove the default row",
    };
  }

  if (deleteFromDisk) {
    try {
      await dependencies.removeWorktree(project.path, row.path);
    } catch (error) {
      return {
        removed: false,
        diskError: toDiskRemovalError(row, error),
      };
    }
  }

  dependencies.cleanupRow(row.id);
  dependencies.removeRow(project.id, row.id);

  return {
    removed: true,
  };
}
