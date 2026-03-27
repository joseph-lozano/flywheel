import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock("child_process", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

import { WorktreeManager } from "../../src/main/worktree-manager";

type ExecFileCallback = (error: Error | null, stdout?: string) => void;

describe("WorktreeManager", () => {
  let manager: WorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorktreeManager();
  });

  describe("generateName", () => {
    it("returns adjective-noun-sqid format", () => {
      const name = manager.generateName(0);
      expect(name).toMatch(/^[a-z]+-[a-z]+-[a-zA-Z0-9]+$/);
    });

    it("produces unique sqid suffix per counter value", () => {
      const names = Array.from({ length: 10 }, (_, i) => manager.generateName(i));
      const suffixes = names.map((n) => n.split("-").slice(2).join("-"));
      expect(new Set(suffixes).size).toBe(10);
    });

    it("same counter always produces same sqid suffix", () => {
      const a = manager.generateName(42).split("-").slice(2).join("-");
      const b = manager.generateName(42).split("-").slice(2).join("-");
      expect(a).toBe(b);
    });
  });

  describe("resolveBase", () => {
    it("resolves origin/HEAD when remote exists", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
          if (args.includes("origin/HEAD")) cb(null, "abc123\n");
          else cb(new Error("not found"));
        },
      );
      const base = await manager.resolveBase("/test/project");
      expect(base).toBe("abc123");
    });

    it("falls back to HEAD when no remote", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
          if (args.includes("origin/HEAD")) cb(new Error("no remote"));
          else if (args.includes("HEAD")) cb(null, "def456\n");
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
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
          cb(null, porcelainOutput);
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
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
          cb(null, "true\n");
        },
      );
      expect(await manager.isGitRepo("/test/project")).toBe(true);
    });

    it("returns false for non-git directories", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
          cb(new Error("not a git repo"));
        },
      );
      expect(await manager.isGitRepo("/test/not-git")).toBe(false);
    });
  });

  describe("getDefaultBranch", () => {
    it("returns current branch name", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
          cb(null, "main\n");
        },
      );
      expect(await manager.getDefaultBranch("/test/project")).toBe("main");
    });
  });
});
