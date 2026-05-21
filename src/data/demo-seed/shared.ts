// 데모 시드 전반에서 쓰이는 공통 키/라벨 타입.
// `time` 은 빌드타임 표시용이므로 현재 시각에 따라 상대 라벨로 표시되도록
// (today/yesterday/...) 분리 — 실제 Date 가 아니다.

export type DemoRelativeDay =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'd2ago'
  | 'd3ago'
  | 'd4ago'

export type DemoTimeLabel = {
  day: DemoRelativeDay
  time: string
}

export const DEMO_GUILD_NAME = 'Emberfall'
export const DEMO_GUILD_SLUG = 'emberfall'
export const DEMO_ALLIANCE_TAG = 'DUSK'
