import { describe, expect, it, vi } from "vitest";
import { runCleanupHook } from "../../src/main/hooks";

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

import { exec } from "child_process";

const mockExec = vi.mocked(exec);

describe("runCleanupHook", () => {
  it("runs the command with cwd and timeout", async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      (callback as (error: Error | null, result: { stdout: string; stderr: string }) => void)(
        null,
        { stdout: "", stderr: "" },
      );
      return {} as ReturnType<typeof exec>;
    });

    const result = await runCleanupHook("git clean -xdf", "/tmp/worktree");
    expect(mockExec).toHaveBeenCalledWith(
      "git clean -xdf",
      expect.objectContaining({ cwd: "/tmp/worktree", timeout: 10_000 }),
      expect.any(Function),
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns error message on failure", async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      (callback as (error: Error | null) => void)(new Error("command failed"));
      return {} as ReturnType<typeof exec>;
    });

    const result = await runCleanupHook("bad-command", "/tmp/worktree");
    expect(result).toEqual({ ok: false, error: "command failed" });
  });

  it("returns ok when command is undefined", async () => {
    const result = await runCleanupHook(undefined, "/tmp/worktree");
    expect(result).toEqual({ ok: true });
    expect(mockExec).not.toHaveBeenCalled();
  });
});
