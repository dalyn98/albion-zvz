export const VISUAL_REFRESH_V3_SETTING_KEY = 'visual_refresh_v3_enabled' as const

export type QueueCountTone = 'neutral' | 'attention' | 'danger'

export function isVisualRefreshV3Enabled(rawValue: string): boolean {
  return rawValue === 'true'
}

export function getQueueCountTone({
  count,
  isOverdue,
}: Readonly<{
  count: number
  isOverdue: boolean
}>): QueueCountTone {
  if (count <= 0) return 'neutral'
  return isOverdue ? 'danger' : 'attention'
}
