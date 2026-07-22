// 이벤트 사후 리포트. 전투 종료 후 멤버들이 결과를 한눈에 확인할 수 있도록
// 신청/배정, 전투 확인 참석, 전투/생존/리기어 영역으로 집계한다.
// - 모든 계산은 pure function. 쿼리 결과를 인자로 받고 가공만.
// - 쿼리 계층은 events, parties, slots, killboard_events, raw_battle.players,
//   regear_requests 를 읽고, 이 모듈은 이미 로드된 rows 만 집계한다.

export interface EventReportSlot {
  assigned_discord_id: string | null
  role_name: string | null
}

export interface EventReportKillboard {
  discord_id: string | null
  albion_player_id: string | null
  role: 'killer' | 'victim'
  occurred_at: string
  battle_id: number | null
}

export interface EventReportRegear {
  status: 'pending' | 'approved' | 'rejected'
  payout_silver: number | null
}

export interface EventReportBattle {
  id: string
  battle_number: number
  albion_battle_id: number
  started_at: string
  opponent_force_name: string
  result_estimate: 'advantage' | 'disadvantage' | 'even' | 'unclear'
  projection_status: 'provisional' | 'final' | 'low_confidence'
  subject_kills: number
  subject_deaths: number
  subject_kill_fame: number
  opponent_kills: number
  opponent_deaths: number
  opponent_kill_fame: number
}

export interface EventReportProfile {
  discord_id: string
  username: string
  avatar: string | null
}

export interface EventReportBattleParticipation {
  discord_id: string | null
  albion_player_id: string
  albion_name: string
  battle_id: number
}

export type EventReportParticipantStatus =
  | 'confirmed_assigned'
  | 'assigned_no_battle'
  | 'unassigned_battle'

export interface EventReportParticipant {
  key: string
  discord_id: string | null
  albion_player_id: string | null
  username: string
  avatar: string | null
  role_name: string | null
  battleCount: number
  kills: number
  deaths: number
  status: EventReportParticipantStatus
}

