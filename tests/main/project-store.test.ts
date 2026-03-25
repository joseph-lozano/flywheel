import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStore = { get: vi.fn(), set: vi.fn() }
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(function () {
    return mockStore
  })
}))

import { ProjectStore } from '../../src/main/project-store'

describe('ProjectStore', () => {
  let store: ProjectStore

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return []
      if (key === 'activeProjectId') return null
      return undefined
    })
    store = new ProjectStore()
  })

  it('getProjects returns empty array initially', () => {
    expect(store.getProjects()).toEqual([])
  })

  it('addProject stores a new project', () => {
    const project = store.addProject('/Users/test/my-project')
    expect(project).not.toBeNull()
    expect(project!.name).toBe('my-project')
    expect(project!.path).toBe('/Users/test/my-project')
    expect(project!.id).toBeTruthy()
    expect(mockStore.set).toHaveBeenCalledWith('projects', [project])
  })

  it('addProject rejects duplicate paths', () => {
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return [{ id: '1', name: 'my-project', path: '/Users/test/my-project' }]
      return null
    })
    store = new ProjectStore()
    expect(store.addProject('/Users/test/my-project')).toBeNull()
  })

  it('removeProject deletes by id', () => {
    const project = { id: 'abc', name: 'test', path: '/test' }
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return [project]
      if (key === 'activeProjectId') return 'abc'
      return null
    })
    store = new ProjectStore()
    store.removeProject('abc')
    expect(mockStore.set).toHaveBeenCalledWith('projects', [])
    expect(mockStore.set).toHaveBeenCalledWith('activeProjectId', null)
  })

  it('setActiveProjectId persists', () => {
    store.setActiveProjectId('proj-1')
    expect(mockStore.set).toHaveBeenCalledWith('activeProjectId', 'proj-1')
  })

  it('getActiveProjectId reads from store', () => {
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'activeProjectId') return 'proj-1'
      return []
    })
    store = new ProjectStore()
    expect(store.getActiveProjectId()).toBe('proj-1')
  })
})
