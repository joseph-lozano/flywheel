import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_DEFAULTS } from '../shared/constants'

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
  ...TERMINAL_DEFAULTS,
  allowProposedApi: true,
  scrollback: 5000
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
