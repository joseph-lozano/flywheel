# Phase 4: Rows + Worktrees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multiple rows per project (one per git worktree) with instant row switching, sidebar tree UI, and keyboard-driven worktree creation.

**Architecture:** Each project gains a `rows: Row[]` array. The default row maps to the project's main working directory; additional rows are git worktrees at `~/.flywheel/worktrees/<project>/<name>/`. Strip stores and panel IDs are re-keyed from `projectId` to `rowId`. Row switching reuses the existing snapshot/restore pattern. A new `WorktreeManager` handles all git CLI operations.

**Tech Stack:** Electron, SolidJS, node-pty, electron-store, git CLI (`git worktree`), lucide-solid

**Spec:** `docs/superpowers/specs/2026-03-25-phase4-rows-worktrees-design.md`

---

### Task 1: Types & Constants

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Test: `tests/shared/color.test.ts` (create)

- [ ] **Step 1: Write failing test for golden-angle color generation**

Create `tests/shared/color.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { goldenAngleColor } from "../../src/shared/constants";

describe("goldenAngleColor", () => {
  it("returns an hsl string", () => {
    expect(goldenAngleColor(0)).toMatch(/^hsl\(\d+(\.\d+)?, 65%, 65%\)$/);
  });

  it("produces different hues for different indices", () => {
    const colors = [0, 1, 2, 3, 4].map(goldenAngleColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(5);
  });

  it("wraps hue around 360", () => {
    const color = goldenAngleColor(3);
    expect(color).toMatch(/^hsl\(\d+(\.\d+)?, 65%, 65%\)$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/color.test.ts`
Expected: FAIL — `goldenAngleColor` does not exist

- [ ] **Step 3: Add goldenAngleColor to constants**

In `src/shared/constants.ts`, add after the `SIDEBAR` export (line 67):

```typescript
export function goldenAngleColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${Math.round(hue * 100) / 100}, 65%, 65%)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/color.test.ts`
Expected: PASS

- [ ] **Step 5: Add Row interface and extend Project in types.ts**

In `src/shared/types.ts`, add after the `Project` interface (line 16):

```typescript
export interface Row {
  id: string;
  projectId: string;
  branch: string;
  path: string;
  color: string;
  isDefault: boolean;
}
```

Extend the `Project` interface (replace lines 11–16):

```typescript
export interface Project {
  id: string;
  name: string;
  path: string;
  missing?: boolean;
  rows: Row[];
  activeRowId: string;
  expanded: boolean;
}
```

Update `PersistedState` (replace lines 18–21):

```typescript
export interface PersistedState {
  projects: Project[];
  activeProjectId: string | null;
}
```

(PersistedState stays the same — rows are nested inside Project.)

- [ ] **Step 6: Update ShortcutAction type**

In `src/shared/types.ts`, replace the `ShortcutAction` type (line 56–58):

```typescript
export type ShortcutAction = {
  type:
    | "focus-left"
    | "focus-right"
    | "swap-left"
    | "swap-right"
    | "new-panel"
    | "new-browser"
    | "close-panel"
    | "jump-to"
    | "blur-panel"
    | "reload-browser"
    | "browser-back"
    | "browser-forward"
    | "add-project"
    | "switch-project"
    | "prev-project"
    | "next-project"
    | "new-row"
    | "prev-row"
    | "next-row";
  index?: number;
};
```

- [ ] **Step 7: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: Some tests may fail because `Project` now requires `rows`, `activeRowId`, `expanded`. That's expected — we'll fix those in subsequent tasks.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts tests/shared/color.test.ts
git commit -m "feat: add Row type, extend Project, add golden-angle color generation"
```

---

### Task 2: WorktreeManager

**Files:**

- Create: `src/main/worktree-manager.ts`
- Test: `tests/main/worktree-manager.test.ts` (create)

- [ ] **Step 1: Write failing tests for WorktreeManager**

Create `tests/main/worktree-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorktreeManager } from "../../src/main/worktree-manager";

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Mock fs
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

describe("WorktreeManager", () => {
  let manager: WorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorktreeManager();
  });

  describe("generateName", () => {
    it("returns adjective-noun-NNN format", () => {
      const name = manager.generateName();
      expect(name).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    });

    it("generates different names on successive calls", () => {
      const names = new Set(Array.from({ length: 10 }, () => manager.generateName()));
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe("resolveBase", () => {
    it("resolves origin/HEAD when remote exists", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (args.includes("origin/HEAD")) cb(null, { stdout: "abc123\n" });
          else cb(new Error("not found"));
        },
      );
      const base = await manager.resolveBase("/test/project");
      expect(base).toBe("abc123");
    });

    it("falls back to HEAD when no remote", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (args.includes("origin/HEAD")) cb(new Error("no remote"));
          else if (args.includes("HEAD")) cb(null, { stdout: "def456\n" });
          else cb(new Error("not found"));
        },
      );
      const base = await manager.resolveBase("/test/project");
      expect(base).toBe("def456");
    });
  });

  describe("listWorktrees", () => {
    it("parses git worktree list --porcelain output", async () => {
      const porcelainOutput = [
        "worktree /Users/test/project",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /Users/test/.flywheel/worktrees/project/brave-eagle-042",
        "HEAD def456",
        "branch refs/heads/brave-eagle-042",
        "",
      ].join("\n");

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, { stdout: porcelainOutput });
        },
      );

      const worktrees = await manager.listWorktrees("/Users/test/project");
      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).toEqual({ path: "/Users/test/project", branch: "main" });
      expect(worktrees[1]).toEqual({
        path: "/Users/test/.flywheel/worktrees/project/brave-eagle-042",
        branch: "brave-eagle-042",
      });
    });
  });

  describe("isGitRepo", () => {
    it("returns true for git repos", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, { stdout: "true\n" });
        },
      );
      expect(await manager.isGitRepo("/test/project")).toBe(true);
    });

    it("returns false for non-git directories", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(new Error("not a git repo"));
        },
      );
      expect(await manager.isGitRepo("/test/not-git")).toBe(false);
    });
  });

  describe("getDefaultBranch", () => {
    it("returns current branch name", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, { stdout: "main\n" });
        },
      );
      expect(await manager.getDefaultBranch("/test/project")).toBe("main");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/worktree-manager.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement WorktreeManager**

Create `src/main/worktree-manager.ts`:

