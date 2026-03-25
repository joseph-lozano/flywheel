import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    pty: {
      input: (panelId: string, data: string) => void
      onOutput: (callback: (data: string) => void) => void
      resize: (panelId: string, cols: number, rows: number) => void
      onExit: (callback: (exitCode: number) => void) => void
      getPanelId: () => string
    }
  }
}

const panelId = window.pty.getPanelId()

const terminal = new Terminal({
  fontFamily: 'monospace',
  fontSize: 14,
  theme: {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
    cursor: '#e0e0e0',
    cursorAccent: '#1a1a2e',
    selectionBackground: 'rgba(255, 255, 255, 0.2)',
    black: '#1a1a2e',
    red: '#f43f5e',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#6366f1',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#e0e0e0',
    brightBlack: '#4a4a6a',
    brightRed: '#fb7185',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#818cf8',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  },
  allowProposedApi: true
})

const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.loadAddon(new Unicode11Addon())
terminal.unicode.activeVersion = '11'

const container = document.getElementById('terminal')!
terminal.open(container)

// Try WebGL, fall back to canvas
try {
  terminal.loadAddon(new WebglAddon())
} catch {
  console.warn('WebGL addon failed, using canvas renderer')
}

fitAddon.fit()

// Wire input: terminal → PTY
terminal.onData((data) => {
  window.pty.input(panelId, data)
})

// Wire output: PTY → terminal
window.pty.onOutput((data) => {
  terminal.write(data)
})

// Wire exit: PTY exited
window.pty.onExit((_exitCode) => {
  terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
})

// Wire resize: terminal → PTY
function reportSize(): void {
  window.pty.resize(panelId, terminal.cols, terminal.rows)
}

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit()
  reportSize()
})
resizeObserver.observe(container)

// Initial size report
reportSize()
