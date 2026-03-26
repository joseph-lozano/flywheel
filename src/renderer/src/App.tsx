import { createEffect, createSignal, on, onMount, onCleanup, batch } from 'solid-js'
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
import MissingRowDialog from './components/MissingRowDialog'
import RemoveRowDialog from './components/RemoveRowDialog'

export default function App() {
  const appStore = createAppStore()
  const stripStores = new Map<string, ReturnType<typeof createStripStore>>()
  const stripSnapshots = new Map<string, StripSnapshot>()
  const createdPanelIds = new Set<string>()
  let currentAnimation: AnimationHandle | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout>

  const [confirmClose, setConfirmClose] = createSignal<{ panelId: string; processName: string } | null>(null)
  const [missingRow, setMissingRow] = createSignal<{ projectId: string; rowId: string; branch: string } | null>(null)
  const [toast, setToast] = createSignal<string | null>(null)
  let toastTimer: ReturnType<typeof setTimeout>

  function showToast(message: string): void {
    clearTimeout(toastTimer)
    setToast(message)
    toastTimer = setTimeout(() => setToast(null), 3000)
  }

  // --- Store helpers ---

  function getStripStore(rowId: string): ReturnType<typeof createStripStore> {
    let store = stripStores.get(rowId)
    if (!store) {
      store = createStripStore(rowId)
      store.actions.setViewport(window.innerWidth, window.innerHeight)
      const snapshot = stripSnapshots.get(rowId)
      if (snapshot) {
        store.restore(snapshot)
        stripSnapshots.delete(rowId)
      }
      stripStores.set(rowId, store)
    }
    return store
  }

  function activeStrip(): ReturnType<typeof createStripStore> | null {
    const project = appStore.actions.getActiveProject()
    if (!project) return null
    return getStripStore(project.activeRowId)
  }

  function findStripByPanelId(panelId: string): ReturnType<typeof createStripStore> | null {
    for (const [rowId, store] of stripStores) {
      if (panelId.startsWith(rowId)) return store
    }
    return null
  }

  // --- Branch checking ---

  function refreshBranches(projectId: string): void {
    window.api.checkBranches(projectId).then((result) => {
      for (const update of result.updates) {
        appStore.actions.updateBranch(projectId, update.rowId, update.branch)
      }
    })
  }

  // --- Row management ---

  async function handleSwitchRow(projectId: string, targetRowId: string): Promise<void> {
    const project = appStore.state.projects.find(p => p.id === projectId)
    if (!project) return

    const crossProject = projectId !== appStore.state.activeProjectId

    // For cross-project switches, stash and hide current project's row
    // without showing the intermediate project's active row panels
    if (crossProject) {
      const currentId = appStore.state.activeProjectId
      if (currentId) {
        const currentProject = appStore.state.projects.find(p => p.id === currentId)
        if (currentProject) {
          const currentStore = stripStores.get(currentProject.activeRowId)
          if (currentStore) stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot())
          window.api.hidePanelsByPrefix(currentProject.activeRowId)
        }
      }
      appStore.actions.switchProject(projectId)
      window.api.switchProject(projectId)
    }

    const currentRowId = project.activeRowId
    if (!crossProject && currentRowId === targetRowId) return

    // Check if target row's path still exists on disk
    const targetRow = project.rows.find(r => r.id === targetRowId)
    if (targetRow && !targetRow.isDefault) {
      const { exists } = await window.api.checkRowPath(targetRow.path)
      if (!exists) {
        // For cross-project, we already switched — show the current active row
        if (crossProject) {
          window.api.showPanelsByPrefix(currentRowId)
          getStripStore(currentRowId)
        }
        setMissingRow({ projectId, rowId: targetRowId, branch: targetRow.branch })
        return
      }
    }

    // Stash current row's strip (only for same-project switches; cross-project already stashed above)
    if (!crossProject) {
      const currentStore = stripStores.get(currentRowId)
      if (currentStore) stripSnapshots.set(currentRowId, currentStore.getSnapshot())
      window.api.hidePanelsByPrefix(currentRowId)
    }

    // Switch row
    appStore.actions.switchRow(projectId, targetRowId)

    // Show target row panels
    window.api.showPanelsByPrefix(targetRowId)

    // Ensure strip store exists
    getStripStore(targetRowId)

    // Check for branch renames
    refreshBranches(projectId)
  }

  async function handleCreateRow(projectId: string): Promise<void> {
    const result = await window.api.createRow(projectId)
    if ('error' in result) {
      showToast(result.error)
      return
    }
    appStore.actions.addRow(projectId, result.row)
    handleSwitchRow(projectId, result.row.id)
  }

  async function handleRemoveRow(rowId: string, deleteFromDisk: boolean): Promise<void> {
    const project = appStore.state.projects.find(p => p.rows.some(r => r.id === rowId))
    if (!project) return
    const wasActive = project.activeRowId === rowId

    const removeResult = await window.api.removeRow(rowId, deleteFromDisk)
    if (removeResult.error) showToast(removeResult.error)

    for (const id of [...createdPanelIds]) {
      if (id.startsWith(rowId)) createdPanelIds.delete(id)
    }
    stripStores.delete(rowId)
    stripSnapshots.delete(rowId)

    const projectId = project.id
    appStore.actions.removeRow(projectId, rowId)

    if (wasActive) {
      const updated = appStore.state.projects.find(p => p.id === projectId)
      if (updated) handleSwitchRow(projectId, updated.activeRowId)
    }
  }

  async function handleDiscoverWorktrees(projectId: string): Promise<void> {
    const result = await window.api.discoverWorktrees(projectId)
    if (result.rows.length > 0) {
      for (const row of result.rows) {
        appStore.actions.addRow(projectId, row)
      }
      showToast(`Discovered ${result.rows.length} worktree${result.rows.length > 1 ? 's' : ''}`)
    } else {
      showToast('No new worktrees found')
    }
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

    // Only destroy panels belonging to the active row
    const activeProject = appStore.actions.getActiveProject()
    const activeRowId = activeProject?.activeRowId
    for (const id of [...createdPanelIds]) {
      if (activeRowId && id.startsWith(activeRowId) && !desiredIds.has(id)) {
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
      const currentProject = appStore.state.projects.find(p => p.id === currentId)
      if (currentProject) {
        const currentStore = stripStores.get(currentProject.activeRowId)
        if (currentStore) stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot())
        window.api.hidePanelsByPrefix(currentProject.activeRowId)
      }
    }
    appStore.actions.addProject(result)
    window.api.switchProject(result.id)
  }

  function handleSwitchProject(targetId: string): void {
    const currentId = appStore.state.activeProjectId
    if (currentId === targetId) return

    // Stash current row's strip
    if (currentId) {
      const currentProject = appStore.state.projects.find(p => p.id === currentId)
      if (currentProject) {
        const currentStore = stripStores.get(currentProject.activeRowId)
        if (currentStore) stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot())
        window.api.hidePanelsByPrefix(currentProject.activeRowId)
      }
    }

    appStore.actions.switchProject(targetId)
    window.api.switchProject(targetId)

    // Show target project's active row panels
    const targetProject = appStore.state.projects.find(p => p.id === targetId)
    if (targetProject) {
      window.api.showPanelsByPrefix(targetProject.activeRowId)
      getStripStore(targetProject.activeRowId)
    }
  }

  function handleRemoveProject(projectId: string): void {
    const project = appStore.state.projects.find(p => p.id === projectId)
    const wasActive = appStore.state.activeProjectId === projectId

    window.api.removeProject(projectId)

    // Clean up all rows' panel IDs, strip stores, and snapshots
    if (project) {
      for (const row of project.rows) {
        for (const id of [...createdPanelIds]) {
          if (id.startsWith(row.id)) createdPanelIds.delete(id)
        }
        stripStores.delete(row.id)
        stripSnapshots.delete(row.id)
      }
    }

    appStore.actions.removeProject(projectId)

    if (wasActive) {
      const newActiveId = appStore.state.activeProjectId
      if (newActiveId) {
        const newProject = appStore.state.projects.find(p => p.id === newActiveId)
        if (newProject) {
          window.api.switchProject(newActiveId)
          window.api.showPanelsByPrefix(newProject.activeRowId)
        }
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
        const activeRow = appStore.actions.getActiveRow()
        const panel = strip.actions.addPanel('terminal')
        if (activeRow) {
          window.api.createTerminalWithCwd(panel.id, activeRow.path)
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
      case 'new-row': {
        const project = appStore.actions.getActiveProject()
        if (!project) break
        handleCreateRow(project.id)
        break
      }
      case 'prev-row': {
        const project = appStore.actions.getActiveProject()
        if (!project || project.rows.length <= 1) break
        const currentIdx = project.rows.findIndex(r => r.id === project.activeRowId)
        if (currentIdx > 0) handleSwitchRow(project.id, project.rows[currentIdx - 1].id)
        break
      }
      case 'next-row': {
        const project = appStore.actions.getActiveProject()
        if (!project || project.rows.length <= 1) break
        const currentIdx = project.rows.findIndex(r => r.id === project.activeRowId)
        if (currentIdx < project.rows.length - 1) handleSwitchRow(project.id, project.rows[currentIdx + 1].id)
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
      const activeProject = appStore.actions.getActiveProject()
      if (activeProject) window.api.showPanelsByPrefix(activeProject.activeRowId)
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

    // Branch checking on window focus
    window.addEventListener('focus', () => {
      const project = appStore.actions.getActiveProject()
      if (project) refreshBranches(project.id)
    })

    // Periodic branch checking (catches fast commands like git branch -m)
    const branchCheckInterval = setInterval(() => {
      const project = appStore.actions.getActiveProject()
      if (project) refreshBranches(project.id)
    }, 5000)
    onCleanup(() => clearInterval(branchCheckInterval))

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
        onSwitchRow={(projectId, rowId) => handleSwitchRow(projectId, rowId)}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
        onToggleExpanded={(projectId) => {
          const project = appStore.state.projects.find(p => p.id === projectId)
          if (project) {
            const newExpanded = !project.expanded
            appStore.actions.setExpanded(projectId, newExpanded)
            window.api.setExpanded(projectId, newExpanded)
          }
        }}
        onCreateRow={(projectId) => handleCreateRow(projectId)}
        onRemoveRow={(rowId, deleteFromDisk) => handleRemoveRow(rowId, deleteFromDisk)}
        onDiscoverWorktrees={(projectId) => handleDiscoverWorktrees(projectId)}
        onModalShow={() => window.api.hideAllPanels()}
        onModalHide={() => {
          const project = appStore.actions.getActiveProject()
          if (project) window.api.showPanelsByPrefix(project.activeRowId)
        }}
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
        rowCount={appStore.actions.getActiveProject()?.rows.length || 0}
      />
      {confirmClose() && (
        <ConfirmDialog
          processName={confirmClose()!.processName}
          onConfirm={() => handleConfirmResponse(true)}
          onCancel={() => handleConfirmResponse(false)}
        />
      )}
      {missingRow() && (
        <MissingRowDialog
          branch={missingRow()!.branch}
          onCancel={() => setMissingRow(null)}
          onRemove={() => {
            const data = missingRow()!
            handleRemoveRow(data.rowId, false)
            setMissingRow(null)
          }}
        />
      )}
      {toast() && (
        <div style={{
          position: 'fixed', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
          background: '#f43f5e', color: '#fff', padding: '8px 20px',
          'border-radius': '6px', 'font-size': '13px', 'font-family': 'monospace',
          'z-index': '2000', 'box-shadow': '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          {toast()}
        </div>
      )}
    </>
  )
}
