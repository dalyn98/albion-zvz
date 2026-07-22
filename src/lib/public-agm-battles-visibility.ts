import { AGM_BATTLES_COLLECTION_PAUSED } from '@/lib/agm-battles-collection-pause'
import { BATTLELOG_FEATURES_PAUSED } from '@/lib/battlelog-pause'

export type PublicAgmBattlesPauseReason =
  | 'battlelog-paused'
  | 'public-collection-paused'

export interface PublicAgmBattlesVisibilityInput {
  battlelogPaused: boolean
  publicCollectionPaused: boolean
}

export interface PublicAgmBattlesVisibility {
  isNavigationVisible: boolean
  shouldShowPausedPanel: boolean
  reason: PublicAgmBattlesPauseReason | null
}

export function resolvePublicAgmBattlesVisibility(
  input: PublicAgmBattlesVisibilityInput,
): PublicAgmBattlesVisibility {
  if (input.battlelogPaused) {
    return {
      isNavigationVisible: false,
      shouldShowPausedPanel: true,
      reason: 'battlelog-paused',
    }
  }

  if (input.publicCollectionPaused) {
    return {
      isNavigationVisible: false,
      shouldShowPausedPanel: true,
      reason: 'public-collection-paused',
    }
  }

  return {
    isNavigationVisible: true,
    shouldShowPausedPanel: false,
    reason: null,
  }
}

export const PUBLIC_AGM_BATTLES_VISIBILITY = resolvePublicAgmBattlesVisibility({
  battlelogPaused: BATTLELOG_FEATURES_PAUSED,
  publicCollectionPaused: AGM_BATTLES_COLLECTION_PAUSED,
})

export const PUBLIC_AGM_BATTLES_AVAILABLE =
  PUBLIC_AGM_BATTLES_VISIBILITY.isNavigationVisible

export function arePublicAgmBattlesAvailable(): boolean {
  return PUBLIC_AGM_BATTLES_AVAILABLE
}
