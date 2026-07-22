export interface EventPublishSummary {
  visibleSlots: number
  hiddenSlots: number
  assignedSlots: number
  emptySlots: number
  tentativeCount: number
  hasNotificationChannel: boolean
}

export interface EventPublishSlotState {
  isHidden: boolean
  assignedDiscordId: string | null
}

export function summarizeEventPublishState(input: {
  slots: readonly EventPublishSlotState[]
  tentativeCount: number
  eventNotificationChannelId: string | null
  tenantNotificationChannelId: string | null
}): EventPublishSummary {
  const visibleSlots = input.slots.filter((slot) => !slot.isHidden).length
  const hiddenSlots = input.slots.length - visibleSlots
  const assignedSlots = input.slots.filter((slot) => !!slot.assignedDiscordId).length
  const emptySlots = input.slots.filter(
    (slot) => !slot.isHidden && !slot.assignedDiscordId,
  ).length
  return {
    visibleSlots,
    hiddenSlots,
    assignedSlots,
    emptySlots,
    tentativeCount: Math.max(0, Math.trunc(input.tentativeCount)),
    hasNotificationChannel: !!(
      input.eventNotificationChannelId ?? input.tenantNotificationChannelId
    ),
  }
}