```typescript
import { execFile } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { basename } from "path";

const ADJECTIVES = [
  "brave",
  "calm",
  "cool",
  "dark",
  "deep",
  "dry",
  "fair",
  "fast",
  "firm",
  "flat",
  "free",
  "glad",
  "gold",
  "good",
  "gray",
  "keen",
  "kind",
  "late",
  "lean",
  "long",
  "mild",
  "neat",
  "new",
  "nice",
  "old",
  "pale",
  "pure",
  "raw",
  "red",
  "rich",
  "safe",
  "shy",
  "slim",
  "soft",
  "tall",
  "thin",
  "true",
  "warm",
  "wide",
  "wild",
  "wise",
  "bold",
  "cold",
  "dull",
  "even",
  "fine",
  "full",
  "high",
  "low",
  "swift",
];

const NOUNS = [
  "arch",
  "bear",
  "bird",
  "cave",
  "clay",
  "dawn",
  "deer",
  "dove",
  "dune",
  "eagle",
  "elm",
  "fern",
  "fire",
  "fish",
  "frog",
  "glen",
  "hare",
  "hawk",
  "hill",
  "iris",
  "jade",
  "lake",
  "leaf",
  "lily",
  "lynx",
  "moon",
  "moss",
  "oak",
  "owl",
  "peak",
  "pine",
  "pond",
  "rain",
  "reed",
  "reef",
  "ridge",
  "river",
  "rock",
  "rose",
  "sage",
  "snow",
  "star",
  "stone",
  "swan",
  "tide",
  "vale",
  "vine",
  "wave",
  "wind",
  "wolf",
];

interface WorktreeInfo {
  path: string;
  branch: string;
}

export class WorktreeManager {
  private worktreeRoot: string;

  constructor(worktreeRoot?: string) {
    this.worktreeRoot = worktreeRoot || join(homedir(), ".flywheel", "worktrees");
  }

  generateName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    return `${adj}-${noun}-${num}`;
  }

  getWorktreePath(projectName: string, worktreeName: string): string {
    return join(this.worktreeRoot, projectName, worktreeName);
  }

  async resolveBase(projectPath: string): Promise<string> {
    try {
      return await this.git(projectPath, ["rev-parse", "--verify", "origin/HEAD"]);
    } catch {
      return await this.git(projectPath, ["rev-parse", "--verify", "HEAD"]);
    }
  }

  async createWorktree(
    projectPath: string,
    branchName: string,
    worktreePath: string,
    base: string,
  ): Promise<void> {
    const dir = join(worktreePath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await this.git(projectPath, ["worktree", "add", "-b", branchName, worktreePath, base]);
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    await this.git(projectPath, ["worktree", "remove", worktreePath]);
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const output = await this.git(projectPath, ["worktree", "list", "--porcelain"]);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        current.path = line.slice("worktree ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        current.branch = line.slice("branch refs/heads/".length);
      } else if (line === "" && current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch || "detached",
        });
        current = {};
      }
    }

    return worktrees;
  }

  async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      await this.git(dirPath, ["rev-parse", "--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  async getDefaultBranch(projectPath: string): Promise<string> {
    return await this.git(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  }

  private git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", ["-C", cwd, ...args], {}, (error, stdout) => {
        if (error) reject(error);
        else resolve((stdout as string).trim());
      });
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/worktree-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/worktree-manager.ts tests/main/worktree-manager.test.ts
git commit -m "feat: add WorktreeManager for git worktree operations"
```

---

### Task 3: Extend ProjectStore for Rows

**Files:**

- Modify: `src/main/project-store.ts`
- Modify: `tests/main/project-store.test.ts`

- [ ] **Step 1: Write failing tests for row persistence**

Add to `tests/main/project-store.test.ts`:

```typescript
describe("row management", () => {
  it("addProject creates a default row", () => {
    const project = store.addProject("/Users/test/my-project");
    expect(project).not.toBeNull();
    expect(project!.rows).toHaveLength(1);
    expect(project!.rows[0].isDefault).toBe(true);
    expect(project!.rows[0].path).toBe("/Users/test/my-project");
    expect(project!.activeRowId).toBe(project!.rows[0].id);
    expect(project!.expanded).toBe(true);
  });

  it("addRow appends a row to the project", () => {
    const project = store.addProject("/Users/test/my-project");
    const row = {
      id: "row-2",
      projectId: project!.id,
      branch: "feat",
      path: "/tmp/wt",
      color: "hsl(137, 65%, 65%)",
      isDefault: false,
    };
    store.addRow(project!.id, row);
    const projects = store.getProjects();
    const updated = projects.find((p) => p.id === project!.id);
    expect(updated!.rows).toHaveLength(2);
    expect(updated!.rows[1].id).toBe("row-2");
  });

  it("removeRow removes a non-default row", () => {
    const project = store.addProject("/Users/test/my-project");
    const row = {
      id: "row-2",
      projectId: project!.id,
      branch: "feat",
      path: "/tmp/wt",
      color: "hsl(137, 65%, 65%)",
      isDefault: false,
    };
    store.addRow(project!.id, row);
    store.removeRow(project!.id, "row-2");
    const projects = store.getProjects();
    const updated = projects.find((p) => p.id === project!.id);
    expect(updated!.rows).toHaveLength(1);
  });

  it("setActiveRowId updates the active row", () => {
    const project = store.addProject("/Users/test/my-project");
    const row = {
      id: "row-2",
      projectId: project!.id,
      branch: "feat",
      path: "/tmp/wt",
      color: "hsl(137, 65%, 65%)",
      isDefault: false,
    };
    store.addRow(project!.id, row);
    store.setActiveRowId(project!.id, "row-2");
    const projects = store.getProjects();
    const updated = projects.find((p) => p.id === project!.id);
    expect(updated!.activeRowId).toBe("row-2");
  });

  it("updateRowBranch updates branch name", () => {
    const project = store.addProject("/Users/test/my-project");
    store.updateRowBranch(project!.id, project!.rows[0].id, "develop");
    const projects = store.getProjects();
    expect(projects[0].rows[0].branch).toBe("develop");
  });

  it("setExpanded toggles project expanded state", () => {
    const project = store.addProject("/Users/test/my-project");
    store.setExpanded(project!.id, false);
    const projects = store.getProjects();
    expect(projects[0].expanded).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/project-store.test.ts`
Expected: FAIL — new methods don't exist, `addProject` doesn't return rows

- [ ] **Step 3: Update ProjectStore implementation**

Modify `src/main/project-store.ts` to add rows support. The `addProject` method now creates a default row. Add `addRow`, `removeRow`, `setActiveRowId`, `updateRowBranch`, and `setExpanded` methods.

Replace the full file:

