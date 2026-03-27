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
      if (parsed && typeof parsed === 'object') {
        this.validateTypes(parsed, path)
        return parsed
      }
      return null
    } catch (e) {
      console.warn(`Failed to parse config file ${path}:`, e)
      return null
    }
  }

  private validateTypes(obj: any, path: string): void {
    const prefs = obj.preferences
    if (!prefs || typeof prefs !== 'object') return

    const terminal = prefs.terminal
    if (terminal && typeof terminal === 'object') {
      if (terminal.fontFamily !== undefined && typeof terminal.fontFamily !== 'string') {
        console.warn(`Invalid terminal.fontFamily in ${path}, expected string`)
        delete terminal.fontFamily
      }
      if (terminal.fontSize !== undefined && typeof terminal.fontSize !== 'number') {
        console.warn(`Invalid terminal.fontSize in ${path}, expected number`)
        delete terminal.fontSize
      }
    }

    const browser = prefs.browser
    if (browser && typeof browser === 'object') {
      if (browser.defaultZoom !== undefined && typeof browser.defaultZoom !== 'number') {
        console.warn(`Invalid browser.defaultZoom in ${path}, expected number`)
        delete browser.defaultZoom
      }
    }

    const appPrefs = prefs.app
    if (appPrefs && typeof appPrefs === 'object') {
      if (appPrefs.defaultZoom !== undefined && typeof appPrefs.defaultZoom !== 'number') {
        console.warn(`Invalid app.defaultZoom in ${path}, expected number`)
        delete appPrefs.defaultZoom
      }
    }
  }
}
