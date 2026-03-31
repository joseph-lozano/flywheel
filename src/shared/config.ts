export interface FlywheelConfig {
  preferences: {
    terminal: {
      fontFamily: string;
      fontSize: number;
    };
    browser: {
      defaultZoom: number;
    };
    app: {
      defaultZoom: number;
    };
  };
}

export const DEFAULT_CONFIG: FlywheelConfig = {
  preferences: {
    terminal: {
      fontFamily: "monospace",
      fontSize: 14,
    },
    browser: {
      defaultZoom: 0,
    },
    app: {
      defaultZoom: 0,
    },
  },
};

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function mergeConfigs(layers: Partial<FlywheelConfig>[]): FlywheelConfig {
  let result = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  for (let i = layers.length - 1; i >= 0; i--) {
    result = deepMerge(result, layers[i] as unknown as Record<string, unknown>);
  }
  return result as unknown as FlywheelConfig;
}
