import { LAYOUT } from '../../../shared/constants'
import type { Panel, PanelLayout, VisibilityState } from '../../../shared/types'

export interface LayoutInput {
  panels: Panel[]
  scrollOffset: number
  viewportWidth: number
  viewportHeight: number
}

export function computeVisibility(screenX: number, panelWidth: number, viewportWidth: number): VisibilityState {
  const panelRight = screenX + panelWidth
  const bufferZone = viewportWidth * LAYOUT.BUFFER_ZONE_MULTIPLIER
  if (panelRight > 0 && screenX < viewportWidth) return 'visible'
  if (panelRight > -bufferZone && screenX < viewportWidth + bufferZone) return 'hidden'
  return 'destroyed'
}

export function computeLayout(input: LayoutInput): PanelLayout[] {
  const { panels, scrollOffset, viewportWidth, viewportHeight } = input
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const stripHeight = viewportHeight - LAYOUT.STRIP_TOP_PADDING - LAYOUT.HINT_BAR_HEIGHT - LAYOUT.SCROLL_TRACK_HEIGHT
  const contentHeight = stripHeight - LAYOUT.TITLE_BAR_HEIGHT
  const contentTop = LAYOUT.STRIP_TOP_PADDING + LAYOUT.TITLE_BAR_HEIGHT

  return panels.map((panel, index) => {
    const stripX = index * (panelWidth + LAYOUT.PANEL_GAP)
    const screenX = stripX - scrollOffset
    return {
      panelId: panel.id,
      contentBounds: { x: screenX, y: contentTop, width: panelWidth, height: contentHeight },
      titleBarBounds: { x: screenX, y: LAYOUT.STRIP_TOP_PADDING, width: panelWidth, height: LAYOUT.TITLE_BAR_HEIGHT },
      visibility: computeVisibility(screenX, panelWidth, viewportWidth)
    }
  })
}

export function computeMaxScroll(panelCount: number, viewportWidth: number): number {
  if (panelCount === 0) return 0
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const totalStripWidth = panelCount * panelWidth + (panelCount - 1) * LAYOUT.PANEL_GAP
  return Math.max(0, totalStripWidth - viewportWidth)
}

export function computeScrollToCenter(panelIndex: number, panelCount: number, viewportWidth: number): number {
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const stripX = panelIndex * (panelWidth + LAYOUT.PANEL_GAP)
  const centerOffset = stripX - (viewportWidth - panelWidth) / 2
  return Math.max(0, Math.min(centerOffset, computeMaxScroll(panelCount, viewportWidth)))
}

export function findMostCenteredPanel(scrollOffset: number, panelCount: number, viewportWidth: number): number {
  if (panelCount === 0) return -1
  const panelWidth = Math.round(viewportWidth * LAYOUT.DEFAULT_PANEL_WIDTH_RATIO)
  const viewportCenter = scrollOffset + viewportWidth / 2
  let closestIndex = 0, closestDistance = Infinity
  for (let i = 0; i < panelCount; i++) {
    const panelCenter = i * (panelWidth + LAYOUT.PANEL_GAP) + panelWidth / 2
    const distance = Math.abs(panelCenter - viewportCenter)
    if (distance < closestDistance) { closestDistance = distance; closestIndex = i }
  }
  return closestIndex
}
