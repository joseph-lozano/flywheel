import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFileSync = vi.fn();
vi.mock("child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args) as unknown,
}));

import { fixPath } from "../../src/main/fix-path";

describe("fixPath", () => {
  let originalPath: string | undefined;
  let originalPlatform: PropertyDescriptor | undefined;
  let originalShell: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPath = process.env.PATH;
    originalShell = process.env.SHELL;
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    process.env.SHELL = originalShell;
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("patches process.env.PATH with shell output", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    process.env.SHELL = "/bin/zsh";
    mockExecFileSync.mockReturnValue("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");

    fixPath();

    expect(process.env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-ilc", "printf '%s' \"$PATH\""],
      expect.objectContaining({ encoding: "utf8", timeout: 5000 }),
    );
  });

  it("skips on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    process.env.PATH = "/original";

    fixPath();

    expect(process.env.PATH).toBe("/original");
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("keeps existing PATH when shell fails", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    process.env.PATH = "/original";
    mockExecFileSync.mockImplementation(() => {
      throw new Error("shell not found");
    });

    fixPath();

    expect(process.env.PATH).toBe("/original");
  });

  it("keeps existing PATH when shell returns empty", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    process.env.PATH = "/original";
    mockExecFileSync.mockReturnValue("");

    fixPath();

    expect(process.env.PATH).toBe("/original");
  });

  it("defaults to /bin/zsh when SHELL is unset", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    delete process.env.SHELL;
    mockExecFileSync.mockReturnValue("/usr/bin:/bin");

    fixPath();

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "/bin/zsh",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("works on Linux", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    process.env.SHELL = "/bin/bash";
    mockExecFileSync.mockReturnValue("/home/user/.local/bin:/usr/bin:/bin");

    fixPath();

    expect(process.env.PATH).toBe("/home/user/.local/bin:/usr/bin:/bin");
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "/bin/bash",
      expect.any(Array),
      expect.any(Object),
    );
  });
});
