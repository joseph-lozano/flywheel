import type { Rectangle } from '../../../shared/types'
import { LAYOUT } from '../../../shared/constants'

interface PanelFrameProps {
  contentBounds: Rectangle
  focused: boolean
}

export default function PanelFrame(props: PanelFrameProps) {
  const borderWidth = LAYOUT.FOCUS_BORDER_WIDTH
  const chromeHeight = LAYOUT.PANEL_CHROME_HEIGHT

  return (
    <>
      {props.focused && (
        <div
          style={{
            position: 'absolute',
            left: `${props.contentBounds.x - borderWidth}px`,
            top: `${props.contentBounds.y + chromeHeight - borderWidth}px`,
            width: `${props.contentBounds.width + borderWidth * 2}px`,
            height: `${props.contentBounds.height - chromeHeight + borderWidth * 2}px`,
            border: `${borderWidth}px solid #6366f1`,
            'border-radius': '4px',
            'box-shadow': '0 0 16px rgba(99, 102, 241, 0.2)',
            'pointer-events': 'none'
          }}
        />
      )}
    </>
  )
}
