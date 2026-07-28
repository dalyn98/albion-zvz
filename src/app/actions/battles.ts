'use server'


import { publicActionError, publicActionMessage } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { logAdminAction } from '@/lib/admin-audit'
import {
  buildBattlePlayerSummaries,
  categorizeSize,
  computeHomeAllianceGuildBreakdown,
  computeHomeAllianceStats,
  computeOpponentGuildBreakdown,
  parseRawBattle,
  type BattlePlayerEquipmentEvidence,
  type BattlePlayerSummary,
  type HomeAllianceGuildBreakdown,
  type HomeAllianceStats,
  type OpponentGuildBreakdown,
  type SizeCategory,
} from '@/lib/albion-battles'
import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from '@/lib/battle-ledger-shadow'
import {
  compareKillFameDisplayResult,
  resolveGuildBattleDisplayStatus,
  type GuildBattleDisplayResult,
} from '@/lib/guild-battle-view'
import type {
  BattleEngagementMatchupRole,
  BattleEngagementResult,
  BattleEngagementRunReason,
  BattleEngagementRunState,
  BattleEngagementStatus,
} from '@/lib/battle-engagements'

const battleActivityOverrideSchema = z.object({
  battleRecordId: z.string().uuid(),
  relationScope: z.enum(['direct', 'alliance']).default('direct'),
  action: z.enum(['mark_ganking', 'mark_zvz', 'reset']),
})

const battleEngagementNoteSchema = z.object({
  engagementId: z.string().uuid(),
  note: z.string().trim().max(1000),
})

// 1~2명 스트래글러는 "집계 규모에 맞는 길드" 가 아니다 — small 카테고리 최소
// 인원 (10) 과 동일한 컷을 적용해 노이즈를 잘라낸다. tenant_battle_records 자체가
// 이미 opponent 측 합계 인원 < 10 이면 기록되지 않으므로, 같은 임계로 개별 길드도
// 거른다.
const OPPONENT_GUILD_MIN_TEAM_SIZE = 10

export interface BattleActivityOverrideResult {
  ok: boolean
  error?: string
}

export interface BattleEngagementNoteResult {
  ok: boolean
  error?: string
}

export async function saveBattleEngagementNote(
  input: unknown,
): Promise<BattleEngagementNoteResult> {
  const parsed = battleEngagementNoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: await publicActionMessage('invalidInput') }

  const session = await getSession()
  if (!session || !sessionHas(session, CAP.BATTLES_MANAGE)) {
    return { ok: false, error: await publicActionMessage('unauthorized') }
  }

  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { engagementId, note } = parsed.data
  const { data: scoped, error: scopeError } = await db
    .from('guild_battle_engagements')
    .select('battle_record_id, engagement_key')
    .eq('tenant_id', guildId)
    .eq('engagement_id', engagementId)
    .maybeSingle()
  if (scopeError) {
    return {
      ok: false,
      error: await publicActionError(scopeError, 'actions/battles'),
    }
  }
  if (!scoped?.battle_record_id || !scoped.engagement_key) {
    return { ok: false, error: await publicActionMessage('notFound') }
  }

  const battleRecordId = scoped.battle_record_id as string
  const engagementKey = scoped.engagement_key as string

  if (note === '') {
    const { error } = await db
      .from('battle_engagement_notes')
      .delete()
      .eq('guild_id', guildId)
      .eq('battle_record_id', battleRecordId)
      .eq('engagement_key', engagementKey)
    if (error) {
      return {
        ok: false,
        error: await publicActionError(error, 'actions/battles'),
      }
    }
  } else {
    const { error } = await db
      .from('battle_engagement_notes')
      .upsert(
        {
          guild_id: guildId,
          battle_record_id: battleRecordId,
          engagement_key: engagementKey,
          note,
          created_by_discord_id: session.discordId,
          updated_by_discord_id: session.discordId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guild_id,battle_record_id,engagement_key' },
      )
    if (error) {
      return {
        ok: false,
        error: await publicActionError(error, 'actions/battles'),
      }
    }
  }

  await logAdminAction({
    guildId,
    adminDiscordId: session.discordId,
    action: note === '' ? 'battle.engagement_note.delete' : 'battle.engagement_note.save',
    targetId: engagementId,
    targetKind: 'battle',
    details: {
      battleRecordId,
      engagementKey,
      noteLength: note.length,
    },
  })
  revalidatePath('/battles')
  revalidatePath(`/battles/${engagementId}`)
  return { ok: true }
}

export async function setBattleActivityOverride(
  input: unknown,
): Promise<BattleActivityOverrideResult> {
  const parsed = battleActivityOverrideSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: await publicActionMessage('invalidInput') }

  const session = await getSession()
  if (!session || !sessionHas(session, CAP.BATTLES_MANAGE)) {
    return { ok: false, error: await publicActionMessage('unauthorized') }
  }

  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { battleRecordId, relationScope, action } = parsed.data

  const { data: scopedRow, error: scopeErr } = await db
    .from('guild_battle_views')
    .select('id, battle_record_id, relation_scope, activity_kind, opponent_force_name')
    .eq('tenant_id', guildId)
    .eq('battle_record_id', battleRecordId)
    .eq('relation_scope', relationScope)
    .limit(1)
    .maybeSingle()

  if (scopeErr) return { ok: false, error: await publicActionError(scopeErr, 'actions/battles') }
  if (!scopedRow) {
    return { ok: false, error: await publicActionMessage('notFound') }
  }

  if (action === 'reset') {
    const { error } = await db
      .from('battle_activity_overrides')
      .delete()
      .eq('guild_id', guildId)
      .eq('battle_record_id', battleRecordId)
      .eq('relation_scope', relationScope)
    if (error) return { ok: false, error: await publicActionError(error, 'actions/battles') }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'battle.activity_override.reset',
      targetId: battleRecordId,
      targetKind: 'battle',
      details: {
        relationScope,
        previousActivityKind: scopedRow.activity_kind,
      },
    })
  } else {
    const activityKind = action === 'mark_zvz' ? 'zvz' : 'ganking'
    const reason = action === 'mark_zvz'
      ? 'manual_mark_zvz'
      : 'manual_mark_ganking'
    const { error } = await db
      .from('battle_activity_overrides')
      .upsert(
        {
          guild_id: guildId,
          battle_record_id: battleRecordId,
          relation_scope: relationScope,
          activity_kind: activityKind,
          reason,
          created_by_discord_id: session.discordId,
          updated_by_discord_id: session.discordId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guild_id,battle_record_id,relation_scope' },
      )
    if (error) return { ok: false, error: await publicActionError(error, 'actions/battles') }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'battle.activity_override.update',
      targetId: battleRecordId,
      targetKind: 'battle',
      details: {
        relationScope,
        activityKind,
        previousActivityKind: scopedRow.activity_kind,
      },
    })
  }

  revalidatePath('/battles')
  revalidatePath(`/battles/${scopedRow.id}`)
  revalidatePath('/leaderboard')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return { ok: true }
}

