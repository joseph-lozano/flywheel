import { createSignal } from 'solid-js'
import { Globe, ArrowLeft, ArrowRight, RotateCw } from 'lucide-solid'
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
  autoEdit?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onNavigate?: (panelId: string, url: string) => void
  onGoBack?: (panelId: string) => void
  onGoForward?: (panelId: string) => void
  onReload?: (panelId: string) => void
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH
  const [editingUrl, setEditingUrl] = createSignal(props.autoEdit || false)
  const [urlInput, setUrlInput] = createSignal('')

  function startEditing() {
    setUrlInput(props.url || '')
    setEditingUrl(true)
  }

  function normalizeUrl(raw: string): string {
    if (raw.match(/^https?:\/\//)) return raw
    const isLocal = raw.match(/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/)
    return isLocal ? `http://${raw}` : `https://${raw}`
  }

  function commitUrl() {
    const raw = urlInput().trim()
    if (!raw) { setEditingUrl(false); return }
    props.onNavigate?.(props.panelId, normalizeUrl(raw))
    setEditingUrl(false)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitUrl() }
    else if (e.key === 'Escape') { setEditingUrl(false) }
  }

  const isBrowser = () => props.panelType === 'browser'

  const navBarTop = () => props.titleBarBounds.y + props.titleBarBounds.height

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

      {/* Title bar */}
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
          'padding-right': '12px',
          'font-size': '13px',
          'font-weight': props.focused ? '500' : '400',
          color: props.focused ? '#e0e0e0' : '#666',
          background: props.focused ? '#252540' : '#1a1a2e',
          'border-radius': isBrowser() ? '6px 6px 0 0' : '6px 6px 0 0',
          'user-select': 'none',
          'border-bottom': isBrowser() ? '1px solid #2a2a3e' : (props.focused ? '2px solid #6366f1' : '1px solid #2a2a3e'),
          'pointer-events': isBrowser() ? 'none' : 'none'
        }}
      >
        {isBrowser() ? (
          <>
            {props.position <= 9 && (
              <span style={{
                color: props.focused ? '#e0e0e0' : '#666', 'margin-right': '6px', 'flex-shrink': '0'
              }}>{props.position} /</span>
            )}
            <Globe size={14} color="#06b6d4" />
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
                'font-size': '12px',
                'margin-left': '6px',
                color: props.focused ? '#c0c0c0' : '#555'
              }}
            >
              {props.url || 'about:blank'}
            </span>
          </>
        ) : (
          <span>{props.label}</span>
        )}
      </div>

      {/* Nav bar — browser panels only */}
      {isBrowser() && (
        <div
          style={{
            position: 'absolute',
            left: `${props.titleBarBounds.x}px`,
            top: `${navBarTop()}px`,
            width: `${props.titleBarBounds.width}px`,
            height: `${LAYOUT.BROWSER_NAV_BAR_HEIGHT}px`,
            display: 'flex',
            'align-items': 'center',
            padding: '0 8px',
            background: '#1e1e36',
            gap: '4px',
            'pointer-events': 'auto',
            'border-bottom': props.focused ? '2px solid #6366f1' : '1px solid #2a2a3e'
          }}
        >
          {/* Back button */}
          <button
            onClick={() => props.onGoBack?.(props.panelId)}
            disabled={!props.canGoBack}
            style={{
              width: '22px',
              height: '22px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'border-radius': '4px',
              cursor: props.canGoBack ? 'pointer' : 'default',
              border: 'none',
              background: 'transparent',
              color: props.canGoBack ? '#888' : '#444',
              padding: '0',
              'flex-shrink': '0'
            }}
          >
            <ArrowLeft size={14} />
          </button>

          {/* Forward button */}
          <button
            onClick={() => props.onGoForward?.(props.panelId)}
            disabled={!props.canGoForward}
            style={{
              width: '22px',
              height: '22px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'border-radius': '4px',
              cursor: props.canGoForward ? 'pointer' : 'default',
              border: 'none',
              background: 'transparent',
              color: props.canGoForward ? '#888' : '#444',
              padding: '0',
              'flex-shrink': '0'
            }}
          >
            <ArrowRight size={14} />
          </button>

          {/* Vertical separator */}
          <div
            style={{
              width: '1px',
              height: '16px',
              background: '#333',
              'flex-shrink': '0'
            }}
          />

          {/* URL bar */}
          {editingUrl() ? (
            <input
              type="text"
              value={urlInput()}
              onInput={(e) => setUrlInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setEditingUrl(false)}
              ref={(el) => requestAnimationFrame(() => el.focus())}
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

          {/* Reload button */}
          <button
            onClick={() => props.onReload?.(props.panelId)}
            style={{
              width: '22px',
              height: '22px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'border-radius': '4px',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: '#888',
              padding: '0',
              'flex-shrink': '0'
            }}
          >
            <RotateCw size={12} />
          </button>
        </div>
      )}
    </>
  )
}
