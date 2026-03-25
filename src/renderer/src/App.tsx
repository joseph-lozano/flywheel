import { createEffect, on, onMount, batch } from 'solid-js'
import { createStripStore } from './store/strip'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { PanelBoundsUpdate } from '../../../shared/types'
import Strip from './components/Strip'
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'

export default function App() {
  const { state, actions } = createStripStore()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  createEffect(() => {
    const layout = computeLayout({
      panels: [...state.panels],
      scrollOffset: state.scrollOffset,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight
    })

    const desiredIds = new Set<string>()
    const boundsUpdates: PanelBoundsUpdate[] = []

    for (const entry of layout) {
      if (entry.visibility === 'destroyed') continue
      desiredIds.add(entry.panelId)
      if (!createdPanelIds.has(entry.panelId)) {
        const panel = state.panels.find((p) => p.id === entry.panelId)
        if (panel) {
          window.api.createPanel(entry.panelId, panel.color)
          createdPanelIds.add(entry.panelId)
        }
      }
      boundsUpdates.push({
        panelId: entry.panelId,
        bounds: entry.contentBounds,
        visible: entry.visibility === 'visible'
      })
    }

    for (const id of [...createdPanelIds]) {
      if (!desiredIds.has(id)) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates)
    }
  })

  createEffect(
    on(
      () => state.focusedIndex,
      (focusedIndex) => {
        currentAnimation?.cancel()
        currentAnimation = null
        const target = computeScrollToCenter(focusedIndex, state.panels.length, state.viewportWidth)
        if (Math.abs(state.scrollOffset - target) < 1) {
          actions.setScrollOffset(target)
          return
        }
        currentAnimation = animate({
          from: state.scrollOffset, to: target, duration: 200, easing: easeOut,
          onUpdate: (value) => actions.setScrollOffset(value),
          onComplete: () => { currentAnimation = null }
        })
      },
      { defer: true }
    )
  )

  function handleWheel(deltaX: number): void {
    currentAnimation?.cancel()
    currentAnimation = null
    const maxScroll = computeMaxScroll(state.panels.length, state.viewportWidth)
    const newOffset = Math.max(0, Math.min(state.scrollOffset + deltaX, maxScroll))
    actions.setScrollOffset(newOffset)
    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(() => {
      const idx = findMostCenteredPanel(state.scrollOffset, state.panels.length, state.viewportWidth)
      if (idx >= 0 && idx !== state.focusedIndex) actions.jumpTo(idx)
    }, 150)
  }

  function handleShortcut(action: { type: string; index?: number }): void {
    switch (action.type) {
      case 'focus-left': actions.focusLeft(); break
      case 'focus-right': actions.focusRight(); break
      case 'new-panel': actions.addPanel(); break
      case 'close-panel': actions.removePanel(); break
      case 'jump-to': if (action.index !== undefined) actions.jumpTo(action.index); break
    }
  }

  onMount(() => {
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))
    window.addEventListener('resize', () => actions.setViewport(window.innerWidth, window.innerHeight))
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) handleWheel(event.deltaX)
    }, { passive: true })

    batch(() => {
      actions.setViewport(window.innerWidth, window.innerHeight)
      for (let i = 0; i < 12; i++) actions.addPanel()
      actions.jumpTo(0)
    })
  })

  const layout = () => computeLayout({
    panels: [...state.panels],
    scrollOffset: state.scrollOffset,
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight
  })

  const maxScroll = () => computeMaxScroll(state.panels.length, state.viewportWidth)

  return (
    <>
      <Strip layout={layout()} panels={[...state.panels]} focusedIndex={state.focusedIndex} />
      <ScrollIndicators
        scrollOffset={state.scrollOffset} maxScroll={maxScroll()}
        viewportWidth={state.viewportWidth} viewportHeight={state.viewportHeight}
      />
      <HintBar viewportHeight={state.viewportHeight} />
    </>
  )
}
