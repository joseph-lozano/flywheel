import { LAYOUT } from "../../../shared/constants";
import type { Panel, PanelLayout, VisibilityState } from "../../../shared/types";

export interface LayoutInput {
  panels: Panel[];
  scrollOffset: number;
  viewportWidth: number;
  viewportHeight: number;
  sidebarWidth?: number;
}

export function computeVisibility(
  screenX: number,
  panelWidth: number,
  viewportWidth: number,
  sidebarWidth = 0,
): VisibilityState {
  const panelRight = screenX + panelWidth;
  if (panelRight > sidebarWidth && screenX < viewportWidth) return "visible";
  // TODO(phase6): Re-enable panel destruction for off-screen panels.
  // Currently all off-screen panels are hidden, never destroyed.
  // Profile memory with real terminals/browsers to decide buffer zone + destruction strategy.
  return "hidden";
}

export function computeLayout(input: LayoutInput): PanelLayout[] {
  const { panels, scrollOffset, viewportWidth, viewportHeight, sidebarWidth = 0 } = input;
  const effectiveWidth = viewportWidth - sidebarWidth;
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO);
  const panelTop = LAYOUT.STRIP_TOP_PADDING;
  const panelHeight =
    viewportHeight - LAYOUT.STRIP_TOP_PADDING - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT;

  return panels.map((panel, index) => {
    const stripX = index * (panelWidth + LAYOUT.PANEL_GAP);
    const screenX = stripX - scrollOffset + sidebarWidth;
    return {
      panelId: panel.id,
      contentBounds: { x: screenX, y: panelTop, width: panelWidth, height: panelHeight },
      visibility: computeVisibility(screenX, panelWidth, viewportWidth, sidebarWidth),
    };
  });
}

export function computeMaxScroll(
  panelCount: number,
  viewportWidth: number,
  sidebarWidth = 0,
): number {
  if (panelCount === 0) return 0;
  const effectiveWidth = viewportWidth - sidebarWidth;
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO);
  const totalStripWidth = panelCount * panelWidth + (panelCount - 1) * LAYOUT.PANEL_GAP;
  return Math.max(0, totalStripWidth - effectiveWidth);
}

export function computeScrollToCenter(
  panelIndex: number,
  panelCount: number,
  viewportWidth: number,
  sidebarWidth = 0,
): number {
  const effectiveWidth = viewportWidth - sidebarWidth;
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO);
  // Align the focused panel's left edge to the sidebar edge so no panel
  // is ever partially behind the sidebar (avoids terminal reflow from clipping).
  const target = panelIndex * (panelWidth + LAYOUT.PANEL_GAP);
  return Math.max(0, Math.min(target, computeMaxScroll(panelCount, viewportWidth, sidebarWidth)));
}

export function findMostCenteredPanel(
  scrollOffset: number,
  panelCount: number,
  viewportWidth: number,
  sidebarWidth = 0,
): number {
  if (panelCount === 0) return -1;
  const effectiveWidth = viewportWidth - sidebarWidth;
  const panelWidth = Math.round(effectiveWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO);
  const viewportCenter = scrollOffset + effectiveWidth / 2;
  let closestIndex = 0,
    closestDistance = Infinity;
  for (let i = 0; i < panelCount; i++) {
    const panelCenter = i * (panelWidth + LAYOUT.PANEL_GAP) + panelWidth / 2;
    const distance = Math.abs(panelCenter - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}
