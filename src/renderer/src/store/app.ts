import { createStore } from "solid-js/store";
import { SIDEBAR } from "../../../shared/constants";
import type { Project, PrStatus, Row } from "../../../shared/types";

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  sidebarWidth: number;
}

function computeSidebarWidth(projects: Project[]): number {
  if (projects.length === 0) return SIDEBAR.MIN_WIDTH;
  let longestName = 0;
  for (const p of projects) {
    longestName = Math.max(longestName, p.name.length);
    if (p.expanded) {
      for (const r of p.rows) {
        // Row names are indented, add 3 chars for icon + indent
        longestName = Math.max(longestName, r.branch.length + 3);
      }
    }
  }
  const estimated = longestName * 7 + SIDEBAR.ITEM_PADDING_H * 2 + 2 + 12;
  return Math.max(SIDEBAR.MIN_WIDTH, Math.min(estimated, SIDEBAR.MAX_WIDTH));
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    projects: [],
    activeProjectId: null,
    sidebarWidth: SIDEBAR.MIN_WIDTH,
  });

  const actions = {
    loadProjects(projects: Project[], activeProjectId: string | null): void {
      setState("projects", projects);
      setState("activeProjectId", activeProjectId);
      setState("sidebarWidth", computeSidebarWidth(projects));
    },

    addProject(project: Project): void {
      setState("projects", [...state.projects, project]);
      setState("activeProjectId", project.id);
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    removeProject(id: string): void {
      const newProjects = state.projects.filter((p) => p.id !== id);
      setState("projects", newProjects);
      if (state.activeProjectId === id) {
        setState("activeProjectId", newProjects.length > 0 ? newProjects[0].id : null);
      }
      setState("sidebarWidth", computeSidebarWidth(newProjects));
    },

    switchProject(id: string): void {
      if (state.projects.some((p) => p.id === id)) {
        setState("activeProjectId", id);
      }
    },

    getActiveProject(): Project | null {
      if (!state.activeProjectId) return null;
      return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
    },

    // --- Row management ---

    addRow(projectId: string, row: Row): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      setState("projects", idx, "rows", [...state.projects[idx].rows, row]);
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    removeRow(projectId: string, rowId: string): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      const project = state.projects[idx];
      const newRows = project.rows.filter((r) => r.id !== rowId);
      setState("projects", idx, "rows", newRows);
      if (project.activeRowId === rowId) {
        const defaultRow = newRows.find((r) => r.isDefault);
        const nextActiveId = defaultRow ? defaultRow.id : newRows.length > 0 ? newRows[0].id : "";
        setState("projects", idx, "activeRowId", nextActiveId);
      }
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    switchRow(projectId: string, rowId: string): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      setState("projects", idx, "activeRowId", rowId);
    },

    updateBranch(projectId: string, rowId: string, branch: string): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      const rowIdx = state.projects[idx].rows.findIndex((r) => r.id === rowId);
      if (rowIdx < 0) return;
      setState("projects", idx, "rows", rowIdx, "branch", branch);
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    updatePrStatuses(
      projectId: string,
      updates: { rowId: string; prStatus: PrStatus | undefined }[],
    ): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      const updateMap = new Map(updates.map((u) => [u.rowId, u.prStatus]));
      for (let i = 0; i < state.projects[idx].rows.length; i++) {
        const row = state.projects[idx].rows[i];
        if (updateMap.has(row.id)) {
          setState("projects", idx, "rows", i, "prStatus", updateMap.get(row.id));
        }
      }
    },

    setExpanded(projectId: string, expanded: boolean): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      setState("projects", idx, "expanded", expanded);
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    getActiveRow(): Row | null {
      const project = actions.getActiveProject();
      if (!project) return null;
      return project.rows.find((r) => r.id === project.activeRowId) ?? null;
    },
  };

  return { state, actions };
}
