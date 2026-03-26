export interface FlywheelConfig {
  preferences: {
    terminal: {
      fontFamily: string
      fontSize: number
    }
    browser: {
      defaultZoom: number
    }
    app: {
      defaultZoom: number
    }
  }
}

export const DEFAULT_CONFIG: FlywheelConfig = {
  preferences: {
    terminal: {
      fontFamily: 'monospace',
      fontSize: 14
    },
    browser: {
      defaultZoom: 0
    },
    app: {
      defaultZoom: 0
    }
  }
}

function deepMerge(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function mergeConfigs(layers: Partial<FlywheelConfig>[]): FlywheelConfig {
  let result: FlywheelConfig = structuredClone(DEFAULT_CONFIG)
  for (let i = layers.length - 1; i >= 0; i--) {
    result = deepMerge(result, layers[i])
  }
  return result
}
