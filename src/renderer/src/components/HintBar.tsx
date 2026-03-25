import { createSignal, onMount, onCleanup } from 'solid-js'
import { LAYOUT } from '../../../shared/constants'

interface HintBarProps {
  viewportHeight: number
  panelCount: number
  hasProjects: boolean
  sidebarWidth: number
}

const PANEL_HINTS = [
  { key: '\u2318\u2190', label: 'Focus Left' },
  { key: '\u2318\u2192', label: 'Focus Right' },
  { key: '\u2318\u21e7\u2190', label: 'Swap Left' },
  { key: '\u2318\u21e7\u2192', label: 'Swap Right' },
  { key: '\u2318T', label: 'New Terminal' },
  { key: '\u2318B', label: 'New Browser' },
  { key: '\u2318[', label: 'Back' },
  { key: '\u2318]', label: 'Forward' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u2318G', label: 'Blur' },
  { key: '\u23181-9', label: 'Jump' },
  { key: '\u2318\u21e71-9', label: 'Switch Project' }
]

const NO_PROJECT_HINTS = [
  { key: '\u2318O', label: 'Add Project' }
]

export default function HintBar(props: HintBarProps) {
  const top = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT

  const hints = () => props.hasProjects ? PANEL_HINTS : NO_PROJECT_HINTS

  const [stats, setStats] = createSignal({
    panelViewCount: 0,
    mainMemoryMB: 0,
    heapUsedMB: 0
  })

  onMount(() => {
    async function poll() {
      try {
        setStats(await window.api.getDebugStats())
      } catch (e) {
        console.error('debug:stats failed', e)
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    onCleanup(() => clearInterval(id))
  })

  const dimStyle = { color: '#444', 'font-size': '11px' } as const
  const valStyle = { color: '#666', 'font-size': '11px', 'font-family': 'monospace' } as const

  return (
    <div style={{
      position: 'absolute', left: `${props.sidebarWidth}px`, top: `${top()}px`,
      width: `calc(100% - ${props.sidebarWidth}px)`,
      height: `${LAYOUT.HINT_BAR_HEIGHT}px`, display: 'flex', 'align-items': 'center',
      background: '#1a1a2e', 'border-top': '1px solid #252540',
      'user-select': 'none', 'font-size': '12px', 'padding-left': '16px', 'padding-right': '16px'
    }}>
      <div style={{ flex: 1, display: 'flex', 'justify-content': 'center', gap: '24px' }}>
        {hints().map((hint) => (
          <span>
            <span style={{
              color: '#888', 'font-weight': '500', background: '#252540',
              padding: '2px 6px', 'border-radius': '3px', 'margin-right': '4px',
              'font-family': 'monospace'
            }}>{hint.key}</span>
            <span style={{ color: '#555' }}>{hint.label}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', 'flex-shrink': 0 }}>
        <span>
          <span style={dimStyle}>panels </span>
          <span style={valStyle}>{props.panelCount}</span>
        </span>
        <span>
          <span style={dimStyle}>views </span>
          <span style={valStyle}>{stats().panelViewCount}</span>
        </span>
        <span>
          <span style={dimStyle}>main </span>
          <span style={valStyle}>{stats().mainMemoryMB}MB</span>
        </span>
        <span>
          <span style={dimStyle}>heap </span>
          <span style={valStyle}>{stats().heapUsedMB}MB</span>
        </span>
      </div>
    </div>
  )
}
