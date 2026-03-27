import { randomUUID } from "crypto";
import Store from "electron-store";
import { accessSync, constants, existsSync } from "fs";
import { basename } from "path";
import { goldenAngleColor } from "../shared/constants";
import type { Project, Row } from "../shared/types";

interface StoreSchema {
  projects: Project[];
  activeProjectId: string | null;
  worktreeCounter: number;
}

export class ProjectStore {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        projects: [],
        activeProjectId: null,
        worktreeCounter: 0,
      },
    });
    // Phase 4: clear pre-Phase 4 projects that lack rows
    const projects = this.store.get("projects");
    if (projects.some((p) => p.rows.length === 0)) {
      this.store.set("projects", []);
      this.store.set("activeProjectId", null);
    }
  }

  getProjects(): Project[] {
    const projects = this.store.get("projects");
    return projects.map((p) => ({
      ...p,
      missing: !existsSync(p.path),
      expanded: p.expanded,
    }));
  }

  getActiveProjectId(): string | null {
    return this.store.get("activeProjectId");
  }

  setActiveProjectId(id: string | null): void {
    this.store.set("activeProjectId", id);
  }

  addProject(dirPath: string, defaultBranch = "main"): Project | null {
    const projects = this.store.get("projects");
    if (projects.some((p) => p.path === dirPath)) return null;

    try {
      accessSync(dirPath, constants.R_OK);
    } catch {
      return null;
    }

    const projectId = randomUUID();
    const defaultRow: Row = {
      id: randomUUID(),
      projectId,
      branch: defaultBranch,
      path: dirPath,
      color: goldenAngleColor(0),
      isDefault: true,
    };

    const project: Project = {
      id: projectId,
      name: basename(dirPath),
      path: dirPath,
      rows: [defaultRow],
      activeRowId: defaultRow.id,
      expanded: true,
    };
    this.store.set("projects", [...projects, project]);
    return project;
  }

  removeProject(id: string): void {
    const projects = this.store.get("projects");
    this.store.set(
      "projects",
      projects.filter((p) => p.id !== id),
    );
    if (this.getActiveProjectId() === id) {
      this.setActiveProjectId(null);
    }
  }

  addRow(projectId: string, row: Row): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, rows: [...p.rows, row] };
    });
    this.store.set("projects", updated);
  }

  removeRow(projectId: string, rowId: string): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const newRows = p.rows.filter((r) => r.id !== rowId);
      const fallbackId = newRows.find((r) => r.isDefault)?.id ?? newRows[0]?.id;
      const activeRowId = p.activeRowId === rowId ? fallbackId : p.activeRowId;
      return { ...p, rows: newRows, activeRowId };
    });
    this.store.set("projects", updated);
  }

  setActiveRowId(projectId: string, rowId: string): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, activeRowId: rowId };
    });
    this.store.set("projects", updated);
  }

  updateRowBranch(projectId: string, rowId: string, branch: string): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        rows: p.rows.map((r) => (r.id === rowId ? { ...r, branch } : r)),
      };
    });
    this.store.set("projects", updated);
  }

  nextWorktreeCounter(): number {
    const counter = this.store.get("worktreeCounter");
    this.store.set("worktreeCounter", counter + 1);
    return counter;
  }

  setExpanded(projectId: string, expanded: boolean): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, expanded };
    });
    this.store.set("projects", updated);
  }
}
