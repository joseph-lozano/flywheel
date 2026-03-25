import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStore = { get: vi.fn(), set: vi.fn() }
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(function () {
    return mockStore
  })
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn((p: string) => !p.includes('/gone/')),
    accessSync: vi.fn((p: string) => {
      if (p.includes('/noaccess/')) throw new Error('EACCES')
    })
  }
})

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

  it('getProjects marks missing directories', () => {
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return [
        { id: '1', name: 'exists', path: '/Users/test/exists' },
        { id: '2', name: 'gone', path: '/Users/test/gone/project' }
      ]
      return null
    })
    store = new ProjectStore()
    const projects = store.getProjects()
    expect(projects[0].missing).toBe(false)
    expect(projects[1].missing).toBe(true)
  })

  it('addProject rejects unreadable paths', () => {
    expect(store.addProject('/Users/test/noaccess/project')).toBeNull()
    expect(mockStore.set).not.toHaveBeenCalled()
  })
})
