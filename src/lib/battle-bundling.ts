// 같은 albion_battle_id (= battle_record_id) 안에서 매치업 분리된
// tenant_battle_records row 들을 "1전투" 단위로 묶는 helper.
//
// 배경: 마이그 098 이후로 한 albion battle 이 여러 main_opponent_force 와 교전하면
// tenant_battle_records 에 force 당 1행씩 들어간다 (UNIQUE: guild_id +
// battle_record_id + main_opponent_force_key). /battles 목록 표시는 분리한 그대로
// 노출하지만 통계/업적의 "전투 카운트" 류 메트릭은 동일 albion battle 을 1로
// 묶어야 자연스럽다.
//
// 묶음 규칙:
//   - K/D (home_kills, home_deaths): force 별 페어 필터링이라 force 끼리 disjoint —
//     단순 합산.
//   - home_team_size: 같은 albion battle 안에서 동일하므로 그대로 (max 안전망).
//   - main_opponent_team_size: 가장 큰 force 의 값 (= main row 채택).
//   - outcome: 가장 큰 main_opponent_team_size 를 가진 row 의 outcome 채택.
//     ("진짜 메인 매치업" 의 결과를 1전투의 outcome 으로 본다.)
//   - low-engagement 컷: 합산 K/D + max home_team_size 로 재평가하되 컷은 caller 가
//     하도록 결과만 노출 (이 helper 는 raw 묶음 결과만 반환).

export interface BundleableRow {
  battle_record_id: string
  outcome: string
  home_kills: number
  home_deaths: number
  home_team_size: number
  main_opponent_team_size: number
}

export interface BundledBattle {
  battleRecordId: string
  outcome: string
  homeKills: number
  homeDeaths: number
  homeTeamSize: number
  mainOpponentTeamSize: number
}

export function bundleSplitBattles<T extends BundleableRow>(
  rows: ReadonlyArray<T>,
): BundledBattle[] {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.battle_record_id
    const list = grouped.get(key)
    if (list) list.push(row)
    else grouped.set(key, [row])
  }

  const bundled: BundledBattle[] = []
  for (const [battleRecordId, group] of grouped) {
    let homeKills = 0
    let homeDeaths = 0
    let homeTeamSize = 0
    let mainRow: T = group[0]
    for (const row of group) {
      homeKills += row.home_kills ?? 0
      homeDeaths += row.home_deaths ?? 0
      const teamSize = row.home_team_size ?? 0
      if (teamSize > homeTeamSize) homeTeamSize = teamSize
      const mainSize = row.main_opponent_team_size ?? 0
      const currentMainSize = mainRow.main_opponent_team_size ?? 0
      if (mainSize > currentMainSize) mainRow = row
    }
    bundled.push({
      battleRecordId,
      outcome: mainRow.outcome,
      homeKills,
      homeDeaths,
      homeTeamSize,
      mainOpponentTeamSize: mainRow.main_opponent_team_size ?? 0,
    })
  }
  return bundled
}
