import { describe, expect, it } from "vitest";
import {
  computeLayout,
  computeMaxScroll,
  computeScrollToCenter,
  computeVisibility,
} from "../../src/renderer/src/layout/engine";
import type { Panel } from "../../src/shared/types";

const mkPanel = (id: string): Panel => ({
  id,
  type: "terminal" as const,
  color: "#000",
  label: id,
});

describe("computeVisibility", () => {
  const vw = 1000;
  const pw = 500;

  it("returns visible when panel intersects viewport", () => {
    expect(computeVisibility(0, pw, vw)).toBe("visible");
    expect(computeVisibility(499, pw, vw)).toBe("visible");
    expect(computeVisibility(-499, pw, vw)).toBe("visible");
  });

  it("returns hidden when within buffer zone", () => {
    expect(computeVisibility(-600, pw, vw)).toBe("hidden");
    expect(computeVisibility(1100, pw, vw)).toBe("hidden");
  });

  it("returns hidden when beyond buffer zone (destroy disabled)", () => {
    expect(computeVisibility(-1600, pw, vw)).toBe("hidden");
    expect(computeVisibility(2100, pw, vw)).toBe("hidden");
  });

  it("returns visible for panel partially on-screen", () => {
    expect(computeVisibility(-499, pw, vw)).toBe("visible");
  });
});

describe("computeLayout", () => {
  const panels = [mkPanel("a"), mkPanel("b"), mkPanel("c")];

  it("positions panels left-to-right with gap", () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout).toHaveLength(3);
    expect(layout[0].contentBounds.x).toBe(0);
    expect(layout[1].contentBounds.x).toBe(508);
    expect(layout[2].contentBounds.x).toBe(1016);
  });

  it("offsets panels by scrollOffset", () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 200,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].contentBounds.x).toBe(-200);
    expect(layout[1].contentBounds.x).toBe(308);
  });

  it("positions panels at strip top padding", () => {
    const layout = computeLayout({
      panels: [mkPanel("a")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].contentBounds.y).toBe(8);
  });

  it("computes panel height from viewport", () => {
    const layout = computeLayout({
      panels: [mkPanel("a")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    // 600 - 8(top) - 32(hint) - 4(scroll) = 556
    expect(layout[0].contentBounds.height).toBe(556);
  });

  it("assigns visibility based on viewport position", () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].visibility).toBe("visible");
    expect(layout[1].visibility).toBe("visible");
    expect(layout[2].visibility).toBe("hidden");
  });

  it("returns empty array for no panels", () => {
    const layout = computeLayout({
      panels: [],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout).toHaveLength(0);
  });
});

describe("computeMaxScroll", () => {
  it("returns 0 for no panels", () => {
    expect(computeMaxScroll(0, 1000)).toBe(0);
  });
  it("returns 0 when all panels fit", () => {
    expect(computeMaxScroll(1, 1000)).toBe(0);
  });
  it("returns correct max for multiple panels", () => {
    expect(computeMaxScroll(3, 1000)).toBe(516);
  });
});

describe("computeScrollToCenter", () => {
  it("left-aligns first panel (clamps to 0)", () => {
    expect(computeScrollToCenter(0, 3, 1000)).toBe(0);
  });
  it("left-aligns middle panel", () => {
    // panel 1 stripX = 1 * (500 + 8) = 508
    expect(computeScrollToCenter(1, 3, 1000)).toBe(508);
  });
  it("clamps to max scroll for last panel", () => {
    expect(computeScrollToCenter(2, 3, 1000)).toBe(516);
  });
});

describe("single panel uses full width", () => {
  it("single panel takes full effective width", () => {
    const layout = computeLayout({
      panels: [mkPanel("a")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].contentBounds.width).toBe(1000);
  });

  it("two panels use half width each", () => {
    const layout = computeLayout({
      panels: [mkPanel("a"), mkPanel("b")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].contentBounds.width).toBe(500);
    expect(layout[1].contentBounds.width).toBe(500);
  });
});

describe("sidebarWidth support", () => {
  const panels = [mkPanel("a"), mkPanel("b"), mkPanel("c")];

  it("computeLayout shifts x coordinates by sidebarWidth", () => {
    const layout = computeLayout({
      panels,
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
      sidebarWidth: 200,
    });
    expect(layout[0].contentBounds.x).toBe(200);
    expect(layout[0].contentBounds.width).toBe(400);
  });

  it("computeLayout uses effective width for panel sizing", () => {
    const layout = computeLayout({
      panels: [mkPanel("a")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
      sidebarWidth: 200,
    });
    expect(layout[0].contentBounds.width).toBe(800);
  });

  it("computeMaxScroll uses effective width", () => {
    expect(computeMaxScroll(3, 1000, 200)).toBe(416);
  });

  it("computeScrollToCenter uses effective width", () => {
    expect(computeScrollToCenter(0, 3, 1000, 200)).toBe(0);
  });

  it("defaults sidebarWidth to 0", () => {
    const layout = computeLayout({
      panels: [mkPanel("a")],
      scrollOffset: 0,
      viewportWidth: 1000,
      viewportHeight: 600,
    });
    expect(layout[0].contentBounds.x).toBe(0);
    expect(layout[0].contentBounds.width).toBe(1000);
  });

  it("computeVisibility uses sidebarWidth as left boundary", () => {
    // Panel behind sidebar: screenX=-10, width=200, panelRight=190 < sidebarWidth=200 → hidden
    expect(computeVisibility(-10, 200, 1000, 200)).toBe("hidden");
    // Panel partially visible: screenX=150, width=200, panelRight=350 > sidebarWidth=200 → visible
    expect(computeVisibility(150, 200, 1000, 200)).toBe("visible");
  });
});
