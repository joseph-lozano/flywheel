import { createEffect, createSignal, on, onMount, batch } from 'solid-js'
import { createStripStore } from './store/strip'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { PanelBoundsUpdate } from '../../../shared/types'
import Strip from './components/Strip'
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'
import ConfirmDialog from './components/ConfirmDialog'

export default function App() {
  const { state, actions } = createStripStore()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  const [confirmClose, setConfirmClose] = createSignal<{ panelId: string; processName: string } | null>(null)

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
          if (panel.type === 'terminal') {
            window.api.createTerminalPanel(entry.panelId)
          } else {
            window.api.createPanel(entry.panelId, panel.color)
          }
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

  createEffect(
    on(
      () => ({ idx: state.focusedIndex, focused: state.terminalFocused }),
      ({ idx, focused }) => {
        if (state.panels.length === 0) return
        const panel = state.panels[idx]
        if (!panel) return

        if (focused && panel.type === 'terminal') {
          window.api.focusPanel(panel.id)
        } else {
          window.api.blurAllPanels()
        }
      }
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

  function handleClosePanel(): void {
    if (state.panels.length === 0) return
    const focusedPanel = state.panels[state.focusedIndex]
    if (!focusedPanel) return

    if (focusedPanel.type === 'terminal') {
      window.api.closePanel(focusedPanel.id)
    } else {
      const removedId = actions.removePanel()
      if (removedId) {
        window.api.destroyPanel(removedId)
        createdPanelIds.delete(removedId)
      }
    }
  }

  function handleShortcut(action: { type: string; index?: number }): void {
    switch (action.type) {
      case 'focus-left': actions.focusLeft(); break
      case 'focus-right': actions.focusRight(); break
      case 'new-panel': {
        const panel = actions.addPanel('terminal')
        window.api.createTerminal(panel.id)
        break
      }
      case 'close-panel': handleClosePanel(); break
      case 'blur-panel': actions.blurPanel(); break
      case 'jump-to': if (action.index !== undefined) actions.jumpTo(action.index); break
    }
  }

  function handleConfirmResponse(confirmed: boolean): void {
    const data = confirmClose()
    if (data) {
      window.api.confirmCloseResponse(data.panelId, confirmed)
      if (confirmed) {
        actions.removePanelById(data.panelId)
        createdPanelIds.delete(data.panelId)
      }
      setConfirmClose(null)
      window.api.showAllPanels()
    }
  }

  onMount(() => {
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))
    window.addEventListener('resize', () => actions.setViewport(window.innerWidth, window.innerHeight))
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) handleWheel(event.deltaX)
    }, { passive: true })

    window.api.onPtyExit((data) => {
      actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    window.api.onConfirmClose((data) => {
      window.api.hideAllPanels()
      setConfirmClose(data)
    })

    // Update panel title when foreground process changes
    window.api.onPanelTitle((data) => {
      actions.setPanelTitle(data.panelId, data.title)
    })

    // When user clicks a panel, sync the store's focusedIndex
    window.api.onPanelFocused((data) => {
      const idx = state.panels.findIndex((p) => p.id === data.panelId)
      if (idx >= 0 && idx !== state.focusedIndex) {
        actions.jumpTo(idx)
      }
    })

    batch(() => {
      actions.setViewport(window.innerWidth, window.innerHeight)
      const panel = actions.addPanel('terminal')
      window.api.createTerminal(panel.id)
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
      <HintBar viewportHeight={state.viewportHeight} panelCount={state.panels.length} />
      {confirmClose() && (
        <ConfirmDialog
          processName={confirmClose()!.processName}
          onConfirm={() => handleConfirmResponse(true)}
          onCancel={() => handleConfirmResponse(false)}
        />
      )}
    </>
  )
}
