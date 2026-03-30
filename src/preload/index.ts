import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { FlywheelConfig } from "../shared/config";
import type {
  CheckBranchesResult,
  CheckPrStatusResult,
  CreateRowResult,
  DiscoverWorktreesResult,
  Project,
  RemoveRowResult,
} from "../shared/types";

contextBridge.exposeInMainWorld("api", {
  // Existing panel management
  createPanel: (id: string, color: string) => {
    ipcRenderer.send("panel:create", { id, color });
  },
  createTerminalPanel: (id: string) => {
    ipcRenderer.send("panel:create", { id, type: "terminal" });
  },
  destroyPanel: (id: string) => {
    ipcRenderer.send("panel:destroy", id);
  },
  updateBounds: (
    updates: {
      panelId: string;
      bounds: { x: number; y: number; width: number; height: number };
      visible: boolean;
    }[],
    sidebarWidth?: number,
  ) => {
    const factor = webFrame.getZoomFactor();
    const scaledSidebar = sidebarWidth != null ? Math.round(sidebarWidth * factor) : undefined;
    const scaledUpdates =
      factor === 1
        ? updates
        : updates.map((u) => ({
            ...u,
            bounds: {
              x: Math.round(u.bounds.x * factor),
              y: Math.round(u.bounds.y * factor),
              width: Math.round(u.bounds.width * factor),
              height: Math.round(u.bounds.height * factor),
            },
          }));
    ipcRenderer.send("panel:update-bounds", scaledUpdates, scaledSidebar);
  },
  onWheelEvent: (callback: (data: { deltaX: number }) => void) => {
    ipcRenderer.on("scroll:wheel", (_event, data: { deltaX: number }) => {
      callback(data);
    });
  },
  onShortcut: (callback: (action: { type: string; index?: number }) => void) => {
    ipcRenderer.on("shortcut:action", (_event, action: { type: string; index?: number }) => {
      callback(action);
    });
  },
  getDebugStats: (): Promise<{
    panelViewCount: number;
    mainMemoryMB: number;
    heapUsedMB: number;
  }> => {
    return ipcRenderer.invoke("debug:stats");
  },

  // New: PTY lifecycle
  createTerminal: (panelId: string) => {
    ipcRenderer.send("pty:create", { panelId });
  },
  onPtyExit: (callback: (data: { panelId: string; exitCode: number }) => void) => {
    ipcRenderer.on("pty:exit", (_event, data: { panelId: string; exitCode: number }) => {
      callback(data);
    });
  },

  // New: Close with busy-check
  closePanel: (panelId: string) => {
    ipcRenderer.send("panel:close-request", { panelId });
  },
  onConfirmClose: (callback: (data: { panelId: string; processName: string }) => void) => {
    ipcRenderer.on(
      "pty:confirm-close",
      (_event, data: { panelId: string; processName: string }) => {
        callback(data);
      },
    );
  },
  confirmCloseResponse: (panelId: string, confirmed: boolean) => {
    ipcRenderer.send("pty:confirm-close-response", { panelId, confirmed });
  },

  // Focus management
  focusPanel: (panelId: string) => {
    ipcRenderer.send("panel:focus", { panelId });
  },
  focusPanelChrome: (panelId: string) => {
    ipcRenderer.send("panel:focus-chrome", { panelId });
  },
  blurAllPanels: () => {
    ipcRenderer.send("panel:blur-all");
  },
  onPanelFocused: (callback: (data: { panelId: string }) => void) => {
    ipcRenderer.on("panel:focused", (_event, data: { panelId: string }) => {
      callback(data);
    });
  },
  onPanelTitle: (callback: (data: { panelId: string; title: string }) => void) => {
    ipcRenderer.on("panel:title", (_event, data: { panelId: string; title: string }) => {
      callback(data);
    });
  },
  hideAllPanels: () => {
    ipcRenderer.send("panel:hide-all");
  },
  showAllPanels: () => {
    ipcRenderer.send("panel:show-all");
  },

  // Browser panels
  createBrowserPanel: (id: string, url: string) => {
    ipcRenderer.send("panel:create", { id, type: "browser", url });
  },
  reloadBrowser: (panelId: string) => {
    ipcRenderer.send("browser:reload", { panelId });
  },
  goBackBrowser: (panelId: string) => {
    ipcRenderer.send("browser:go-back", { panelId });
  },
  goForwardBrowser: (panelId: string) => {
    ipcRenderer.send("browser:go-forward", { panelId });
  },
  toggleBrowserDevTools: (panelId: string) => {
    ipcRenderer.send("browser:toggle-devtools", { panelId });
  },
  onBrowserUrlChanged: (
    callback: (data: {
      panelId: string;
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }) => void,
  ) => {
    ipcRenderer.on(
      "browser:url-changed",
      (
        _event,
        data: { panelId: string; url: string; canGoBack: boolean; canGoForward: boolean },
      ) => {
        callback(data);
      },
    );
  },
  onBrowserTitleChanged: (callback: (data: { panelId: string; title: string }) => void) => {
    ipcRenderer.on("browser:title-changed", (_event, data: { panelId: string; title: string }) => {
      callback(data);
    });
  },
  sendChromeState: (
    panelId: string,
    state: {
      position: number;
      label: string;
      focused: boolean;
      type: string;
      url?: string;
      canGoBack?: boolean;
      canGoForward?: boolean;
      busy?: boolean;
    },
  ) => {
    ipcRenderer.send("panel:send-chrome-state", { panelId, ...state });
  },
  onBrowserOpenUrl: (callback: (data: { url: string }) => void) => {
    ipcRenderer.on("browser:open-url", (_event, data: { url: string }) => {
      callback(data);
    });
  },
  onPanelClosed: (callback: (data: { panelId: string }) => void) => {
    ipcRenderer.on("panel:closed", (_event, data: { panelId: string }) => {
      callback(data);
    });
  },

  // Project management
  addProject: (): Promise<Project | null> => {
    return ipcRenderer.invoke("project:add");
  },
  removeProject: (projectId: string, deleteWorktrees = false): Promise<{ errors: string[] }> => {
    return ipcRenderer.invoke("project:remove", { projectId, deleteWorktrees });
  },
  switchProject: (projectId: string) => {
    ipcRenderer.send("project:switch", { projectId });
  },
  listProjects: (): Promise<{ projects: Project[]; activeProjectId: string | null }> => {
    return ipcRenderer.invoke("project:list");
  },
  createTerminalWithCwd: (panelId: string, cwd: string) => {
    ipcRenderer.send("pty:create", { panelId, cwd });
  },
  hidePanelsByPrefix: (prefix: string) => {
    ipcRenderer.send("panel:hide-by-prefix", { prefix });
  },
  showPanelsByPrefix: (prefix: string) => {
    ipcRenderer.send("panel:show-by-prefix", { prefix });
  },
  destroyPanelsByPrefix: (prefix: string) => {
    ipcRenderer.send("panel:destroy-by-prefix", { prefix });
  },
  setSidebarWidth: (width: number) => {
    const factor = webFrame.getZoomFactor();
    ipcRenderer.send("panel:set-sidebar-width", { width: Math.round(width * factor) });
  },

  setExpanded: (projectId: string, expanded: boolean) => {
    ipcRenderer.send("project:set-expanded", { projectId, expanded });
  },

  // Row management
  createRow: (projectId: string): Promise<CreateRowResult> => {
    return ipcRenderer.invoke("row:create", { projectId });
  },
  removeRow: (rowId: string, deleteFromDisk: boolean): Promise<RemoveRowResult> => {
    return ipcRenderer.invoke("row:remove", { rowId, deleteFromDisk });
  },
  discoverWorktrees: (projectId: string): Promise<DiscoverWorktreesResult> => {
    return ipcRenderer.invoke("row:discover", { projectId });
  },
  checkBranches: (projectId: string): Promise<CheckBranchesResult> => {
    return ipcRenderer.invoke("row:check-branches", { projectId });
  },
  checkPrStatus: (projectId: string): Promise<CheckPrStatusResult> => {
    return ipcRenderer.invoke("row:check-pr-status", { projectId });
  },
  checkRowPath: (path: string): Promise<{ exists: boolean }> => {
    return ipcRenderer.invoke("row:check-path", { path });
  },

  // Zoom
  zoomPanel: (panelId: string, direction: "in" | "out" | "reset", defaultValue?: number) => {
    ipcRenderer.send("panel:zoom", { panelId, direction, defaultValue });
  },
  zoomApp: (direction: "in" | "out" | "reset", defaultValue?: number) => {
    if (direction === "in") {
      webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);
    } else if (direction === "out") {
      webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);
    } else {
      webFrame.setZoomLevel(defaultValue ?? 0);
    }
  },

  // Config
  getConfig: (): Promise<FlywheelConfig> => {
    return ipcRenderer.invoke("config:get-all");
  },
  reloadConfig: () => {
    ipcRenderer.send("config:reload");
  },
  onConfigUpdated: (callback: (config: FlywheelConfig) => void) => {
    ipcRenderer.on("config:updated", (_event, config: FlywheelConfig) => {
      callback(config);
    });
  },
});
