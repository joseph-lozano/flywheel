import { createStore } from 'solid-js/store'
import type { Panel } from '../../../shared/types'
import { PANEL_COLORS } from '../../../shared/constants'

export interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
}

export function createStripStore() {
  let nextId = 0
  let colorIndex = 0

  function nextPanel(): Panel {
    const color = PANEL_COLORS[colorIndex % PANEL_COLORS.length]
    colorIndex++
    nextId++
    return { id: `panel-${nextId}`, type: 'placeholder', color: color.hex, label: color.name }
  }

  const [state, setState] = createStore<StripState>({
    panels: [], focusedIndex: 0, scrollOffset: 0, viewportWidth: 800, viewportHeight: 600
  })

  const actions = {
    addPanel(): Panel {
      const panel = nextPanel()
      const insertIndex = state.panels.length === 0 ? 0 : state.focusedIndex + 1
      const before = state.panels.slice(0, insertIndex)
      const after = state.panels.slice(insertIndex)
      setState('panels', [...before, panel, ...after])
      setState('focusedIndex', insertIndex)
      return panel
    },
    removePanel(): string | null {
      if (state.panels.length === 0) return null
      const removedId = state.panels[state.focusedIndex].id
      const removedIndex = state.focusedIndex
      const newPanels = state.panels.filter((_, i) => i !== removedIndex)
      setState('panels', newPanels)
      setState('focusedIndex', newPanels.length > 0 ? Math.min(removedIndex, newPanels.length - 1) : 0)
      return removedId
    },
    focusLeft() { if (state.focusedIndex > 0) setState('focusedIndex', state.focusedIndex - 1) },
    focusRight() { if (state.focusedIndex < state.panels.length - 1) setState('focusedIndex', state.focusedIndex + 1) },
    jumpTo(index: number) { if (index >= 0 && index < state.panels.length) setState('focusedIndex', index) },
    setScrollOffset(offset: number) { setState('scrollOffset', offset) },
    setViewport(width: number, height: number) { setState('viewportWidth', width); setState('viewportHeight', height) }
  }

  return { state, actions }
}
