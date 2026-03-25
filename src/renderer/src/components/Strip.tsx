import { For } from 'solid-js'
import type { PanelLayout } from '../../../shared/types'
import PanelFrame from './PanelFrame'

interface StripProps {
  layout: PanelLayout[]
  panels: Array<{ id: string; type: string; label: string }>
  focusedIndex: number
}

export default function Strip(props: StripProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
      <For each={props.layout}>
        {(entry, index) => {
          const panel = () => props.panels.find((p) => p.id === entry.panelId)
          const panelIndex = () => props.panels.findIndex((p) => p.id === entry.panelId)
          const label = () => {
            const pos = panelIndex() + 1
            const p = panel()
            const name = p?.label ?? ''
            return pos <= 9 ? `${pos} — ${name}` : name
          }
          return (
            <PanelFrame
              titleBarBounds={entry.titleBarBounds}
              contentBounds={entry.contentBounds}
              label={label()}
              focused={entry.panelId === props.panels[props.focusedIndex]?.id}
            />
          )
        }}
      </For>
    </div>
  )
}
