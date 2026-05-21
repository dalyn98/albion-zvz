// 이벤트 사후 리포트. 전투 종료 후 멤버들이 결과를 한눈에 확인할 수 있도록
// 참여/전투/생존/리기어 4개 영역으로 집계한다.
// - 모든 계산은 pure function. 쿼리 결과를 인자로 받고 가공만.
// - 쿼리 계층은 events, parties, slots, killboard_events, regear_requests 를
//   읽고, 이 모듈은 이미 로드된 rows 만 집계한다.

export interface EventReportSlot {
  assigned_discord_id: string | null
  role_name: string | null
}

export interface EventReportKillboard {
  discord_id: string
  role: 'killer' | 'victim'
  occurred_at: string
}

export interface EventReportRegear {
  status: 'pending' | 'approved' | 'rejected'
  payout_silver: number | null
}

export interface EventReportBattle {
  battle_number: number
  opponent_guild: string
  outcome: 'win' | 'loss'
}

export interface EventReportProfile {
  discord_id: string
  username: string
  avatar: string | null
}

export interface CombatLeader {
  discord_id: string
  username: string
  avatar: string | null
  kills: number
  deaths: number
  ratio: number | null // null = deaths 0 && kills 0
}

export interface EventReport {
  battles: EventReportBattle[]
  participation: {
    totalSlots: number
    assignedSlots: number
    uniqueAttendees: number
    // 역할별 분포. 가장 많은 역할부터 desc.
    roleBreakdown: Array<{ role: string; count: number }>
  }
  combat: {
    totalKills: number
    totalDeaths: number
    kdRatio: number | null
    topKillers: CombatLeader[]
    topKD: CombatLeader[]
  }
  survival: {
    attended: number
    died: number
    survived: number
    rate: number | null // 0..1
  }
  regear: {
    totalClaims: number
    approvedCount: number
    pendingCount: number
    rejectedCount: number
    totalPayoutSilver: number
  }
}

const TOP_N = 5
// K/D 랭킹 노이즈 컷. 이벤트 스코프라 리더보드보다 관대하게 3.
const MIN_EVENTS_FOR_KD_RANK = 3

export function buildEventReport(input: {
  slots: EventReportSlot[]
  killboard: EventReportKillboard[]
  regear: EventReportRegear[]
  battles: EventReportBattle[]
  profiles: Map<string, EventReportProfile>
}): EventReport {
  const { slots, killboard, regear, battles, profiles } = input

  const totalSlots = slots.length
  const assignedSlots = slots.filter((s) => s.assigned_discord_id).length
  const attendees = new Set<string>()
  const roleCount = new Map<string, number>()
  for (const s of slots) {
    if (!s.assigned_discord_id) continue
    attendees.add(s.assigned_discord_id)
    const role = s.role_name ?? '기타'
    roleCount.set(role, (roleCount.get(role) ?? 0) + 1)
  }
  const roleBreakdown = [...roleCount.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)

  interface CombatAgg {
    kills: number
    deaths: number
  }
  const combat = new Map<string, CombatAgg>()
  let totalKills = 0
  let totalDeaths = 0
  const diedSet = new Set<string>()
  for (const ke of killboard) {
    let entry = combat.get(ke.discord_id)
    if (!entry) {
      entry = { kills: 0, deaths: 0 }
      combat.set(ke.discord_id, entry)
    }
    if (ke.role === 'killer') {
      entry.kills += 1
      totalKills += 1
    } else {
      entry.deaths += 1
      totalDeaths += 1
      diedSet.add(ke.discord_id)
    }
  }

  const kdRatio =
    totalDeaths > 0
      ? totalKills / totalDeaths
      : totalKills > 0
        ? totalKills
        : null

  // 이벤트 참여자(슬롯 배정자) 중 킬보드에 등장한 사람만 전적으로 집계.
  // 게스트/참여 안한 킬은 전적에 안 들어가도록 profiles 로 필터.
  const combatLeaders: CombatLeader[] = []
  for (const [discordId, agg] of combat) {
    const profile = profiles.get(discordId)
    if (!profile) continue
    const ratio =
      agg.deaths > 0
        ? agg.kills / agg.deaths
        : agg.kills > 0
          ? agg.kills
          : null
    combatLeaders.push({
      discord_id: discordId,
      username: profile.username,
      avatar: profile.avatar,
      kills: agg.kills,
      deaths: agg.deaths,
      ratio,
    })
  }

  const topKillers = [...combatLeaders]
    .filter((c) => c.kills > 0)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, TOP_N)

  const topKD = [...combatLeaders]
    .filter(
      (c) => c.ratio !== null && c.kills + c.deaths >= MIN_EVENTS_FOR_KD_RANK,
    )
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
    .slice(0, TOP_N)

  const attended = attendees.size
  const died = [...diedSet].filter((id) => attendees.has(id)).length
  const survived = attended - died
  const survivalRate = attended > 0 ? survived / attended : null

  let approvedCount = 0
  let pendingCount = 0
  let rejectedCount = 0
  let totalPayoutSilver = 0
  for (const r of regear) {
    if (r.status === 'approved') {
      approvedCount += 1
      if (r.payout_silver) totalPayoutSilver += r.payout_silver
    } else if (r.status === 'pending') {
      pendingCount += 1
    } else if (r.status === 'rejected') {
      rejectedCount += 1
    }
  }

  return {
    battles: [...battles].sort((a, b) => a.battle_number - b.battle_number),
    participation: {
      totalSlots,
      assignedSlots,
      uniqueAttendees: attended,
      roleBreakdown,
    },
    combat: {
      totalKills,
      totalDeaths,
      kdRatio,
      topKillers,
      topKD,
    },
    survival: {
      attended,
      died,
      survived,
      rate: survivalRate,
    },
    regear: {
      totalClaims: regear.length,
      approvedCount,
      pendingCount,
      rejectedCount,
      totalPayoutSilver,
    },
  }
}
