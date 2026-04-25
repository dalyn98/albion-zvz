// "규모 대비 너무 적은 K/D" 컷 — tenant_battle_records 의 row 가 raw 적재는
// 됐어도 통계/업적/리스트 집계에서 제외되어야 하는지 판정. raw 데이터는 보존하되
// (기준 변경 시 재계산 가능) 표시/집계에서만 hide 한다.
//
// 컷 조건: (K+D < team_size × 10%) AND (D < 3)
//   - 비율 컷: 70명 길드가 K1/D0 같은 드라이브바이는 의미 없는 참여 → hide
//   - 절대 컷 면제: D >= 3 이면 "포지셔닝 실패해서 다 죽음" 진성 패배 → keep
//
// 두 조건 모두 충족 시에만 hide. 둘 중 하나라도 깨지면 의미 있는 전투로 판정.
//
// SQL 표현 (RPC 등): NOT ((kills+deaths) < team_size*0.1 AND deaths < 3)
// = (kills+deaths) >= team_size*0.1 OR deaths >= 3

export const LOW_ENGAGEMENT_RATIO = 0.1
export const LOW_ENGAGEMENT_DEATHS_FLOOR = 3

export interface EngagementSignals {
  homeKills: number
  homeDeaths: number
  homeTeamSize: number
}

export function isLowEngagement(signals: EngagementSignals): boolean {
  const ratio = (signals.homeKills + signals.homeDeaths) <
    signals.homeTeamSize * LOW_ENGAGEMENT_RATIO
  const tooFewDeaths = signals.homeDeaths < LOW_ENGAGEMENT_DEATHS_FLOOR
  return ratio && tooFewDeaths
}

export function isHighEngagement(signals: EngagementSignals): boolean {
  return !isLowEngagement(signals)
}
