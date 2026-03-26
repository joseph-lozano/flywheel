import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import { DEFAULT_CONFIG, mergeConfigs } from '../shared/config'
import type { FlywheelConfig } from '../shared/config'

export class ConfigManager {
  private config: FlywheelConfig = structuredClone(DEFAULT_CONFIG)
  private projectPath: string | null = null

  load(projectPath: string): void {
    this.projectPath = projectPath
    this.config = this.buildConfig()
  }

  reload(): void {
    this.config = this.buildConfig()
  }

  get(): FlywheelConfig {
    return this.config
  }

  private buildConfig(): FlywheelConfig {
    const layers: Partial<FlywheelConfig>[] = []

    if (this.projectPath) {
      const local = this.readYaml(join(this.projectPath, 'flywheel.local.yaml'))
      if (local) layers.push(local)
    }

    if (this.projectPath) {
      const project = this.readYaml(join(this.projectPath, 'flywheel.yaml'))
      if (project) layers.push(project)
    }

    const globalPath = this.getGlobalConfigPath()
    if (globalPath) {
      const global = this.readYaml(globalPath)
      if (global) layers.push(global)
    }

    return mergeConfigs(layers)
  }

  private getGlobalConfigPath(): string {
    const xdgHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || '', '.config')
    return join(xdgHome, 'flywheel.yaml')
  }

  private readYaml(path: string): Partial<FlywheelConfig> | null {
    if (!existsSync(path)) return null
    try {
      const content = readFileSync(path, 'utf-8')
      const parsed = parseYaml(content)
      if (parsed && typeof parsed === 'object') return parsed
      return null
    } catch (e) {
      console.warn(`Failed to parse config file ${path}:`, e)
      return null
    }
  }
}
