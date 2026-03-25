import { For } from 'solid-js'
import type { PanelLayout } from '../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  panels: Array<{ id: string; label: string }>
  focusedIndex: number
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry, index) => {
          const panel = () => props.panels.find((p) => p.id === entry.panelId)
          return (
            <PanelFrame
              titleBarBounds={entry.titleBarBounds}
              contentBounds={entry.contentBounds}
              label={panel()?.label ?? ''}
              focused={index() === props.focusedIndex}
            />
          )
        }}
      </For>
    </div>
  )
}
