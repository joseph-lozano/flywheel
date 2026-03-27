import { describe, expect, it } from "vitest";
import { goldenAngleColor } from "../../src/shared/constants";

describe("goldenAngleColor", () => {
  it("returns an hsl string", () => {
    expect(goldenAngleColor(0)).toMatch(/^hsl\(\d+(\.\d+)?, 65%, 65%\)$/);
  });

  it("produces different hues for different indices", () => {
    const colors = [0, 1, 2, 3, 4].map(goldenAngleColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(5);
  });

  it("wraps hue around 360", () => {
    const color = goldenAngleColor(3);
    expect(color).toMatch(/^hsl\(\d+(\.\d+)?, 65%, 65%\)$/);
  });
});
