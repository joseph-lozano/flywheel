import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import type { Project } from '../shared/types'

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
  }

  getProjects(): Project[] {
    return this.store.get('projects')
  }

  getActiveProjectId(): string | null {
    return this.store.get('activeProjectId')
  }

  setActiveProjectId(id: string | null): void {
    this.store.set('activeProjectId', id)
  }

  addProject(dirPath: string): Project | null {
    const projects = this.getProjects()
    if (projects.some((p) => p.path === dirPath)) return null

    const project: Project = {
      id: randomUUID(),
      name: basename(dirPath),
      path: dirPath
    }
    this.store.set('projects', [...projects, project])
    return project
  }

  removeProject(id: string): void {
    const projects = this.getProjects()
    this.store.set('projects', projects.filter((p) => p.id !== id))
    if (this.getActiveProjectId() === id) {
      this.setActiveProjectId(null)
    }
  }
}
