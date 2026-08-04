export const AGM_BATTLES_COLLECTION_PAUSED = false
export const AGM_BATTLES_COLLECTION_PAUSE_REASON = 'cost_control_no_active_users'
export const AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS = 202

export type AgmBattlesCollectionPauseArea = 'public-battlelog'

export interface AgmBattlesCollectionPausePayload {
  paused: true
  feature: 'agm-battles-collection'
  area: AgmBattlesCollectionPauseArea
  reason: typeof AGM_BATTLES_COLLECTION_PAUSE_REASON
  message: string
}

export function areAgmBattlesCollectionPaused(): boolean {
  return AGM_BATTLES_COLLECTION_PAUSED
}

export function shouldCollectAgmBattles(): boolean {
  // AGM Battles is a public acquisition product. Collection continuity must
  // not depend on how many tenants happen to be active at cron time.
  return !AGM_BATTLES_COLLECTION_PAUSED
}

export function getAgmBattlesCollectionPausePayload(
  area: AgmBattlesCollectionPauseArea,
): AgmBattlesCollectionPausePayload {
  return {
    paused: true,
    feature: 'agm-battles-collection',
    area,
    reason: AGM_BATTLES_COLLECTION_PAUSE_REASON,
    message: 'AGM Battles public collection is paused by the operator kill switch.',
  }
}
