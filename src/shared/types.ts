export interface Panel {
  id: string;
  type: "terminal" | "placeholder" | "browser";
  color: string;
  label: string;
  url?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  missing?: boolean;
  rows: Row[];
  activeRowId: string;
  expanded: boolean;
}

export type PrStatus = "draft" | "open" | "merged" | "closed";

export interface Row {
  id: string;
  projectId: string;
  branch: string;
  path: string;
  color: string;
  isDefault: boolean;
  prStatus?: PrStatus;
}

export interface PersistedState {
  projects: Project[];
  activeProjectId: string | null;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelBoundsUpdate {
  panelId: string;
  bounds: Rectangle;
  visible: boolean;
}

export type VisibilityState = "visible" | "hidden" | "destroyed";

export interface PanelChromeState {
  panelId: string;
  position: number;
  label: string;
  focused: boolean;
  type: "terminal" | "placeholder" | "browser";
  url?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  busy?: boolean;
}

export interface PanelLayout {
  panelId: string;
  contentBounds: Rectangle;
  visibility: VisibilityState;
}

// IPC result types for row management
export type CreateRowResult = { row: Row } | { error: string };
export interface RemoveRowResult {
  error?: string;
}
export interface DiscoverWorktreesResult {
  rows: Row[];
}
export interface CheckBranchesResult {
  updates: { rowId: string; branch: string }[];
}
export interface CheckPrStatusResult {
  updates: { rowId: string; prStatus: PrStatus | undefined }[];
}

export interface ShortcutAction {
  type:
    | "focus-left"
    | "focus-right"
    | "swap-left"
    | "swap-right"
    | "new-panel"
    | "new-browser"
    | "close-panel"
    | "jump-to"
    | "blur-panel"
    | "reload-browser"
    | "browser-back"
    | "browser-forward"
    | "add-project"
    | "switch-project"
    | "prev-project"
    | "next-project"
    | "new-row"
    | "prev-row"
    | "next-row"
    | "zoom-in"
    | "zoom-out"
    | "zoom-reset"
    | "reload-config";
  index?: number;
}
