/// <reference types="vite/client" />

import type { FlywheelConfig } from "../../shared/config";
import type {
  CheckBranchesResult,
  CheckPrStatusResult,
  CreateRowResult,
  DiscoverWorktreesResult,
  Project,
  RemoveProjectResult,
  RemoveRowResult,
} from "../../shared/types";

interface FlywheelAPI {
  createPanel(id: string, color: string): void;
  createTerminalPanel(id: string): void;
  destroyPanel(id: string): void;
  updateBounds(
    updates: {
      panelId: string;
      bounds: { x: number; y: number; width: number; height: number };
      visible: boolean;
    }[],
    sidebarWidth?: number,
  ): void;
  onWheelEvent(callback: (data: { deltaX: number }) => void): void;
  onShortcut(callback: (action: { type: string; index?: number }) => void): void;
  getDebugStats(): Promise<{ panelViewCount: number; mainMemoryMB: number; heapUsedMB: number }>;

  // PTY lifecycle
  createTerminal(panelId: string): void;
  onPtyExit(callback: (data: { panelId: string; exitCode: number }) => void): void;

  // Close with busy-check (confirmation handled by native dialog in main process)
  closePanel(panelId: string): void;

  // Focus management
  focusPanel(panelId: string): void;
  focusPanelChrome(panelId: string): void;
  blurAllPanels(): void;
  onPanelFocused(callback: (data: { panelId: string }) => void): void;
  onPanelTitle(callback: (data: { panelId: string; title: string }) => void): void;
  hideAllPanels(): void;
  showAllPanels(): void;

  // Terminal panels
  clearTerminal(panelId: string): void;

  // Browser panels
  createBrowserPanel(id: string, url: string): void;
  reloadBrowser(panelId: string): void;
  goBackBrowser(panelId: string): void;
  goForwardBrowser(panelId: string): void;
  toggleBrowserDevTools(panelId: string): void;
  onBrowserUrlChanged(
    callback: (data: {
      panelId: string;
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }) => void,
  ): void;
  onBrowserTitleChanged(callback: (data: { panelId: string; title: string }) => void): void;
  onBrowserOpenUrl(callback: (data: { url: string }) => void): void;
  onPanelClosed(callback: (data: { panelId: string }) => void): void;
  sendChromeState(
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
  ): void;

  // Project management
  addProject(): Promise<Project | null>;
  removeProject(projectId: string, deleteWorktrees?: boolean): Promise<RemoveProjectResult>;
  switchProject(projectId: string): void;
  listProjects(): Promise<{
    projects: Project[];
    activeProjectId: string | null;
  }>;
  createTerminalWithCwd(panelId: string, cwd: string): void;
  hidePanelsByPrefix(prefix: string): void;
  showPanelsByPrefix(prefix: string): void;
  destroyPanelsByPrefix(prefix: string): void;
  setSidebarWidth(width: number): void;
  setExpanded(projectId: string, expanded: boolean): void;

  // Row management
  createRow(projectId: string): Promise<CreateRowResult>;
  removeRow(rowId: string, deleteFromDisk: boolean): Promise<RemoveRowResult>;
  discoverWorktrees(projectId: string): Promise<DiscoverWorktreesResult>;
  checkBranches(projectId: string): Promise<CheckBranchesResult>;
  checkPrStatus(projectId: string): Promise<CheckPrStatusResult>;
  checkRowPath(path: string): Promise<{ exists: boolean }>;

  // Native context menus
  showProjectContextMenu(): Promise<{ action: "new-row" | "discover" | "remove" | "cancel" }>;
  showRowContextMenu(): Promise<{ action: "remove" | "cancel" }>;

  // Native dialogs
  showRemoveRowDialog(): Promise<{ action: "remove" | "delete" | "cancel" }>;
  showRemoveProjectDialog(): Promise<{ action: "remove" | "delete" | "cancel" }>;
  showMissingRowDialog(branch: string): Promise<{ confirmed: boolean }>;

  // Zoom
  zoomPanel(panelId: string, direction: "in" | "out" | "reset", defaultValue?: number): void;
  zoomApp(direction: "in" | "out" | "reset", defaultValue?: number): void;

  // Config
  getConfig(): Promise<FlywheelConfig>;
  reloadConfig(): void;
  onConfigUpdated(callback: (config: FlywheelConfig) => void): void;
}

declare global {
  interface Window {
    api: FlywheelAPI;
  }
}

export {};
