interface PickerRect {
  top: number
  bottom: number
  right: number
}

interface PickerPositionInput {
  trigger: PickerRect
  panelWidth: number
  panelHeight: number
  viewportWidth: number
  viewportHeight: number
  viewportGap: number
  triggerGap: number
}

export function resolveTentativeSlotPickerPosition({
  trigger,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  viewportGap,
  triggerGap,
}: PickerPositionInput): { left: number; top: number } {
  const maxLeft = Math.max(viewportGap, viewportWidth - panelWidth - viewportGap)
  const left = Math.min(Math.max(viewportGap, trigger.right - panelWidth), maxLeft)
  const availableBelow = viewportHeight - trigger.bottom - triggerGap - viewportGap
  const availableAbove = trigger.top - triggerGap - viewportGap
  const placeBelow = panelHeight <= availableBelow || availableBelow >= availableAbove
  const unclampedTop = placeBelow
    ? trigger.bottom + triggerGap
    : trigger.top - panelHeight - triggerGap
  const maxTop = Math.max(viewportGap, viewportHeight - panelHeight - viewportGap)

  return {
    left,
    top: Math.min(Math.max(viewportGap, unclampedTop), maxTop),
  }
}
