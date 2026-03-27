import { mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installScripts } from "../../src/main/scripts";

describe("installScripts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flywheel-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates bin directory and flywheel-open script", () => {
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
    expect(script).toContain("7770");
    expect(script).toContain("/dev/tty");
  });

  it("flywheel-open falls back when /dev/tty is unavailable", () => {
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
    // Uses try-and-fallback: attempt write to /dev/tty, suppress errors, fall back
    expect(script).toContain("> /dev/tty 2>/dev/null");
    expect(script).toContain("command -v open");
    expect(script).toContain("command -v xdg-open");
  });

  it("makes scripts executable (mode 0o755)", () => {
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const stat = statSync(join(binDir, "flywheel-open"));
    // Check owner-executable bit
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it("writes open wrapper on darwin", () => {
    installScripts(tempDir, "darwin");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "open"), "utf-8");
    expect(script).toContain("/usr/bin/open");
    expect(script).toContain("7770");
  });

  it("writes xdg-open wrapper on linux", () => {
    installScripts(tempDir, "linux");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "xdg-open"), "utf-8");
    expect(script).toContain("/usr/bin/xdg-open");
    expect(script).toContain("7770");
  });

  it("open wrapper falls back to /usr/bin/open when /dev/tty is unavailable", () => {
    installScripts(tempDir, "darwin");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "open"), "utf-8");
    expect(script).toContain("> /dev/tty 2>/dev/null");
    // Should call /usr/bin/open as fallback for HTTP URLs too
    const httpBlock = script.slice(script.indexOf("http://"));
    expect(httpBlock).toContain("/usr/bin/open");
  });

  it("does not write open wrapper on linux", () => {
    installScripts(tempDir, "linux");
    const binDir = join(tempDir, ".flywheel", "bin");
    expect(() => statSync(join(binDir, "open"))).toThrow();
  });

  it("xdg-open wrapper falls back to /usr/bin/xdg-open when /dev/tty is unavailable", () => {
    installScripts(tempDir, "linux");
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "xdg-open"), "utf-8");
    expect(script).toContain("> /dev/tty 2>/dev/null");
    // Should call /usr/bin/xdg-open as fallback for HTTP URLs too
    const httpBlock = script.slice(script.indexOf("http://"));
    expect(httpBlock).toContain("/usr/bin/xdg-open");
  });

  it("does not write xdg-open wrapper on darwin", () => {
    installScripts(tempDir, "darwin");
    const binDir = join(tempDir, ".flywheel", "bin");
    expect(() => statSync(join(binDir, "xdg-open"))).toThrow();
  });

  it("overwrites existing scripts idempotently", () => {
    installScripts(tempDir);
    installScripts(tempDir);
    const binDir = join(tempDir, ".flywheel", "bin");
    const script = readFileSync(join(binDir, "flywheel-open"), "utf-8");
    expect(script).toContain("7770");
  });
});
