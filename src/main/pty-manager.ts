import * as pty from "node-pty";
import { homedir } from "os";
import { basename, join } from "path";

interface ManagedPty {
  panelId: string;
  pty: pty.IPty;
  buffer: string;
  shellName: string;
  lastTitle: string;
  disposed: boolean;
  hookCommand?: string;
  hookTimer: ReturnType<typeof setTimeout> | null;
  hookSent: boolean;
}

type SendToPanelFn = (panelId: string, channel: string, data: unknown) => void;
type SendToChromeFn = (channel: string, data: unknown) => void;

const FLUSH_INTERVAL_MS = 16;

const TITLE_CHECK_INTERVAL = 30; // check every ~30 flushes (~0.5s)
const HOOK_FALLBACK_DELAY_MS = 500;

export class PtyManager {
  private ptys = new Map<string, ManagedPty>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushCount = 0;
  private sendToPanel: SendToPanelFn;
  private sendToChrome: SendToChromeFn;
  constructor(sendToPanel: SendToPanelFn, sendToChrome: SendToChromeFn) {
    this.sendToPanel = sendToPanel;
    this.sendToChrome = sendToChrome;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  create(panelId: string, cwd?: string, hookCommand?: string): void {
    if (this.ptys.has(panelId)) return;
    const shell = process.env.SHELL ?? "/bin/zsh";
    const shellName = basename(shell);
    const binDir = join(homedir(), ".flywheel", "bin");
    const env = {
      ...process.env,
      BROWSER: join(binDir, "flywheel-open"),
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FLYWHEEL: "1",
    } as Record<string, string>;
    const ptyProcess = pty.spawn(shell, ["-l"], {
      cols: 80,
      rows: 24,
      cwd: cwd ?? process.cwd(),
      env,
    });
    const managed: ManagedPty = {
      panelId,
      pty: ptyProcess,
      buffer: "",
      shellName,
      lastTitle: shellName,
      disposed: false,
      hookCommand,
      hookTimer: null,
      hookSent: false,
    };
    if (hookCommand) {
      managed.hookTimer = setTimeout(() => {
        this.sendHookCommand(managed);
      }, HOOK_FALLBACK_DELAY_MS);
    }
    ptyProcess.onData((data: string) => {
      if (managed.disposed) return;
      managed.buffer += data;
      this.sendHookCommand(managed);
    });
    ptyProcess.onExit(({ exitCode }) => {
      this.clearHookTimer(managed);
      if (!managed.disposed) {
        if (managed.buffer.length > 0) {
          this.sendToPanel(panelId, "pty:output", { panelId, data: managed.buffer });
          managed.buffer = "";
        }
        this.sendToChrome("pty:exit", { panelId, exitCode });
        this.ptys.delete(panelId);
      }
    });
    this.ptys.set(panelId, managed);
    this.sendToChrome("panel:title", { panelId, title: shellName });
  }

  write(panelId: string, data: string): void {
    const managed = this.ptys.get(panelId);
    if (!managed) return;
    managed.pty.write(data);
  }

  dropFiles(panelId: string, paths: string[]): void {
    const managed = this.ptys.get(panelId);
    if (!managed) return;

    if (paths.length === 0) return;

    const payload = `${paths.map((path) => this.quoteForShell(path)).join(" ")} `;
    managed.pty.write(payload);
  }

  resize(panelId: string, cols: number, rows: number): void {
    const managed = this.ptys.get(panelId);
    if (!managed) return;
    managed.pty.resize(cols, rows);
  }

  kill(panelId: string): void {
    const managed = this.ptys.get(panelId);
    if (!managed) return;
    managed.disposed = true;
    this.clearHookTimer(managed);
    managed.pty.kill();
    this.ptys.delete(panelId);
  }

  killByPrefix(prefix: string): void {
    for (const panelId of [...this.ptys.keys()]) {
      if (panelId.startsWith(prefix)) {
        const managed = this.ptys.get(panelId);
        if (!managed) continue;
        managed.disposed = true;
        this.clearHookTimer(managed);
        managed.pty.kill();
        this.ptys.delete(panelId);
      }
    }
  }

  getForegroundProcess(panelId: string): string | null {
    const managed = this.ptys.get(panelId);
    if (!managed) return null;
    return managed.pty.process;
  }

  hasPty(panelId: string): boolean {
    return this.ptys.has(panelId);
  }

  isBusy(panelId: string): boolean {
    const managed = this.ptys.get(panelId);
    if (!managed) return false;
    const fg = managed.pty.process;
    if (!fg) return false;
    return basename(fg) !== managed.shellName;
  }

  private quoteForShell(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
  }

  private clearHookTimer(managed: ManagedPty): void {
    if (managed.hookTimer) {
      clearTimeout(managed.hookTimer);
      managed.hookTimer = null;
    }
  }

  private sendHookCommand(managed: ManagedPty): void {
    if (managed.disposed || managed.hookSent || !managed.hookCommand) return;
    managed.hookSent = true;
    this.clearHookTimer(managed);
    managed.pty.write(managed.hookCommand + "\n");
  }

  private flush(): void {
    for (const managed of this.ptys.values()) {
      if (managed.buffer.length > 0 && !managed.disposed) {
        this.sendToPanel(managed.panelId, "pty:output", {
          panelId: managed.panelId,
          data: managed.buffer,
        });
        managed.buffer = "";
      }
    }
    this.flushCount++;
    if (this.flushCount >= TITLE_CHECK_INTERVAL) {
      this.flushCount = 0;
      this.checkTitles();
    }
  }

  private checkTitles(): void {
    for (const managed of this.ptys.values()) {
      if (managed.disposed) continue;
      const current = managed.pty.process;
      if (!current) continue;
      const processName = basename(current);
      if (processName !== managed.lastTitle) {
        managed.lastTitle = processName;
        this.sendToChrome("panel:title", { panelId: managed.panelId, title: processName });
      }
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    for (const managed of this.ptys.values()) {
      managed.disposed = true;
      this.clearHookTimer(managed);
      managed.pty.kill();
    }
    this.ptys.clear();
  }
}
