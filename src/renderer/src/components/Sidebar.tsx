import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { SIDEBAR, THEME } from "../../../shared/constants";
import type { Project } from "../../../shared/types";
import RemoveProjectDialog from "./RemoveProjectDialog";
import RemoveRowDialog from "./RemoveRowDialog";

// Lucide icons as inline SVGs
function ChevronDown(props: { size?: number; color?: string }) {
  return (
    <svg
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "#888"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight(props: { size?: number; color?: string }) {
  return (
    <svg
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "#888"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PullRequest(props: { size?: number; color?: string }) {
  return (
    <svg
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "#888"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function GitHub(props: { size?: number; color?: string }) {
  return (
    <svg
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "currentColor"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

const PR_STATUS_COLORS: Record<string, string> = {
  draft: "#8b949e",
  open: "#3fb950",
  merged: "#a371f7",
  closed: "#f85149",
};

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  sidebarWidth: number;
  viewportHeight: number;
  onSwitchProject: (id: string) => void;
  onSwitchRow: (projectId: string, rowId: string) => void;
  onAddProject: () => void;
  onRemoveProject: (id: string, deleteWorktrees: boolean) => void;
  onToggleExpanded: (projectId: string) => void;
  onCreateRow: (projectId: string) => void;
  onRemoveRow: (rowId: string, deleteFromDisk: boolean) => void;
  onDiscoverWorktrees: (projectId: string) => void;
  onOpenPrUrl?: (url: string) => void;
  onOpenRepoUrl?: (projectId: string, url: string) => void;
  onModalShow?: () => void;
  onModalHide?: () => void;
  onBlurPanels?: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    projectId?: string;
    rowId?: string;
    isDefault?: boolean;
  } | null>(null);
  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = createSignal<{ rowId: string } | null>(null);
  const [removeProjectConfirm, setRemoveProjectConfirm] = createSignal<{
    projectId: string;
  } | null>(null);

  function handleProjectContext(e: MouseEvent, projectId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectId });
  }

  function handleRowContext(e: MouseEvent, rowId: string, isDefault: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (isDefault) return;
    setContextMenu({ x: e.clientX, y: e.clientY, rowId, isDefault });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  createEffect(() => {
    if (contextMenu()) {
      const handler = () => {
        closeContextMenu();
      };
      window.addEventListener("click", handler);
      onCleanup(() => {
        window.removeEventListener("click", handler);
      });
    }
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: `${props.sidebarWidth}px`,
        height: `${props.viewportHeight}px`,
        background: SIDEBAR.BACKGROUND,
        "border-right": `1px solid ${SIDEBAR.BORDER_COLOR}`,
        display: "flex",
        "flex-direction": "column",
        "font-family": THEME.font.body,
        "font-size": `${SIDEBAR.ITEM_FONT_SIZE}px`,
        "user-select": "none",
        "z-index": "20",
      }}
      onMouseDown={() => props.onBlurPanels?.()}
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div
        style={{
          color: SIDEBAR.ACCENT_COLOR,
          "font-weight": "bold",
          "font-size": `${SIDEBAR.HEADER_FONT_SIZE}px`,
          padding: "12px 12px 8px",
          display: "flex",
          "align-items": "center",
          gap: "6px",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={SIDEBAR.ACCENT_COLOR}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        Projects
      </div>

      {/* Project tree */}
      <div style={{ flex: 1, "overflow-y": "auto" }}>
        <For each={props.projects}>
          {(project) => {
            const isActiveProject = () => project.id === props.activeProjectId;

            return (
              <div>
                {/* Project header */}
                <div
                  style={{
                    padding: `${SIDEBAR.ITEM_PADDING_V}px ${SIDEBAR.ITEM_PADDING_H}px`,
                    color: project.missing ? "#555" : isActiveProject() ? THEME.text : THEME.muted,
                    "font-style": project.missing ? "italic" : "normal",
                    cursor: "pointer",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    display: "flex",
                    "align-items": "center",
                    gap: "4px",
                  }}
                  title={project.name}
                  onClick={() => {
                    props.onSwitchProject(project.id);
                  }}
                  onContextMenu={(e) => {
                    handleProjectContext(e, project.id);
                  }}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Show when={project.rows.length > 1}>
                    <span
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        "align-items": "center",
                        "flex-shrink": 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onToggleExpanded(project.id);
                      }}
                    >
                      {project.expanded ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </Show>
                  <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>
                    {project.name}
                  </span>
                  <Show when={project.repoUrl}>
                    {(repoUrl) => (
                      <span
                        style={{
                          display: "inline-flex",
                          "align-items": "center",
                          gap: "3px",
                          "margin-left": "4px",
                          color: "#555",
                          "font-size": "10px",
                          cursor: "pointer",
                          "text-decoration": "none",
                          "flex-shrink": 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onOpenRepoUrl?.(project.id, repoUrl());
                        }}
                      >
                        <GitHub />
                        GitHub
                      </span>
                    )}
                  </Show>
                </div>

                {/* Row list (when expanded) */}
                <Show when={project.expanded && project.rows}>
                  <For each={project.rows}>
                    {(row) => {
                      const isActiveRow = () => isActiveProject() && row.id === project.activeRowId;
                      const isRowHovered = () => hoveredId() === row.id;

                      return (
                        <div
                          style={{
                            padding: `3px ${SIDEBAR.ITEM_PADDING_H}px 3px ${SIDEBAR.ITEM_PADDING_H + 18}px`,
                            color: isActiveRow() ? THEME.text : THEME.muted,
                            background: isActiveRow()
                              ? SIDEBAR.ACTIVE_BG
                              : isRowHovered()
                                ? "rgba(255,255,255,0.03)"
                                : "transparent",
                            cursor: "pointer",
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                            display: "flex",
                            "align-items": "center",
                            gap: "6px",
                          }}
                          onClick={() => {
                            props.onSwitchRow(project.id, row.id);
                          }}
                          onContextMenu={(e) => {
                            handleRowContext(e, row.id, row.isDefault);
                          }}
                          onMouseEnter={() => setHoveredId(row.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <Show
                            when={row.prStatus}
                            fallback={
                              <Show when={row.isDefault}>
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                  <circle
                                    cx="5"
                                    cy="5"
                                    r="4"
                                    fill={isActiveRow() ? THEME.text : THEME.muted}
                                  />
                                </svg>
                              </Show>
                            }
                          >
                            <PullRequest
                              color={row.prStatus ? PR_STATUS_COLORS[row.prStatus] : undefined}
                            />
                            <Show when={row.prNumber && row.prUrl}>
                              <span
                                style={{
                                  color: row.prStatus ? PR_STATUS_COLORS[row.prStatus] : undefined,
                                  "font-size": "11px",
                                  "font-weight": "600",
                                  cursor: "pointer",
                                  "text-decoration": "none",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.textDecoration = "underline";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.textDecoration = "none";
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (row.prUrl) props.onOpenPrUrl?.(row.prUrl);
                                }}
                              >
                                #{row.prNumber}
                              </span>
                            </Show>
                          </Show>
                          <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>
                            {row.branch}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Add Project button */}
      <div
        style={{
          padding: "8px 12px",
          color: "#555",
          "font-size": `${SIDEBAR.ADD_FONT_SIZE}px`,
          "border-top": `1px solid ${SIDEBAR.BORDER_COLOR}`,
          cursor: "pointer",
        }}
        onClick={() => {
          props.onAddProject();
        }}
      >
        + Add Project
      </div>

      {/* Context menu */}
      <Show when={contextMenu()} keyed>
        {(menu) => (
          <div
            style={{
              position: "fixed",
              left: `${menu.x}px`,
              top: `${menu.y}px`,
              background: THEME.faint,
              border: `1px solid ${SIDEBAR.BORDER_COLOR}`,
              "border-radius": "4px",
              padding: "4px 0",
              "z-index": "100",
              "box-shadow": "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <Show when={menu.projectId}>
              <div
                style={{
                  padding: "6px 16px",
                  color: THEME.text,
                  "font-size": "11px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  const pid = menu.projectId;
                  if (pid) props.onCreateRow(pid);
                  setContextMenu(null);
                }}
              >
                New Row
              </div>
              <div
                style={{
                  padding: "6px 16px",
                  color: THEME.text,
                  "font-size": "11px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  const pid = menu.projectId;
                  if (pid) props.onDiscoverWorktrees(pid);
                  setContextMenu(null);
                }}
              >
                Discover Worktrees
              </div>
              <div
                style={{
                  padding: "6px 16px",
                  color: THEME.danger,
                  "font-size": "11px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244,63,94,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  const pid = menu.projectId;
                  if (!pid) return;
                  const project = props.projects.find((p) => p.id === pid);
                  const hasWorktrees = project?.rows.some((r) => !r.isDefault);
                  setContextMenu(null);
                  if (hasWorktrees) {
                    setRemoveProjectConfirm({ projectId: pid });
                    props.onModalShow?.();
                  } else {
                    props.onRemoveProject(pid, false);
                  }
                }}
              >
                Remove Project
              </div>
            </Show>
            <Show when={menu.rowId && !menu.isDefault}>
              <div
                style={{
                  padding: "6px 16px",
                  color: THEME.danger,
                  "font-size": "11px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244,63,94,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  const rid = menu.rowId;
                  if (rid) setRemoveConfirm({ rowId: rid });
                  setContextMenu(null);
                  props.onModalShow?.();
                }}
              >
                Remove Row
              </div>
            </Show>
          </div>
        )}
      </Show>

      {/* Row removal confirmation */}
      <Show when={removeConfirm()} keyed>
        {(confirm) => (
          <RemoveRowDialog
            onRemoveFromFlywheel={() => {
              props.onRemoveRow(confirm.rowId, false);
              setRemoveConfirm(null);
              props.onModalHide?.();
            }}
            onDeleteFromDisk={() => {
              props.onRemoveRow(confirm.rowId, true);
              setRemoveConfirm(null);
              props.onModalHide?.();
            }}
            onCancel={() => {
              setRemoveConfirm(null);
              props.onModalHide?.();
            }}
          />
        )}
      </Show>

      {/* Project removal confirmation (when project has worktree rows) */}
      <Show when={removeProjectConfirm()} keyed>
        {(confirm) => (
          <RemoveProjectDialog
            onRemoveFromFlywheel={() => {
              props.onRemoveProject(confirm.projectId, false);
              setRemoveProjectConfirm(null);
              props.onModalHide?.();
            }}
            onDeleteWorktrees={() => {
              props.onRemoveProject(confirm.projectId, true);
              setRemoveProjectConfirm(null);
              props.onModalHide?.();
            }}
            onCancel={() => {
              setRemoveProjectConfirm(null);
              props.onModalHide?.();
            }}
          />
        )}
      </Show>
    </div>
  );
}
