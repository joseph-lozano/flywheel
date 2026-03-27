import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, mergeConfigs } from '../../src/shared/config'
import type { FlywheelConfig } from '../../src/shared/config'

describe('config defaults', () => {
  it('DEFAULT_CONFIG has expected shape', () => {
    expect(DEFAULT_CONFIG.preferences.terminal.fontFamily).toBe('monospace')
    expect(DEFAULT_CONFIG.preferences.terminal.fontSize).toBe(14)
    expect(DEFAULT_CONFIG.preferences.browser.defaultZoom).toBe(0)
    expect(DEFAULT_CONFIG.preferences.app.defaultZoom).toBe(0)
  })
})

describe('mergeConfigs', () => {
  it('returns defaults when no overrides provided', () => {
    const result = mergeConfigs([])
    expect(result).toEqual(DEFAULT_CONFIG)
  })

  it('overrides scalar values from higher-precedence config', () => {
    const override: Partial<FlywheelConfig> = {
      preferences: {
        terminal: { fontFamily: 'JetBrains Mono', fontSize: 18 },
        browser: { defaultZoom: 0 },
        app: { defaultZoom: 0 }
      }
    }
    const result = mergeConfigs([override])
    expect(result.preferences.terminal.fontFamily).toBe('JetBrains Mono')
    expect(result.preferences.terminal.fontSize).toBe(18)
  })

  it('deep merges partial overrides', () => {
    const override = {
      preferences: {
        terminal: { fontSize: 20 }
      }
    }
    const result = mergeConfigs([override as any])
    expect(result.preferences.terminal.fontSize).toBe(20)
    expect(result.preferences.terminal.fontFamily).toBe('monospace')
    expect(result.preferences.browser.defaultZoom).toBe(0)
  })

  it('first config in array takes precedence', () => {
    const local = { preferences: { terminal: { fontSize: 20 } } }
    const project = { preferences: { terminal: { fontSize: 16 } } }
    const result = mergeConfigs([local as any, project as any])
    expect(result.preferences.terminal.fontSize).toBe(20)
  })
})
