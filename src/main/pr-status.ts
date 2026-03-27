import { execFile } from "child_process";
import type { PrStatus } from "../shared/types";

interface GhPrEntry {
  headRefName: string;
  state: string;
  isDraft: boolean;
  updatedAt: string;
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

  async function fetchPrStatuses(projectPath: string): Promise<Map<string, PrStatus>> {
    const available = await ghAvailable();
    if (!available) return new Map();

    return new Promise((resolve) => {
      execFile(
        "gh",
        [
          "pr",
          "list",
          "--json",
          "headRefName,state,isDraft,updatedAt",
          "--state",
          "all",
          "--limit",
          "100",
        ],
        { cwd: projectPath },
        (err, stdout) => {
          if (err) {
            resolve(new Map());
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

            const result = new Map<string, PrStatus>();
            for (const [branch, pr] of byBranch) {
              if (pr.isDraft) {
                result.set(branch, "draft");
              } else if (pr.state === "MERGED") {
                result.set(branch, "merged");
              } else if (pr.state === "CLOSED") {
                result.set(branch, "closed");
              } else {
                result.set(branch, "open");
              }
            }
            resolve(result);
          } catch {
            resolve(new Map());
          }
        },
      );
    });
  }

  return { ghAvailable, fetchPrStatuses };
}
