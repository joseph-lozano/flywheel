import { For } from 'solid-js'
import type { PanelLayout } from '../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  focusedPanelId: string | undefined
  panelChromeHeights: Map<string, number>
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry) => (
          <PanelFrame
            contentBounds={entry.contentBounds}
            focused={entry.panelId === props.focusedPanelId}
            chromeHeight={props.panelChromeHeights.get(entry.panelId) || 60}
          />
        )}
      </For>
    </div>
  )
}
