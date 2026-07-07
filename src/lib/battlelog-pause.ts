export const BATTLELOG_FEATURES_PAUSED = false
export const BATTLELOG_PAUSE_REASON = 'ui_ux_refresh'
export const BATTLELOG_PAUSED_API_STATUS = 503
export const BATTLELOG_PAUSED_CRON_STATUS = 202

export type BattlelogPauseArea =
  | 'battle-tracker'
  | 'killboard-sync'
  | 'killbot-feed'
  | 'public-battlelog'
  | 'battle-matchup-backfill'
  | 'battle-ledger-diff-report'
  | 'killboard-backfill-battle-id'
  | 'killboard-backfill-equipment'
  | 'stats-diagnose'
  | 'battle-summary-og'
  | 'battles-ui'
  | 'public-battlelog-ui'
  | 'killbot-ui'

export interface BattlelogPausePayload {
  paused: true
  feature: 'battlelog'
  area: BattlelogPauseArea
  reason: typeof BATTLELOG_PAUSE_REASON
  message: string
}

export function areBattlelogFeaturesPaused(): boolean {
  return BATTLELOG_FEATURES_PAUSED
}

export function getBattlelogPausePayload(area: BattlelogPauseArea): BattlelogPausePayload {
  return {
    paused: true,
    feature: 'battlelog',
    area,
    reason: BATTLELOG_PAUSE_REASON,
    message: 'Battlelog features are temporarily paused while the UI/UX refresh is in progress.',
  }
}
