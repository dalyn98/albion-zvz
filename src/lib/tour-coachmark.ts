export interface TourTargetRect {
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export interface TourCoachmarkPosition {
  top: number
  left: number
  width: number
  right: 'auto'
  bottom: 'auto'
  maxWidth: 'none'
  transform: 'none'
}

const VIEWPORT_GUTTER = 12
const TARGET_GAP = 14
const DEFAULT_WIDTH = 420
const ESTIMATED_HEIGHT = 220

export function getTourCoachmarkPosition(
  rect: Readonly<TourTargetRect>,
): TourCoachmarkPosition | undefined {
  if (rect.viewportWidth < 640) return undefined

  const width = Math.min(DEFAULT_WIDTH, rect.viewportWidth - VIEWPORT_GUTTER * 2)
  const targetCenter = rect.left + rect.width / 2
  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, targetCenter - width / 2),
    rect.viewportWidth - width - VIEWPORT_GUTTER,
  )
  const below = rect.top + rect.height + TARGET_GAP
  const top = below + ESTIMATED_HEIGHT <= rect.viewportHeight - VIEWPORT_GUTTER
    ? below
    : Math.max(VIEWPORT_GUTTER, rect.top - ESTIMATED_HEIGHT - TARGET_GAP)

  return {
    top,
    left,
    width,
    right: 'auto',
    bottom: 'auto',
    maxWidth: 'none',
    transform: 'none',
  }
}
