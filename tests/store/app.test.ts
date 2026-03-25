import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../../src/renderer/src/store/app'
import type { Project } from '../../src/shared/types'

function withAppStore(fn: (store: ReturnType<typeof createAppStore>) => void) {
  createRoot((dispose) => { const store = createAppStore(); fn(store); dispose() })
}

describe('createAppStore', () => {
  it('starts with no projects', () => {
    withAppStore(({ state }) => {
      expect(state.projects).toHaveLength(0)
      expect(state.activeProjectId).toBeNull()
    })
  })
})

describe('project management', () => {
  it('addProject adds to list and sets active', () => {
    withAppStore(({ state, actions }) => {
      const project: Project = { id: 'p1', name: 'test', path: '/test' }
      actions.addProject(project)
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0].id).toBe('p1')
      expect(state.activeProjectId).toBe('p1')
    })
  })

  it('removeProject removes from list', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.removeProject('p1')
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0].id).toBe('p2')
    })
  })

  it('removeProject switches to next project if active was removed', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.switchProject('p1')
      actions.removeProject('p1')
      expect(state.activeProjectId).toBe('p2')
    })
  })

  it('removeProject sets null if last project removed', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.removeProject('p1')
      expect(state.activeProjectId).toBeNull()
    })
  })
})

describe('project switching', () => {
  it('switchProject changes activeProjectId', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'a', path: '/a' })
      actions.addProject({ id: 'p2', name: 'b', path: '/b' })
      actions.switchProject('p1')
      expect(state.activeProjectId).toBe('p1')
    })
  })

  it('getActiveProject returns current project', () => {
    withAppStore(({ actions }) => {
      actions.addProject({ id: 'p1', name: 'test', path: '/test' })
      expect(actions.getActiveProject()?.id).toBe('p1')
    })
  })

  it('getActiveProject returns null when no active', () => {
    withAppStore(({ actions }) => {
      expect(actions.getActiveProject()).toBeNull()
    })
  })
})

describe('sidebar width', () => {
  it('computes sidebar width from longest project name', () => {
    withAppStore(({ state, actions }) => {
      actions.addProject({ id: 'p1', name: 'short', path: '/short' })
      expect(state.sidebarWidth).toBeGreaterThanOrEqual(180)
      expect(state.sidebarWidth).toBeLessThanOrEqual(280)
    })
  })

  it('returns 180 (min) when no projects', () => {
    withAppStore(({ state }) => {
      expect(state.sidebarWidth).toBe(180)
    })
  })
})

describe('loadProjects', () => {
  it('loads project list and active project', () => {
    withAppStore(({ state, actions }) => {
      const projects: Project[] = [
        { id: 'p1', name: 'a', path: '/a' },
        { id: 'p2', name: 'b', path: '/b' }
      ]
      actions.loadProjects(projects, 'p2')
      expect(state.projects).toHaveLength(2)
      expect(state.activeProjectId).toBe('p2')
    })
  })
})
