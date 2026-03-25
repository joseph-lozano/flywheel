import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_DEFAULTS } from '../shared/constants'
import { DOT_GRID_SVG, DOT_GRID_CSS, setDotGridBusy } from '../browser/dot-grid'

declare global {
  interface Window {
    pty: {
      input: (panelId: string, data: string) => void
      onOutput: (callback: (data: string) => void) => void
      resize: (panelId: string, cols: number, rows: number) => void
      onExit: (callback: (exitCode: number) => void) => void
      getPanelId: () => string
      openUrl: (url: string) => void
      onChromeState: (callback: (state: { position: number; label: string; focused: boolean; busy?: boolean }) => void) => void
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
} catch (e) {
  console.warn('WebGL addon failed, using canvas renderer:', e)
}

fitAddon.fit()

// Link detection — open URLs as browser panels instead of system browser
terminal.loadAddon(new WebLinksAddon((_event, url) => {
  window.pty.openUrl(url)
}))

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

// Chrome state → title bar with dot-grid divider
const posLabel = document.getElementById('pos-label')!
const dotGridWrap = document.getElementById('dot-grid')!
const titleLabel = document.getElementById('title-label')!

// Inject dot-grid SVG and CSS
dotGridWrap.className = 'dot-grid-wrap'
dotGridWrap.innerHTML = DOT_GRID_SVG
const style = document.createElement('style')
style.textContent = DOT_GRID_CSS
document.head.appendChild(style)

const titleBar = document.getElementById('panel-titlebar')!

window.pty.onChromeState((state) => {
  posLabel.textContent = state.position <= 9 ? `${state.position}` : ''
  dotGridWrap.style.display = state.position <= 9 ? '' : 'none'
  titleLabel.textContent = state.label
  titleBar.classList.toggle('focused', state.focused)
  setDotGridBusy(dotGridWrap, !!state.busy)
})
