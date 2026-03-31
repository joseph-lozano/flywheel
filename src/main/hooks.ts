import { exec } from "child_process";

const CLEANUP_TIMEOUT_MS = 10_000;

export function runCleanupHook(
  command: string | undefined,
  cwd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!command) return Promise.resolve({ ok: true });

  return new Promise((resolve) => {
    exec(command, { cwd, timeout: CLEANUP_TIMEOUT_MS }, (error) => {
      if (error) {
        resolve({ ok: false, error: error.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}