export interface CombatLeader {
  key: string
  discord_id: string | null
  albion_player_id: string | null
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
    uniqueAssigned: number
    uniqueAttendees: number
    // 역할별 분포. 가장 많은 역할부터 desc.
    roleBreakdown: Array<{ role: string | null; count: number }>
  }
  attendance: {
    // 이벤트에 연결된 Albion battle 수. 이벤트 1개가 여러 battle 을 가질 수 있다.
    linkedBattleCount: number
    // raw_battle.players 기준 고유 전투 참여자 수.
    battleParticipants: number
    // battleParticipants 의 battle별 등장 횟수 합. 한 이벤트 안 3개 battle 참여면 3.
    battleParticipations: number
    // 슬롯 배정자 중 전투 기록으로 확인된 고유 인원. 이벤트 참석률의 분자.
    confirmedAssigned: number
    // 슬롯 배정자는 맞지만 연결 battle 에 등장하지 않은 고유 인원.
    unconfirmedAssigned: number
    // 슬롯에는 없지만 연결 battle 에 등장한 고유 인원.
    unassignedBattleParticipants: number
    // confirmedAssigned / uniqueAssigned. 배정자가 없으면 null.
    eventAttendanceRate: number | null
    participants: EventReportParticipant[]
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
  trackedBattleIds?: readonly number[]
  battleParticipations?: EventReportBattleParticipation[]
  regear: EventReportRegear[]
  battles: EventReportBattle[]
  profiles: Map<string, EventReportProfile>
}): EventReport {
  const {
    slots,
    killboard,
    trackedBattleIds = [],
    battleParticipations: battleParticipationRows = [],
    regear,
    battles,
    profiles,
  } = input

  const totalSlots = slots.length
  const assignedSlots = slots.filter((s) => s.assigned_discord_id).length
  const assigned = new Map<string, { role: string | null }>()
  const roleCount = new Map<string | null, number>()
  for (const s of slots) {
    if (!s.assigned_discord_id) continue
    if (!assigned.has(s.assigned_discord_id)) {
      assigned.set(s.assigned_discord_id, { role: s.role_name })
    }
    const role = s.role_name?.trim() || null
    roleCount.set(role, (roleCount.get(role) ?? 0) + 1)
  }
  const roleBreakdown = [...roleCount.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)

  interface ParticipantAgg {
    key: string
    discord_id: string | null
    albion_player_id: string | null
    username: string
    avatar: string | null
    role_name: string | null
    battleIds: Set<number>
    kills: number
    deaths: number
    isAssigned: boolean
  }

  const participantAgg = new Map<string, ParticipantAgg>()
  const participantKey = (discordId: string | null, albionPlayerId: string | null): string | null => {
    if (discordId) return `discord:${discordId}`
    if (albionPlayerId) return `albion:${albionPlayerId}`
    return null
  }
  const getOrCreateParticipant = (input: {
    discordId: string | null
    albionPlayerId: string | null
    username?: string | null
    roleName?: string | null
    isAssigned?: boolean
  }): ParticipantAgg | null => {
    const key = participantKey(input.discordId, input.albionPlayerId)
    if (!key) return null
    const profile = input.discordId ? profiles.get(input.discordId) : undefined
    const existing = participantAgg.get(key)
    if (existing) {
      const updated: ParticipantAgg = {
        ...existing,
        discord_id: existing.discord_id ?? input.discordId,
        albion_player_id: existing.albion_player_id ?? input.albionPlayerId,
        username: profile?.username ?? existing.username ?? input.username ?? input.discordId ?? input.albionPlayerId ?? 'Unknown',
        avatar: profile?.avatar ?? existing.avatar,
        role_name: existing.role_name ?? input.roleName ?? null,
        isAssigned: existing.isAssigned || input.isAssigned === true,
      }
      participantAgg.set(key, updated)
      return updated
    }
    const created: ParticipantAgg = {
      key,
      discord_id: input.discordId,
      albion_player_id: input.albionPlayerId,
      username: profile?.username ?? input.username ?? input.discordId ?? input.albionPlayerId ?? 'Unknown',
      avatar: profile?.avatar ?? null,
      role_name: input.roleName ?? null,
      battleIds: new Set(),
      kills: 0,
      deaths: 0,
      isAssigned: input.isAssigned === true,
    }
    participantAgg.set(key, created)
    return created
  }

  for (const [discordId, entry] of assigned.entries()) {
    getOrCreateParticipant({
      discordId,
      albionPlayerId: null,
      roleName: entry.role,
      isAssigned: true,
    })
  }

  const linkedBattleIds = new Set<number>(trackedBattleIds)
  for (const bp of battleParticipationRows) {
    linkedBattleIds.add(bp.battle_id)
    const entry = getOrCreateParticipant({
      discordId: bp.discord_id,
      albionPlayerId: bp.albion_player_id,
      username: bp.albion_name,
    })
    entry?.battleIds.add(bp.battle_id)
  }

  let totalKills = 0
  let totalDeaths = 0
  for (const ke of killboard) {
    if (ke.battle_id !== null) linkedBattleIds.add(ke.battle_id)
    const entry = getOrCreateParticipant({
      discordId: ke.discord_id,
      albionPlayerId: ke.albion_player_id,
    })
    if (!entry) continue
    if (ke.battle_id !== null) entry.battleIds.add(ke.battle_id)
    if (ke.role === 'killer') {
      entry.kills += 1
      totalKills += 1
    } else {
      entry.deaths += 1
      totalDeaths += 1
    }
  }

  const kdRatio =
    totalDeaths > 0
      ? totalKills / totalDeaths
      : totalKills > 0
        ? totalKills
        : null

  const statusRank: Record<EventReportParticipantStatus, number> = {
    confirmed_assigned: 0,
    assigned_no_battle: 1,
    unassigned_battle: 2,
  }
  const participants: EventReportParticipant[] = []
  for (const entry of participantAgg.values()) {
    const battleCount = entry.battleIds.size
    const status: EventReportParticipantStatus = entry.isAssigned
      ? battleCount > 0
        ? 'confirmed_assigned'
        : 'assigned_no_battle'
      : 'unassigned_battle'
    if (!entry.isAssigned && battleCount === 0) continue
    participants.push({
      key: entry.key,
      discord_id: entry.discord_id,
      albion_player_id: entry.albion_player_id,
      username: entry.username,
      avatar: entry.avatar,
      role_name: entry.role_name,
      battleCount,
      kills: entry.kills,
      deaths: entry.deaths,
      status,
    })
  }
  participants.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      b.battleCount - a.battleCount ||
      a.username.localeCompare(b.username),
  )

  const battleParticipants = participants.filter((p) => p.battleCount > 0)
  const confirmedAssigned = participants.filter((p) => p.status === 'confirmed_assigned').length
  const unconfirmedAssigned = participants.filter((p) => p.status === 'assigned_no_battle').length
  const unassignedBattleParticipants = participants.filter(
    (p) => p.status === 'unassigned_battle',
  ).length
  const battleParticipations = battleParticipants.reduce((acc, p) => acc + p.battleCount, 0)
  const eventAttendanceRate = assigned.size > 0 ? confirmedAssigned / assigned.size : null

  const combatLeaders: CombatLeader[] = []
  for (const agg of participantAgg.values()) {
    if (agg.kills + agg.deaths === 0) continue
    const ratio =
      agg.deaths > 0
        ? agg.kills / agg.deaths
        : agg.kills > 0
          ? agg.kills
          : null
    combatLeaders.push({
      key: agg.key,
      discord_id: agg.discord_id,
      albion_player_id: agg.albion_player_id,
      username: agg.username,
      avatar: agg.avatar,
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

  const attended = battleParticipants.length
  const died = battleParticipants.filter((p) => p.deaths > 0).length
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
      uniqueAssigned: assigned.size,
      uniqueAttendees: assigned.size,
      roleBreakdown,
    },
    attendance: {
      linkedBattleCount: linkedBattleIds.size,
      battleParticipants: battleParticipants.length,
      battleParticipations,
      confirmedAssigned,
      unconfirmedAssigned,
      unassignedBattleParticipants,
      eventAttendanceRate,
      participants,
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