```typescript
import Store from "electron-store";
import { randomUUID } from "crypto";
import { basename } from "path";
import { existsSync, accessSync, constants } from "fs";
import type { Project, Row } from "../shared/types";
import { goldenAngleColor } from "../shared/constants";

interface StoreSchema {
  projects: Project[];
  activeProjectId: string | null;
}

export class ProjectStore {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        projects: [],
        activeProjectId: null,
      },
    });
  }

  getProjects(): Project[] {
    const projects = this.store.get("projects");
    return projects.map((p) => ({
      ...p,
      missing: !existsSync(p.path),
      // Migration: ensure rows exist for pre-Phase 4 data
      rows: p.rows || [
        {
          id: randomUUID(),
          projectId: p.id,
          branch: "main",
          path: p.path,
          color: goldenAngleColor(0),
          isDefault: true,
        },
      ],
      activeRowId: p.activeRowId || p.rows?.[0]?.id || "",
      expanded: p.expanded ?? true,
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
      return { ...p, rows: [...(p.rows || []), row] };
    });
    this.store.set("projects", updated);
  }

  removeRow(projectId: string, rowId: string): void {
    const projects = this.store.get("projects");
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const newRows = (p.rows || []).filter((r) => r.id !== rowId);
      const activeRowId =
        p.activeRowId === rowId
          ? newRows.find((r) => r.isDefault)?.id || newRows[0]?.id || ""
          : p.activeRowId;
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
        rows: (p.rows || []).map((r) => (r.id === rowId ? { ...r, branch } : r)),
      };
    });
    this.store.set("projects", updated);
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
```

- [ ] **Step 4: Update existing project-store tests**

The existing tests call `addProject` and expect the old shape. Update the mock return values and assertions to include `rows`, `activeRowId`, and `expanded` fields. Specifically:

- In `beforeEach`, update the mock to return projects with rows when they exist
- Update the `addProject stores a new project` test to verify `rows` and `activeRowId`
- Other tests that compare project shapes need the new fields

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/main/project-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/project-store.ts tests/main/project-store.test.ts
git commit -m "feat: extend ProjectStore with row management"
```

---

### Task 4: Update App Store for Rows

**Files:**

- Modify: `src/renderer/src/store/app.ts`
- Modify: `tests/store/app.test.ts`

- [ ] **Step 1: Write failing tests for row actions**

Add to `tests/store/app.test.ts`:

```typescript
import type { Project, Row } from "../../src/shared/types";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/app.test.ts`
Expected: FAIL — new actions don't exist

- [ ] **Step 3: Update app store with row actions**

In `src/renderer/src/store/app.ts`, add row management actions. Update the `AppState` interface and `createAppStore`:

- Add `addRow(projectId, row)` — updates `projects` store
- Add `removeRow(projectId, rowId)` — removes row, falls back to default if active was removed
- Add `switchRow(projectId, rowId)` — updates `activeRowId`
- Add `updateBranch(projectId, rowId, branch)` — updates row branch
- Add `setExpanded(projectId, expanded)` — toggles sidebar expand/collapse
- Add `getActiveRow()` — returns the active row of the active project
- Update `computeSidebarWidth` to consider row branch names (indented rows)

Replace the full file:

```typescript
import { createStore } from "solid-js/store";
import type { Project, Row } from "../../../shared/types";
import { SIDEBAR } from "../../../shared/constants";

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
    if (p.expanded && p.rows) {
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
      return state.projects.find((p) => p.id === state.activeProjectId) || null;
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
        setState("projects", idx, "activeRowId", defaultRow?.id || newRows[0]?.id || "");
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

    setExpanded(projectId: string, expanded: boolean): void {
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return;
      setState("projects", idx, "expanded", expanded);
      setState("sidebarWidth", computeSidebarWidth([...state.projects]));
    },

    getActiveRow(): Row | null {
      const project = actions.getActiveProject();
      if (!project) return null;
      return project.rows.find((r) => r.id === project.activeRowId) || null;
    },
  };

  return { state, actions };
}
```

- [ ] **Step 4: Update existing app store tests to use new Project shape**

Update the existing tests in `tests/store/app.test.ts` to provide `rows`, `activeRowId`, and `expanded` fields on Project objects. Use the `mkProject` helper everywhere.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/store/app.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/app.ts tests/store/app.test.ts
git commit -m "feat: add row management to app store"
```

---

### Task 5: Re-key Strip Store from projectId to rowId

**Files:**

- Modify: `src/renderer/src/store/strip.ts`
- Modify: `tests/store/strip.test.ts`

- [ ] **Step 1: Update strip store to accept rowId**

In `src/renderer/src/store/strip.ts`, rename the parameter from `projectId` to `rowId` (line 21):

```typescript
export function createStripStore(rowId = 'default') {
```

And update panel ID generation (line 28):

```typescript
return { id: `${rowId}-panel-${nextId}`, type: "placeholder", color: color.hex, label: color.name };
```

This is a parameter rename — the function signature is identical, but the semantic meaning changes.

- [ ] **Step 2: Update strip store tests**

In `tests/store/strip.test.ts`, update:

