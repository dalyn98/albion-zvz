export const AGM_BATTLES_COLLECTION_PAUSED = true
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

export function getAgmBattlesCollectionPausePayload(
  area: AgmBattlesCollectionPauseArea,
): AgmBattlesCollectionPausePayload {
  return {
    paused: true,
    feature: 'agm-battles-collection',
    area,
    reason: AGM_BATTLES_COLLECTION_PAUSE_REASON,
    message: 'AGM Battles public collection is paused to avoid unnecessary cost while there are no active users.',
  }
}
