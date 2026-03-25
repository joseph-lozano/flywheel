import { createStore } from 'solid-js/store'
import type { Project } from '../../../shared/types'
import { SIDEBAR } from '../../../shared/constants'

export interface AppState {
  projects: Project[]
  activeProjectId: string | null
  sidebarWidth: number
  sidebarCollapsed: boolean
}

function computeSidebarWidth(projects: Project[]): number {
  if (projects.length === 0) return SIDEBAR.MIN_WIDTH
  const longestName = Math.max(...projects.map((p) => p.name.length))
  const estimated = longestName * 7 + SIDEBAR.ITEM_PADDING_H * 2 + 2 + 12
  return Math.max(SIDEBAR.MIN_WIDTH, Math.min(estimated, SIDEBAR.MAX_WIDTH))
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    projects: [],
    activeProjectId: null,
    sidebarWidth: SIDEBAR.MIN_WIDTH,
    sidebarCollapsed: false
  })

  const actions = {
    loadProjects(projects: Project[], activeProjectId: string | null): void {
      setState('projects', projects)
      setState('activeProjectId', activeProjectId)
      setState('sidebarWidth', computeSidebarWidth(projects))
    },

    addProject(project: Project): void {
      setState('projects', [...state.projects, project])
      setState('activeProjectId', project.id)
      setState('sidebarWidth', computeSidebarWidth([...state.projects]))
    },

    removeProject(id: string): void {
      const newProjects = state.projects.filter((p) => p.id !== id)
      setState('projects', newProjects)
      if (state.activeProjectId === id) {
        setState('activeProjectId', newProjects.length > 0 ? newProjects[0].id : null)
      }
      setState('sidebarWidth', computeSidebarWidth(newProjects))
    },

    switchProject(id: string): void {
      if (state.projects.some((p) => p.id === id)) {
        setState('activeProjectId', id)
      }
    },

    getActiveProject(): Project | null {
      if (!state.activeProjectId) return null
      return state.projects.find((p) => p.id === state.activeProjectId) || null
    },

    toggleSidebar(): void {
      setState('sidebarCollapsed', !state.sidebarCollapsed)
    }
  }

  return { state, actions }
}
