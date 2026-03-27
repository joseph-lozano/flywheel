import { chmodSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const FLYWHEEL_OPEN = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    elif command -v open > /dev/null 2>&1; then
      open "$1"
    elif command -v xdg-open > /dev/null 2>&1; then
      xdg-open "$1"
    fi ;;
esac
`;

const OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    else
      /usr/bin/open "$1"
    fi ;;
  *)
    /usr/bin/open "$@" ;;
esac
`;

const XDG_OPEN_WRAPPER = `#!/bin/sh
case "$1" in
  http://*|https://*)
    if [ -w /dev/tty ]; then
      printf '\\033]7770;%s\\007' "$1" > /dev/tty
    else
      /usr/bin/xdg-open "$1"
    fi ;;
  *)
    /usr/bin/xdg-open "$@" ;;
esac
`;

export function installScripts(homeDir: string, platform: string = process.platform): void {
  const binDir = join(homeDir, ".flywheel", "bin");
  mkdirSync(binDir, { recursive: true });

  const write = (name: string, content: string): void => {
    const path = join(binDir, name);
    writeFileSync(path, content, "utf-8");
    chmodSync(path, 0o755);
  };

  write("flywheel-open", FLYWHEEL_OPEN);

  if (platform === "darwin") {
    write("open", OPEN_WRAPPER);
  } else if (platform === "linux") {
    write("xdg-open", XDG_OPEN_WRAPPER);
  }
}
