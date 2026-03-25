import { ICONS } from './icons'

declare global {
  interface Window {
    browserHost: {
      panelId: string
      initialUrl: string
      navigate: (url: string) => void
      goBack: () => void
      goForward: () => void
      reload: () => void
      onChromeState: (callback: (state: {
        position: number; label: string; focused: boolean;
        url: string; canGoBack: boolean; canGoForward: boolean
      }) => void) => void
    }
  }
}

const titlebar = document.getElementById('titlebar')!
const navbar = document.getElementById('navbar')!
const posLabel = document.getElementById('pos-label')!
const globeIcon = document.getElementById('globe-icon')!
const titleLabel = document.getElementById('title-label')!
const btnBack = document.getElementById('btn-back') as HTMLButtonElement
const btnForward = document.getElementById('btn-forward') as HTMLButtonElement
const btnReload = document.getElementById('btn-reload') as HTMLButtonElement
const urlDisplay = document.getElementById('url-display')!
const urlInput = document.getElementById('url-input') as HTMLInputElement

// Set icons
globeIcon.innerHTML = ICONS.globe
btnBack.innerHTML = ICONS.arrowLeft
btnForward.innerHTML = ICONS.arrowRight
btnReload.innerHTML = ICONS.rotateCw

// Nav button handlers
btnBack.addEventListener('click', () => window.browserHost.goBack())
btnForward.addEventListener('click', () => window.browserHost.goForward())
btnReload.addEventListener('click', () => window.browserHost.reload())

// URL bar editing
let editing = false

urlDisplay.addEventListener('click', () => {
  editing = true
  urlInput.value = urlDisplay.textContent || ''
  urlDisplay.style.display = 'none'
  urlInput.style.display = 'block'
  requestAnimationFrame(() => urlInput.focus())
})

function normalizeUrl(raw: string): string {
  if (raw.match(/^https?:\/\//)) return raw
  const isLocal = raw.match(/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/)
  return isLocal ? `http://${raw}` : `https://${raw}`
}

function commitUrl(): void {
  const raw = urlInput.value.trim()
  editing = false
  urlInput.style.display = 'none'
  urlDisplay.style.display = 'block'
  if (raw) window.browserHost.navigate(normalizeUrl(raw))
}

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitUrl() }
  else if (e.key === 'Escape') {
    editing = false
    urlInput.style.display = 'none'
    urlDisplay.style.display = 'block'
  }
})

urlInput.addEventListener('blur', () => { if (editing) commitUrl() })

// Chrome state updates from main process — merges partial updates
let currentState = {
  position: 0, label: '', focused: false,
  url: 'about:blank', canGoBack: false, canGoForward: false
}

window.browserHost.onChromeState((partial) => {
  currentState = { ...currentState, ...partial }
  const s = currentState
  posLabel.textContent = s.position <= 9 ? `${s.position} /` : ''
  titleLabel.textContent = s.label || s.url || 'about:blank'
  titlebar.classList.toggle('focused', s.focused)
  navbar.classList.toggle('focused', s.focused)
  btnBack.disabled = !s.canGoBack
  btnForward.disabled = !s.canGoForward
  if (!editing) urlDisplay.textContent = s.url || 'about:blank'
})

// Auto-focus URL input if initial URL is about:blank
if (window.browserHost.initialUrl === 'about:blank') {
  requestAnimationFrame(() => {
    urlDisplay.style.display = 'none'
    urlInput.style.display = 'block'
    urlInput.focus()
  })
}
