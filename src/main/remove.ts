import type {
  DiskRemovalError,
  Project,
  RemoveProjectResult,
  RemoveRowResult,
  Row,
} from "../shared/types";

interface ProjectRemovalDependencies {
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>;
  cleanupRow: (rowId: string) => void;
  removeRow: (projectId: string, rowId: string) => void;
  removeProject: (projectId: string) => void;
}

interface RowRemovalDependencies {
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>;
  cleanupRow: (rowId: string) => void;
  removeRow: (projectId: string, rowId: string) => void;
}

function toDiskRemovalError(row: Row, error: unknown): DiskRemovalError {
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
      removedRowIds: [],
    };
  }

  const removedRowIds: string[] = [];
  if (deleteWorktrees) {
    for (const row of project.rows) {
      if (row.isDefault) continue;
      try {
        await dependencies.removeWorktree(project.path, row.path);
        dependencies.cleanupRow(row.id);
        dependencies.removeRow(project.id, row.id);
        removedRowIds.push(row.id);
      } catch (error) {
        return {
          removed: false,
          diskError: toDiskRemovalError(row, error),
          removedRowIds,
        };
      }
    }
  }

  for (const row of project.rows) {
    if (removedRowIds.includes(row.id)) continue;
    dependencies.cleanupRow(row.id);
  }
  dependencies.removeProject(project.id);

  return {
    removed: true,
    removedRowIds,
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
