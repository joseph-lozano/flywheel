import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import { existsSync, accessSync, constants } from 'fs'
import type { Project, Row } from '../shared/types'
import { goldenAngleColor } from '../shared/constants'

interface StoreSchema {
  projects: Project[]
  activeProjectId: string | null
}

export class ProjectStore {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        projects: [],
        activeProjectId: null
      }
    })
    // Phase 4: clear pre-Phase 4 projects that lack rows
    const projects = this.store.get('projects')
    if (projects.some((p) => !p.rows || p.rows.length === 0)) {
      this.store.set('projects', [])
      this.store.set('activeProjectId', null)
    }
  }

  getProjects(): Project[] {
    const projects = this.store.get('projects')
    return projects.map((p) => ({
      ...p,
      missing: !existsSync(p.path),
      expanded: p.expanded ?? true
    }))
  }

  getActiveProjectId(): string | null {
    return this.store.get('activeProjectId')
  }

  setActiveProjectId(id: string | null): void {
    this.store.set('activeProjectId', id)
  }

  addProject(dirPath: string, defaultBranch = 'main'): Project | null {
    const projects = this.store.get('projects')
    if (projects.some((p) => p.path === dirPath)) return null

    try {
      accessSync(dirPath, constants.R_OK)
    } catch {
      return null
    }

    const projectId = randomUUID()
    const defaultRow: Row = {
      id: randomUUID(),
      projectId,
      branch: defaultBranch,
      path: dirPath,
      color: goldenAngleColor(0),
      isDefault: true
    }

    const project: Project = {
      id: projectId,
      name: basename(dirPath),
      path: dirPath,
      rows: [defaultRow],
      activeRowId: defaultRow.id,
      expanded: true
    }
    this.store.set('projects', [...projects, project])
    return project
  }

  removeProject(id: string): void {
    const projects = this.store.get('projects')
    this.store.set('projects', projects.filter((p) => p.id !== id))
    if (this.getActiveProjectId() === id) {
      this.setActiveProjectId(null)
    }
  }

  addRow(projectId: string, row: Row): void {
    const projects = this.store.get('projects')
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p
      return { ...p, rows: [...(p.rows || []), row] }
    })
    this.store.set('projects', updated)
  }

  removeRow(projectId: string, rowId: string): void {
    const projects = this.store.get('projects')
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p
      const newRows = (p.rows || []).filter((r) => r.id !== rowId)
      const activeRowId = p.activeRowId === rowId
        ? newRows.find((r) => r.isDefault)?.id || newRows[0]?.id || ''
        : p.activeRowId
      return { ...p, rows: newRows, activeRowId }
    })
    this.store.set('projects', updated)
  }

  setActiveRowId(projectId: string, rowId: string): void {
    const projects = this.store.get('projects')
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p
      return { ...p, activeRowId: rowId }
    })
    this.store.set('projects', updated)
  }

  updateRowBranch(projectId: string, rowId: string, branch: string): void {
    const projects = this.store.get('projects')
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        rows: (p.rows || []).map((r) => r.id === rowId ? { ...r, branch } : r)
      }
    })
    this.store.set('projects', updated)
  }

  setExpanded(projectId: string, expanded: boolean): void {
    const projects = this.store.get('projects')
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p
      return { ...p, expanded }
    })
    this.store.set('projects', updated)
  }
}
