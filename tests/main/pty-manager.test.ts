import { basename } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const defaultShellName = basename(process.env.SHELL ?? "/bin/zsh");

interface MockPty {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  process: string;
  pid: number;
  _triggerData?: (data: string) => void;
  _triggerExit?: (code: number) => void;
}

const mockPty: MockPty = {
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
  process: defaultShellName,
  pid: 12345,
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

import * as nodePty from "node-pty";
import { PtyManager } from "../../src/main/pty-manager";

describe("PtyManager", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    let onDataCb: ((data: string) => void) | null = null;
    let onExitCb: ((exit: { exitCode: number; signal?: number }) => void) | null = null;
    mockPty.onData = vi.fn((cb: (data: string) => void) => {
      onDataCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit = vi.fn((cb: (exit: { exitCode: number; signal?: number }) => void) => {
      onExitCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.process = defaultShellName;
    mockPty._triggerData = (data: string) => onDataCb?.(data);
    mockPty._triggerExit = (code: number) => onExitCb?.({ exitCode: code });
    manager = new PtyManager(mockSendToPanel, mockSendToChrome);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("creates a PTY session as a login shell", () => {
    manager.create("panel-1");
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["-l"],
      expect.objectContaining({ cols: 80, rows: 24, cwd: expect.any(String) as string }),
    );
  });

  it("ignores duplicate create for same panelId", () => {
    manager.create("panel-1");
    manager.create("panel-1");
    expect(nodePty.spawn).toHaveBeenCalledTimes(1);
  });

  it("writes input to PTY immediately", () => {
    manager.create("panel-1");
    manager.write("panel-1", "ls\r");
    expect(mockPty.write).toHaveBeenCalledWith("ls\r");
  });

  it("quotes dropped file paths and writes them as one paste payload", () => {
    manager.create("panel-1");
    manager.dropFiles("panel-1", [
      "/Users/test/My Screenshot.png",
      "/Users/test/it's-fine.png",
      "/Users/test/notes.txt",
      "/Users/test/readme.md",
    ]);
    expect(mockPty.write).toHaveBeenCalledWith(
      "'/Users/test/My Screenshot.png' '/Users/test/it'\\''s-fine.png' '/Users/test/notes.txt' '/Users/test/readme.md' ",
    );
  });

  it("ignores dropped files when the list is empty", () => {
    manager.create("panel-1");
    manager.dropFiles("panel-1", []);
    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("ignores write for unknown panelId", () => {
    manager.write("unknown", "data");
    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("resizes PTY", () => {
    manager.create("panel-1");
    manager.resize("panel-1", 120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it("kills PTY and cleans up", () => {
    manager.create("panel-1");
    manager.kill("panel-1");
    expect(mockPty.kill).toHaveBeenCalled();
  });

  it("returns foreground process name", () => {
    manager.create("panel-1");
    mockPty.process = "vim";
    expect(manager.getForegroundProcess("panel-1")).toBe("vim");
  });

  it("detects busy PTY (foreground process differs from shell)", () => {
    manager.create("panel-1");
    mockPty.process = "npm";
    expect(manager.isBusy("panel-1")).toBe(true);
  });

  it("detects idle PTY (foreground process is the shell)", () => {
    manager.create("panel-1");
    expect(manager.isBusy("panel-1")).toBe(false);
  });

  it("passes cwd to node-pty spawn", () => {
    manager.create("panel-1", "/Users/test/my-project");
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["-l"],
      expect.objectContaining({ cwd: "/Users/test/my-project" }),
    );
  });

  it("falls back to process.cwd() when no cwd provided", () => {
    manager.create("panel-1");
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["-l"],
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("killByPrefix kills all PTYs with matching prefix", () => {
    manager.create("proj1-panel-1");
    manager.create("proj1-panel-2");
    manager.create("proj2-panel-1");
    manager.killByPrefix("proj1");
    expect(manager.hasPty("proj1-panel-1")).toBe(false);
    expect(manager.hasPty("proj1-panel-2")).toBe(false);
    expect(manager.hasPty("proj2-panel-1")).toBe(true);
  });
});

describe("PtyManager output buffering", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    let onDataCb: ((data: string) => void) | null = null;
    let onExitCb: ((exit: { exitCode: number }) => void) | null = null;
    mockPty.onData = vi.fn((cb: (data: string) => void) => {
      onDataCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit = vi.fn((cb: (exit: { exitCode: number }) => void) => {
      onExitCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.process = defaultShellName;
    mockPty._triggerData = (data: string) => onDataCb?.(data);
    mockPty._triggerExit = (code: number) => onExitCb?.({ exitCode: code });
    manager = new PtyManager(mockSendToPanel, mockSendToChrome);
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it("buffers output and flushes on timer", () => {
    manager.create("panel-1");
    mockPty._triggerData?.("hello ");
    mockPty._triggerData?.("world");
    expect(mockSendToPanel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(mockSendToPanel).toHaveBeenCalledWith("panel-1", "pty:output", {
      panelId: "panel-1",
      data: "hello world",
    });
  });

  it("does not flush when buffer is empty", () => {
    manager.create("panel-1");
    vi.advanceTimersByTime(20);
    expect(mockSendToPanel).not.toHaveBeenCalled();
  });
});

describe("PtyManager exit handling", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    let onDataCb: ((data: string) => void) | null = null;
    let onExitCb: ((exit: { exitCode: number }) => void) | null = null;
    mockPty.onData = vi.fn((cb: (data: string) => void) => {
      onDataCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.onExit = vi.fn((cb: (exit: { exitCode: number }) => void) => {
      onExitCb = cb;
      return { dispose: vi.fn() };
    });
    mockPty.process = defaultShellName;
    mockPty._triggerData = (data: string) => onDataCb?.(data);
    mockPty._triggerExit = (code: number) => onExitCb?.({ exitCode: code });
    manager = new PtyManager(mockSendToPanel, mockSendToChrome);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("notifies chrome view on PTY exit", () => {
    manager.create("panel-1");
    mockPty._triggerExit?.(0);
    expect(mockSendToChrome).toHaveBeenCalledWith("pty:exit", { panelId: "panel-1", exitCode: 0 });
  });
});

describe("PtyManager environment injection", () => {
  let manager: PtyManager;
  const mockSendToPanel = vi.fn();
  const mockSendToChrome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPty.onData = vi.fn(() => ({ dispose: vi.fn() }));
    mockPty.onExit = vi.fn(() => ({ dispose: vi.fn() }));
    mockPty.process = defaultShellName;
    manager = new PtyManager(mockSendToPanel, mockSendToChrome);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("sets BROWSER env var to flywheel-open script", () => {
    manager.create("panel-1");
    const spawnCall = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    const env = spawnCall[2].env;
    expect(env.BROWSER).toMatch(/\.flywheel\/bin\/flywheel-open$/);
  });

  it("prepends ~/.flywheel/bin to PATH", () => {
    manager.create("panel-1");
    const spawnCall = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    const env = spawnCall[2].env;
    expect(env.PATH).toMatch(/\.flywheel\/bin:/);
  });

  it("sets FLYWHEEL=1 marker", () => {
    manager.create("panel-1");
    const spawnCall = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    const env = spawnCall[2].env;
    expect(env.FLYWHEEL).toBe("1");
  });
});
