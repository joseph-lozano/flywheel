import { Show, batch, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { LAYOUT, THEME } from "../../shared/constants";
import type { PanelBoundsUpdate } from "../../shared/types";
import ConfirmDialog from "./components/ConfirmDialog";
import HintBar from "./components/HintBar";
import MissingRowDialog from "./components/MissingRowDialog";
import ScrollIndicators from "./components/ScrollIndicators";
import Sidebar from "./components/Sidebar";
import Strip from "./components/Strip";
import { computeLayout, computeMaxScroll, computeScrollToCenter } from "./layout/engine";
import type { AnimationHandle } from "./scroll/animator";
import { animate, easeOut } from "./scroll/animator";
import { createAppStore } from "./store/app";
import type { StripSnapshot } from "./store/strip";
import { createStripStore } from "./store/strip";

export default function App() {
  const appStore = createAppStore();
  const stripStores = new Map<string, ReturnType<typeof createStripStore>>();
  const stripSnapshots = new Map<string, StripSnapshot>();
  const createdPanelIds = new Set<string>();
  let currentAnimation: AnimationHandle | null = null;

  let switchEpoch = 0; // Concurrency guard: "latest wins" for async row/project switches

  const [confirmClose, setConfirmClose] = createSignal<{
    panelId: string;
    processName: string;
  } | null>(null);
  const [missingRow, setMissingRow] = createSignal<{
    projectId: string;
    rowId: string;
    branch: string;
  } | null>(null);
  const [viewportHeight, setViewportHeight] = createSignal(window.innerHeight);
  const [toast, setToast] = createSignal<{ message: string; type: "error" | "info" } | null>(null);
  const [appDefaultZoom, setAppDefaultZoom] = createSignal(0);
  let toastTimer: ReturnType<typeof setTimeout>;

  function showToast(message: string, type: "error" | "info" = "error"): void {
    clearTimeout(toastTimer);
    setToast({ message, type });
    toastTimer = setTimeout(() => setToast(null), 3000);
  }

  // --- Store helpers ---

  function getStripStore(rowId: string): ReturnType<typeof createStripStore> {
    let store = stripStores.get(rowId);
    if (!store) {
      store = createStripStore(rowId);
      store.actions.setViewport(window.innerWidth, window.innerHeight);
      const snapshot = stripSnapshots.get(rowId);
      if (snapshot) {
        store.restore(snapshot);
        stripSnapshots.delete(rowId);
      }
      stripStores.set(rowId, store);
    }
    return store;
  }

  function activeStrip(): ReturnType<typeof createStripStore> | null {
    const project = appStore.actions.getActiveProject();
    if (!project) return null;
    return getStripStore(project.activeRowId);
  }

  function findStripByPanelId(panelId: string): ReturnType<typeof createStripStore> | null {
    for (const [rowId, store] of stripStores) {
      if (panelId.startsWith(rowId)) return store;
    }
    return null;
  }

  // --- Branch checking ---

  function refreshBranches(projectId: string): void {
    void window.api
      .checkBranches(projectId)
      .then((result) => {
        for (const update of result.updates) {
          appStore.actions.updateBranch(projectId, update.rowId, update.branch);
        }
      })
      .catch(() => {
        // git worktree list may fail if the repo is in a transient state
      });
  }

  function refreshPrStatuses(projectId: string): void {
    void window.api.checkPrStatus(projectId).then((result) => {
      appStore.actions.updatePrStatuses(projectId, result.updates);
      appStore.actions.setRepoUrl(projectId, result.repoUrl);
    });
  }

  // --- Row management ---

  async function handleSwitchRow(projectId: string, targetRowId: string): Promise<void> {
    const epoch = ++switchEpoch;

    const project = appStore.state.projects.find((p) => p.id === projectId);
    if (!project) return;

    const crossProject = projectId !== appStore.state.activeProjectId;

    // For cross-project switches, stash and hide current project's row
    // without showing the intermediate project's active row panels
    if (crossProject) {
      const currentId = appStore.state.activeProjectId;
      if (currentId) {
        const currentProject = appStore.state.projects.find((p) => p.id === currentId);
        if (currentProject) {
          const currentStore = stripStores.get(currentProject.activeRowId);
          if (currentStore)
            stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot());
        }
      }
      appStore.actions.switchProject(projectId);
      window.api.switchProject(projectId);
    }

    const currentRowId = project.activeRowId;
    if (!crossProject && currentRowId === targetRowId) return;

    // Check if target row's path still exists on disk
    const targetRow = project.rows.find((r) => r.id === targetRowId);
    if (targetRow && !targetRow.isDefault) {
      const { exists } = await window.api.checkRowPath(targetRow.path);

      // A newer switch has superseded this one — bail out
      if (epoch !== switchEpoch) return;

      if (!exists) {
        // For cross-project, we already switched — show the current active row
        if (crossProject) {
          window.api.showPanelsByPrefix(currentRowId);
          getStripStore(currentRowId);
        }
        setMissingRow({ projectId, rowId: targetRowId, branch: targetRow.branch });
        return;
      }
    }

    // Stash current row's strip (only for same-project switches; cross-project already stashed above)
    if (!crossProject) {
      const currentStore = stripStores.get(currentRowId);
      if (currentStore) stripSnapshots.set(currentRowId, currentStore.getSnapshot());
    }

    // Hide ALL panels before showing target to clean up any orphaned visible panels
    // from prior race conditions (instead of just hidePanelsByPrefix for the current row)
    window.api.hideAllPanels();

    // Switch row
    appStore.actions.switchRow(projectId, targetRowId);

    // Show target row panels
    window.api.showPanelsByPrefix(targetRowId);

    // Ensure strip store exists
    getStripStore(targetRowId);

    // Check for branch renames
    refreshBranches(projectId);
  }

  async function handleCreateRow(projectId: string): Promise<void> {
    const result = await window.api.createRow(projectId);
    if ("error" in result) {
      showToast(result.error);
      return;
    }
    appStore.actions.addRow(projectId, result.row);
    void handleSwitchRow(projectId, result.row.id);
  }

  async function handleRemoveRow(rowId: string, deleteFromDisk: boolean): Promise<void> {
    const project = appStore.state.projects.find((p) => p.rows.some((r) => r.id === rowId));
    if (!project) return;
    const wasActive = project.activeRowId === rowId;

    const removeResult = await window.api.removeRow(rowId, deleteFromDisk);
    if (removeResult.error) showToast(removeResult.error);

    for (const id of [...createdPanelIds]) {
      if (id.startsWith(rowId)) createdPanelIds.delete(id);
    }
    stripStores.delete(rowId);
    stripSnapshots.delete(rowId);

    const projectId = project.id;
    appStore.actions.removeRow(projectId, rowId);

    if (wasActive) {
      const updated = appStore.state.projects.find((p) => p.id === projectId);
      if (updated) void handleSwitchRow(projectId, updated.activeRowId);
    }
  }

  async function handleDiscoverWorktrees(projectId: string): Promise<void> {
    const result = await window.api.discoverWorktrees(projectId);
    if (result.rows.length > 0) {
      for (const row of result.rows) {
        appStore.actions.addRow(projectId, row);
      }
      showToast(
        `Discovered ${result.rows.length} worktree${result.rows.length > 1 ? "s" : ""}`,
        "info",
      );
      refreshPrStatuses(projectId);
    } else {
      showToast("No new worktrees found", "info");
    }
  }

  // --- Layout effect ---

  createEffect(() => {
    const strip = activeStrip();
    if (!strip) return;

    const sidebarWidth = appStore.state.sidebarWidth;
    const layout = computeLayout({
      panels: [...strip.state.panels],
      scrollOffset: strip.state.scrollOffset,
      viewportWidth: strip.state.viewportWidth,
      viewportHeight: strip.state.viewportHeight,
      sidebarWidth,
    });

    const desiredIds = new Set<string>();
    const boundsUpdates: PanelBoundsUpdate[] = [];

    for (const entry of layout) {
      if (entry.visibility === "destroyed") continue;
      desiredIds.add(entry.panelId);
      if (!createdPanelIds.has(entry.panelId)) {
        const panel = strip.state.panels.find((p) => p.id === entry.panelId);
        if (panel) {
          if (panel.type === "terminal") {
            window.api.createTerminalPanel(entry.panelId);
          } else if (panel.type === "browser") {
            window.api.createBrowserPanel(entry.panelId, panel.url ?? "about:blank");
          } else {
            window.api.createPanel(entry.panelId, panel.color);
          }
          createdPanelIds.add(entry.panelId);
        }
      }
      boundsUpdates.push({
        panelId: entry.panelId,
        bounds: entry.contentBounds,
        visible: entry.visibility === "visible",
      });
    }

    // Only destroy panels belonging to the active row
    const activeProject = appStore.actions.getActiveProject();
    const activeRowId = activeProject?.activeRowId;
    for (const id of [...createdPanelIds]) {
      if (activeRowId && id.startsWith(activeRowId) && !desiredIds.has(id)) {
        window.api.destroyPanel(id);
        createdPanelIds.delete(id);
      }
    }

    if (boundsUpdates.length > 0) {
      window.api.updateBounds(boundsUpdates, sidebarWidth);
    }
  });

  // --- Scroll-to-center effect ---

  createEffect(
    on(
      () => activeStrip()?.state.focusedIndex,
      (focusedIndex) => {
        const strip = activeStrip();
        if (!strip || focusedIndex === undefined) return;
        currentAnimation?.cancel();
        currentAnimation = null;
        const sidebarWidth = appStore.state.sidebarWidth;
        const target = computeScrollToCenter(
          focusedIndex,
          strip.state.panels.length,
          strip.state.viewportWidth,
          sidebarWidth,
        );
        if (Math.abs(strip.state.scrollOffset - target) < 1) {
          strip.actions.setScrollOffset(target);
          return;
        }
        currentAnimation = animate({
          from: strip.state.scrollOffset,
          to: target,
          duration: 200,
          easing: easeOut,
          onUpdate: (value) => {
            strip.actions.setScrollOffset(value);
          },
          onComplete: () => {
            currentAnimation = null;
          },
        });
      },
      { defer: true },
    ),
  );

  // --- Focus effect ---

  createEffect(
    on(
      () => {
        const strip = activeStrip();
        if (!strip) return null;
        // Only track focusedIndex and terminalFocused — NOT panels.
        // Tracking panels would re-fire on every addPanel, causing focus oscillation.
        return { idx: strip.state.focusedIndex, focused: strip.state.terminalFocused };
      },
      (data) => {
        if (!data) return;
        const strip = activeStrip();
        if (!strip || strip.state.panels.length === 0) return;
        const panel = strip.state.panels[data.idx];

        if (
          data.focused &&
          (panel.type === "terminal" || (panel.type === "browser" && panel.url !== "about:blank"))
        ) {
          window.api.focusPanel(panel.id);
        } else if (data.focused && panel.type === "browser" && panel.url === "about:blank") {
          window.api.focusPanelChrome(panel.id);
        } else {
          window.api.blurAllPanels();
        }
      },
    ),
  );

  // --- Chrome state effect ---

  createEffect(() => {
    const strip = activeStrip();
    if (!strip) return;
    const panels = [...strip.state.panels];
    const focusedIndex = strip.state.focusedIndex;
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      window.api.sendChromeState(panel.id, {
        position: i + 1,
        label: panel.label,
        focused: i === focusedIndex && strip.state.terminalFocused,
        type: panel.type,
        url: panel.url,
        canGoBack: panel.canGoBack,
        canGoForward: panel.canGoForward,
      });
    }
  });

  // --- Auto-create terminal in empty rows ---

  createEffect(() => {
    const strip = activeStrip();
    const row = appStore.actions.getActiveRow();
    if (!strip || !row) return;
    if (strip.state.panels.length > 0) return;

    const panel = strip.actions.addPanel("terminal");
    window.api.createTerminalWithCwd(panel.id, row.path);
  });

  // --- Wheel handler ---

  function handleWheel(deltaX: number): void {
    const strip = activeStrip();
    if (!strip) return;
    currentAnimation?.cancel();
    currentAnimation = null;
    const sidebarWidth = appStore.state.sidebarWidth;
    const max = computeMaxScroll(
      strip.state.panels.length,
      strip.state.viewportWidth,
      sidebarWidth,
    );
    const newOffset = Math.max(0, Math.min(strip.state.scrollOffset + deltaX, max));
    strip.actions.setScrollOffset(newOffset);
  }

  // --- Close panel ---

  function handleClosePanel(): void {
    const strip = activeStrip();
    if (!strip) return;
    if (strip.state.panels.length === 0) return;
    const focusedPanel = strip.state.panels[strip.state.focusedIndex];

    if (focusedPanel.type === "terminal" || focusedPanel.type === "browser") {
      window.api.closePanel(focusedPanel.id);
    } else {
      const removedId = strip.actions.removePanel();
      if (removedId) {
        window.api.destroyPanel(removedId);
        createdPanelIds.delete(removedId);
      }
    }
  }

  // --- Project management ---

  async function handleAddProject(): Promise<void> {
    const result = await window.api.addProject();
    if (!result) return;

    switchEpoch++; // Cancel any in-flight async switches

    const currentId = appStore.state.activeProjectId;
    if (currentId) {
      const currentProject = appStore.state.projects.find((p) => p.id === currentId);
      if (currentProject) {
        const currentStore = stripStores.get(currentProject.activeRowId);
        if (currentStore)
          stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot());
      }
    }
    window.api.hideAllPanels();
    appStore.actions.addProject(result);
    window.api.switchProject(result.id);
    refreshPrStatuses(result.id);
  }

  function handleSwitchProject(targetId: string): void {
    const currentId = appStore.state.activeProjectId;
    if (currentId === targetId) return;

    switchEpoch++; // Cancel any in-flight async row switches

    // Stash current row's strip
    if (currentId) {
      const currentProject = appStore.state.projects.find((p) => p.id === currentId);
      if (currentProject) {
        const currentStore = stripStores.get(currentProject.activeRowId);
        if (currentStore)
          stripSnapshots.set(currentProject.activeRowId, currentStore.getSnapshot());
      }
    }

    appStore.actions.switchProject(targetId);
    window.api.switchProject(targetId);

    // Hide all panels (cleans up any orphaned panels from prior races), then show target
    window.api.hideAllPanels();
    const targetProject = appStore.state.projects.find((p) => p.id === targetId);
    if (targetProject) {
      window.api.showPanelsByPrefix(targetProject.activeRowId);
      getStripStore(targetProject.activeRowId);
    }
  }

  async function handleRemoveProject(projectId: string, deleteWorktrees = false): Promise<void> {
    const project = appStore.state.projects.find((p) => p.id === projectId);
    const wasActive = appStore.state.activeProjectId === projectId;

    const result = await window.api.removeProject(projectId, deleteWorktrees);
    if (result.errors.length > 0) {
      showToast(`Failed to remove ${result.errors.length} worktree(s)`);
    }

    // Clean up all rows' panel IDs, strip stores, and snapshots
    if (project) {
      for (const row of project.rows) {
        for (const id of [...createdPanelIds]) {
          if (id.startsWith(row.id)) createdPanelIds.delete(id);
        }
        stripStores.delete(row.id);
        stripSnapshots.delete(row.id);
      }
    }

    appStore.actions.removeProject(projectId);

    if (wasActive) {
      const newActiveId = appStore.state.activeProjectId;
      if (newActiveId) {
        const newProject = appStore.state.projects.find((p) => p.id === newActiveId);
        if (newProject) {
          window.api.switchProject(newActiveId);
          window.api.showPanelsByPrefix(newProject.activeRowId);
        }
      }
    }
  }

  // --- Shortcuts ---

  function handleShortcut(action: { type: string; index?: number }): void {
    const strip = activeStrip();

    switch (action.type) {
      case "focus-left":
        strip?.actions.focusLeft();
        break;
      case "focus-right":
        strip?.actions.focusRight();
        break;
      case "swap-left":
        strip?.actions.swapLeft();
        break;
      case "swap-right":
        strip?.actions.swapRight();
        break;
      case "new-panel": {
        if (!strip) break;
        const activeRow = appStore.actions.getActiveRow();
        const panel = strip.actions.addPanel("terminal");
        if (activeRow) {
          window.api.createTerminalWithCwd(panel.id, activeRow.path);
        } else {
          window.api.createTerminal(panel.id);
        }
        break;
      }
      case "new-browser": {
        if (!strip) break;
        const panel = strip.actions.addPanel("browser", "about:blank");
        window.api.createBrowserPanel(panel.id, panel.url ?? "about:blank");
        break;
      }
      case "reload-browser": {
        if (!strip) break;
        const focused = strip.state.panels[strip.state.focusedIndex];
        if (focused.type === "browser") window.api.reloadBrowser(focused.id);
        break;
      }
      case "browser-back": {
        if (!strip) break;
        const focused = strip.state.panels[strip.state.focusedIndex];
        if (focused.type === "browser") window.api.goBackBrowser(focused.id);
        break;
      }
      case "browser-forward": {
        if (!strip) break;
        const focused = strip.state.panels[strip.state.focusedIndex];
        if (focused.type === "browser") window.api.goForwardBrowser(focused.id);
        break;
      }
      case "toggle-devtools": {
        if (!strip) break;
        const focused = strip.state.panels[strip.state.focusedIndex];
        if (focused.type === "browser") window.api.toggleBrowserDevTools(focused.id);
        break;
      }
      case "close-panel":
        handleClosePanel();
        break;
      case "blur-panel":
        strip?.actions.blurPanel();
        break;
      case "jump-to":
        if (strip && action.index !== undefined) strip.actions.jumpTo(action.index);
        break;
      case "add-project":
        void handleAddProject();
        break;
      case "switch-project": {
        if (action.index === undefined) break;
        const projects = appStore.state.projects;
        if (action.index >= 0 && action.index < projects.length) {
          handleSwitchProject(projects[action.index].id);
        }
        break;
      }
      case "prev-project": {
        const projects = appStore.state.projects;
        const currentIdx = projects.findIndex((p) => p.id === appStore.state.activeProjectId);
        if (currentIdx > 0) handleSwitchProject(projects[currentIdx - 1].id);
        break;
      }
      case "next-project": {
        const projects = appStore.state.projects;
        const currentIdx = projects.findIndex((p) => p.id === appStore.state.activeProjectId);
        if (currentIdx >= 0 && currentIdx < projects.length - 1)
          handleSwitchProject(projects[currentIdx + 1].id);
        break;
      }
      case "new-row": {
        const project = appStore.actions.getActiveProject();
        if (!project) break;
        void handleCreateRow(project.id);
        break;
      }
      case "prev-row": {
        const project = appStore.actions.getActiveProject();
        if (!project || project.rows.length <= 1) break;
        const currentIdx = project.rows.findIndex((r) => r.id === project.activeRowId);
        if (currentIdx > 0) void handleSwitchRow(project.id, project.rows[currentIdx - 1].id);
        break;
      }
      case "next-row": {
        const project = appStore.actions.getActiveProject();
        if (!project || project.rows.length <= 1) break;
        const currentIdx = project.rows.findIndex((r) => r.id === project.activeRowId);
        if (currentIdx < project.rows.length - 1)
          void handleSwitchRow(project.id, project.rows[currentIdx + 1].id);
        break;
      }
      case "zoom-in": {
        if (!strip?.state.terminalFocused) {
          window.api.zoomApp("in");
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex];
          window.api.zoomPanel(focused.id, "in");
        }
        break;
      }
      case "zoom-out": {
        if (!strip?.state.terminalFocused) {
          window.api.zoomApp("out");
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex];
          window.api.zoomPanel(focused.id, "out");
        }
        break;
      }
      case "zoom-reset": {
        if (!strip?.state.terminalFocused) {
          window.api.zoomApp("reset", appDefaultZoom());
        } else {
          const focused = strip.state.panels[strip.state.focusedIndex];
          window.api.zoomPanel(focused.id, "reset");
        }
        break;
      }
      case "reload-config": {
        window.api.reloadConfig();
        showToast("Config reloaded", "info");
        break;
      }
    }
  }

  // --- Confirm close ---

  function handleConfirmResponse(confirmed: boolean): void {
    const data = confirmClose();
    if (data) {
      window.api.confirmCloseResponse(data.panelId, confirmed);
      if (confirmed) {
        const strip = findStripByPanelId(data.panelId);
        if (strip) {
          strip.actions.removePanelById(data.panelId);
        }
        createdPanelIds.delete(data.panelId);
      }
      setConfirmClose(null);
      const activeProject = appStore.actions.getActiveProject();
      if (activeProject) window.api.showPanelsByPrefix(activeProject.activeRowId);
    }
  }

  // --- Mount ---

  onMount(() => {
    // Register IPC listeners
    window.api.onWheelEvent((data) => {
      handleWheel(data.deltaX);
    });
    // eslint-disable-next-line solid/reactivity -- IPC handler intentionally reads latest reactive state
    window.api.onShortcut((action) => {
      handleShortcut(action);
    });
    window.addEventListener("resize", () => {
      setViewportHeight(window.innerHeight);
      // Update all strip stores with new viewport dimensions
      for (const store of stripStores.values()) {
        store.actions.setViewport(window.innerWidth, window.innerHeight);
      }
    });
    window.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaX !== 0) handleWheel(event.deltaX);
      },
      { passive: true },
    );

    // Route IPC callbacks by panel ID prefix
    window.api.onPtyExit((data) => {
      const strip = findStripByPanelId(data.panelId);
      if (strip) strip.actions.removePanelById(data.panelId);
      createdPanelIds.delete(data.panelId);
    });

    window.api.onConfirmClose((data) => {
      window.api.hideAllPanels();
      setConfirmClose(data);
    });

    window.api.onPanelTitle((data) => {
      const strip = findStripByPanelId(data.panelId);
      if (strip) strip.actions.setPanelTitle(data.panelId, data.title);
    });

    // Debounce panel focus events to prevent oscillation when
    // multiple panels are created in quick succession
    let focusDebounce: ReturnType<typeof setTimeout>;
    window.api.onPanelFocused((data) => {
      clearTimeout(focusDebounce);
      focusDebounce = setTimeout(() => {
        const strip = findStripByPanelId(data.panelId);
        if (strip) {
          const idx = strip.state.panels.findIndex((p) => p.id === data.panelId);
          if (idx >= 0 && idx !== strip.state.focusedIndex) {
            strip.actions.jumpTo(idx);
          }
        }
      }, 50);
    });

    window.api.onBrowserUrlChanged((data) => {
      const strip = findStripByPanelId(data.panelId);
      if (strip) {
        batch(() => {
          strip.actions.setPanelUrl(data.panelId, data.url);
          strip.actions.setPanelNavState(data.panelId, data.canGoBack, data.canGoForward);
        });
      }
    });

    window.api.onBrowserTitleChanged((data) => {
      const strip = findStripByPanelId(data.panelId);
      if (strip) strip.actions.setPanelTitle(data.panelId, data.title);
    });

    window.api.onBrowserOpenUrl((data) => {
      // No panelId available — route to active strip
      const strip = activeStrip();
      if (strip) {
        const panel = strip.actions.addPanel("browser", data.url);
        window.api.createBrowserPanel(panel.id, data.url);
      }
    });

    window.api.onPanelClosed((data) => {
      const strip = findStripByPanelId(data.panelId);
      if (strip) strip.actions.removePanelById(data.panelId);
      createdPanelIds.delete(data.panelId);
    });

    // Branch checking on window focus
    window.addEventListener("focus", () => {
      const project = appStore.actions.getActiveProject();
      if (project) refreshBranches(project.id);
    });

    // Periodic branch checking (catches fast commands like git branch -m)
    const branchCheckInterval = setInterval(() => {
      const project = appStore.actions.getActiveProject();
      if (project) refreshBranches(project.id);
    }, 5000);
    onCleanup(() => {
      clearInterval(branchCheckInterval);
    });

    // PR status polling — runs every 15s while window is focused
    let prStatusInterval: ReturnType<typeof setInterval> | null = null;

    function startPrPolling(): void {
      if (prStatusInterval) return;
      const project = appStore.actions.getActiveProject();
      if (project) refreshPrStatuses(project.id);
      prStatusInterval = setInterval(() => {
        const project = appStore.actions.getActiveProject();
        if (project) refreshPrStatuses(project.id);
      }, 15_000);
    }

    function stopPrPolling(): void {
      if (prStatusInterval) {
        clearInterval(prStatusInterval);
        prStatusInterval = null;
      }
    }

    // Start polling immediately (app starts focused)
    startPrPolling();

    window.addEventListener("focus", startPrPolling);
    window.addEventListener("blur", stopPrPolling);
    onCleanup(() => {
      stopPrPolling();
      window.removeEventListener("focus", startPrPolling);
      window.removeEventListener("blur", stopPrPolling);
    });

    // Apply app zoom from config on startup
    void window.api.getConfig().then((config) => {
      setAppDefaultZoom(config.preferences.app.defaultZoom);
      window.api.zoomApp("reset", config.preferences.app.defaultZoom);
    });

    // Re-apply app zoom on config reload (only if defaultZoom changed)
    // eslint-disable-next-line solid/reactivity -- IPC handler intentionally reads latest reactive state
    window.api.onConfigUpdated((config) => {
      const prev = appDefaultZoom();
      const next = config.preferences.app.defaultZoom;
      setAppDefaultZoom(next);
      if (prev !== next) {
        window.api.zoomApp("reset", next);
      }
    });

    // Load projects from persistence
    void window.api.listProjects().then(({ projects, activeProjectId }) => {
      appStore.actions.loadProjects(projects, activeProjectId);
      const active = appStore.actions.getActiveProject();
      if (active) refreshPrStatuses(active.id);
    });
  });

  // --- Sync sidebar width to main process for panel clipping ---

  createEffect(() => {
    window.api.setSidebarWidth(appStore.state.sidebarWidth);
  });

  // --- Derived state for rendering ---

  const strip = () => activeStrip();
  const sidebarWidth = () => appStore.state.sidebarWidth;

  const layout = () => {
    const s = strip();
    if (!s) return [];
    return computeLayout({
      panels: [...s.state.panels],
      scrollOffset: s.state.scrollOffset,
      viewportWidth: s.state.viewportWidth,
      viewportHeight: s.state.viewportHeight,
      sidebarWidth: sidebarWidth(),
    });
  };

  const maxScroll = () => {
    const s = strip();
    if (!s) return 0;
    return computeMaxScroll(s.state.panels.length, s.state.viewportWidth, sidebarWidth());
  };

  const panelChromeHeights = () => {
    const map = new Map<string, number>();
    const s = strip();
    if (!s) return map;
    for (const p of s.state.panels) {
      map.set(p.id, p.type === "browser" ? LAYOUT.PANEL_CHROME_HEIGHT : LAYOUT.TITLE_BAR_HEIGHT);
    }
    return map;
  };

  return (
    <>
      <Sidebar
        projects={appStore.state.projects}
        activeProjectId={appStore.state.activeProjectId}
        sidebarWidth={sidebarWidth()}
        viewportHeight={strip()?.state.viewportHeight ?? viewportHeight()}
        onSwitchProject={(id) => {
          handleSwitchProject(id);
        }}
        onSwitchRow={(projectId, rowId) => {
          void handleSwitchRow(projectId, rowId);
        }}
        onAddProject={() => {
          void handleAddProject();
        }}
        onRemoveProject={(id, del) => {
          void handleRemoveProject(id, del);
        }}
        onToggleExpanded={(projectId) => {
          const project = appStore.state.projects.find((p) => p.id === projectId);
          if (project) {
            const newExpanded = !project.expanded;
            appStore.actions.setExpanded(projectId, newExpanded);
            window.api.setExpanded(projectId, newExpanded);
          }
        }}
        onCreateRow={(projectId) => {
          void handleCreateRow(projectId);
        }}
        onRemoveRow={(rowId, deleteFromDisk) => {
          void handleRemoveRow(rowId, deleteFromDisk);
        }}
        onDiscoverWorktrees={(projectId) => {
          void handleDiscoverWorktrees(projectId);
        }}
        onOpenPrUrl={(url) => {
          const s = activeStrip();
          if (s) {
            const panel = s.actions.addPanel("browser", url);
            window.api.createBrowserPanel(panel.id, url);
          }
        }}
        onOpenRepoUrl={(projectId, url) => {
          const project = appStore.state.projects.find((p) => p.id === projectId);
          if (!project) return;
          const defaultRow = project.rows.find((r) => r.isDefault);
          if (!defaultRow) return;
          void handleSwitchRow(projectId, defaultRow.id).then(() => {
            const s = getStripStore(defaultRow.id);
            const panel = s.actions.addPanel("browser", url);
            window.api.createBrowserPanel(panel.id, url);
          });
        }}
        onBlurPanels={() => activeStrip()?.actions.blurPanel()}
        onModalShow={() => {
          window.api.hideAllPanels();
        }}
        onModalHide={() => {
          const project = appStore.actions.getActiveProject();
          if (project) window.api.showPanelsByPrefix(project.activeRowId);
        }}
      />
      <Strip
        layout={layout()}
        focusedPanelId={strip()?.state.panels[strip()?.state.focusedIndex ?? 0]?.id}
        panelChromeHeights={panelChromeHeights()}
      />
      <ScrollIndicators
        scrollOffset={strip()?.state.scrollOffset ?? 0}
        maxScroll={maxScroll()}
        viewportWidth={strip()?.state.viewportWidth ?? window.innerWidth}
        viewportHeight={strip()?.state.viewportHeight ?? viewportHeight()}
        sidebarWidth={sidebarWidth()}
      />
      <HintBar
        viewportHeight={strip()?.state.viewportHeight ?? viewportHeight()}
        panelCount={strip()?.state.panels.length ?? 0}
        hasProjects={appStore.state.projects.length > 0}
        sidebarWidth={sidebarWidth()}
        rowCount={appStore.actions.getActiveProject()?.rows.length ?? 0}
      />
      <Show when={confirmClose()} keyed>
        {(data) => (
          <ConfirmDialog
            processName={data.processName}
            onConfirm={() => {
              handleConfirmResponse(true);
            }}
            onCancel={() => {
              handleConfirmResponse(false);
            }}
          />
        )}
      </Show>
      <Show when={missingRow()} keyed>
        {(data) => (
          <MissingRowDialog
            branch={data.branch}
            onCancel={() => setMissingRow(null)}
            onRemove={() => {
              void handleRemoveRow(data.rowId, false);
              setMissingRow(null);
            }}
          />
        )}
      </Show>
      <Show when={toast()} keyed>
        {(t) => (
          <div
            style={{
              position: "fixed",
              bottom: "48px",
              left: "50%",
              transform: "translateX(-50%)",
              background: t.type === "error" ? THEME.danger : THEME.accent,
              color: t.type === "error" ? "#fff" : THEME.bg,
              padding: "8px 20px",
              "border-radius": "6px",
              "font-size": "13px",
              "font-family": THEME.font.body,
              "z-index": "2000",
              "box-shadow": "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            {t.message}
          </div>
        )}
      </Show>
    </>
  );
}
