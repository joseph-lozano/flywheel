import { describe, it, expect } from 'vitest'
import { randomUUID } from 'crypto'
import type { Row, Project, PrStatus } from '../../src/shared/types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'test-project',
    path: '/Users/test/project',
    rows: [
      {
        id: 'row-default',
        projectId: 'proj-1',
        branch: 'main',
        path: '/Users/test/project',
        color: 'hsl(0, 70%, 60%)',
        isDefault: true
      }
    ],
    activeRowId: 'row-default',
    expanded: true,
    ...overrides
  }
}

// Simulate the discovery logic from the row:discover handler
function discoverNewRows(
  project: Project,
  worktrees: { path: string; branch: string }[],
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
      color: 'hsl(137, 70%, 60%)',
      isDefault: false
    }
    newRows.push(row)
  }

  return newRows
}

describe('discover worktrees — merged PR filtering', () => {
  const project = makeProject()

  const worktrees = [
    { path: '/Users/test/project', branch: 'main' },
    { path: '/Users/test/.flywheel/worktrees/project/feat-merged', branch: 'feat-merged' },
    { path: '/Users/test/.flywheel/worktrees/project/feat-open', branch: 'feat-open' },
    { path: '/Users/test/.flywheel/worktrees/project/feat-no-pr', branch: 'feat-no-pr' }
  ]

  it('skips worktrees whose branch has a merged PR', () => {
    const prStatuses = new Map<string, PrStatus>([
      ['feat-merged', 'merged'],
      ['feat-open', 'open']
    ])

    const rows = discoverNewRows(project, worktrees, prStatuses)
    const branches = rows.map(r => r.branch)

    expect(branches).not.toContain('feat-merged')
    expect(branches).toContain('feat-open')
    expect(branches).toContain('feat-no-pr')
    expect(rows).toHaveLength(2)
  })

  it('adds worktrees with open, draft, or closed PRs', () => {
    const prStatuses = new Map<string, PrStatus>([
      ['feat-merged', 'open'],
      ['feat-open', 'draft'],
      ['feat-no-pr', 'closed']
    ])

    const rows = discoverNewRows(project, worktrees, prStatuses)
    expect(rows).toHaveLength(3)
  })

  it('adds all worktrees when gh is unavailable (empty map)', () => {
    const prStatuses = new Map<string, PrStatus>()

    const rows = discoverNewRows(project, worktrees, prStatuses)
    expect(rows).toHaveLength(3)
  })
})
