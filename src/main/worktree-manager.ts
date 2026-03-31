import { execFile } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import SqidsModule from "sqids";
// sqids is ESM-only; when bundled to CJS the default export lands on .default
const Sqids = (
  "default" in SqidsModule ? (SqidsModule as Record<string, unknown>).default : SqidsModule
) as typeof SqidsModule;

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

const sqids = new Sqids({ alphabet: "abcdefghijklmnopqrstuvwxyz0123456789", minLength: 2 });

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export class WorktreeManager {
  private worktreeRoot: string;

  constructor(worktreeRoot?: string) {
    this.worktreeRoot = worktreeRoot ?? join(homedir(), ".flywheel", "worktrees");
  }

  generateName(counter: number): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const id = sqids.encode([counter]);
    return `${adj}-${noun}-${id}`;
  }

  getWorktreePath(projectName: string, worktreeName: string): string {
    return join(this.worktreeRoot, projectName, worktreeName);
  }

  async fetchLatestRemote(projectPath: string): Promise<void> {
    const remote = await this.getPrimaryRemote(projectPath);
    if (!remote) return;

    await this.git(projectPath, ["fetch", "--prune", remote]);
  }

  async resolveBase(projectPath: string, options?: { preferRemote?: boolean }): Promise<string> {
    if (options?.preferRemote !== false) {
      const remote = await this.getPrimaryRemote(projectPath);
      try {
        if (remote) {
          return await this.git(projectPath, ["rev-parse", "--verify", `${remote}/HEAD`]);
        }
      } catch {
        // Some remotes do not expose a HEAD symref locally; fall back to the current branch.
      }
    }

    return await this.git(projectPath, ["rev-parse", "--verify", "HEAD"]);
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
    let current: Partial<WorktreeInfo & { head: string }> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        current.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        current.branch = line.slice("branch refs/heads/".length);
      } else if (line === "" && current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? current.head?.slice(0, 7) ?? "detached",
        });
        current = {};
      }
    }

    // flush last entry if output didn't end with a blank line
    if (current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch ?? current.head?.slice(0, 7) ?? "detached",
      });
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

  private async getPrimaryRemote(projectPath: string): Promise<string | null> {
    const output = await this.git(projectPath, ["remote"]);
    const remotes = output
      .split("\n")
      .map((remote) => remote.trim())
      .filter((remote) => remote.length > 0);

    if (remotes.includes("origin")) return "origin";
    return remotes[0] ?? null;
  }

  private git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", ["-C", cwd, ...args], {}, (error, stdout) => {
        if (error) reject(new Error(error.message));
        else resolve(stdout.trim());
      });
    });
  }
}
