import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process.execFile
const mockExecFile = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true)
  }
})

import { WorktreeManager } from '../../src/main/worktree-manager'

describe('WorktreeManager', () => {
  let manager: WorktreeManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorktreeManager()
  })

  describe('generateName', () => {
    it('returns adjective-noun-NNN format', () => {
      const name = manager.generateName()
      expect(name).toMatch(/^[a-z]+-[a-z]+-\d{3}$/)
    })

    it('generates different names on successive calls', () => {
      const names = new Set(Array.from({ length: 10 }, () => manager.generateName()))
      expect(names.size).toBeGreaterThan(1)
    })
  })

  describe('resolveBase', () => {
    it('resolves origin/HEAD when remote exists', async () => {
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('origin/HEAD')) cb(null, 'abc123\n')
        else cb(new Error('not found'))
      })
      const base = await manager.resolveBase('/test/project')
      expect(base).toBe('abc123')
    })

    it('falls back to HEAD when no remote', async () => {
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('origin/HEAD')) cb(new Error('no remote'))
        else if (args.includes('HEAD')) cb(null, 'def456\n')
        else cb(new Error('not found'))
      })
      const base = await manager.resolveBase('/test/project')
      expect(base).toBe('def456')
    })
  })

  describe('listWorktrees', () => {
    it('parses git worktree list --porcelain output', async () => {
      const porcelainOutput = [
        'worktree /Users/test/project',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /Users/test/.flywheel/worktrees/project/brave-eagle-042',
        'HEAD def456',
        'branch refs/heads/brave-eagle-042',
        ''
      ].join('\n')

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, porcelainOutput)
      })

      const worktrees = await manager.listWorktrees('/Users/test/project')
      expect(worktrees).toHaveLength(2)
      expect(worktrees[0]).toEqual({ path: '/Users/test/project', branch: 'main' })
      expect(worktrees[1]).toEqual({ path: '/Users/test/.flywheel/worktrees/project/brave-eagle-042', branch: 'brave-eagle-042' })
    })
  })

  describe('isGitRepo', () => {
    it('returns true for git repos', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, 'true\n')
      })
      expect(await manager.isGitRepo('/test/project')).toBe(true)
    })

    it('returns false for non-git directories', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('not a git repo'))
      })
      expect(await manager.isGitRepo('/test/not-git')).toBe(false)
    })
  })

  describe('getDefaultBranch', () => {
    it('returns current branch name', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, 'main\n')
      })
      expect(await manager.getDefaultBranch('/test/project')).toBe('main')
    })
  })
})
