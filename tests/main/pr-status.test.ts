import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
vi.mock("child_process", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { createPrStatus } from "../../src/main/pr-status";

type ExecFileCallback = (error: Error | null, stdout?: string) => void;

describe("createPrStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ghAvailable", () => {
    it("returns true when gh is installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: ExecFileCallback) => {
        cb(null, "gh version 2.40.0\n");
      });
      const prStatus = createPrStatus();
      expect(await prStatus.ghAvailable()).toBe(true);
    });

    it("returns false when gh is not installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: ExecFileCallback) => {
        cb(new Error("command not found"));
      });
      const prStatus = createPrStatus();
      expect(await prStatus.ghAvailable()).toBe(false);
    });

    it("caches the result after first call", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: ExecFileCallback) => {
        cb(null, "gh version 2.40.0\n");
      });
      const prStatus = createPrStatus();
      await prStatus.ghAvailable();
      await prStatus.ghAvailable();
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchPrStatuses", () => {
    it("returns empty map when gh is unavailable", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          callback(new Error("not found"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.size).toBe(0);
    });

    it("maps open PR to open status with url", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-a",
                state: "OPEN",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/42",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-a")).toEqual({
        status: "open",
        url: "https://github.com/owner/repo/pull/42",
      });
    });

    it("maps draft PR to draft status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-b",
                state: "OPEN",
                isDraft: true,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/43",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-b")).toEqual({
        status: "draft",
        url: "https://github.com/owner/repo/pull/43",
      });
    });

    it("maps merged PR to merged status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-c",
                state: "MERGED",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/44",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-c")).toEqual({
        status: "merged",
        url: "https://github.com/owner/repo/pull/44",
      });
    });

    it("maps closed PR to closed status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-d",
                state: "CLOSED",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/45",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-d")).toEqual({
        status: "closed",
        url: "https://github.com/owner/repo/pull/45",
      });
    });

    it("maps closed draft PR to closed status", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-draft-closed",
                state: "CLOSED",
                isDraft: true,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/46",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-draft-closed")).toEqual({
        status: "closed",
        url: "https://github.com/owner/repo/pull/46",
      });
    });

    it("picks most recent PR when multiple exist for same branch", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(
            null,
            JSON.stringify([
              {
                headRefName: "feat-e",
                state: "CLOSED",
                isDraft: false,
                updatedAt: "2026-03-25T00:00:00Z",
                url: "https://github.com/owner/repo/pull/10",
              },
              {
                headRefName: "feat-e",
                state: "OPEN",
                isDraft: false,
                updatedAt: "2026-03-26T00:00:00Z",
                url: "https://github.com/owner/repo/pull/11",
              },
            ]),
          );
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.get("feat-e")).toEqual({
        status: "open",
        url: "https://github.com/owner/repo/pull/11",
      });
    });

    it("returns empty map when gh command fails", async () => {
      let callCount = 0;
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          callCount++;
          if (callCount === 1) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(new Error("auth required"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchPrStatuses("/test/project");
      expect(result.size).toBe(0);
    });
  });

  describe("fetchRepoUrl", () => {
    it("returns repo URL when gh is available", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          if (Array.isArray(args) && args.includes("--version")) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(null, "https://github.com/owner/repo\n");
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchRepoUrl("/test/project");
      expect(result).toBe("https://github.com/owner/repo");
    });

    it("returns undefined when gh is unavailable", async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          callback(new Error("not found"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchRepoUrl("/test/project");
      expect(result).toBeUndefined();
    });

    it("returns undefined when gh command fails", async () => {
      let callCount = 0;
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _optsOrCb: unknown, cb?: ExecFileCallback) => {
          const callback = (cb ?? _optsOrCb) as ExecFileCallback;
          callCount++;
          if (callCount === 1) {
            callback(null, "gh version 2.40.0\n");
            return;
          }
          callback(new Error("not a GitHub repo"));
        },
      );
      const prStatus = createPrStatus();
      const result = await prStatus.fetchRepoUrl("/test/project");
      expect(result).toBeUndefined();
    });
  });
});
