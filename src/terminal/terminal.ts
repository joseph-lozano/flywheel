import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_DEFAULTS } from "../shared/constants";
import { initDotGrid, setDotGridBusy } from "../shared/dot-grid";
import { ICONS } from "../shared/icons";
import { shellEscape } from "./shell-escape";

declare global {
  interface Window {
    pty: {
      input: (panelId: string, data: string) => void;
      onOutput: (callback: (data: string) => void) => void;
      resize: (panelId: string, cols: number, rows: number) => void;
      onExit: (callback: (exitCode: number) => void) => void;
      getPanelId: () => string;
      openUrl: (url: string) => void;
      onChromeState: (
        callback: (state: {
          position: number;
          label: string;
          focused: boolean;
          busy?: boolean;
        }) => void,
      ) => void;
      getConfig: () => Promise<{ terminal: { fontFamily: string; fontSize: number } }>;
      onConfigUpdated: (callback: (config: any) => void) => void;
      onSetFontSize: (callback: (data: { fontSize: number }) => void) => void;
      closePanel: (panelId: string) => void;
    };
  }
}

const panelId = window.pty.getPanelId();

let terminal: Terminal;
let fitAddon: FitAddon;

async function initTerminal(): Promise<void> {
  const config = await window.pty.getConfig();

  terminal = new Terminal({
    fontFamily: config.terminal.fontFamily,
    fontSize: config.terminal.fontSize,
    theme: TERMINAL_DEFAULTS.theme,
    allowProposedApi: true,
    scrollback: 5000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new Unicode11Addon());
  terminal.unicode.activeVersion = "11";

  const container = document.getElementById("terminal")!;
  terminal.open(container);

  // Try WebGL, fall back to canvas
  try {
    terminal.loadAddon(new WebglAddon());
  } catch (e) {
    console.warn("WebGL addon failed, using canvas renderer:", e);
  }

  fitAddon.fit();
  terminal.focus();

  // Drag-and-drop: paste shell-escaped file paths into terminal
  setupFileDrop(container, terminal);

  // Link detection — open URLs as browser panels instead of system browser.
  // The WebLinksAddon's default handler calls window.open() (about:blank) then
  // sets newWindow.location.href = uri. Override window.open so that the URL
  // is captured from the location.href setter and routed via IPC.
  window.open = () => {
    const loc = {} as Location;
    Object.defineProperty(loc, "href", {
      set(url: string) {
        window.pty.openUrl(url);
      },
    });
    return { opener: null, location: loc } as unknown as Window;
  };
  terminal.loadAddon(new WebLinksAddon());

  // OSC 7770 — BROWSER / open wrapper script sends URLs via this sequence.
  // The script writes: \033]7770;<url>\007 to /dev/tty, which flows through
  // the PTY into xterm.js. We parse it here and open as a browser panel.
  terminal.parser.registerOscHandler(7770, (data) => {
    if (/^https?:\/\//.test(data)) {
      window.pty.openUrl(data);
    }
    return true;
  });

  // Wire input: terminal → PTY
  terminal.onData((data) => {
    window.pty.input(panelId, data);
  });

  // Wire output: PTY → terminal
  window.pty.onOutput((data) => {
    terminal.write(data);
  });

  // Wire exit: PTY exited
  window.pty.onExit((_exitCode) => {
    terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
  });

  // Wire resize: terminal → PTY
  function reportSize(): void {
    window.pty.resize(panelId, terminal.cols, terminal.rows);
  }

  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    reportSize();
  });
  resizeObserver.observe(container);

  // Initial size report
  reportSize();

  // Config reload — update font settings
  window.pty.onConfigUpdated((config: any) => {
    const prefs = config.preferences || config;
    if (prefs.terminal) {
      terminal.options.fontFamily = prefs.terminal.fontFamily;
      terminal.options.fontSize = prefs.terminal.fontSize;
      fitAddon.fit();
    }
  });

  // Zoom control from main process
  window.pty.onSetFontSize((data: { fontSize: number }) => {
    terminal.options.fontSize = data.fontSize;
    fitAddon.fit();
  });

  // Chrome state → title bar with dot-grid divider
  const posLabel = document.getElementById("pos-label")!;
  const dotGridWrap = document.getElementById("dot-grid")!;
  const titleLabel = document.getElementById("title-label")!;

  initDotGrid(dotGridWrap);

  const titleBar = document.getElementById("panel-titlebar")!;

  window.pty.onChromeState((state) => {
    posLabel.textContent = state.position <= 9 ? `${state.position}` : "";
    titleLabel.textContent = state.label;
    titleBar.classList.toggle("focused", state.focused);
    setDotGridBusy(dotGridWrap, !!state.busy);
  });

  // Close button
  const btnClose = document.getElementById("btn-close") as HTMLButtonElement;
  btnClose.innerHTML = ICONS.x;
  btnClose.addEventListener("click", () => {
    window.pty.closePanel(panelId);
  });
}

function setupFileDrop(container: HTMLElement, term: Terminal): void {
  const el = term.element;
  if (!el) return;

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.add("drag-over");
  });

  el.addEventListener("dragleave", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove("drag-over");

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const paths = Array.from(files)
      .map((f) => (f as File & { path: string }).path)
      .filter(Boolean)
      .map(shellEscape);

    if (paths.length > 0) {
      term.paste(paths.join(" "));
    }
  });
}

initTerminal();
