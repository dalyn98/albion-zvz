// 길드 단위 "이번 주" at-a-glance 집계. 홈 페이지 상단에 작은 위젯으로 노출.
// /battles 와 동일한 low-engagement 컷을 적용해 진짜 ZvZ 만 집계 (1:1 갱킹 제외).
//
// 주 경계는 미국 태평양 시간(PT) 월요일 00:00 으로 사이트 전역 통일
// (timezone.ts:getCurrentWeekStartIso). 길드 timezone 과 무관 — Discord 길드의
// 일반적 주간 운영 관행과 일치시키기 위함.
//
// 별도의 helper 로 두는 이유: tracked-kills.ts 의 fetchTrackedBattleWindows 는
// 시간창/매칭에 특화돼 있어 home_kills/home_deaths 를 출력에서 제거한다. 위젯은
// 그 두 값이 필요해 별도로 같은 컷 로직을 적용하면서 raw 합계를 유지한다.

import { loadGuildBattleRollup } from '@/lib/guild-battle-rollup'
import { getCurrentWeekStartIso } from '@/lib/timezone'

export interface GuildWeeklyStats {
  battleCount: number
  winCount: number
  lossCount: number
  tieCount: number
  totalKills: number
  totalDeaths: number
  sinceIso: string
}

export async function loadGuildWeeklyStats(guildId: string): Promise<GuildWeeklyStats> {
  const sinceIso = getCurrentWeekStartIso()
  const rollup = await loadGuildBattleRollup(guildId, sinceIso)
  return {
    ...rollup,
    sinceIso,
  }
}
