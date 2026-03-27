import { randomUUID } from 'crypto'
import { goldenAngleColor } from '../shared/constants'
import type { Row, Project, PrStatus } from '../shared/types'
import type { WorktreeInfo } from './worktree-manager'

export function filterDiscoveredWorktrees(
  project: Project,
  worktrees: WorktreeInfo[],
  prStatuses: Map<string, PrStatus>
): Row[] {
  const existingPaths = new Set(project.rows.map(r => r.path))
  const newRows: Row[] = []

  for (const wt of worktrees) {
    if (existingPaths.has(wt.path)) continue
    if (wt.path === project.path) continue
    if (prStatuses.get(wt.branch) === 'merged') continue
    const row: Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: wt.branch,
      path: wt.path,
      color: goldenAngleColor(project.rows.length + newRows.length),
      isDefault: false
    }
    newRows.push(row)
  }

  return newRows
}
