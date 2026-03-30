import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_DEFAULTS } from "../shared/constants";
import { initDotGrid, setDotGridBusy } from "../shared/dot-grid";
import { ICONS } from "../shared/icons";

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
      onSetClip: (callback: (data: { clip: number; fullWidth: number }) => void) => void;
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

  // Sidebar clip: fix container width so xterm.js keeps its column count
  // while the view narrows during horizontal scroll. The negative margin
  // shifts content left so the visible portion is the right side of the
  // terminal, appearing to slide under the sidebar.
  window.pty.onSetClip((data) => {
    if (data.clip > 0) {
      // 16 = 2 × 8px horizontal padding from index.html #terminal
      container.style.width = `${data.fullWidth - 16}px`;
      container.style.marginLeft = `-${data.clip}px`;
    } else {
      container.style.width = "calc(100% - 16px)";
      container.style.marginLeft = "0";
    }
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

initTerminal();
