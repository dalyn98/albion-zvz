import type { TentativeSlotRecommendationOption } from './event-tentative-signups'

export function formatTentativeSlotRecommendationLabel(
  slot: TentativeSlotRecommendationOption,
  weaponName: string,
): string {
  return `${slot.partyNumber}-${slot.slotNumber} (${weaponName})`
}
