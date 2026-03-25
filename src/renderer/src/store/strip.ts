import { createStore } from 'solid-js/store'
import type { Panel } from '../../../shared/types'
import { PANEL_COLORS } from '../../../shared/constants'

export interface StripState {
  panels: Panel[]
  focusedIndex: number
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
  terminalFocused: boolean
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
    panels: [], focusedIndex: 0, scrollOffset: 0, viewportWidth: 800, viewportHeight: 600,
    terminalFocused: true
  })

  const actions = {
    addPanel(panelType: 'terminal' | 'placeholder' = 'terminal'): Panel {
      const panel = nextPanel()
      panel.type = panelType
      const insertIndex = state.panels.length === 0 ? 0 : state.focusedIndex + 1
      const before = state.panels.slice(0, insertIndex)
      const after = state.panels.slice(insertIndex)
      setState('panels', [...before, panel, ...after])
      setState('focusedIndex', insertIndex)
      setState('terminalFocused', true)
      return panel
    },
    removePanelById(id: string): string | null {
      const index = state.panels.findIndex((p) => p.id === id)
      if (index === -1) return null
      const newPanels = state.panels.filter((_, i) => i !== index)
      setState('panels', newPanels)
      if (newPanels.length === 0) {
        setState('focusedIndex', 0)
      } else if (index <= state.focusedIndex) {
        setState('focusedIndex', Math.max(0, Math.min(state.focusedIndex - (index < state.focusedIndex ? 1 : 0), newPanels.length - 1)))
      }
      return id
    },
    removePanel(): string | null {
      if (state.panels.length === 0) return null
      return actions.removePanelById(state.panels[state.focusedIndex].id)
    },
    blurPanel() { setState('terminalFocused', false) },
    focusLeft() {
      if (state.focusedIndex > 0) { setState('focusedIndex', state.focusedIndex - 1); setState('terminalFocused', true) }
    },
    focusRight() {
      if (state.focusedIndex < state.panels.length - 1) { setState('focusedIndex', state.focusedIndex + 1); setState('terminalFocused', true) }
    },
    jumpTo(index: number) {
      if (index >= 0 && index < state.panels.length) { setState('focusedIndex', index); setState('terminalFocused', true) }
    },
    setScrollOffset(offset: number) { setState('scrollOffset', offset) },
    setViewport(width: number, height: number) { setState('viewportWidth', width); setState('viewportHeight', height) }
  }

  return { state, actions }
}
