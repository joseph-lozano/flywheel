import { For, Show, createSignal, createEffect, onCleanup } from 'solid-js'
import type { Project, Row } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

// Lucide icons as inline SVGs
function ChevronDown(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronRight(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function GitBranch(props: { size?: number; color?: string }) {
  return (
    <svg width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none"
      stroke={props.color || '#888'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
  viewportHeight: number
  onSwitchProject: (id: string) => void
  onSwitchRow: (projectId: string, rowId: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
  onToggleExpanded: (projectId: string) => void
  onCreateRow: (projectId: string) => void
  onRemoveRow: (rowId: string, deleteFromDisk: boolean) => void
  onDiscoverWorktrees: (projectId: string) => void
  isGitProject: (projectId: string) => boolean
}

export default function Sidebar(props: SidebarProps) {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number; y: number;
    projectId?: string; rowId?: string; isDefault?: boolean; isGit?: boolean
  } | null>(null)
  const [hoveredId, setHoveredId] = createSignal<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = createSignal<{ rowId: string } | null>(null)

  function handleProjectContext(e: MouseEvent, projectId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId, isGit: props.isGitProject(projectId) })
  }

  function handleRowContext(e: MouseEvent, rowId: string, isDefault: boolean) {
    e.preventDefault()
    e.stopPropagation()
    if (isDefault) return
    setContextMenu({ x: e.clientX, y: e.clientY, rowId, isDefault })
  }

  function closeContextMenu() { setContextMenu(null) }

  createEffect(() => {
    if (contextMenu()) {
      const handler = () => closeContextMenu()
      window.addEventListener('click', handler)
      onCleanup(() => window.removeEventListener('click', handler))
    }
  })

  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0,
        width: `${props.sidebarWidth}px`, height: `${props.viewportHeight}px`,
        background: SIDEBAR.BACKGROUND, 'border-right': `1px solid ${SIDEBAR.BORDER_COLOR}`,
        display: 'flex', 'flex-direction': 'column', 'font-family': 'monospace',
        'font-size': `${SIDEBAR.ITEM_FONT_SIZE}px`, 'user-select': 'none', 'z-index': '20'
      }}
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div style={{
        color: SIDEBAR.ACCENT_COLOR, 'font-weight': 'bold',
        'font-size': `${SIDEBAR.HEADER_FONT_SIZE}px`, padding: '12px 12px 8px',
        display: 'flex', 'align-items': 'center', gap: '6px'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SIDEBAR.ACCENT_COLOR}
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        Projects
      </div>

      {/* Project tree */}
      <div style={{ flex: 1, 'overflow-y': 'auto' }}>
        <For each={props.projects}>
          {(project) => {
            const isActiveProject = () => project.id === props.activeProjectId
            const hasRows = () => project.rows && project.rows.length > 1

            return (
              <div>
                {/* Project header */}
                <div
                  style={{
                    padding: `${SIDEBAR.ITEM_PADDING_V}px ${SIDEBAR.ITEM_PADDING_H}px`,
                    color: project.missing ? '#555' : isActiveProject() ? '#e0e0e0' : '#666',
                    'font-style': project.missing ? 'italic' : 'normal',
                    cursor: 'pointer', 'white-space': 'nowrap',
                    overflow: 'hidden', 'text-overflow': 'ellipsis',
                    display: 'flex', 'align-items': 'center', gap: '4px'
                  }}
                  title={project.name}
                  onClick={() => props.onSwitchProject(project.id)}
                  onContextMenu={(e) => handleProjectContext(e, project.id)}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Show when={hasRows() || (project.rows && project.rows.length >= 1)}>
                    <span
                      style={{ cursor: 'pointer', display: 'flex', 'align-items': 'center', 'flex-shrink': 0 }}
                      onClick={(e) => { e.stopPropagation(); props.onToggleExpanded(project.id) }}
                    >
                      {project.expanded ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </Show>
                  <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{project.name}</span>
                </div>

                {/* Row list (when expanded) */}
                <Show when={project.expanded && project.rows}>
                  <For each={project.rows}>
                    {(row) => {
                      const isActiveRow = () => isActiveProject() && row.id === project.activeRowId
                      const isRowHovered = () => hoveredId() === row.id

                      return (
                        <div
                          style={{
                            padding: `3px ${SIDEBAR.ITEM_PADDING_H}px 3px ${SIDEBAR.ITEM_PADDING_H + 18}px`,
                            color: isActiveRow() ? '#e0e0e0' : '#666',
                            background: isActiveRow() ? SIDEBAR.ACTIVE_BG
                              : isRowHovered() ? 'rgba(255,255,255,0.03)' : 'transparent',
                            cursor: 'pointer', 'white-space': 'nowrap',
                            overflow: 'hidden', 'text-overflow': 'ellipsis',
                            display: 'flex', 'align-items': 'center', gap: '6px'
                          }}
                          onClick={() => props.onSwitchRow(project.id, row.id)}
                          onContextMenu={(e) => handleRowContext(e, row.id, row.isDefault)}
                          onMouseEnter={() => setHoveredId(row.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <GitBranch color={row.color} />
                          <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{row.branch}</span>
                        </div>
                      )
                    }}
                  </For>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      {/* Add Project button */}
      <div
        style={{
          padding: '8px 12px', color: '#555',
          'font-size': `${SIDEBAR.ADD_FONT_SIZE}px`,
          'border-top': `1px solid ${SIDEBAR.BORDER_COLOR}`, cursor: 'pointer'
        }}
        onClick={props.onAddProject}
      >
        + Add Project
      </div>

      {/* Context menu */}
      <Show when={contextMenu()}>
        <div
          style={{
            position: 'fixed', left: `${contextMenu()!.x}px`, top: `${contextMenu()!.y}px`,
            background: '#1a1a2e', border: `1px solid ${SIDEBAR.BORDER_COLOR}`,
            'border-radius': '4px', padding: '4px 0', 'z-index': '100',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          <Show when={contextMenu()!.projectId}>
            <div
              style={{ padding: '6px 16px', color: '#f43f5e', 'font-size': '11px', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { props.onRemoveProject(contextMenu()!.projectId!); setContextMenu(null) }}
            >
              Remove Project
            </div>
            <Show when={contextMenu()!.isGit}>
              <div
                style={{ padding: '6px 16px', color: '#e0e0e0', 'font-size': '11px', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { props.onDiscoverWorktrees(contextMenu()!.projectId!); setContextMenu(null) }}
              >
                Discover Worktrees
              </div>
            </Show>
          </Show>
          <Show when={contextMenu()!.rowId && !contextMenu()!.isDefault}>
            <div
              style={{ padding: '6px 16px', color: '#f43f5e', 'font-size': '11px', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { setRemoveConfirm({ rowId: contextMenu()!.rowId! }); setContextMenu(null) }}
            >
              Remove Row
            </div>
          </Show>
        </div>
      </Show>

      {/* Row removal confirmation */}
      <Show when={removeConfirm()}>
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': '1000'
          }}
        >
          <div style={{
            background: '#252540', 'border-radius': '8px', padding: '24px', 'max-width': '400px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #3a3a5c'
          }}>
            <p style={{ color: '#e0e0e0', margin: '0 0 20px 0', 'font-size': '14px', 'line-height': '1.5' }}>
              Remove this worktree row?
            </p>
            <div style={{ display: 'flex', gap: '12px', 'justify-content': 'flex-end', 'flex-wrap': 'wrap' }}>
              <button onClick={() => setRemoveConfirm(null)} style={{
                background: '#1a1a2e', color: '#888', border: '1px solid #3a3a5c',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Cancel</button>
              <button onClick={() => {
                props.onRemoveRow(removeConfirm()!.rowId, false)
                setRemoveConfirm(null)
              }} style={{
                background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #3a3a5c',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Remove from Flywheel</button>
              <button onClick={() => {
                props.onRemoveRow(removeConfirm()!.rowId, true)
                setRemoveConfirm(null)
              }} style={{
                background: '#f43f5e', color: '#fff', border: 'none',
                padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px'
              }}>Remove and delete from disk</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
