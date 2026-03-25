import type { Rectangle } from '../../../shared/types'
import { LAYOUT } from '../../../shared/constants'

interface PanelFrameProps {
  titleBarBounds: Rectangle
  contentBounds: Rectangle
  label: string
  focused: boolean
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH

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
          'font-size': '13px',
          'font-weight': props.focused ? '500' : '400',
          color: props.focused ? '#e0e0e0' : '#666',
          background: props.focused ? '#252540' : '#1a1a2e',
          'border-radius': '6px 6px 0 0',
          'user-select': 'none',
          'border-bottom': props.focused ? '2px solid #6366f1' : '1px solid #2a2a3e'
        }}
      >
        {props.label}
      </div>
    </>
  )
}
