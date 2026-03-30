import { execFile } from "child_process";
import type { PrStatus } from "../shared/types";

interface GhPrEntry {
  headRefName: string;
  state: string;
  isDraft: boolean;
  updatedAt: string;
  url: string;
  number: number;
}

export function createPrStatus() {
  let ghCheck: boolean | null = null;

  async function ghAvailable(): Promise<boolean> {
    if (ghCheck !== null) return ghCheck;
    return new Promise((resolve) => {
      execFile("gh", ["--version"], (err) => {
        ghCheck = !err;
        resolve(ghCheck);
      });
    });
  }

  async function fetchPrStatuses(
    projectPath: string,
  ): Promise<Map<string, { status: PrStatus; url: string; number: number }>> {
    const available = await ghAvailable();
    if (!available) return new Map<string, { status: PrStatus; url: string; number: number }>();

    return new Promise((resolve) => {
      execFile(
        "gh",
        [
          "pr",
          "list",
          "--json",
          "headRefName,state,isDraft,updatedAt,url,number",
          "--state",
          "all",
          "--limit",
          "100",
        ],
        { cwd: projectPath },
        (err, stdout) => {
          if (err) {
            resolve(new Map<string, { status: PrStatus; url: string; number: number }>());
            return;
          }

          try {
            const prs = JSON.parse(stdout) as GhPrEntry[];
            const byBranch = new Map<string, GhPrEntry>();

            for (const pr of prs) {
              const existing = byBranch.get(pr.headRefName);
              if (!existing || pr.updatedAt > existing.updatedAt) {
                byBranch.set(pr.headRefName, pr);
              }
            }

            const result = new Map<string, { status: PrStatus; url: string; number: number }>();
            for (const [branch, pr] of byBranch) {
              let status: PrStatus;
              if (pr.state === "MERGED") {
                status = "merged";
              } else if (pr.state === "CLOSED") {
                status = "closed";
              } else if (pr.isDraft) {
                status = "draft";
              } else {
                status = "open";
              }
              result.set(branch, { status, url: pr.url, number: pr.number });
            }
            resolve(result);
          } catch {
            resolve(new Map<string, { status: PrStatus; url: string; number: number }>());
          }
        },
      );
    });
  }

  // Cached for process lifetime — repo URL rarely changes. Stale until app restart if remote changes.
  const repoUrlCache = new Map<string, string>();

  async function fetchRepoUrl(projectPath: string): Promise<string | undefined> {
    const cached = repoUrlCache.get(projectPath);
    if (cached) return cached;

    const available = await ghAvailable();
    if (!available) return undefined;

    return new Promise((resolve) => {
      execFile(
        "gh",
        ["repo", "view", "--json", "url", "--jq", ".url"],
        { cwd: projectPath },
        (err, stdout) => {
          if (err) {
            resolve(undefined);
            return;
          }
          const url = stdout.trim();
          if (url) repoUrlCache.set(projectPath, url);
          resolve(url || undefined);
        },
      );
    });
  }

  return { ghAvailable, fetchPrStatuses, fetchRepoUrl };
}
