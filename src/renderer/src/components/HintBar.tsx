import { LAYOUT } from '../../../shared/constants'

interface HintBarProps {
  viewportHeight: number
}

const HINTS = [
  { key: '\u2318\u2190', label: 'Focus Left' },
  { key: '\u2318\u2192', label: 'Focus Right' },
  { key: '\u2318T', label: 'New Panel' },
  { key: '\u2318W', label: 'Close' },
  { key: '\u23181-9', label: 'Jump' }
]

export default function HintBar(props: HintBarProps) {
  const top = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT

  return (
    <div style={{
      position: 'absolute', left: 0, top: `${top()}px`, width: '100%',
      height: `${LAYOUT.HINT_BAR_HEIGHT}px`, display: 'flex', 'align-items': 'center',
      'justify-content': 'center', gap: '24px', background: '#1a1a2e',
      'border-top': '1px solid #252540', 'user-select': 'none', 'font-size': '12px'
    }}>
      {HINTS.map((hint) => (
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
  )
}
