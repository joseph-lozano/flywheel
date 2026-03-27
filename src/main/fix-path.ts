import { execFileSync } from "child_process";

/**
 * On macOS/Linux, GUI apps launched from Finder/Dock get a minimal PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin) that excludes Homebrew, ~/.local/bin, etc.
 * Run the user's login shell to capture their full PATH and patch process.env.
 */
export function fixPath(): void {
  if (process.platform === "win32") return;

  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const result = execFileSync(shell, ["-ilc", "printf '%s' \"$PATH\""], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (result) {
      process.env.PATH = result;
    }
  } catch {
    // Silently fall back to existing PATH — this runs in dev too where it's already correct
  }
}