function normalizeBattleId(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  if (raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(n) ? n : null
}

// 단일 tenant_battle_records 의 상세. 전투 헤더 정보 + 해당 전투 시간창 안에서
// 길드원이 낸 킬/데스 이벤트 목록. 길드원 판정은 guild_avatars 조인 — 탈퇴자
// 포함 (withdrawn_at 무시) 해야 과거 전투에서 탈퇴한 멤버의 킬도 보인다.

export interface BattleKillEvent {
  event_id: string
  // anonymized 모드일 때 null. cross-tenant 보기에서는 Discord identity 를
  // 노출하지 않고 albion 닉네임만 사용.
  discord_id: string | null
  username: string
  avatar: string | null
  role: 'killer' | 'victim'
  opponent_name: string | null
  opponent_guild: string | null
  opponent_alliance: string | null
  fame: number
  item_power: number | null
  occurred_at: string
}

export interface BattleForceEngagement {
  forceLevel: 'alliance' | 'guild'
  forceAKey: string
  forceAName: string
  forceAKind: 'alliance' | 'guild'
  forceATeamSize: number
  forceBKey: string
  forceBName: string
  forceBKind: 'alliance' | 'guild'
  forceBTeamSize: number
  aKills: number
  aDeaths: number
  aKillFame: number
  bKills: number
  bDeaths: number
  bKillFame: number
  eventCount: number
  perspectiveResult: GuildBattleDisplayResult | null
}

export interface BattleEngagementDetailMatchup {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceAlbionId: string
  forceName: string
  opponentTeamSize: number
  role: BattleEngagementMatchupRole
  eventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
}

export interface BattleEngagementDetailProjection {
  runState: BattleEngagementRunState
  runReason: BattleEngagementRunReason
  status: BattleEngagementStatus
  result: BattleEngagementResult | null
  sequence: number
  engagementKey: string
  sourceObservationCount: number
  evaluatedAt: string
  rawHomeKills: number
  rawHomeDeaths: number
  collectedHomeKills: number
  collectedHomeDeaths: number
  unidentifiedEventCount: number
  resultHomeKills: number
  resultHomeDeaths: number
  resultHomeKillFame: number
  resultOpponentKills: number
  resultOpponentDeaths: number
  resultOpponentKillFame: number
  resultEligibleEventCount: number
  interventionEventCount: number
  otherEventCount: number
  homeSideTeamSize: number
  opponentSideTeamSize: number
  note: string | null
  matchups: BattleEngagementDetailMatchup[]
}

// 같은 battle_record_id 를 추적 중인 다른 tenant. 사이트가 등록된 길드끼리
// 서로 시점을 바꿔 보기 위한 cross-link. 자기 자신은 제외.
export interface CrossTenantPerspective {
  slug: string
  name: string
  homeGuildName: string
}

export interface BattleDetail {
  id: string
  legacyTenantBattleRecordId: string | null
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  endedAt: string
  homeGuildName: string
  homeAllianceName: string | null
  homeTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  opponentGuildNames: string[]
  opponentAllianceNames: string[]
  primaryOpponentName: string | null
  // 주 상대 (alliance 또는 단독 길드). UI 의 "v" 표기/카테고리 산정 기준.
  mainOpponentName: string
  mainOpponentKind: 'alliance' | 'guild' | 'pending' | 'legacy'
  mainOpponentTeamSize: number
  mainOpponentKills: number
  mainOpponentDeaths: number
  mainOpponentKillFame: number
  matchIndex: number
  matchTotal: number
  isProvisional: boolean
  sizeCategory: SizeCategory | null
  outcome: 'win' | 'loss' | 'tie'
  relationScope: BattleRelationScope
  viewPolicy: BattleViewPolicy
  resultEstimate: BattleResultEstimate
  projectionStatus: BattleProjectionStatus
  evidenceSource: BattleProjectionEvidenceSource
  isMeaningful: boolean
  hasActiveDiff: boolean
  activeDiffTypes: string[]
  // 상대 측 길드별 분해. raw_battle 에서 직접 계산 — 1~2명 스트래글러 컷오프
  // (OPPONENT_GUILD_MIN_TEAM_SIZE) 적용. raw_battle 이 없는 구 행이면 빈 배열.
  opponentGuilds: OpponentGuildBreakdown[]
  // 홈 길드가 alliance 에 가입되어 있고 alliance 안에 다른 길드가 있을 때만 채워짐.
  // raw_battle 의 alliance 합산값 — 매치업 분리 X (전체 전투 합산). 단독 가입이면 null.
  homeAllianceStats: HomeAllianceStats | null
  // 같은 홈 alliance 를 구성한 길드별 원본 K/D. 연합 총계와 같은 전체 전투 범위다.
  homeAllianceGuilds: HomeAllianceGuildBreakdown[]
  // 같은 battle 안에서 직접 교전 증거가 있는 force 간 edge. shared battle cache
  // 에서 읽으며, 없으면 빈 배열로 degrade.
  forceEngagements: BattleForceEngagement[]
  // battle_records.raw_battle.players 기반 플레이어 K/D. weapon/IP 는 raw_battle
  // optional 필드 또는 killboard_events 로 보강된다. 별도 player snapshot 저장 X.
  players: BattlePlayerSummary[]
  // 전투 시간창 안에서 길드원이 낸 killboard 이벤트. occurred_at 오름차순.
  events: BattleKillEvent[]
  // anonymized 보기 (cross-tenant) 에서는 events 의 discord identity 가 가려지고
  // 이 플래그로 UI 가 멤버 상세 링크/아바타를 빼게 된다.
  anonymized: boolean
  // 같은 전투를 추적하는 다른 등록 tenant 목록 (자기 자신 제외). 비어있을 수도.
  crossTenants: CrossTenantPerspective[]
  // 'self' = 내 tenant 시점, 'cross' = 상대 tenant 시점 보기. 배너/뒤로가기 분기.
  perspectiveKind: 'self' | 'cross'
  // cross 일 때만 채워짐 — 표시용 라벨/배너에 사용.
  perspectiveTenantSlug: string | null
  perspectiveTenantName: string | null
  engagement: BattleEngagementDetailProjection | null
}

// 매칭 창 padding — tracked-kills 와 동일한 15분. 전투 시작/끝 경계에서 놓치는
// 이벤트를 최소화. 과하게 잡혀도 동일 배틀 시간대라 UI 상 혼동은 없다.
const WINDOW_PADDING_MS = 15 * 60 * 1000

function estimateToOutcome(estimate: BattleResultEstimate): 'win' | 'loss' | 'tie' {
  if (estimate === 'advantage') return 'win'
  if (estimate === 'disadvantage') return 'loss'
  return 'tie'
}

function forceKey(kind: 'alliance' | 'guild', id: unknown): string | null {
  if (typeof id !== 'string' || id.trim() === '') return null
  return `${kind === 'alliance' ? 'a' : 'g'}:${id}`
}

function resolveForceEdgePerspectiveResult(
  row: {
    force_level: string | null
    force_a_key: string | null
    force_b_key: string | null
    a_kill_fame: number | null
    b_kill_fame: number | null
  },
  activeRow: Record<string, unknown>,
): GuildBattleDisplayResult | null {
  const subjectKey =
    row.force_level === 'alliance'
      ? forceKey('alliance', activeRow.home_alliance_id)
      : row.force_level === 'guild'
        ? forceKey('guild', activeRow.home_guild_id)
        : null
  if (!subjectKey) return null

  const aKillFame = row.a_kill_fame ?? 0
  const bKillFame = row.b_kill_fame ?? 0
  if (row.force_a_key === subjectKey) {
    return compareKillFameDisplayResult(aKillFame, bKillFame)
  }
  if (row.force_b_key === subjectKey) {
    return compareKillFameDisplayResult(bKillFame, aKillFame)
  }
  return null
}

// 자기 tenant 시점 또는 cross-tenant 시점 모두 같은 detail shape 으로 반환.
// `perspectiveSlug` 가 주어지면 그 slug 의 등록된 tenant 시점으로 해석되어
// killboard 이벤트는 anonymized 모드 (Discord identity 가려짐) 로 내려간다.
//
// id 인자 의미:
//   - perspectiveSlug 미지정: 내 tenant 의 tenant_battle_records.id
//   - perspectiveSlug 지정: 같은 battle_records.id (battle_record_id) 를
//     공유하는 행 중 perspectiveSlug 의 tenant_battle_records 를 찾는다.
//     id 가 내 tenant 의 row 라도 cross 시 같은 battle_record_id 만 동일하면
//     그쪽 시점으로 이동.
export async function getBattleDetail(
  id: string,
  perspectiveSlug?: string,
): Promise<{
  detail: BattleDetail | null
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { detail: null, error: await publicActionMessage('unauthorized') }
    const myGuildId = await getSessionGuildId(session)
    const db = getAdminClient()

    type DetailRow = Record<string, unknown> & {
      __ledger?: {
        relationScope: BattleRelationScope
        viewPolicy: BattleViewPolicy
        resultEstimate: BattleResultEstimate
        projectionStatus: BattleProjectionStatus
        evidenceSource: BattleProjectionEvidenceSource
        isMeaningful: boolean
        hasActiveDiff: boolean
        activeDiffTypes: string[]
        legacyTenantBattleRecordId: string | null
      }
    }

    // 새 제품 표면은 guild_battle_views projection id 를 먼저 해석한다. 구
    // tenant_battle_records id 링크는 아래 fallback 으로 계속 지원한다.
    let myRow: DetailRow | null = null
    let engagementProjection: BattleEngagementDetailProjection | null = null
    let engagementEventKeys: Set<string> | null = null
    const { data: engagementRow, error: engagementErr } = await db
      .from('guild_battle_engagements')
      .select(
        'run_id, battle_record_id, albion_battle_id, cluster_name, raw_started_at, raw_ended_at, home_guild_id, home_guild_name, home_alliance_id, home_alliance_name, source_observation_count, run_state, run_reason, raw_home_kills, raw_home_deaths, collected_home_kills, collected_home_deaths, unidentified_event_count, evaluated_at, engagement_id, engagement_key, sequence, started_at, ended_at, status, result, home_kills, home_deaths, home_kill_fame, opponent_kills, opponent_deaths, opponent_kill_fame, result_home_kills, result_home_deaths, result_home_kill_fame, result_opponent_kills, result_opponent_deaths, result_opponent_kill_fame, result_eligible_event_count, intervention_event_count, other_event_count, home_team_size, home_side_team_size, is_other_only, note, opponent_side_team_size',
      )
      .eq('tenant_id', myGuildId)
      .eq('engagement_id', id)
      .maybeSingle()
    if (engagementErr) return { detail: null, error: await publicActionError(engagementErr, 'actions/battles') }

    const { data: ledgerRow, error: ledgerErr } = engagementRow
      ? { data: null, error: null }
      : await db
          .from('guild_battle_views')
          .select(
            'id, tenant_id, battle_record_id, legacy_tenant_battle_record_id, albion_battle_id, started_at, ended_at, cluster_name, subject_albion_id, subject_name, subject_alliance_id, subject_alliance_name, relation_scope, opponent_force_key, opponent_force_kind, opponent_force_name, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, subject_team_size, subject_kills, subject_deaths, subject_kill_fame, status, evidence_source, is_meaningful, view_policy, result_estimate, size_category, legacy_outcome, legacy_row_outcome, legacy_is_provisional, match_index, match_total, has_active_diff, active_diff_types',
          )
          .eq('tenant_id', myGuildId)
          .eq('id', id)
          .maybeSingle()
    if (ledgerErr) return { detail: null, error: await publicActionError(ledgerErr, 'actions/battles') }

    if (engagementRow) {
      const battleRecordId = engagementRow.battle_record_id as string
      const [
        { data: rawBattleRow, error: rawBattleErr },
        { data: matchupRows, error: matchupErr },
        { data: eventLinkRows, error: eventLinkErr },
      ] = await Promise.all([
        db
          .from('battle_records')
          .select('albion_battle_id, cluster_name, ended_at, raw_battle')
          .eq('id', battleRecordId)
          .maybeSingle(),
        db
          .from('battle_engagement_matchups')
          .select(
            'force_key, force_kind, force_albion_id, force_name, opponent_team_size, matchup_role, event_count, home_kills, home_deaths, home_kill_fame, opponent_kills, opponent_deaths, opponent_kill_fame',
          )
          .eq('guild_id', myGuildId)
          .eq('engagement_id', id)
          .order('matchup_role', { ascending: true })
          .order('event_count', { ascending: false }),
        db
          .from('battle_engagement_event_links')
          .select('event_id, role')
          .eq('guild_id', myGuildId)
          .eq('engagement_id', id),
      ])
      if (rawBattleErr) return { detail: null, error: await publicActionError(rawBattleErr, 'actions/battles') }
      if (matchupErr) return { detail: null, error: await publicActionError(matchupErr, 'actions/battles') }
      if (eventLinkErr) return { detail: null, error: await publicActionError(eventLinkErr, 'actions/battles') }
      if (!rawBattleRow) return { detail: null }

      const numberValue = (value: unknown): number => {
        const parsed = Number(value ?? 0)
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
      }
      const matchups: BattleEngagementDetailMatchup[] = (matchupRows ?? []).map(
        (row) => ({
          forceKey: row.force_key as string,
          forceKind: row.force_kind as 'alliance' | 'guild',
          forceAlbionId: row.force_albion_id as string,
          forceName: row.force_name as string,
          opponentTeamSize: numberValue(row.opponent_team_size),
          role: row.matchup_role as BattleEngagementMatchupRole,
          eventCount: numberValue(row.event_count),
          homeKills: numberValue(row.home_kills),
          homeDeaths: numberValue(row.home_deaths),
          homeKillFame: numberValue(row.home_kill_fame),
          opponentKills: numberValue(row.opponent_kills),
          opponentDeaths: numberValue(row.opponent_deaths),
          opponentKillFame: numberValue(row.opponent_kill_fame),
        }),
      )
      const primaryMatchup =
        matchups.find((matchup) => matchup.role === 'result_eligible') ??
        matchups[0] ??
        null
      const matchupOpponentTeamSize = matchups
        .filter((matchup) => matchup.role === 'result_eligible')
        .reduce((sum, matchup) => sum + matchup.opponentTeamSize, 0)
      const opponentTeamSize = Math.max(
        numberValue(engagementRow.opponent_side_team_size),
        matchupOpponentTeamSize,
      )
      const result = engagementRow.result as BattleEngagementResult | null
      const resultEstimate: BattleResultEstimate =
        result === 'advantage'
          ? 'advantage'
          : result === 'disadvantage'
            ? 'disadvantage'
            : result === 'even'
              ? 'even'
              : 'unclear'
      const engagementStatus = engagementRow.status as BattleEngagementStatus
      const projectionStatus: BattleProjectionStatus =
        engagementStatus === 'final'
          ? 'final'
          : engagementStatus === 'pending'
            ? 'provisional'
            : 'low_confidence'
      const homeTeamSize = numberValue(engagementRow.home_team_size)
      const homeSideTeamSize = numberValue(engagementRow.home_side_team_size)
      const sizeCategory = categorizeSize(
        Math.max(homeSideTeamSize, opponentTeamSize),
      )

      engagementProjection = {
        runState: engagementRow.run_state as BattleEngagementRunState,
        runReason: engagementRow.run_reason as BattleEngagementRunReason,
        status: engagementStatus,
        result,
        sequence: numberValue(engagementRow.sequence),
        engagementKey: engagementRow.engagement_key as string,
        sourceObservationCount: numberValue(engagementRow.source_observation_count),
        evaluatedAt: engagementRow.evaluated_at as string,
        rawHomeKills: numberValue(engagementRow.raw_home_kills),
        rawHomeDeaths: numberValue(engagementRow.raw_home_deaths),
        collectedHomeKills: numberValue(engagementRow.collected_home_kills),
        collectedHomeDeaths: numberValue(engagementRow.collected_home_deaths),
        unidentifiedEventCount: numberValue(engagementRow.unidentified_event_count),
        resultHomeKills: numberValue(engagementRow.result_home_kills),
        resultHomeDeaths: numberValue(engagementRow.result_home_deaths),
        resultHomeKillFame: numberValue(engagementRow.result_home_kill_fame),
        resultOpponentKills: numberValue(engagementRow.result_opponent_kills),
        resultOpponentDeaths: numberValue(engagementRow.result_opponent_deaths),
        resultOpponentKillFame: numberValue(engagementRow.result_opponent_kill_fame),
        resultEligibleEventCount: numberValue(
          engagementRow.result_eligible_event_count,
        ),
        interventionEventCount: numberValue(
          engagementRow.intervention_event_count,
        ),
        otherEventCount: numberValue(engagementRow.other_event_count),
        homeSideTeamSize,
        opponentSideTeamSize: opponentTeamSize,
        note: (engagementRow.note as string | null) ?? null,
        matchups,
      }
      engagementEventKeys = new Set(
        (eventLinkRows ?? []).map(
          (row) => `${String(row.event_id)}:${String(row.role)}`,
        ),
      )

      myRow = {
        id: engagementRow.engagement_id,
        battle_record_id: battleRecordId,
        home_guild_id: engagementRow.home_guild_id,
        home_guild_name: engagementRow.home_guild_name,
        home_alliance_id: engagementRow.home_alliance_id,
        home_alliance_name: engagementRow.home_alliance_name,
        home_team_size: homeTeamSize,
        home_kills: numberValue(engagementRow.home_kills),
        home_deaths: numberValue(engagementRow.home_deaths),
        home_kill_fame: numberValue(engagementRow.home_kill_fame),
        opponent_team_size: opponentTeamSize,
        opponent_kills: numberValue(engagementRow.opponent_kills),
        opponent_deaths: numberValue(engagementRow.opponent_deaths),
        opponent_kill_fame: numberValue(engagementRow.opponent_kill_fame),
        opponent_guild_names: matchups
          .filter((matchup) => matchup.forceKind === 'guild')
          .map((matchup) => matchup.forceName),
        opponent_alliance_names: matchups
          .filter((matchup) => matchup.forceKind === 'alliance')
          .map((matchup) => matchup.forceName),
        primary_opponent_name: primaryMatchup?.forceName ?? null,
        main_opponent_force_kind: primaryMatchup?.forceKind ?? 'legacy',
        main_opponent_force_name: primaryMatchup?.forceName ?? '-',
        main_opponent_team_size: primaryMatchup?.opponentTeamSize ?? 0,
        main_opponent_kills: primaryMatchup?.opponentKills ?? 0,
        main_opponent_deaths: primaryMatchup?.opponentDeaths ?? 0,
        main_opponent_kill_fame: primaryMatchup?.opponentKillFame ?? 0,
        match_index: numberValue(engagementRow.sequence),
        match_total: 1,
        is_provisional: projectionStatus !== 'final',
        size_category: sizeCategory,
        outcome:
          result === 'advantage'
            ? 'win'
            : result === 'disadvantage'
              ? 'loss'
              : 'tie',
        started_at: engagementRow.started_at,
        ended_at: engagementRow.ended_at,
        battle_records: rawBattleRow,
        __ledger: {
          relationScope: 'direct',
          viewPolicy:
            engagementRow.is_other_only === true
              ? 'small_or_low_engagement'
              : 'default_meaningful',
          resultEstimate,
          projectionStatus,
          evidenceSource: 'killboard_events',
          isMeaningful: engagementRow.is_other_only !== true,
          hasActiveDiff: false,
          activeDiffTypes: [],
          legacyTenantBattleRecordId: null,
        },
      }
    } else if (ledgerRow) {
      const { data: rawBattleRow, error: rawBattleErr } = await db
        .from('battle_records')
        .select('albion_battle_id, cluster_name, ended_at, raw_battle')
        .eq('id', ledgerRow.battle_record_id as string)
        .maybeSingle()
      if (rawBattleErr) return { detail: null, error: await publicActionError(rawBattleErr, 'actions/battles') }
      if (!rawBattleRow) return { detail: null }

      const resultEstimate = ledgerRow.result_estimate as BattleResultEstimate
      const sizeCategory =
        (ledgerRow.size_category as SizeCategory | null) ??
        categorizeSize(
          Math.max(
            ledgerRow.subject_team_size as number,
            ledgerRow.opponent_team_size as number,
          ),
        )
      const outcome =
        (ledgerRow.legacy_row_outcome as 'win' | 'loss' | 'tie' | null) ??
        (ledgerRow.legacy_outcome as 'win' | 'loss' | 'tie' | null) ??
        estimateToOutcome(resultEstimate)
      const projectionStatus = resolveGuildBattleDisplayStatus(
        ledgerRow.status as BattleProjectionStatus,
        ledgerRow.legacy_is_provisional as boolean | null,
      )

      myRow = {
        id: ledgerRow.id,
        battle_record_id: ledgerRow.battle_record_id,
        home_guild_id: ledgerRow.subject_albion_id,
        home_guild_name: ledgerRow.subject_name,
        home_alliance_id: ledgerRow.subject_alliance_id,
        home_alliance_name: ledgerRow.subject_alliance_name,
        home_team_size: ledgerRow.subject_team_size,
        home_kills: ledgerRow.subject_kills,
        home_deaths: ledgerRow.subject_deaths,
        home_kill_fame: ledgerRow.subject_kill_fame,
        opponent_team_size: ledgerRow.opponent_team_size,
        opponent_kills: ledgerRow.opponent_kills,
        opponent_deaths: ledgerRow.opponent_deaths,
        opponent_kill_fame: ledgerRow.opponent_kill_fame,
        opponent_guild_names:
          ledgerRow.opponent_force_kind === 'guild' ? [ledgerRow.opponent_force_name] : [],
        opponent_alliance_names:
          ledgerRow.opponent_force_kind === 'alliance' ? [ledgerRow.opponent_force_name] : [],
        primary_opponent_name: ledgerRow.opponent_force_name,
        main_opponent_force_kind: ledgerRow.opponent_force_kind,
        main_opponent_force_name: ledgerRow.opponent_force_name,
        main_opponent_team_size: ledgerRow.opponent_team_size,
        main_opponent_kills: ledgerRow.opponent_kills,
        main_opponent_deaths: ledgerRow.opponent_deaths,
        main_opponent_kill_fame: ledgerRow.opponent_kill_fame,
        match_index: ledgerRow.match_index ?? 1,
        match_total: ledgerRow.match_total ?? 1,
        is_provisional: projectionStatus === 'provisional',
        size_category: sizeCategory,
        outcome,
        started_at: ledgerRow.started_at,
        battle_records: rawBattleRow,
        __ledger: {
          relationScope: ledgerRow.relation_scope as BattleRelationScope,
          viewPolicy: ledgerRow.view_policy as BattleViewPolicy,
          resultEstimate,
          projectionStatus,
          evidenceSource: ledgerRow.evidence_source as BattleProjectionEvidenceSource,
          isMeaningful: ledgerRow.is_meaningful as boolean,
          hasActiveDiff: ledgerRow.has_active_diff as boolean,
          activeDiffTypes: (ledgerRow.active_diff_types as string[] | null) ?? [],
          legacyTenantBattleRecordId:
            (ledgerRow.legacy_tenant_battle_record_id as string | null) ?? null,
        },
      }
    } else {
      const { data: legacyRow, error: myErr } = await db
        .from('tenant_battle_records')
        .select(
          'id, battle_record_id, home_guild_id, home_guild_name, home_alliance_id, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kills, main_opponent_deaths, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name, ended_at, raw_battle)',
        )
        .eq('guild_id', myGuildId)
        .eq('id', id)
        .maybeSingle()
      if (myErr) return { detail: null, error: await publicActionError(myErr, 'actions/battles') }
      if (!legacyRow) return { detail: null }
      myRow = legacyRow as DetailRow
    }

    const battleRecordId = myRow.battle_record_id as string

    type PeerRow = {
      guild_id: string
      home_guild_name: string
      tenants:
        | { slug: string; name: string; status: string }
        | { slug: string; name: string; status: string }[]
        | null
    }
    const crossTenants: CrossTenantPerspective[] = []
    const peerByGuildId = new Map<string, PeerRow>()

    // 기존 battle detail 에서만 다른 tenant 시점 전환을 지원한다.
    // 교전 ID 는 현재 tenant 의 자동 분할 결과이므로 peer row 로 치환할 수 없다.
    if (!engagementProjection) {
      const { data: peerRows, error: peerErr } = await db
        .from('tenant_battle_records')
        .select('guild_id, home_guild_name, tenants!inner(slug, name, status)')
        .eq('battle_record_id', battleRecordId)
        .neq('guild_id', myGuildId)
      if (peerErr) return { detail: null, error: await publicActionError(peerErr, 'actions/battles') }

      for (const row of (peerRows ?? []) as PeerRow[]) {
        const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
        if (!tenant || tenant.status !== 'active') continue
        crossTenants.push({
          slug: tenant.slug,
          name: tenant.name,
          homeGuildName: row.home_guild_name,
        })
        peerByGuildId.set(row.guild_id, row)
      }
    }

    // perspective 모드 결정. slug 가 비어있거나 자기 자신을 가리키면 self 모드.
    let activeRow = myRow
    let activeGuildId = myGuildId
    let perspectiveKind: 'self' | 'cross' = 'self'
    let perspectiveTenantSlug: string | null = null
    let perspectiveTenantName: string | null = null
    let anonymized = false

    if (perspectiveSlug && !engagementProjection) {
      const peer = crossTenants.find((p) => p.slug === perspectiveSlug)
      if (peer) {
        // peer 의 row 를 별도 조회. 위 peerRows 는 슬림 select 라 detail 에 부족.
        const peerGuildId = Array.from(peerByGuildId.entries()).find(
          ([, r]) => {
            const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants
            return t?.slug === perspectiveSlug
          },
        )?.[0]
        if (peerGuildId) {
          const { data: peerFull, error: peerFullErr } = await db
            .from('tenant_battle_records')
            .select(
              'id, battle_record_id, home_guild_id, home_guild_name, home_alliance_id, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kills, main_opponent_deaths, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name, ended_at, raw_battle)',
            )
            .eq('guild_id', peerGuildId)
            .eq('battle_record_id', battleRecordId)
            .maybeSingle()
          if (peerFullErr) return { detail: null, error: await publicActionError(peerFullErr, 'actions/battles') }
          if (peerFull) {
            activeRow = peerFull
            activeGuildId = peerGuildId
            perspectiveKind = 'cross'
            perspectiveTenantSlug = peer.slug
            perspectiveTenantName = peer.name
            anonymized = true
          }
        }
      }
      // perspectiveSlug 가 지정됐는데 매칭되는 peer 가 없으면 그냥 self 로 fallback.
      // (URL 직접 입력 / stale 상태 등) 잘못된 slug 라도 페이지가 깨지진 않음.
    }

    const battle = Array.isArray(activeRow.battle_records)
      ? activeRow.battle_records[0]
      : activeRow.battle_records
    const endedAt =
      (activeRow.ended_at as string | null) ??
      (battle?.ended_at as string | null) ??
      (activeRow.started_at as string)

    // 상대 길드 분해: raw_battle 이 있으면 Albion API 원본에서 직접 측 분리.
    // parseRawBattle 로 read-time 검증 — 손상된/구버전 JSONB 가 들어와도
    // 페이지가 깨지지 않고 빈 배열로 degrade.
    const rawBattle = parseRawBattle(battle?.raw_battle)
    const opponentGuilds: OpponentGuildBreakdown[] = rawBattle
      ? computeOpponentGuildBreakdown(rawBattle, activeRow.home_guild_id as string, {
          minTeamSize: OPPONENT_GUILD_MIN_TEAM_SIZE,
        })
      : []
    // 홈 alliance 합산. alliance 미가입/단독 가입/raw 없음 시 null.
    const homeAllianceStats: HomeAllianceStats | null = rawBattle
      ? computeHomeAllianceStats(rawBattle, activeRow.home_guild_id as string)
      : null
    const homeAllianceGuilds: HomeAllianceGuildBreakdown[] = rawBattle
      ? computeHomeAllianceGuildBreakdown(rawBattle, activeRow.home_guild_id as string)
      : []

    const { data: edgeRows, error: edgeErr } = engagementProjection
      ? { data: [], error: null }
      : await db
          .from('battle_force_edges')
          .select(
            'force_level, force_a_key, force_a_kind, force_a_name, force_a_team_size, force_b_key, force_b_kind, force_b_name, force_b_team_size, a_kills, a_deaths, a_kill_fame, b_kills, b_deaths, b_kill_fame, event_count',
          )
          .eq('battle_record_id', battleRecordId)
          .eq('is_meaningful', true)
          .order('force_level', { ascending: true })
          .order('event_count', { ascending: false })
    if (edgeErr) return { detail: null, error: await publicActionError(edgeErr, 'actions/battles') }

    type ForceEdgeRow = {
      force_level: string | null
      force_a_key: string | null
      force_a_kind: string | null
      force_a_name: string | null
      force_a_team_size: number | null
      force_b_key: string | null
      force_b_kind: string | null
      force_b_name: string | null
      force_b_team_size: number | null
      a_kills: number | null
      a_deaths: number | null
      a_kill_fame: number | null
      b_kills: number | null
      b_deaths: number | null
      b_kill_fame: number | null
      event_count: number | null
    }
    const forceEngagements: BattleForceEngagement[] = []
    for (const row of (edgeRows ?? []) as ForceEdgeRow[]) {
      if (row.force_level !== 'alliance' && row.force_level !== 'guild') continue
      if (row.force_a_kind !== 'alliance' && row.force_a_kind !== 'guild') continue
      if (row.force_b_kind !== 'alliance' && row.force_b_kind !== 'guild') continue
      if (!row.force_a_key || !row.force_b_key || !row.force_a_name || !row.force_b_name) continue
      forceEngagements.push({
        forceLevel: row.force_level,
        forceAKey: row.force_a_key,
        forceAName: row.force_a_name,
        forceAKind: row.force_a_kind,
        forceATeamSize: row.force_a_team_size ?? 0,
        forceBKey: row.force_b_key,
        forceBName: row.force_b_name,
        forceBKind: row.force_b_kind,
        forceBTeamSize: row.force_b_team_size ?? 0,
        aKills: row.a_kills ?? 0,
        aDeaths: row.a_deaths ?? 0,
        aKillFame: row.a_kill_fame ?? 0,
        bKills: row.b_kills ?? 0,
        bDeaths: row.b_deaths ?? 0,
        bKillFame: row.b_kill_fame ?? 0,
        eventCount: row.event_count ?? 0,
        perspectiveResult: resolveForceEdgePerspectiveResult(row, activeRow),
      })
    }

    const startMs = Date.parse(activeRow.started_at as string)
    const endMs = Date.parse(endedAt)
    const windowStart = new Date(startMs - WINDOW_PADDING_MS).toISOString()
    const windowEnd = new Date(endMs + WINDOW_PADDING_MS).toISOString()

    // 길드원 killboard_events. battle_id 가 있는 최신 행은 정확 매칭만 허용하고,
    // legacy NULL battle_id 행에서만 시간창 fallback 을 사용한다. self:
    // Discord identity 노출, cross: anonymized — albion_nickname 만 사용하고
    // discord 식별자는 가린다.
    const activeBattleId = normalizeBattleId(battle?.albion_battle_id)
    let eventsQuery = db
      .from('killboard_events')
      .select(
        'event_id, role, fame, item_power, occurred_at, opponent_name, opponent_guild, opponent_alliance, discord_id, albion_player_id, player_name, equipment, guild_avatars(username, avatar, albion_nickname)',
      )
      .eq('guild_id', activeGuildId)
    eventsQuery =
      activeBattleId !== null
        ? eventsQuery.eq('battle_id', activeBattleId)
        : eventsQuery.gte('occurred_at', windowStart).lte('occurred_at', windowEnd)
    const { data: events, error: eventsErr } = await eventsQuery.order('occurred_at', {
      ascending: true,
    })
    if (eventsErr) return { detail: null, error: await publicActionError(eventsErr, 'actions/battles') }

    type EventRow = {
      event_id: number | string | null
      role: string | null
      fame: number | null
      item_power: number | null
      occurred_at: string | null
      opponent_name: string | null
      opponent_guild: string | null
      opponent_alliance: string | null
      discord_id: string | null
      albion_player_id: string | null
      player_name: string | null
      equipment: Record<string, { Type?: string | null } | null> | null
      guild_avatars:
        | { username: string | null; avatar: string | null; albion_nickname: string | null }
        | { username: string | null; avatar: string | null; albion_nickname: string | null }[]
        | null
    }

    const battleEvents: BattleKillEvent[] = []
    const playerEvidenceRows: BattlePlayerEquipmentEvidence[] = []
    for (const row of (events ?? []) as EventRow[]) {
      if (!row.occurred_at) continue
      if (
        engagementEventKeys &&
        !engagementEventKeys.has(`${String(row.event_id ?? '')}:${String(row.role ?? '')}`)
      ) {
        continue
      }
      if (row.albion_player_id) {
        playerEvidenceRows.push({
          playerId: row.albion_player_id,
          itemPower: row.item_power,
          equipment: row.equipment,
          occurredAt: row.occurred_at,
        })
      }
      if (row.role !== 'killer' && row.role !== 'victim') continue
      const avatar = Array.isArray(row.guild_avatars)
        ? row.guild_avatars[0]
        : row.guild_avatars
      // anonymized: Albion 닉네임을 표시명으로. 없으면 row 자체를 스킵 — 표시할
      // 안전한 라벨이 없으면 그냥 안 보여주는 게 낫다.
      const displayName = anonymized
        ? avatar?.albion_nickname ?? row.player_name ?? null
        : avatar?.username ?? row.player_name ?? null
      if (!displayName) continue
      battleEvents.push({
        event_id: String(row.event_id ?? ''),
        discord_id: anonymized ? null : row.discord_id,
        username: displayName,
        avatar: anonymized ? null : avatar?.avatar ?? null,
        role: row.role,
        opponent_name: row.opponent_name,
        opponent_guild: row.opponent_guild,
        opponent_alliance: row.opponent_alliance,
        fame: row.fame ?? 0,
        item_power: row.item_power,
        occurred_at: row.occurred_at,
      })
    }
    const players = rawBattle ? buildBattlePlayerSummaries(rawBattle, playerEvidenceRows) : []
    const fallbackResultEstimate: BattleResultEstimate =
      activeRow.outcome === 'win'
        ? 'advantage'
        : activeRow.outcome === 'loss'
          ? 'disadvantage'
          : 'even'
    const ledger = activeRow.__ledger ?? {
      relationScope: 'direct' as BattleRelationScope,
      viewPolicy: 'default_meaningful' as BattleViewPolicy,
      resultEstimate: fallbackResultEstimate,
      projectionStatus: (activeRow.is_provisional as boolean | null)
        ? ('provisional' as BattleProjectionStatus)
        : ('final' as BattleProjectionStatus),
      evidenceSource: 'battle_summary' as BattleProjectionEvidenceSource,
      isMeaningful: true,
      hasActiveDiff: false,
      activeDiffTypes: [],
      legacyTenantBattleRecordId: activeRow.id as string,
    }

    const detail: BattleDetail = {
      id: activeRow.id as string,
      legacyTenantBattleRecordId: ledger.legacyTenantBattleRecordId,
      albionBattleId: battle?.albion_battle_id as number,
      clusterName: (battle?.cluster_name as string | null) ?? null,
      startedAt: activeRow.started_at as string,
      endedAt,
      homeGuildName: activeRow.home_guild_name as string,
      homeAllianceName: (activeRow.home_alliance_name as string | null) ?? null,
      homeTeamSize: activeRow.home_team_size as number,
      homeKills: activeRow.home_kills as number,
      homeDeaths: activeRow.home_deaths as number,
      homeKillFame: activeRow.home_kill_fame as number,
      opponentTeamSize: activeRow.opponent_team_size as number,
      opponentKills: activeRow.opponent_kills as number,
      opponentDeaths: activeRow.opponent_deaths as number,
      opponentKillFame: activeRow.opponent_kill_fame as number,
      opponentGuildNames: (activeRow.opponent_guild_names as string[] | null) ?? [],
      opponentAllianceNames: (activeRow.opponent_alliance_names as string[] | null) ?? [],
      primaryOpponentName: (activeRow.primary_opponent_name as string | null) ?? null,
      mainOpponentName:
        (activeRow.main_opponent_force_name as string | null) ??
        (activeRow.primary_opponent_name as string | null) ??
        '-',
      mainOpponentKind:
        (activeRow.main_opponent_force_kind as
          | 'alliance'
          | 'guild'
          | 'pending'
          | 'legacy'
          | null) ?? 'legacy',
      mainOpponentTeamSize:
        (activeRow.main_opponent_team_size as number | null) ??
        (activeRow.opponent_team_size as number),
      mainOpponentKills:
        (activeRow.main_opponent_kills as number | null) ??
        (activeRow.opponent_kills as number),
      mainOpponentDeaths:
        (activeRow.main_opponent_deaths as number | null) ??
        (activeRow.opponent_deaths as number),
      mainOpponentKillFame:
        (activeRow.main_opponent_kill_fame as number | null) ??
        (activeRow.opponent_kill_fame as number),
      matchIndex: (activeRow.match_index as number | null) ?? 1,
      matchTotal: (activeRow.match_total as number | null) ?? 1,
      isProvisional: (activeRow.is_provisional as boolean | null) ?? false,
      sizeCategory: activeRow.size_category as SizeCategory | null,
      outcome: activeRow.outcome as 'win' | 'loss' | 'tie',
      relationScope: ledger.relationScope,
      viewPolicy: ledger.viewPolicy,
      resultEstimate: ledger.resultEstimate,
      projectionStatus: ledger.projectionStatus,
      evidenceSource: ledger.evidenceSource,
      isMeaningful: ledger.isMeaningful,
      hasActiveDiff: ledger.hasActiveDiff,
      activeDiffTypes: ledger.activeDiffTypes,
      opponentGuilds,
      homeAllianceStats,
      homeAllianceGuilds,
      forceEngagements,
      players,
      events: battleEvents,
      anonymized,
      crossTenants,
      perspectiveKind,
      perspectiveTenantSlug,
      perspectiveTenantName,
      engagement: engagementProjection,
    }
    return { detail }
  } catch (e) {
    return { detail: null, error: await publicActionError(e, 'actions/battles') }
  }
}