- The `withStore` helper: `createStripStore('test-row')` instead of `createStripStore('test')`
- The `projectId panel ID generation` describe block: rename to `rowId panel ID generation` and use `createStripStore('row-abc')`
- Snapshot tests: use `createStripStore('row-1')` instead of `createStripStore('proj-1')`

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/store/strip.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/strip.ts tests/store/strip.test.ts
git commit -m "refactor: re-key strip store from projectId to rowId"
```

---

### Task 6: Add Busy-to-Idle Callback to PtyManager

**Files:**

- Modify: `src/main/pty-manager.ts`
- Modify: `tests/main/pty-manager.test.ts`

- [ ] **Step 1: Write failing test for busy-to-idle callback**

Add to `tests/main/pty-manager.test.ts`:

```typescript
describe("PtyManager busy-to-idle detection", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();
  const mockOnBusyToIdle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    let onDataCb: ((data: string) => void) | null = null;
    let onExitCb: ((exit: { exitCode: number }) => void) | null = null;
    mockPty.onData = vi.fn((cb) => {
      onDataCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit = vi.fn((cb) => {
      onExitCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.process = defaultShellName;
    (mockPty as any)._triggerData = (data: string) => onDataCb?.(data);
    (mockPty as any)._triggerExit = (code: number) => onExitCb?.({ exitCode: code });
    manager = new PtyManager(mockSendToPanel, mockSendToChrome, mockOnBusyToIdle);
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it("calls onBusyToIdle when process returns to shell", () => {
    manager.create("panel-1");
    // Simulate: shell → npm (busy)
    mockPty.process = "npm";
    vi.advanceTimersByTime(16 * 30); // trigger title check
    // Simulate: npm → shell (idle)
    mockPty.process = defaultShellName;
    vi.advanceTimersByTime(16 * 30); // trigger title check
    expect(mockOnBusyToIdle).toHaveBeenCalledWith("panel-1");
  });

  it("does not call onBusyToIdle when process stays idle", () => {
    manager.create("panel-1");
    vi.advanceTimersByTime(16 * 30 * 3); // multiple title checks
    expect(mockOnBusyToIdle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: FAIL — constructor doesn't accept third argument

- [ ] **Step 3: Add busy-to-idle detection to PtyManager**

In `src/main/pty-manager.ts`:

1. Add `wasBusy` field to `ManagedPty` interface (line 4–11):

```typescript
interface ManagedPty {
  panelId: string;
  pty: pty.IPty;
  buffer: string;
  shellName: string;
  lastTitle: string;
  disposed: boolean;
  wasBusy: boolean;
}
```

2. Add `onBusyToIdle` callback to constructor (line 20–31):

```typescript
type OnBusyToIdleFn = (panelId: string) => void

export class PtyManager {
  private ptys = new Map<string, ManagedPty>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private flushCount = 0
  private sendToPanel: SendToPanelFn
  private sendToChrome: SendToChromeFn
  private onBusyToIdle: OnBusyToIdleFn | null

  constructor(sendToPanel: SendToPanelFn, sendToChrome: SendToChromeFn, onBusyToIdle?: OnBusyToIdleFn) {
    this.sendToPanel = sendToPanel
    this.sendToChrome = sendToChrome
    this.onBusyToIdle = onBusyToIdle || null
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
  }
```

3. Initialize `wasBusy: false` in `create()` (line 42)

4. Add transition detection in `checkTitles()` (after line 128):

```typescript
private checkTitles(): void {
  for (const managed of this.ptys.values()) {
    if (managed.disposed) continue
    const current = managed.pty.process
    if (!current) continue
    const processName = basename(current)
    const isBusy = processName !== managed.shellName

    // Detect busy → idle transition
    if (managed.wasBusy && !isBusy && this.onBusyToIdle) {
      this.onBusyToIdle(managed.panelId)
    }
    managed.wasBusy = isBusy

    if (processName !== managed.lastTitle) {
      managed.lastTitle = processName
      this.sendToChrome('panel:title', { panelId: managed.panelId, title: processName })
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/pty-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-manager.ts tests/main/pty-manager.test.ts
git commit -m "feat: add busy-to-idle transition callback to PtyManager"
```

---

### Task 7: Add Row IPC to Preload

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add row management API to preload**

In `src/preload/index.ts`, add after the project management section (after line 128):

```typescript
  // Row management
  createRow: (projectId: string): Promise<unknown> => {
    return ipcRenderer.invoke('row:create', { projectId })
  },
  removeRow: (rowId: string, deleteFromDisk: boolean): Promise<unknown> => {
    return ipcRenderer.invoke('row:remove', { rowId, deleteFromDisk })
  },
  discoverWorktrees: (projectId: string): Promise<unknown> => {
    return ipcRenderer.invoke('row:discover', { projectId })
  },
  checkBranches: (projectId: string): Promise<unknown> => {
    return ipcRenderer.invoke('row:check-branches', { projectId })
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: add row management IPC API to preload"
```

---

### Task 8: Add Row IPC Handlers and Updated Shortcuts to Main Process

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/main/panel-manager.ts`

- [ ] **Step 1: Import WorktreeManager and add row IPC handlers**

In `src/main/index.ts`:

1. Add import (line 5):

```typescript
import { WorktreeManager } from "./worktree-manager";
```

2. Add `worktreeManager` variable (after line 11):

```typescript
let worktreeManager: WorktreeManager;
```

3. Initialize in `createWindow()` (after line 51):

```typescript
worktreeManager = new WorktreeManager();
```

4. Wire up the `onBusyToIdle` callback on PtyManager (replace lines 41–49):

```typescript
ptyManager = new PtyManager(
  (panelId, channel, data) => {
    const view = panelManager.getPanelView(panelId);
    if (view) view.webContents.send(channel, data);
  },
  (channel, data) => {
    chromeView.webContents.send(channel, data);
  },
  (panelId) => {
    // Busy→idle: notify renderer to check branches
    chromeView.webContents.send("pty:busy-to-idle", { panelId });
  },
);
```

5. Add row IPC handlers in `setupIpcHandlers()` (before the closing `}`):

```typescript
// Row management
ipcMain.handle("row:create", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { error: "Project not found" };

  const isGit = await worktreeManager.isGitRepo(project.path);
  if (!isGit) return { error: "Not a git repository" };

  const name = worktreeManager.generateName();
  const worktreePath = worktreeManager.getWorktreePath(project.name, name);

  try {
    const base = await worktreeManager.resolveBase(project.path);
    await worktreeManager.createWorktree(project.path, name, worktreePath, base);
  } catch (err) {
    return { error: `Failed to create worktree: ${(err as Error).message}` };
  }

  const row: import("../shared/types").Row = {
    id: randomUUID(),
    projectId: project.id,
    branch: name,
    path: worktreePath,
    color: goldenAngleColor(project.rows.length),
    isDefault: false,
  };

  projectStore.addRow(project.id, row);
  projectStore.setActiveRowId(project.id, row.id);

  return { row };
});

ipcMain.handle("row:remove", async (_event, data: { rowId: string; deleteFromDisk: boolean }) => {
  const projects = projectStore.getProjects();
  let targetProject: import("../shared/types").Project | undefined;
  let targetRow: import("../shared/types").Row | undefined;

  for (const p of projects) {
    const row = p.rows.find((r) => r.id === data.rowId);
    if (row) {
      targetProject = p;
      targetRow = row;
      break;
    }
  }

  if (!targetProject || !targetRow) return { error: "Row not found" };

  // Kill PTYs and destroy panels for this row
  ptyManager.killByPrefix(data.rowId);
  panelManager.destroyByPrefix(data.rowId);

  let diskError: string | undefined;
  if (data.deleteFromDisk) {
    try {
      await worktreeManager.removeWorktree(targetProject.path, targetRow.path);
    } catch (err) {
      diskError = (err as Error).message;
    }
  }

  projectStore.removeRow(targetProject.id, data.rowId);

  return { error: diskError };
});

ipcMain.handle("row:discover", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { rows: [] };

  const worktrees = await worktreeManager.listWorktrees(project.path);
  const existingPaths = new Set(project.rows.map((r) => r.path));
  const newRows: import("../shared/types").Row[] = [];

  for (const wt of worktrees) {
    if (existingPaths.has(wt.path)) continue;
    if (wt.path === project.path) continue; // Skip main worktree
    const row: import("../shared/types").Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: wt.branch,
      path: wt.path,
      color: goldenAngleColor(project.rows.length + newRows.length),
      isDefault: false,
    };
    newRows.push(row);
    projectStore.addRow(project.id, row);
  }

  return { rows: newRows };
});

ipcMain.handle("row:check-branches", async (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (!project) return { updates: [] };

  const worktrees = await worktreeManager.listWorktrees(project.path);
  const pathToBranch = new Map(worktrees.map((wt) => [wt.path, wt.branch]));
  const updates: { rowId: string; branch: string }[] = [];

  for (const row of project.rows) {
    const currentBranch = pathToBranch.get(row.path);
    if (currentBranch && currentBranch !== row.branch) {
      updates.push({ rowId: row.id, branch: currentBranch });
      projectStore.updateRowBranch(project.id, row.id, currentBranch);
    }
  }

  return { updates };
});
```

6. Add import for `randomUUID` and `goldenAngleColor` at the top:

```typescript
import { randomUUID } from "crypto";
import { goldenAngleColor } from "../shared/constants";
```

- [ ] **Step 2: Update shortcuts in setupShortcuts()**

In `src/main/index.ts`, update `setupShortcuts()`:

1. Change "Add Project" accelerator from `CommandOrControl+O` to `CommandOrControl+Shift+N` (line 327)

2. Add new "Rows" submenu after "Projects" submenu:

```typescript
{
  label: 'Rows',
  submenu: [
    {
      label: 'New Worktree Row',
      accelerator: 'CommandOrControl+N',
      click: () => chromeView.webContents.send('shortcut:action', { type: 'new-row' })
    },
    { type: 'separator' },
    {
      label: 'Previous Row',
      accelerator: 'Command+Up',
      click: () => chromeView.webContents.send('shortcut:action', { type: 'prev-row' })
    },
    {
      label: 'Next Row',
      accelerator: 'Command+Down',
      click: () => chromeView.webContents.send('shortcut:action', { type: 'next-row' })
    }
  ]
}
```

3. Remove the `Previous Project` and `Next Project` entries from the "Projects" submenu (they used `Command+Up` and `Command+Down`). Add new entries with `Command+Shift+Up` and `Command+Shift+Down`.

Wait — checking the current code, `Command+Shift+Up` and `Command+Shift+Down` already exist for prev/next project (lines 333–339). Those stay unchanged. But we need to remove `Command+Up` and `Command+Down` from the panel-manager shortcut interception and add them to the new Rows menu.

- [ ] **Step 3: Update panel-manager shortcut interception**

In `src/main/panel-manager.ts`, update the `handleShortcutKey` function. Currently (lines 49–54), `Cmd+Shift+Up/Down` sends `prev-project`/`next-project`. Add `Cmd+Up/Down` (without shift) for `prev-row`/`next-row`:

In the `if (input.shift)` block, Cmd+Shift+Up/Down stays for prev-project/next-project (lines 52–53).

In the `else` block (non-shift), add:

```typescript
else if (input.key === 'ArrowUp') action = { type: 'prev-row' }
else if (input.key === 'ArrowDown') action = { type: 'next-row' }
```

Also add `Cmd+N` for `new-row`:

```typescript
else if (input.key === 'n') action = { type: 'new-row' }
```

And in the shift block, add `Cmd+Shift+N` for `add-project`:

```typescript
else if (input.key === 'n') action = { type: 'add-project' }
```

Remove the existing `Cmd+O` mapping for `add-project` (line 66):

```typescript
// DELETE: else if (input.key === 'o') action = { type: 'add-project' }
```

- [ ] **Step 4: Add pty:busy-to-idle listener to preload**

In `src/preload/index.ts`, add:

```typescript
  onBusyToIdle: (callback: (data: { panelId: string }) => void) => {
    ipcRenderer.on('pty:busy-to-idle', (_event, data) => callback(data))
  },
```

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/panel-manager.ts src/preload/index.ts
git commit -m "feat: add row IPC handlers and updated keyboard shortcuts"
```

---

### Task 9: Sidebar Tree UI

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar for tree structure**

Replace `src/renderer/src/components/Sidebar.tsx` with:

```typescript
import { For, Show, createSignal, createEffect, onCleanup } from 'solid-js'
import type { Project, Row } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

// Lucide icons as inline SVGs
function ChevronDown(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronRight(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function GitBranch(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
  viewportHeight: number
  onSwitchProject: (id: string) => void
  onSwitchRow: (projectId: string, rowId: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
  onToggleExpanded: (projectId: string) => void
  onCreateRow: (projectId: string) => void
  onRemoveRow: (rowId: string, deleteFromDisk: boolean) => void
  onDiscoverWorktrees: (projectId: string) => void
  isGitProject: (projectId: string) => boolean
}

export default function Sidebar(props: SidebarProps) {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number; y: number;
    projectId?: string; rowId?: string; isDefault?: boolean; isGit?: boolean
  } | null>(null)
  const [hoveredId, setHoveredId] = createSignal<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = createSignal<{ rowId: string } | null>(null)

  function handleProjectContext(e: MouseEvent, projectId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId, isGit: props.isGitProject(projectId) })
  }

  function handleRowContext(e: MouseEvent, rowId: string, isDefault: boolean) {
    e.preventDefault()
    e.stopPropagation()
    if (isDefault) return
    setContextMenu({ x: e.clientX, y: e.clientY, rowId, isDefault })
  }

  function closeContextMenu() { setContextMenu(null) }

  createEffect(() => {
    if (contextMenu()) {
      const handler = () => closeContextMenu()
      window.addEventListener('click', handler)
      onCleanup(() => window.removeEventListener('click', handler))
    }
  })

  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0,
        width: `${props.sidebarWidth}px`, height: `${props.viewportHeight}px`,
        background: SIDEBAR.BACKGROUND, 'border-right': `1px solid ${SIDEBAR.BORDER_COLOR}`,
        display: 'flex', 'flex-direction': 'column', 'font-family': 'monospace',
        'font-size': `${SIDEBAR.ITEM_FONT_SIZE}px`, 'user-select': 'none', 'z-index': '20'
      }}
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div style={{
        color: SIDEBAR.ACCENT_COLOR, 'font-weight': 'bold',
        'font-size': `${SIDEBAR.HEADER_FONT_SIZE}px`, padding: '12px 12px 8px',
        display: 'flex', 'align-items': 'center', gap: '6px'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SIDEBAR.ACCENT_COLOR}
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        Projects
      </div>

      {/* Project tree */}
      <div style={{ flex: 1, 'overflow-y': 'auto' }}>
        <For each={props.projects}>
          {(project) => {
            const isActiveProject = () => project.id === props.activeProjectId
            const hasRows = () => project.rows && project.rows.length > 1

            return (
              <div>
                {/* Project header */}
                <div
                  style={{
                    padding: `${SIDEBAR.ITEM_PADDING_V}px ${SIDEBAR.ITEM_PADDING_H}px`,
                    color: project.missing ? '#555' : isActiveProject() ? '#e0e0e0' : '#666',
                    'font-style': project.missing ? 'italic' : 'normal',
                    cursor: 'pointer', 'white-space': 'nowrap',
                    overflow: 'hidden', 'text-overflow': 'ellipsis',
                    display: 'flex', 'align-items': 'center', gap: '4px'
                  }}
                  title={project.name}
                  onClick={() => props.onSwitchProject(project.id)}
                  onContextMenu={(e) => handleProjectContext(e, project.id)}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Show when={hasRows() || (project.rows && project.rows.length >= 1)}>
                    <span
                      style={{ cursor: 'pointer', display: 'flex', 'align-items': 'center', 'flex-shrink': 0 }}
                      onClick={(e) => { e.stopPropagation(); props.onToggleExpanded(project.id) }}
                    >
                      {project.expanded ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </Show>
                  <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{project.name}</span>
                </div>

                {/* Row list (when expanded) */}
                <Show when={project.expanded && project.rows}>
                  <For each={project.rows}>
                    {(row) => {
                      const isActiveRow = () => isActiveProject() && row.id === project.activeRowId
                      const isRowHovered = () => hoveredId() === row.id
                      return (
                        <div
                          style={{
                            padding: `3px ${SIDEBAR.ITEM_PADDING_H}px 3px ${SIDEBAR.ITEM_PADDING_H + 18}px`,
                            color: isActiveRow() ? '#e0e0e0' : '#666',
                            background: isActiveRow() ? SIDEBAR.ACTIVE_BG
                              : isRowHovered() ? 'rgba(255,255,255,0.03)' : 'transparent',
                            cursor: 'pointer', 'white-space': 'nowrap',
                            overflow: 'hidden', 'text-overflow': 'ellipsis',
                            display: 'flex', 'align-items': 'center', gap: '6px'
                          }}
                          onClick={() => props.onSwitchRow(project.id, row.id)}
                          onContextMenu={(e) => handleRowContext(e, row.id, row.isDefault)}
                          onMouseEnter={() => setHoveredId(row.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <GitBranch color={row.color} />
                          <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{row.branch}</span>
                        </div>
                      )
                    }}
                  </For>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      {/* Add Project button */}
      <div
        style={{
          padding: '8px 12px', color: '#555',
          'font-size': `${SIDEBAR.ADD_FONT_SIZE}px`,
          'border-top': `1px solid ${SIDEBAR.BORDER_COLOR}`, cursor: 'pointer'
        }}
        onClick={props.onAddProject}
      >
        + Add Project
      </div>

      {/* Context menu */}
      <Show when={contextMenu()}>
        <div
          style={{
            position: 'fixed', left: `${contextMenu()!.x}px`, top: `${contextMenu()!.y}px`,
            background: '#1a1a2e', border: `1px solid ${SIDEBAR.BORDER_COLOR}`,
            'border-radius': '4px', padding: '4px 0', 'z-index': '100',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          <Show when={contextMenu()!.projectId}>
            <div
              style={{ padding: '6px 16px', color: '#f43f5e', 'font-size': '11px', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { props.onRemoveProject(contextMenu()!.projectId!); setContextMenu(null) }}
            >
              Remove Project
            </div>
            <Show when={contextMenu()!.isGit}>
              <div
                style={{ padding: '6px 16px', color: '#e0e0e0', 'font-size': '11px', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { props.onDiscoverWorktrees(contextMenu()!.projectId!); setContextMenu(null) }}
              >
                Discover Worktrees
              </div>
            </Show>
          </Show>
          <Show when={contextMenu()!.rowId && !contextMenu()!.isDefault}>
            <div
              style={{ padding: '6px 16px', color: '#f43f5e', 'font-size': '11px', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { setRemoveConfirm({ rowId: contextMenu()!.rowId! }); setContextMenu(null) }}
            >
              Remove Row
            </div>
          </Show>
        </div>
      </Show>

      {/* Row removal confirmation */}
      <Show when={removeConfirm()}>
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': '1000'
          }}
        >
          <div style={{
            background: '#252540', 'border-radius': '8px', padding: '24px', 'max-width': '400px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #3a3a5c'
          }}>
            <p style={{ color: '#e0e0e0', margin: '0 0 20px 0', 'font-size': '14px', 'line-height': '1.5' }}>
              Remove this worktree row?
            </p>
            <div style={{ display: 'flex', gap: '12px', 'justify-content': 'flex-end', 'flex-wrap': 'wrap' }}>
              <button onClick={() => setRemoveConfirm(null)} style={{
                background: '#1a1a2e', color: '#888', border: '1px solid #3a3a5c',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Cancel</button>
              <button onClick={() => {
                props.onRemoveRow(removeConfirm()!.rowId, false)
                setRemoveConfirm(null)
              }} style={{
                background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #3a3a5c',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Remove from Flywheel</button>
              <button onClick={() => {
                props.onRemoveRow(removeConfirm()!.rowId, true)
                setRemoveConfirm(null)
              }} style={{
                background: '#f43f5e', color: '#fff', border: 'none',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Remove and delete from disk</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: sidebar tree UI with expand/collapse and row context menus"
```

---

### Task 10: App.tsx Row Switching Integration

**Files:**

- Modify: `src/renderer/src/App.tsx`

This is the largest change. The key refactors:

1. Strip stores and snapshots keyed by `rowId` instead of `projectId`
2. Row switching logic (snapshot/restore at row level)
3. Project switching delegates to row switching
4. New shortcut handlers for `new-row`, `prev-row`, `next-row`
5. Wire up sidebar callbacks
6. Branch checking on row switch, window focus, busy-to-idle

- [ ] **Step 1: Re-key strip stores and add row switching**

Key changes to `src/renderer/src/App.tsx`:

**Strip store helpers** — change `getStripStore` to accept `rowId`:

```typescript
function getStripStore(rowId: string): ReturnType<typeof createStripStore> {
  let store = stripStores.get(rowId);
  if (!store) {
    store = createStripStore(rowId);
    store.actions.setViewport(window.innerWidth, window.innerHeight);
    const snapshot = stripSnapshots.get(rowId);
    if (snapshot) {
      store.restore(snapshot);
      stripSnapshots.delete(rowId);
    }
    stripStores.set(rowId, store);
  }
  return store;
}
```

**`activeStrip()`** — use `activeRowId` instead of `activeProjectId`:

```typescript
function activeStrip(): ReturnType<typeof createStripStore> | null {
  const project = appStore.actions.getActiveProject();
  if (!project) return null;
  return getStripStore(project.activeRowId);
}
```

**`findStripByPanelId()`** — match on `rowId` prefix:

```typescript
function findStripByPanelId(panelId: string): ReturnType<typeof createStripStore> | null {
  for (const [rowId, store] of stripStores) {
    if (panelId.startsWith(rowId)) return store;
  }
  return null;
}
```

**`handleSwitchRow(projectId, targetRowId)`** — new function:

```typescript
function handleSwitchRow(projectId: string, targetRowId: string): void {
  const project = appStore.state.projects.find((p) => p.id === projectId);
  if (!project) return;

  // If different project, switch project first
  if (projectId !== appStore.state.activeProjectId) {
    handleSwitchProject(projectId);
  }

  const currentRowId = project.activeRowId;
  if (currentRowId === targetRowId) return;

  // Stash current row's strip
  const currentStore = stripStores.get(currentRowId);
  if (currentStore) stripSnapshots.set(currentRowId, currentStore.getSnapshot());
  window.api.hidePanelsByPrefix(currentRowId);

  // Switch row
  appStore.actions.switchRow(projectId, targetRowId);

  // Show target row panels
  window.api.showPanelsByPrefix(targetRowId);

  // Ensure strip store exists
  const targetStore = getStripStore(targetRowId);

  // If first visit to this row, create a terminal
  if (targetStore.state.panels.length === 0) {
    const row = project.rows.find((r) => r.id === targetRowId);
    if (row) {
      const panel = targetStore.actions.addPanel("terminal");
      window.api.createTerminalWithCwd(panel.id, row.path);
    }
  }

  // Check for branch renames
  refreshBranches(projectId);
}
```

**Add `refreshBranches()` helper** — shared branch-checking logic:

```typescript
function refreshBranches(projectId: string): void {
  window.api.checkBranches(projectId).then((result: any) => {
    if (result?.updates) {
      for (const update of result.updates) {
        appStore.actions.updateBranch(projectId, update.rowId, update.branch);
      }
    }
  });
}
```

**Update `handleSwitchProject()`** — delegate to row-level hide/show:

```typescript
function handleSwitchProject(targetId: string): void {
  const currentId = appStore.state.activeProjectId;
  if (currentId === targetId) return;

  // Stash current row's strip
  if (currentId) {
    const currentProject = appStore.state.projects.find((p) => p.id === currentId);
    if (currentProject) {
      const currentStore = stripStores.get(currentProject.activeRowId);
      if (currentStore) stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot());
      window.api.hidePanelsByPrefix(currentProject.activeRowId);
    }
  }

  appStore.actions.switchProject(targetId);
  window.api.switchProject(targetId);

  // Show target project's active row panels
  const targetProject = appStore.state.projects.find((p) => p.id === targetId);
  if (targetProject) {
    window.api.showPanelsByPrefix(targetProject.activeRowId);
    getStripStore(targetProject.activeRowId);
  }
}
```

**Update `handleRemoveProject()`** — clean up all row strip stores:

```typescript
function handleRemoveProject(projectId: string): void {
  const project = appStore.state.projects.find((p) => p.id === projectId);
  const wasActive = appStore.state.activeProjectId === projectId;

  window.api.removeProject(projectId);

  // Clean up all rows' panel IDs, strip stores, and snapshots
  if (project) {
    for (const row of project.rows) {
      for (const id of [...createdPanelIds]) {
        if (id.startsWith(row.id)) createdPanelIds.delete(id);
      }
      stripStores.delete(row.id);
      stripSnapshots.delete(row.id);
    }
  }

  appStore.actions.removeProject(projectId);

  if (wasActive) {
    const newActiveId = appStore.state.activeProjectId;
    if (newActiveId) {
      const newProject = appStore.state.projects.find((p) => p.id === newActiveId);
      if (newProject) {
        window.api.switchProject(newActiveId);
        window.api.showPanelsByPrefix(newProject.activeRowId);
      }
    }
  }
}
```

**Update `handleAddProject()`** — hide by row ID prefix instead of project ID:

```typescript
async function handleAddProject(): Promise<void> {
  const result = await window.api.addProject();
  if (!result) return;
  const currentId = appStore.state.activeProjectId;
  if (currentId) {
    const currentProject = appStore.state.projects.find((p) => p.id === currentId);
    if (currentProject) {
      const currentStore = stripStores.get(currentProject.activeRowId);
      if (currentStore) stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot());
      window.api.hidePanelsByPrefix(currentProject.activeRowId);
    }
  }
  appStore.actions.addProject(result);
  window.api.switchProject(result.id);
}
```

**Update `new-panel` shortcut** — use row path for cwd:

```typescript
case 'new-panel': {
  if (!strip) break
  const activeRow = appStore.actions.getActiveRow()
  const panel = strip.actions.addPanel('terminal')
  if (activeRow) {
    window.api.createTerminalWithCwd(panel.id, activeRow.path)
  } else {
    window.api.createTerminal(panel.id)
  }
  break
}
```

**Add new shortcut handlers:**

```typescript
case 'new-row': {
  const project = appStore.actions.getActiveProject()
  if (!project) break
  handleCreateRow(project.id)
  break
}
case 'prev-row': {
  const project = appStore.actions.getActiveProject()
  if (!project || project.rows.length <= 1) break
  const currentIdx = project.rows.findIndex(r => r.id === project.activeRowId)
  if (currentIdx > 0) handleSwitchRow(project.id, project.rows[currentIdx - 1].id)
  break
}
case 'next-row': {
  const project = appStore.actions.getActiveProject()
  if (!project || project.rows.length <= 1) break
  const currentIdx = project.rows.findIndex(r => r.id === project.activeRowId)
  if (currentIdx < project.rows.length - 1) handleSwitchRow(project.id, project.rows[currentIdx + 1].id)
  break
}
```

**Add `handleCreateRow()`:**

```typescript
async function handleCreateRow(projectId: string): Promise<void> {
  const result = await window.api.createRow(projectId);
  if ("error" in result) return; // TODO: show toast
  const row = (result as { row: Row }).row;
  appStore.actions.addRow(projectId, row);
  handleSwitchRow(projectId, row.id);
}
```

**Add `handleRemoveRow()`:**

```typescript
async function handleRemoveRow(rowId: string, deleteFromDisk: boolean): Promise<void> {
  const project = appStore.state.projects.find((p) => p.rows.some((r) => r.id === rowId));
  if (!project) return;
  const wasActive = project.activeRowId === rowId;

  await window.api.removeRow(rowId, deleteFromDisk);

  for (const id of [...createdPanelIds]) {
    if (id.startsWith(rowId)) createdPanelIds.delete(id);
  }
  stripStores.delete(rowId);
  stripSnapshots.delete(rowId);

  appStore.actions.removeRow(project.id, rowId);

  if (wasActive) {
    const defaultRow = project.rows.find((r) => r.isDefault);
    if (defaultRow) handleSwitchRow(project.id, defaultRow.id);
  }
}
```

**Add `handleDiscoverWorktrees()`:**

```typescript
async function handleDiscoverWorktrees(projectId: string): Promise<void> {
  const result = await window.api.discoverWorktrees(projectId);
  if (result?.rows) {
    for (const row of result.rows) {
      appStore.actions.addRow(projectId, row);
    }
  }
}
```

**Track git project status** — add a signal tracking which projects are git repos:

```typescript
const [gitProjects, setGitProjects] = createSignal<Set<string>>(new Set());
```

Check on project load and add:

```typescript
// In onMount, after loading projects:
window.api.listProjects().then(async ({ projects, activeProjectId }) => {
  appStore.actions.loadProjects(projects, activeProjectId);
  // Check which projects are git repos (for sidebar context menu)
  // This is done via the row:check-branches call — if a project has rows, it's git
  const gitSet = new Set<string>();
  for (const p of projects) {
    if (p.rows.length > 1) gitSet.add(p.id);
    // Could also check via IPC, but for now assume if rows > 1, it's git
    // Default row always exists, so check if worktree operations would work
  }
  setGitProjects(gitSet);
});
```

Actually, simpler: add an IPC call or just always show "Discover Worktrees" for all projects and let it fail gracefully. For now, always show the menu item — the IPC handler returns empty if not a git repo.

**Wire up sidebar props:**

```typescript
<Sidebar
  projects={appStore.state.projects}
  activeProjectId={appStore.state.activeProjectId}
  sidebarWidth={sidebarWidth()}
  viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
  onSwitchProject={(id) => handleSwitchProject(id)}
  onSwitchRow={(projectId, rowId) => handleSwitchRow(projectId, rowId)}
  onAddProject={handleAddProject}
  onRemoveProject={handleRemoveProject}
  onToggleExpanded={(projectId) => {
    const project = appStore.state.projects.find(p => p.id === projectId)
    if (project) appStore.actions.setExpanded(projectId, !project.expanded)
  }}
  onCreateRow={(projectId) => handleCreateRow(projectId)}
  onRemoveRow={(rowId, deleteFromDisk) => handleRemoveRow(rowId, deleteFromDisk)}
  onDiscoverWorktrees={(projectId) => handleDiscoverWorktrees(projectId)}
  isGitProject={() => true}
/>
```

**Add busy-to-idle listener in onMount:**

```typescript
window.api.onBusyToIdle(() => {
  const project = appStore.actions.getActiveProject();
  if (project) refreshBranches(project.id);
});
```

**Add window focus listener in onMount:**

```typescript
window.addEventListener("focus", () => {
  const project = appStore.actions.getActiveProject();
  if (project) refreshBranches(project.id);
});
```

**Update layout effect** — destroy panels by rowId prefix:

```typescript
// In the layout effect, change the destroy logic:
const activeProject = appStore.actions.getActiveProject();
const activeRowId = activeProject?.activeRowId;
for (const id of [...createdPanelIds]) {
  if (activeRowId && id.startsWith(activeRowId) && !desiredIds.has(id)) {
    window.api.destroyPanel(id);
    createdPanelIds.delete(id);
  }
}
```

- [ ] **Step 2: Run the app to verify it works**

Run: `npm run dev`
Expected: App launches, sidebar shows projects with expandable rows. Cmd+N creates worktree rows. Cmd+Up/Down switches rows.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: row switching integration in App.tsx"
```

---

### Task 11: Update HintBar

**Files:**

- Modify: `src/renderer/src/components/HintBar.tsx`

- [ ] **Step 1: Update hints for new shortcuts**

In `src/renderer/src/components/HintBar.tsx`:

1. Add `rowCount` prop:

```typescript
interface HintBarProps {
  viewportHeight: number;
  panelCount: number;
  hasProjects: boolean;
  sidebarWidth: number;
  rowCount: number;
}
```

2. Update hint constants:

```typescript
const PANEL_HINTS = [
  { key: "⌘T", label: "Terminal" },
  { key: "⌘B", label: "Browser" },
  { key: "⌘W", label: "Close" },
  { key: "⌘G", label: "Blur" },
];

const ROW_HINTS = [
  { key: "⌘N", label: "New Row" },
  { key: "⌘↑↓", label: "Switch Row" },
];

const NO_PROJECT_HINTS = [{ key: "⌘⇧N", label: "Add Project" }];
```

3. Update `hints()` derivation:

```typescript
const hints = () => {
  if (!props.hasProjects) return NO_PROJECT_HINTS;
  if (props.rowCount > 1) return [...PANEL_HINTS, ...ROW_HINTS];
  return PANEL_HINTS;
};
```

- [ ] **Step 2: Wire up rowCount in App.tsx**

In `src/renderer/src/App.tsx`, update the `HintBar` usage:

```typescript
<HintBar
  viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
  panelCount={strip()?.state.panels.length || 0}
  hasProjects={appStore.state.projects.length > 0}
  sidebarWidth={sidebarWidth()}
  rowCount={appStore.actions.getActiveProject()?.rows.length || 0}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/HintBar.tsx src/renderer/src/App.tsx
git commit -m "feat: update hint bar with row keyboard shortcuts"
```

---

### Task 12: Update Main Process Project Add to Create Default Row

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Update project:add handler to detect default branch**

In `src/main/index.ts`, update the `project:add` handler (lines 217–225) to detect the git default branch and pass it to `addProject`:

```typescript
ipcMain.handle("project:add", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Add Project",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dirPath = result.filePaths[0];

  let defaultBranch = "main";
  try {
    defaultBranch = await worktreeManager.getDefaultBranch(dirPath);
  } catch {
    // Not a git repo or no branch — use 'main'
  }

  const project = projectStore.addProject(dirPath, defaultBranch);
  return project;
});
```

- [ ] **Step 2: Update project:remove to clean up all rows**

In `src/main/index.ts`, update `project:remove` handler (lines 227–231) to kill PTYs and destroy panels for all rows:

```typescript
ipcMain.on("project:remove", (_event, data: { projectId: string }) => {
  const project = projectStore.getProjects().find((p) => p.id === data.projectId);
  if (project) {
    for (const row of project.rows) {
      ptyManager.killByPrefix(row.id);
      panelManager.destroyByPrefix(row.id);
    }
  }
  projectStore.removeProject(data.projectId);
});
```

- [ ] **Step 3: Update project:switch to persist active row**

In `src/main/index.ts`, the `project:switch` handler (lines 233–235) stays the same — it just persists the active project ID. Row switching is handled by the separate `row:*` IPC calls which update `activeRowId` in the store.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Run the app end-to-end**

Run: `npm run dev`

Verify:

1. App launches, sidebar shows projects with expandable tree
2. Each project has a default row showing the git branch name
3. Cmd+N creates a new worktree row with random name
4. New row gets a terminal with cwd in the worktree directory
5. Cmd+Up/Down switches between rows
6. Right-click project → Discover Worktrees finds existing worktrees
7. Right-click row → Remove Row shows two-option dialog
8. Cmd+Shift+N adds a new project (was Cmd+O)
9. Branch renames in terminal are detected on row switch
10. Hint bar shows row shortcuts when project has multiple rows

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: update project handlers for row-aware lifecycle"
```

---

### Task 13: Final Cleanup and All-Tests Pass

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite and fix any failures**

Run: `npx vitest run`
Expected: All tests pass. If any fail due to the Project type change (missing `rows`, `activeRowId`, `expanded`), update the test fixtures to provide these fields.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx electron-vite build`
Expected: Clean build with no type errors

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining type errors and test failures"
```

(Only if there are changes to commit. If everything was clean from previous commits, skip.)
