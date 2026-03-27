import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../../src/renderer/src/store/app";
import type { Project, Row } from "../../src/shared/types";

function withAppStore(fn: (store: ReturnType<typeof createAppStore>) => void) {
  createRoot((dispose) => {
    const store = createAppStore();
    fn(store);
    dispose();
  });
}

function mkProject(id: string, name: string): Project {
  const defaultRow: Row = {
    id: `${id}-row-default`,
    projectId: id,
    branch: "main",
    path: `/${name}`,
    color: "hsl(0, 65%, 65%)",
    isDefault: true,
  };
  return {
    id,
    name,
    path: `/${name}`,
    rows: [defaultRow],
    activeRowId: defaultRow.id,
    expanded: true,
  };
}

describe("createAppStore", () => {
  it("starts with no projects", () => {
    withAppStore(({ state }) => {
      expect(state.projects).toHaveLength(0);
      expect(state.activeProjectId).toBeNull();
    });
  });
});

describe("project management", () => {
  it("addProject adds to list and sets active", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe("p1");
      expect(state.activeProjectId).toBe("p1");
    });
  });

  it("removeProject removes from list", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "a"));
      actions.addProject(mkProject("p2", "b"));
      actions.removeProject("p1");
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe("p2");
    });
  });

  it("removeProject switches to next project if active was removed", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "a"));
      actions.addProject(mkProject("p2", "b"));
      actions.switchProject("p1");
      actions.removeProject("p1");
      expect(state.activeProjectId).toBe("p2");
    });
  });

  it("removeProject sets null if last project removed", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "a"));
      actions.removeProject("p1");
      expect(state.activeProjectId).toBeNull();
    });
  });
});

describe("project switching", () => {
  it("switchProject changes activeProjectId", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "a"));
      actions.addProject(mkProject("p2", "b"));
      actions.switchProject("p1");
      expect(state.activeProjectId).toBe("p1");
    });
  });

  it("getActiveProject returns current project", () => {
    withAppStore(({ actions }) => {
      actions.addProject(mkProject("p1", "test"));
      expect(actions.getActiveProject()?.id).toBe("p1");
    });
  });

  it("getActiveProject returns null when no active", () => {
    withAppStore(({ actions }) => {
      expect(actions.getActiveProject()).toBeNull();
    });
  });
});

describe("sidebar width", () => {
  it("computes sidebar width from longest project name", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "short"));
      expect(state.sidebarWidth).toBeGreaterThanOrEqual(180);
      expect(state.sidebarWidth).toBeLessThanOrEqual(280);
    });
  });

  it("returns 180 (min) when no projects", () => {
    withAppStore(({ state }) => {
      expect(state.sidebarWidth).toBe(180);
    });
  });
});

describe("loadProjects", () => {
  it("loads project list and active project", () => {
    withAppStore(({ state, actions }) => {
      const projects: Project[] = [mkProject("p1", "a"), mkProject("p2", "b")];
      actions.loadProjects(projects, "p2");
      expect(state.projects).toHaveLength(2);
      expect(state.activeProjectId).toBe("p2");
    });
  });
});

describe("row management", () => {
  it("addRow appends row to project", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      const row: Row = {
        id: "row-2",
        projectId: "p1",
        branch: "feat",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      actions.addRow("p1", row);
      expect(state.projects[0].rows).toHaveLength(2);
    });
  });

  it("removeRow removes row from project", () => {
    withAppStore(({ state, actions }) => {
      const p = mkProject("p1", "test");
      const row: Row = {
        id: "row-2",
        projectId: "p1",
        branch: "feat",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      p.rows.push(row);
      actions.addProject(p);
      actions.removeRow("p1", "row-2");
      expect(state.projects[0].rows).toHaveLength(1);
    });
  });

  it("removeRow switches to default if active was removed", () => {
    withAppStore(({ state, actions }) => {
      const p = mkProject("p1", "test");
      const row: Row = {
        id: "row-2",
        projectId: "p1",
        branch: "feat",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      p.rows.push(row);
      p.activeRowId = "row-2";
      actions.addProject(p);
      actions.removeRow("p1", "row-2");
      expect(state.projects[0].activeRowId).toBe("p1-row-default");
    });
  });

  it("switchRow updates activeRowId", () => {
    withAppStore(({ state, actions }) => {
      const p = mkProject("p1", "test");
      const row: Row = {
        id: "row-2",
        projectId: "p1",
        branch: "feat",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      p.rows.push(row);
      actions.addProject(p);
      actions.switchRow("p1", "row-2");
      expect(state.projects[0].activeRowId).toBe("row-2");
    });
  });

  it("setExpanded toggles project expanded", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.setExpanded("p1", false);
      expect(state.projects[0].expanded).toBe(false);
    });
  });

  it("updateBranch updates row branch name", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updateBranch("p1", "p1-row-default", "develop");
      expect(state.projects[0].rows[0].branch).toBe("develop");
    });
  });
});

describe("PR status updates", () => {
  it("updatePrStatuses sets prStatus on matching rows", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: "open" }]);
      expect(state.projects[0].rows[0].prStatus).toBe("open");
    });
  });

  it("updatePrStatuses clears prStatus when undefined", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: "open" }]);
      actions.updatePrStatuses("p1", [{ rowId: "p1-row-default", prStatus: undefined }]);
      expect(state.projects[0].rows[0].prStatus).toBeUndefined();
    });
  });

  it("updatePrStatuses ignores unknown project", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      actions.updatePrStatuses("unknown", [{ rowId: "p1-row-default", prStatus: "open" }]);
      expect(state.projects[0].rows[0].prStatus).toBeUndefined();
    });
  });
});

describe("updateBranch with addRow interaction", () => {
  it("updateBranch works on rows added via addRow", () => {
    withAppStore(({ state, actions }) => {
      actions.addProject(mkProject("p1", "test"));
      const row: Row = {
        id: "row-wt",
        projectId: "p1",
        branch: "old-bear-0xn",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      actions.addRow("p1", row);
      actions.updateBranch("p1", "row-wt", "feat/drag-and-drop-files");
      expect(state.projects[0].rows[1].branch).toBe("feat/drag-and-drop-files");
    });
  });

  it("updateBranch works after loadProjects", () => {
    withAppStore(({ state, actions }) => {
      const p = mkProject("p1", "test");
      const row: Row = {
        id: "row-wt",
        projectId: "p1",
        branch: "old-bear-0xn",
        path: "/wt",
        color: "hsl(137, 65%, 65%)",
        isDefault: false,
      };
      p.rows.push(row);
      actions.loadProjects([p], "p1");
      actions.updateBranch("p1", "row-wt", "feat/drag-and-drop-files");
      expect(state.projects[0].rows[1].branch).toBe("feat/drag-and-drop-files");
    });
  });
});
