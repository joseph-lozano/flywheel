import { For, createSignal } from 'solid-js'
import type { Project } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
  viewportHeight: number
  onSwitchProject: (id: string) => void
  onAddProject: () => void
  onRemoveProject: (id: string) => void
}

export default function Sidebar(props: SidebarProps) {
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; projectId: string } | null>(null)

  function handleContextMenu(e: MouseEvent, projectId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  function handleRemove() {
    const menu = contextMenu()
    if (menu) {
      props.onRemoveProject(menu.projectId)
      setContextMenu(null)
    }
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${props.sidebarWidth}px`,
        height: `${props.viewportHeight}px`,
        background: SIDEBAR.BACKGROUND,
        'border-right': `1px solid ${SIDEBAR.BORDER_COLOR}`,
        display: 'flex',
        'flex-direction': 'column',
        'font-family': 'monospace',
        'font-size': `${SIDEBAR.ITEM_FONT_SIZE}px`,
        'user-select': 'none',
        'z-index': '20'
      }}
      onClick={closeContextMenu}
    >
      {/* Header — layers/stack icon + "Projects" */}
      <div style={{
        color: SIDEBAR.ACCENT_COLOR,
        'font-weight': 'bold',
        'font-size': `${SIDEBAR.HEADER_FONT_SIZE}px`,
        padding: '12px 12px 8px',
        display: 'flex',
        'align-items': 'center',
        gap: '6px'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SIDEBAR.ACCENT_COLOR} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        Projects
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <For each={props.projects}>
          {(project) => (
            <div
              style={{
                padding: `${SIDEBAR.ITEM_PADDING_V}px ${SIDEBAR.ITEM_PADDING_H}px`,
                color: project.missing
                  ? '#555'
                  : project.id === props.activeProjectId ? '#e0e0e0' : '#666',
                'font-style': project.missing ? 'italic' : 'normal',
                background: project.id === props.activeProjectId ? SIDEBAR.ACTIVE_BG : 'transparent',
                'border-left': project.id === props.activeProjectId
                  ? `2px solid ${SIDEBAR.ACCENT_COLOR}`
                  : '2px solid transparent',
                cursor: 'pointer',
                'white-space': 'nowrap',
                overflow: 'hidden',
                'text-overflow': 'ellipsis'
              }}
              title={project.name}
              onClick={() => props.onSwitchProject(project.id)}
              onContextMenu={(e) => handleContextMenu(e, project.id)}
            >
              {project.name}
            </div>
          )}
        </For>
      </div>

      {/* Add Project button */}
      <div
        style={{
          padding: '8px 12px',
          color: '#555',
          'font-size': `${SIDEBAR.ADD_FONT_SIZE}px`,
          'border-top': `1px solid ${SIDEBAR.BORDER_COLOR}`,
          cursor: 'pointer'
        }}
        onClick={props.onAddProject}
      >
        + Add Project
      </div>

      {/* Context menu */}
      {contextMenu() && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu()!.x}px`,
            top: `${contextMenu()!.y}px`,
            background: '#1a1a2e',
            border: `1px solid ${SIDEBAR.BORDER_COLOR}`,
            'border-radius': '4px',
            padding: '4px 0',
            'z-index': '100',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          <div
            style={{
              padding: '6px 16px',
              color: '#f43f5e',
              'font-size': '11px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={handleRemove}
          >
            Remove Project
          </div>
        </div>
      )}
    </div>
  )
}
