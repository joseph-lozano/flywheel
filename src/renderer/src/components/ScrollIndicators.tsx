import { LAYOUT } from '../../../shared/constants'

interface ScrollIndicatorsProps {
  scrollOffset: number
  maxScroll: number
  viewportWidth: number
  viewportHeight: number
}

export default function ScrollIndicators(props: ScrollIndicatorsProps) {
  const trackTop = () => props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT
  const showLeft = () => props.scrollOffset > 1
  const showRight = () => props.scrollOffset < props.maxScroll - 1
  const thumbWidth = () => {
    if (props.maxScroll <= 0) return props.viewportWidth
    const ratio = props.viewportWidth / (props.viewportWidth + props.maxScroll)
    return Math.max(40, props.viewportWidth * ratio)
  }
  const thumbLeft = () => {
    if (props.maxScroll <= 0) return 0
    const ratio = props.scrollOffset / props.maxScroll
    return ratio * (props.viewportWidth - thumbWidth())
  }

  return (
    <>
      {showLeft() && (
        <div style={{
          position: 'absolute', left: 0, top: `${LAYOUT.STRIP_TOP_PADDING}px`,
          width: '60px', height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
          background: 'linear-gradient(to right, rgba(15,15,26,0.9), transparent)',
          'pointer-events': 'none', display: 'flex', 'align-items': 'center',
          'padding-left': '8px', 'z-index': '10'
        }}>
          <span style={{ color: '#555', 'font-size': '18px' }}>&#8249;</span>
        </div>
      )}

      {showRight() && (
        <div style={{
          position: 'absolute', right: 0, top: `${LAYOUT.STRIP_TOP_PADDING}px`,
          width: '60px', height: `${trackTop() - LAYOUT.STRIP_TOP_PADDING}px`,
          background: 'linear-gradient(to left, rgba(15,15,26,0.9), transparent)',
          'pointer-events': 'none', display: 'flex', 'align-items': 'center',
          'justify-content': 'flex-end', 'padding-right': '8px', 'z-index': '10'
        }}>
          <span style={{ color: '#555', 'font-size': '18px' }}>&#8250;</span>
        </div>
      )}

      <div style={{
        position: 'absolute', left: 0, top: `${trackTop()}px`,
        width: '100%', height: `${LAYOUT.SCROLL_TRACK_HEIGHT}px`, background: '#1a1a2e'
      }}>
        <div style={{
          position: 'absolute', left: `${thumbLeft()}px`, top: 0,
          width: `${thumbWidth()}px`, height: '100%',
          background: props.maxScroll > 0 ? '#333' : 'transparent',
          'border-radius': '2px', transition: 'background 0.2s'
        }} />
      </div>
    </>
  )
}
