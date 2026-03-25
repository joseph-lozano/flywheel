import { execFile } from 'child_process'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const ADJECTIVES = [
  'brave', 'calm', 'cool', 'dark', 'deep', 'dry', 'fair', 'fast', 'firm', 'flat',
  'free', 'glad', 'gold', 'good', 'gray', 'keen', 'kind', 'late', 'lean', 'long',
  'mild', 'neat', 'new', 'nice', 'old', 'pale', 'pure', 'raw', 'red', 'rich',
  'safe', 'shy', 'slim', 'soft', 'tall', 'thin', 'true', 'warm', 'wide', 'wild',
  'wise', 'bold', 'cold', 'dull', 'even', 'fine', 'full', 'high', 'low', 'swift'
]

const NOUNS = [
  'arch', 'bear', 'bird', 'cave', 'clay', 'dawn', 'deer', 'dove', 'dune', 'eagle',
  'elm', 'fern', 'fire', 'fish', 'frog', 'glen', 'hare', 'hawk', 'hill', 'iris',
  'jade', 'lake', 'leaf', 'lily', 'lynx', 'moon', 'moss', 'oak', 'owl', 'peak',
  'pine', 'pond', 'rain', 'reed', 'reef', 'ridge', 'river', 'rock', 'rose', 'sage',
  'snow', 'star', 'stone', 'swan', 'tide', 'vale', 'vine', 'wave', 'wind', 'wolf'
]

export interface WorktreeInfo {
  path: string
  branch: string
}

export class WorktreeManager {
  private worktreeRoot: string

  constructor(worktreeRoot?: string) {
    this.worktreeRoot = worktreeRoot || join(homedir(), '.flywheel', 'worktrees')
  }

  generateName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const num = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    return `${adj}-${noun}-${num}`
  }

  getWorktreePath(projectName: string, worktreeName: string): string {
    return join(this.worktreeRoot, projectName, worktreeName)
  }

  async resolveBase(projectPath: string): Promise<string> {
    try {
      return await this.git(projectPath, ['rev-parse', '--verify', 'origin/HEAD'])
    } catch {
      return await this.git(projectPath, ['rev-parse', '--verify', 'HEAD'])
    }
  }

  async createWorktree(projectPath: string, branchName: string, worktreePath: string, base: string): Promise<void> {
    const dir = join(worktreePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await this.git(projectPath, ['worktree', 'add', '-b', branchName, worktreePath, base])
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    await this.git(projectPath, ['worktree', 'remove', worktreePath])
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const output = await this.git(projectPath, ['worktree', 'list', '--porcelain'])
    const worktrees: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        current.path = line.slice('worktree '.length)
      } else if (line.startsWith('branch refs/heads/')) {
        current.branch = line.slice('branch refs/heads/'.length)
      } else if (line === '' && current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch || 'detached'
        })
        current = {}
      }
    }

    // flush last entry if output didn't end with a blank line
    if (current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch || 'detached'
      })
    }

    return worktrees
  }

  async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      await this.git(dirPath, ['rev-parse', '--is-inside-work-tree'])
      return true
    } catch {
      return false
    }
  }

  async getDefaultBranch(projectPath: string): Promise<string> {
    return await this.git(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  }

  private git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', ['-C', cwd, ...args], {}, (error, stdout) => {
        if (error) reject(error)
        else resolve((stdout as string).trim())
      })
    })
  }
}
