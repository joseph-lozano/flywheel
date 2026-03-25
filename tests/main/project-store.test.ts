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
  let storedProjects: any[]
  let storedActiveProjectId: string | null

  beforeEach(() => {
    vi.clearAllMocks()
    storedProjects = []
    storedActiveProjectId = null
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'projects') return storedProjects
      if (key === 'activeProjectId') return storedActiveProjectId
      return undefined
    })
    mockStore.set.mockImplementation((key: string, value: any) => {
      if (key === 'projects') storedProjects = value
      if (key === 'activeProjectId') storedActiveProjectId = value
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
    expect(project!.rows).toHaveLength(1)
    expect(project!.rows[0].isDefault).toBe(true)
    expect(project!.activeRowId).toBe(project!.rows[0].id)
    expect(project!.expanded).toBe(true)
    expect(mockStore.set).toHaveBeenCalledWith('projects', [project])
  })

  it('addProject rejects duplicate paths', () => {
    storedProjects = [{
      id: '1',
      name: 'my-project',
      path: '/Users/test/my-project',
      rows: [],
      activeRowId: '',
      expanded: true
    }]
    store = new ProjectStore()
    expect(store.addProject('/Users/test/my-project')).toBeNull()
  })

  it('removeProject deletes by id', () => {
    storedProjects = [{
      id: 'abc',
      name: 'test',
      path: '/test',
      rows: [],
      activeRowId: '',
      expanded: true
    }]
    storedActiveProjectId = 'abc'
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
    storedActiveProjectId = 'proj-1'
    store = new ProjectStore()
    expect(store.getActiveProjectId()).toBe('proj-1')
  })

  it('getProjects marks missing directories', () => {
    storedProjects = [
      { id: '1', name: 'exists', path: '/Users/test/exists', rows: [], activeRowId: '', expanded: true },
      { id: '2', name: 'gone', path: '/Users/test/gone/project', rows: [], activeRowId: '', expanded: true }
    ]
    store = new ProjectStore()
    const projects = store.getProjects()
    expect(projects[0].missing).toBe(false)
    expect(projects[1].missing).toBe(true)
  })

  it('addProject rejects unreadable paths', () => {
    expect(store.addProject('/Users/test/noaccess/project')).toBeNull()
    expect(mockStore.set).not.toHaveBeenCalled()
  })

  describe('row management', () => {
    it('addProject creates a default row', () => {
      const project = store.addProject('/Users/test/my-project')
      expect(project).not.toBeNull()
      expect(project!.rows).toHaveLength(1)
      expect(project!.rows[0].isDefault).toBe(true)
      expect(project!.rows[0].path).toBe('/Users/test/my-project')
      expect(project!.activeRowId).toBe(project!.rows[0].id)
      expect(project!.expanded).toBe(true)
    })

    it('addRow appends a row to the project', () => {
      const project = store.addProject('/Users/test/my-project')
      const row = { id: 'row-2', projectId: project!.id, branch: 'feat', path: '/tmp/wt', color: 'hsl(137, 65%, 65%)', isDefault: false }
      store.addRow(project!.id, row)
      const projects = store.getProjects()
      const updated = projects.find(p => p.id === project!.id)
      expect(updated!.rows).toHaveLength(2)
      expect(updated!.rows[1].id).toBe('row-2')
    })

    it('removeRow removes a non-default row', () => {
      const project = store.addProject('/Users/test/my-project')
      const row = { id: 'row-2', projectId: project!.id, branch: 'feat', path: '/tmp/wt', color: 'hsl(137, 65%, 65%)', isDefault: false }
      store.addRow(project!.id, row)
      store.removeRow(project!.id, 'row-2')
      const projects = store.getProjects()
      const updated = projects.find(p => p.id === project!.id)
      expect(updated!.rows).toHaveLength(1)
    })

    it('setActiveRowId updates the active row', () => {
      const project = store.addProject('/Users/test/my-project')
      const row = { id: 'row-2', projectId: project!.id, branch: 'feat', path: '/tmp/wt', color: 'hsl(137, 65%, 65%)', isDefault: false }
      store.addRow(project!.id, row)
      store.setActiveRowId(project!.id, 'row-2')
      const projects = store.getProjects()
      const updated = projects.find(p => p.id === project!.id)
      expect(updated!.activeRowId).toBe('row-2')
    })

    it('updateRowBranch updates branch name', () => {
      const project = store.addProject('/Users/test/my-project')
      store.updateRowBranch(project!.id, project!.rows[0].id, 'develop')
      const projects = store.getProjects()
      expect(projects[0].rows[0].branch).toBe('develop')
    })

    it('setExpanded toggles project expanded state', () => {
      const project = store.addProject('/Users/test/my-project')
      store.setExpanded(project!.id, false)
      const projects = store.getProjects()
      expect(projects[0].expanded).toBe(false)
    })
  })
})
