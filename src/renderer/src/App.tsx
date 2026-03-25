import { createEffect, createSignal, on, onMount, batch } from 'solid-js'
import { createStripStore } from './store/strip'
import { createAppStore } from './store/app'
import { computeLayout, computeScrollToCenter, computeMaxScroll, findMostCenteredPanel } from './layout/engine'
import { animate, easeOut } from './scroll/animator'
import type { AnimationHandle } from './scroll/animator'
import type { StripSnapshot } from './store/strip'
import type { PanelBoundsUpdate } from '../../../shared/types'
import { LAYOUT } from '../../shared/constants'
import Strip from './components/Strip'
import ScrollIndicators from './components/ScrollIndicators'
import HintBar from './components/HintBar'
import ConfirmDialog from './components/ConfirmDialog'
import Sidebar from './components/Sidebar'

export default function App() {
  const appStore = createAppStore()
  const stripStores = new Map<string, ReturnType<typeof createStripStore>>()
  const stripSnapshots = new Map<string, StripSnapshot>()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  const [confirmClose, setConfirmClose] = createSignal<{ panelId: string; processName: string } | null>(null)

  // --- Store helpers ---

  function getStripStore(projectId: string): ReturnType<typeof createStripStore> {
    let store = stripStores.get(projectId)
    if (!store) {
      store = createStripStore(projectId)
      store.actions.setViewport(window.innerWidth, window.innerHeight)
      const snapshot = stripSnapshots.get(projectId)
      if (snapshot) {
        store.restore(snapshot)
        stripSnapshots.delete(projectId)
      }
      stripStores.set(projectId, store)
    }
    return store
  }

  function activeStrip(): ReturnType<typeof createStripStore> | null {
    const id = appStore.state.activeProjectId
    if (!id) return null
    return getStripStore(id)
  }

  function findStripByPanelId(panelId: string): ReturnType<typeof createStripStore> | null {
    for (const [projectId, store] of stripStores) {
      if (panelId.startsWith(projectId)) return store
    }
    return null
  }

  // --- Layout effect ---

  createEffect(() => {
    const strip = activeStrip()
    if (!strip) return

    const sidebarWidth = appStore.state.sidebarWidth
    const layout = computeLayout({
      panels: [...strip.state.panels],
      scrollOffset: strip.state.scrollOffset,
      viewportWidth: strip.state.viewportWidth,
      viewportHeight: strip.state.viewportHeight,
      sidebarWidth
    })

    const desiredIds = new Set<string>()
    const boundsUpdates: PanelBoundsUpdate[] = []

    for (const entry of layout) {
      if (entry.visibility === 'destroyed') continue
      desiredIds.add(entry.panelId)
      if (!createdPanelIds.has(entry.panelId)) {
        const panel = strip.state.panels.find((p) => p.id === entry.panelId)
        if (panel) {
          if (panel.type === 'terminal') {
            window.api.createTerminalPanel(entry.panelId)
          } else if (panel.type === 'browser') {
            window.api.createBrowserPanel(entry.panelId, panel.url || 'about:blank')
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

    // Only destroy panels belonging to the active project
    const activeId = appStore.state.activeProjectId
    for (const id of [...createdPanelIds]) {
      if (activeId && id.startsWith(activeId) && !desiredIds.has(id)) {
        window.api.destroyPanel(id)
        createdPanelIds.delete(id)
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates)
    }
  })

  // --- Scroll-to-center effect ---

  createEffect(
    on(
      () => activeStrip()?.state.focusedIndex,
      (focusedIndex) => {
        const strip = activeStrip()
        if (!strip || focusedIndex === undefined) return
        currentAnimation?.cancel()
        currentAnimation = null
        const sidebarWidth = appStore.state.sidebarWidth
        const target = computeScrollToCenter(focusedIndex, strip.state.panels.length, strip.state.viewportWidth, sidebarWidth)
        if (Math.abs(strip.state.scrollOffset - target) < 1) {
          strip.actions.setScrollOffset(target)
          return
        }
        currentAnimation = animate({
          from: strip.state.scrollOffset, to: target, duration: 200, easing: easeOut,
          onUpdate: (value) => strip.actions.setScrollOffset(value),
          onComplete: () => { currentAnimation = null }
        })
      },
      { defer: true }
    )
  )

  // --- Focus effect ---

  createEffect(
    on(
      () => {
        const strip = activeStrip()
        if (!strip) return null
        // Only track focusedIndex and terminalFocused — NOT panels.
        // Tracking panels would re-fire on every addPanel, causing focus oscillation.
        return { idx: strip.state.focusedIndex, focused: strip.state.terminalFocused }
      },
      (data) => {
        if (!data) return
        const strip = activeStrip()
        if (!strip || strip.state.panels.length === 0) return
        const panel = strip.state.panels[data.idx]
        if (!panel) return

        if (data.focused && (panel.type === 'terminal' || (panel.type === 'browser' && panel.url !== 'about:blank'))) {
          window.api.focusPanel(panel.id)
        } else if (data.focused && panel.type === 'browser' && panel.url === 'about:blank') {
          window.api.focusPanelChrome(panel.id)
        } else {
          window.api.blurAllPanels()
        }
      }
    )
  )

  // --- Chrome state effect ---

  createEffect(() => {
    const strip = activeStrip()
    if (!strip) return
    const panels = [...strip.state.panels]
    const focusedIndex = strip.state.focusedIndex
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]
      window.api.sendChromeState(panel.id, {
        position: i + 1,
        label: panel.label,
        focused: i === focusedIndex && strip.state.terminalFocused,
        type: panel.type,
        url: panel.url,
        canGoBack: panel.canGoBack,
        canGoForward: panel.canGoForward
      })
    }
  })

  // --- Wheel handler ---

  function handleWheel(deltaX: number): void {
    const strip = activeStrip()
    if (!strip) return
    currentAnimation?.cancel()
    currentAnimation = null
    const sidebarWidth = appStore.state.sidebarWidth
    const max = computeMaxScroll(strip.state.panels.length, strip.state.viewportWidth, sidebarWidth)
    const newOffset = Math.max(0, Math.min(strip.state.scrollOffset + deltaX, max))
    strip.actions.setScrollOffset(newOffset)
    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(() => {
      const idx = findMostCenteredPanel(strip.state.scrollOffset, strip.state.panels.length, strip.state.viewportWidth, sidebarWidth)
      if (idx >= 0 && idx !== strip.state.focusedIndex) strip.actions.jumpTo(idx)
    }, 150)
  }

  // --- Close panel ---

  function handleClosePanel(): void {
    const strip = activeStrip()
    if (!strip) return
    if (strip.state.panels.length === 0) return
    const focusedPanel = strip.state.panels[strip.state.focusedIndex]
    if (!focusedPanel) return

    if (focusedPanel.type === 'terminal' || focusedPanel.type === 'browser') {
      window.api.closePanel(focusedPanel.id)
    } else {
      const removedId = strip.actions.removePanel()
      if (removedId) {
        window.api.destroyPanel(removedId)
        createdPanelIds.delete(removedId)
      }
    }
  }

  // --- Project management ---

  async function handleAddProject(): Promise<void> {
    const result = await window.api.addProject()
    if (!result) return
    const currentId = appStore.state.activeProjectId
    if (currentId) {
      const currentStore = stripStores.get(currentId)
      if (currentStore) stripSnapshots.set(currentId, currentStore.getSnapshot())
      window.api.hidePanelsByPrefix(currentId)
    }
    appStore.actions.addProject(result)
    window.api.switchProject(result.id)
  }

  function handleSwitchProject(targetId: string): void {
    const currentId = appStore.state.activeProjectId
    if (currentId === targetId) return

    // Stash current strip
    if (currentId) {
      const currentStore = stripStores.get(currentId)
      if (currentStore) stripSnapshots.set(currentId, currentStore.getSnapshot())
      window.api.hidePanelsByPrefix(currentId)
    }

    // Switch to target
    appStore.actions.switchProject(targetId)
    window.api.switchProject(targetId)

    // Show target panels
    window.api.showPanelsByPrefix(targetId)

    // Restore snapshot into the store if needed
    const targetStore = getStripStore(targetId)
    const snapshot = stripSnapshots.get(targetId)
    if (snapshot) {
      targetStore.restore(snapshot)
      stripSnapshots.delete(targetId)
    }
  }

  function handleRemoveProject(projectId: string): void {
    const wasActive = appStore.state.activeProjectId === projectId

    // Tell main process to kill PTYs, destroy panels, and remove from persistence
    window.api.removeProject(projectId)

    // Clean up created panel IDs
    for (const id of [...createdPanelIds]) {
      if (id.startsWith(projectId)) createdPanelIds.delete(id)
    }

    // Clean up stores and snapshots
    stripStores.delete(projectId)
    stripSnapshots.delete(projectId)

    // Remove from app store (this may switch activeProjectId)
    appStore.actions.removeProject(projectId)

    // If it was the active project, switch to the new active
    if (wasActive) {
      const newActiveId = appStore.state.activeProjectId
      if (newActiveId) {
        window.api.switchProject(newActiveId)
        window.api.showPanelsByPrefix(newActiveId)
      }
    }
  }

  // --- Shortcuts ---

  function handleShortcut(action: { type: string; index?: number }): void {
    const strip = activeStrip()

    switch (action.type) {
      case 'focus-left': strip?.actions.focusLeft(); break
      case 'focus-right': strip?.actions.focusRight(); break
      case 'swap-left': strip?.actions.swapLeft(); break
      case 'swap-right': strip?.actions.swapRight(); break
      case 'new-panel': {
        if (!strip) break
        const activeProject = appStore.actions.getActiveProject()
        const panel = strip.actions.addPanel('terminal')
        if (activeProject) {
          window.api.createTerminalWithCwd(panel.id, activeProject.path)
        } else {
          window.api.createTerminal(panel.id)
        }
        break
      }
      case 'new-browser': {
        if (!strip) break
        const panel = strip.actions.addPanel('browser', 'about:blank')
        window.api.createBrowserPanel(panel.id, panel.url || 'about:blank')
        break
      }
      case 'reload-browser': {
        if (!strip) break
        const focused = strip.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.reloadBrowser(focused.id)
        break
      }
      case 'browser-back': {
        if (!strip) break
        const focused = strip.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.goBackBrowser(focused.id)
        break
      }
      case 'browser-forward': {
        if (!strip) break
        const focused = strip.state.panels[strip.state.focusedIndex]
        if (focused?.type === 'browser') window.api.goForwardBrowser(focused.id)
        break
      }
      case 'close-panel': handleClosePanel(); break
      case 'blur-panel': strip?.actions.blurPanel(); break
      case 'jump-to': if (strip && action.index !== undefined) strip.actions.jumpTo(action.index); break
      case 'add-project': handleAddProject(); break
      case 'switch-project': {
        if (action.index === undefined) break
        const projects = appStore.state.projects
        if (action.index >= 0 && action.index < projects.length) {
          handleSwitchProject(projects[action.index].id)
        }
        break
      }
      case 'prev-project': {
        const projects = appStore.state.projects
        const currentIdx = projects.findIndex((p) => p.id === appStore.state.activeProjectId)
        if (currentIdx > 0) handleSwitchProject(projects[currentIdx - 1].id)
        break
      }
      case 'next-project': {
        const projects = appStore.state.projects
        const currentIdx = projects.findIndex((p) => p.id === appStore.state.activeProjectId)
        if (currentIdx >= 0 && currentIdx < projects.length - 1) handleSwitchProject(projects[currentIdx + 1].id)
        break
      }
    }
  }

  // --- Confirm close ---

  function handleConfirmResponse(confirmed: boolean): void {
    const data = confirmClose()
    if (data) {
      window.api.confirmCloseResponse(data.panelId, confirmed)
      if (confirmed) {
        const strip = findStripByPanelId(data.panelId)
        if (strip) {
          strip.actions.removePanelById(data.panelId)
        }
        createdPanelIds.delete(data.panelId)
      }
      setConfirmClose(null)
      const activeId = appStore.state.activeProjectId
      if (activeId) window.api.showPanelsByPrefix(activeId)
    }
  }

  // --- Mount ---

  onMount(() => {
    // Register IPC listeners
    window.api.onWheelEvent((data) => handleWheel(data.deltaX))
    window.api.onShortcut((action) => handleShortcut(action))
    window.addEventListener('resize', () => {
      // Update all strip stores with new viewport dimensions
      for (const store of stripStores.values()) {
        store.actions.setViewport(window.innerWidth, window.innerHeight)
      }
    })
    window.addEventListener('wheel', (event) => {
      if (event.deltaX !== 0) handleWheel(event.deltaX)
    }, { passive: true })

    // Route IPC callbacks by panel ID prefix
    window.api.onPtyExit((data) => {
      const strip = findStripByPanelId(data.panelId)
      if (strip) strip.actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    window.api.onConfirmClose((data) => {
      window.api.hideAllPanels()
      setConfirmClose(data)
    })

    window.api.onPanelTitle((data) => {
      const strip = findStripByPanelId(data.panelId)
      if (strip) strip.actions.setPanelTitle(data.panelId, data.title)
    })

    // Debounce panel focus events to prevent oscillation when
    // multiple panels are created in quick succession
    let focusDebounce: ReturnType<typeof setTimeout>
    window.api.onPanelFocused((data) => {
      clearTimeout(focusDebounce)
      focusDebounce = setTimeout(() => {
        const strip = findStripByPanelId(data.panelId)
        if (strip) {
          const idx = strip.state.panels.findIndex((p) => p.id === data.panelId)
          if (idx >= 0 && idx !== strip.state.focusedIndex) {
            strip.actions.jumpTo(idx)
          }
        }
      }, 50)
    })

    window.api.onBrowserUrlChanged((data) => {
      const strip = findStripByPanelId(data.panelId)
      if (strip) {
        batch(() => {
          strip.actions.setPanelUrl(data.panelId, data.url)
          strip.actions.setPanelNavState(data.panelId, data.canGoBack, data.canGoForward)
        })
      }
    })

    window.api.onBrowserTitleChanged((data) => {
      const strip = findStripByPanelId(data.panelId)
      if (strip) strip.actions.setPanelTitle(data.panelId, data.title)
    })

    window.api.onBrowserOpenUrl((data) => {
      // No panelId available — route to active strip
      const strip = activeStrip()
      if (strip) {
        const panel = strip.actions.addPanel('browser', data.url)
        window.api.createBrowserPanel(panel.id, data.url)
      }
    })

    window.api.onPanelClosed((data) => {
      const strip = findStripByPanelId(data.panelId)
      if (strip) strip.actions.removePanelById(data.panelId)
      createdPanelIds.delete(data.panelId)
    })

    // Load projects from persistence
    window.api.listProjects().then(({ projects, activeProjectId }) => {
      appStore.actions.loadProjects(projects, activeProjectId)
    })
  })

  // --- Sync sidebar width to main process for panel clipping ---

  createEffect(() => {
    window.api.setSidebarWidth(appStore.state.sidebarWidth)
  })

  // --- Derived state for rendering ---

  const strip = () => activeStrip()
  const sidebarWidth = () => appStore.state.sidebarWidth

  const layout = () => {
    const s = strip()
    if (!s) return []
    return computeLayout({
      panels: [...s.state.panels],
      scrollOffset: s.state.scrollOffset,
      viewportWidth: s.state.viewportWidth,
      viewportHeight: s.state.viewportHeight,
      sidebarWidth: sidebarWidth()
    })
  }

  const maxScroll = () => {
    const s = strip()
    if (!s) return 0
    return computeMaxScroll(s.state.panels.length, s.state.viewportWidth, sidebarWidth())
  }

  const panelChromeHeights = () => {
    const map = new Map<string, number>()
    const s = strip()
    if (!s) return map
    for (const p of s.state.panels) {
      map.set(p.id, p.type === 'browser' ? LAYOUT.PANEL_CHROME_HEIGHT : LAYOUT.TITLE_BAR_HEIGHT)
    }
    return map
  }

  return (
    <>
      <Sidebar
        projects={appStore.state.projects}
        activeProjectId={appStore.state.activeProjectId}
        sidebarWidth={sidebarWidth()}
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        onSwitchProject={(id) => handleSwitchProject(id)}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />
      <Strip
        layout={layout()}
        focusedPanelId={strip()?.state.panels[strip()?.state.focusedIndex ?? 0]?.id}
        panelChromeHeights={panelChromeHeights()}
      />
      <ScrollIndicators
        scrollOffset={strip()?.state.scrollOffset || 0}
        maxScroll={maxScroll()}
        viewportWidth={strip()?.state.viewportWidth || window.innerWidth}
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        sidebarWidth={sidebarWidth()}
      />
      <HintBar
        viewportHeight={strip()?.state.viewportHeight || window.innerHeight}
        panelCount={strip()?.state.panels.length || 0}
        hasProjects={appStore.state.projects.length > 0}
        sidebarWidth={sidebarWidth()}
      />
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
