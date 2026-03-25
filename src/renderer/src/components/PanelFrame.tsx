import { createSignal } from 'solid-js'
import type { Rectangle } from '../../../shared/types'
import { LAYOUT } from '../../../shared/constants'

interface PanelFrameProps {
  titleBarBounds: Rectangle
  contentBounds: Rectangle
  label: string
  focused: boolean
  panelType: string
  panelId: string
  position: number
  url?: string
  onNavigate?: (panelId: string, url: string) => void
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH
  const [editingUrl, setEditingUrl] = createSignal(false)
  const [urlInput, setUrlInput] = createSignal('')

  function startEditing() {
    setUrlInput(props.url || '')
    setEditingUrl(true)
  }

  function commitUrl() {
    const raw = urlInput().trim()
    if (!raw) { setEditingUrl(false); return }
    const url = raw.match(/^https?:\/\//) ? raw : `https://${raw}`
    props.onNavigate?.(props.panelId, url)
    setEditingUrl(false)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitUrl() }
    else if (e.key === 'Escape') { setEditingUrl(false) }
  }

  const isBrowser = () => props.panelType === 'browser'

  return (
    <>
      {props.focused && (
        <div
          style={{
            position: 'absolute',
            left: `${props.contentBounds.x - borderWidth}px`,
            top: `${props.contentBounds.y - borderWidth}px`,
            width: `${props.contentBounds.width + borderWidth * 2}px`,
            height: `${props.contentBounds.height + borderWidth * 2}px`,
            border: `${borderWidth}px solid #6366f1`,
            'border-radius': '4px',
            'box-shadow': '0 0 16px rgba(99, 102, 241, 0.2)',
            'pointer-events': 'none'
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: `${props.titleBarBounds.x}px`,
          top: `${props.titleBarBounds.y}px`,
          width: `${props.titleBarBounds.width}px`,
          height: `${props.titleBarBounds.height}px`,
          display: 'flex',
          'align-items': 'center',
          'padding-left': '12px',
          'padding-right': isBrowser() ? '12px' : '0',
          'font-size': '13px',
          'font-weight': props.focused ? '500' : '400',
          color: props.focused ? '#e0e0e0' : '#666',
          background: props.focused ? '#252540' : '#1a1a2e',
          'border-radius': '6px 6px 0 0',
          'user-select': 'none',
          'border-bottom': props.focused ? '2px solid #6366f1' : '1px solid #2a2a3e',
          'pointer-events': isBrowser() ? 'auto' : 'none'
        }}
      >
        {isBrowser() ? (
          <>
            {props.position <= 9 && (
              <span style={{
                color: props.focused ? '#e0e0e0' : '#666', 'margin-right': '6px', 'flex-shrink': 0
              }}>{props.position} ⌁</span>
            )}
            <span style={{
              color: '#06b6d4', 'margin-right': '8px', 'font-size': '14px', 'flex-shrink': 0
            }}>&#127760;</span>
            {editingUrl() ? (
              <input
                type="text"
                value={urlInput()}
                onInput={(e) => setUrlInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => setEditingUrl(false)}
                ref={(el) => setTimeout(() => el.focus(), 0)}
                style={{
                  flex: 1,
                  background: '#1a1a2e',
                  border: '1px solid #3a3a5c',
                  'border-radius': '3px',
                  color: '#e0e0e0',
                  'font-size': '12px',
                  'font-family': 'monospace',
                  padding: '2px 6px',
                  outline: 'none',
                  height: '22px'
                }}
              />
            ) : (
              <span
                onClick={startEditing}
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  'font-family': 'monospace',
                  'font-size': '12px',
                  color: props.focused ? '#888' : '#555',
                  cursor: 'text'
                }}
              >
                {props.url || 'about:blank'}
              </span>
            )}
          </>
        ) : (
          <span>{props.label}</span>
        )}
      </div>
    </>
  )
}
