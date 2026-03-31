import { describe, expect, it } from "vitest";
import type { FlywheelConfig } from "../../src/shared/config";
import { DEFAULT_CONFIG, mergeConfigs } from "../../src/shared/config";

describe("config defaults", () => {
  it("DEFAULT_CONFIG has expected shape", () => {
    expect(DEFAULT_CONFIG.preferences.terminal.fontFamily).toBe("monospace");
    expect(DEFAULT_CONFIG.preferences.terminal.fontSize).toBe(14);
    expect(DEFAULT_CONFIG.preferences.browser.defaultZoom).toBe(0);
    expect(DEFAULT_CONFIG.preferences.app.defaultZoom).toBe(0);
  });
});

describe("mergeConfigs", () => {
  it("returns defaults when no overrides provided", () => {
    const result = mergeConfigs([]);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("overrides scalar values from higher-precedence config", () => {
    const override: Partial<FlywheelConfig> = {
      preferences: {
        terminal: { fontFamily: "JetBrains Mono", fontSize: 18 },
        browser: { defaultZoom: 0 },
        app: { defaultZoom: 0 },
      },
    };
    const result = mergeConfigs([override]);
    expect(result.preferences.terminal.fontFamily).toBe("JetBrains Mono");
    expect(result.preferences.terminal.fontSize).toBe(18);
  });

  it("deep merges partial overrides", () => {
    const override = {
      preferences: {
        terminal: { fontSize: 20 },
      },
    } as Partial<FlywheelConfig>;
    const result = mergeConfigs([override]);
    expect(result.preferences.terminal.fontSize).toBe(20);
    expect(result.preferences.terminal.fontFamily).toBe("monospace");
    expect(result.preferences.browser.defaultZoom).toBe(0);
  });

  it("first config in array takes precedence", () => {
    const local = { preferences: { terminal: { fontSize: 20 } } } as Partial<FlywheelConfig>;
    const project = { preferences: { terminal: { fontSize: 16 } } } as Partial<FlywheelConfig>;
    const result = mergeConfigs([local, project]);
    expect(result.preferences.terminal.fontSize).toBe(20);
  });
});

describe("hooks config", () => {
  it("DEFAULT_CONFIG has no hooks", () => {
    expect(DEFAULT_CONFIG.hooks).toBeUndefined();
  });

  it("merges hooks from override", () => {
    const override = {
      hooks: {
        onWorktreeCreate: "pnpm install",
        onWorktreeRemove: "git clean -xdf",
      },
    } as Partial<FlywheelConfig>;
    const result = mergeConfigs([override]);
    expect(result.hooks?.onWorktreeCreate).toBe("pnpm install");
    expect(result.hooks?.onWorktreeRemove).toBe("git clean -xdf");
    // preferences still get defaults
    expect(result.preferences.terminal.fontFamily).toBe("monospace");
  });

  it("higher-precedence hooks override lower", () => {
    const local = {
      hooks: { onWorktreeCreate: "npm ci" },
    } as Partial<FlywheelConfig>;
    const project = {
      hooks: { onWorktreeCreate: "pnpm install", onWorktreeRemove: "rm -rf node_modules" },
    } as Partial<FlywheelConfig>;
    const result = mergeConfigs([local, project]);
    expect(result.hooks?.onWorktreeCreate).toBe("npm ci");
    expect(result.hooks?.onWorktreeRemove).toBe("rm -rf node_modules");
  });
});
