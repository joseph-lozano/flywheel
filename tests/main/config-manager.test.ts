import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = new Map<string, string>();
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: vi.fn((path: string) => {
      const content = mockFiles.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    }),
    existsSync: vi.fn((path: string) => mockFiles.has(path)),
  };
});

import { ConfigManager } from "../../src/main/config-manager";
import { DEFAULT_CONFIG } from "../../src/shared/config";

describe("ConfigManager", () => {
  beforeEach(() => {
    mockFiles.clear();
    delete process.env.XDG_CONFIG_HOME;
  });

  it("returns defaults when no config files exist", () => {
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get()).toEqual(DEFAULT_CONFIG);
  });

  it("loads global config from XDG_CONFIG_HOME", () => {
    process.env.XDG_CONFIG_HOME = "/home/user/.config";
    mockFiles.set(
      "/home/user/.config/flywheel.yaml",
      "preferences:\n  terminal:\n    fontSize: 20",
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().preferences.terminal.fontSize).toBe(20);
    expect(manager.get().preferences.terminal.fontFamily).toBe("monospace");
  });

  it("loads global config from ~/.config when XDG not set", () => {
    mockFiles.set(
      join(process.env.HOME ?? "", ".config", "flywheel.yaml"),
      "preferences:\n  terminal:\n    fontSize: 18",
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().preferences.terminal.fontSize).toBe(18);
  });

  it("project config overrides global", () => {
    process.env.XDG_CONFIG_HOME = "/home/user/.config";
    mockFiles.set(
      "/home/user/.config/flywheel.yaml",
      "preferences:\n  terminal:\n    fontSize: 20",
    );
    mockFiles.set("/some/project/flywheel.yaml", "preferences:\n  terminal:\n    fontSize: 16");
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().preferences.terminal.fontSize).toBe(16);
  });

  it("local config overrides project config", () => {
    mockFiles.set("/some/project/flywheel.yaml", "preferences:\n  terminal:\n    fontSize: 16");
    mockFiles.set(
      "/some/project/flywheel.local.yaml",
      "preferences:\n  terminal:\n    fontSize: 22",
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().preferences.terminal.fontSize).toBe(22);
  });

  it("reload re-reads files", () => {
    mockFiles.set("/some/project/flywheel.yaml", "preferences:\n  terminal:\n    fontSize: 16");
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().preferences.terminal.fontSize).toBe(16);

    mockFiles.set("/some/project/flywheel.yaml", "preferences:\n  terminal:\n    fontSize: 24");
    manager.reload();
    expect(manager.get().preferences.terminal.fontSize).toBe(24);
  });

  it("handles invalid YAML gracefully", () => {
    mockFiles.set("/some/project/flywheel.yaml", ": invalid: yaml: [");
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get()).toEqual(DEFAULT_CONFIG);
  });

  it("drops config values with wrong types and falls back to defaults", () => {
    mockFiles.set(
      "/some/project/flywheel.yaml",
      [
        "preferences:",
        "  terminal:",
        "    fontFamily: 123",
        '    fontSize: "big"',
        "  browser:",
        "    defaultZoom: true",
        "  app:",
        '    defaultZoom: "high"',
      ].join("\n"),
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    const config = manager.get();
    expect(config.preferences.terminal.fontFamily).toBe(
      DEFAULT_CONFIG.preferences.terminal.fontFamily,
    );
    expect(config.preferences.terminal.fontSize).toBe(DEFAULT_CONFIG.preferences.terminal.fontSize);
    expect(config.preferences.browser.defaultZoom).toBe(
      DEFAULT_CONFIG.preferences.browser.defaultZoom,
    );
    expect(config.preferences.app.defaultZoom).toBe(DEFAULT_CONFIG.preferences.app.defaultZoom);
  });

  it("loads hooks from project config", () => {
    mockFiles.set(
      "/some/project/flywheel.yaml",
      "hooks:\n  onWorktreeCreate: pnpm install\n  onWorktreeRemove: git clean -xdf",
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().hooks?.onWorktreeCreate).toBe("pnpm install");
    expect(manager.get().hooks?.onWorktreeRemove).toBe("git clean -xdf");
  });

  it("drops hooks values with wrong types", () => {
    mockFiles.set(
      "/some/project/flywheel.yaml",
      "hooks:\n  onWorktreeCreate: 123\n  onWorktreeRemove: true",
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().hooks?.onWorktreeCreate).toBeUndefined();
    expect(manager.get().hooks?.onWorktreeRemove).toBeUndefined();
  });

  it("keeps valid hook when sibling has wrong type", () => {
    mockFiles.set(
      "/some/project/flywheel.yaml",
      'hooks:\n  onWorktreeCreate: "pnpm install"\n  onWorktreeRemove: 42',
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    expect(manager.get().hooks?.onWorktreeCreate).toBe("pnpm install");
    expect(manager.get().hooks?.onWorktreeRemove).toBeUndefined();
  });

  it("keeps valid values when sibling values have wrong types", () => {
    mockFiles.set(
      "/some/project/flywheel.yaml",
      [
        "preferences:",
        "  terminal:",
        '    fontFamily: "JetBrains Mono"',
        '    fontSize: "wrong"',
      ].join("\n"),
    );
    const manager = new ConfigManager();
    manager.load("/some/project");
    const config = manager.get();
    expect(config.preferences.terminal.fontFamily).toBe("JetBrains Mono");
    expect(config.preferences.terminal.fontSize).toBe(DEFAULT_CONFIG.preferences.terminal.fontSize);
  });
});
