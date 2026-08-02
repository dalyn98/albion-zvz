import 'server-only'

import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { isAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import type {
  AllianceContentRegearLinkedSubmission,
  AllianceContentRegearVideoContext,
  AllianceContentRegearVideoOption,
} from '@/lib/alliance-content-regear-video'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveStableMemberOwnership } from '@/lib/stable-member-ownership'

interface RequirementRow {
  id: string
  due_at: string
}

interface RequirementSessionRow {
  session_id: string
}

interface SessionRow {
  id: string
  ended_at: string
}

interface SessionBattleRow {
  session_id: string
  battle_record_id: string
}

interface BattleRecordRow {
  id: string
  albion_battle_id: number | string | null
}

interface LinkedSubmissionRow {
  id: string
  status: AllianceContentRegearLinkedSubmission['status']
}

const EMPTY_CONTEXT: AllianceContentRegearVideoContext = {
  option: null,
  linkedSubmission: null,
  sourceAlbionBattleIds: [],
}

export async function getMyAllianceContentRegearVideoContext(
  guildId: string,
  discordId: string,
  regearRequestId?: string,
): Promise<AllianceContentRegearVideoContext> {
  if (!(await isAllianceContentComplianceAvailable(guildId))) return EMPTY_CONTEXT

  const db = getAdminClient()
  const ownership = await resolveStableMemberOwnership(db, guildId, discordId)
  let requirementQuery = db
    .from('alliance_content_video_requirements')
    .select('id, due_at')
    .eq('guild_id', guildId)
  requirementQuery = ownership.guildMemberId
    ? requirementQuery.eq('guild_member_id', ownership.guildMemberId)
    : requirementQuery.eq('discord_id', discordId)
  const [requirementResult, linkedResult, sourceAlbionBattleIds] = await Promise.all([
    requirementQuery
      .in('status', ['open', 'overdue'])
      .gte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    regearRequestId
      ? db
        .from('alliance_content_video_submissions')
        .select('id, status')
        .eq('guild_id', guildId)
        .eq('source_regear_request_id', regearRequestId)
        .in('status', ['pending', 'approved'])
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    regearRequestId
      ? loadRegearSourceAlbionBattleIds(guildId, discordId, regearRequestId)
      : Promise.resolve([]),
  ])
  if (requirementResult.error) throw new Error(requirementResult.error.message)
  if (linkedResult.error) throw new Error(linkedResult.error.message)

  return {
    option: requirementResult.data
      ? await loadRequirementOption(guildId, requirementResult.data as RequirementRow)
      : null,
    linkedSubmission: (linkedResult.data as LinkedSubmissionRow | null) ?? null,
    sourceAlbionBattleIds,
  }
}

async function loadRequirementOption(
  guildId: string,
  requirement: RequirementRow,
): Promise<AllianceContentRegearVideoOption> {
  const db = getAdminClient()
  const { data: requirementSessions, error: requirementSessionsError } = await db
    .from('alliance_content_video_requirement_sessions')
    .select('session_id')
    .eq('guild_id', guildId)
    .eq('requirement_id', requirement.id)
  if (requirementSessionsError) throw new Error(requirementSessionsError.message)

  const sessionIds = ((requirementSessions ?? []) as RequirementSessionRow[])
    .map((row) => row.session_id)
  if (sessionIds.length === 0) {
    return { requirementId: requirement.id, dueAt: requirement.due_at, sessions: [] }
  }

  const [sessionsResult, sessionBattlesResult] = await Promise.all([
    db
      .from('alliance_content_sessions')
      .select('id, ended_at')
      .eq('guild_id', guildId)
      .in('id', sessionIds),
    db
      .from('alliance_content_session_battles')
      .select('session_id, battle_record_id')
      .eq('guild_id', guildId)
      .in('session_id', sessionIds),
  ])
  if (sessionsResult.error) throw new Error(sessionsResult.error.message)
  if (sessionBattlesResult.error) throw new Error(sessionBattlesResult.error.message)

  const sessionBattles = (sessionBattlesResult.data ?? []) as SessionBattleRow[]
  const battleRecordIds = Array.from(new Set(sessionBattles.map((row) => row.battle_record_id)))
  const battleRecordsResult = battleRecordIds.length === 0
    ? { data: [] as BattleRecordRow[], error: null }
    : await db
      .from('battle_records')
      .select('id, albion_battle_id')
      .in('id', battleRecordIds)
  if (battleRecordsResult.error) throw new Error(battleRecordsResult.error.message)

  const albionBattleIdByRecordId = new Map(
    ((battleRecordsResult.data ?? []) as BattleRecordRow[])
      .map((row) => [row.id, normalizeAlbionBattleId(row.albion_battle_id)] as const),
  )
  const albionBattleIdsBySessionId = new Map<string, number[]>()
  for (const row of sessionBattles) {
    const battleId = albionBattleIdByRecordId.get(row.battle_record_id) ?? null
    if (battleId === null) continue
    const current = albionBattleIdsBySessionId.get(row.session_id) ?? []
    albionBattleIdsBySessionId.set(row.session_id, [...current, battleId])
  }

  return {
    requirementId: requirement.id,
    dueAt: requirement.due_at,
    sessions: ((sessionsResult.data ?? []) as SessionRow[])
      .map((session) => ({
        id: session.id,
        endedAt: session.ended_at,
        albionBattleIds: Array.from(
          new Set(albionBattleIdsBySessionId.get(session.id) ?? []),
        ),
      }))
      .sort((left, right) => left.endedAt.localeCompare(right.endedAt)),
  }
}

async function loadRegearSourceAlbionBattleIds(
  guildId: string,
  discordId: string,
  regearRequestId: string,
): Promise<number[]> {
  const db = getAdminClient()
  const ownership = await resolveStableMemberOwnership(db, guildId, discordId)
  let regearQuery = db
    .from('regear_requests')
    .select('event_id, killboard_event_id, events(battle_started_at)')
    .eq('guild_id', guildId)
    .eq('id', regearRequestId)
  regearQuery = ownership.guildMemberId
    ? regearQuery.eq('guild_member_id', ownership.guildMemberId)
    : regearQuery.eq('discord_id', discordId)
  const { data: regear, error: regearError } = await regearQuery
    .maybeSingle()
  if (regearError) throw new Error(regearError.message)
  if (!regear) return []

  const killboardEventId = normalizeAlbionBattleId(regear.killboard_event_id)
  if (killboardEventId !== null) {
    const { data: killboardEvent, error: killboardError } = await db
      .from('killboard_events')
      .select('battle_id')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .eq('event_id', killboardEventId)
      .maybeSingle()
    if (killboardError) throw new Error(killboardError.message)
    const battleId = normalizeAlbionBattleId(killboardEvent?.battle_id ?? null)
    return battleId === null ? [] : [battleId]
  }

  const eventRelation = regear.events as
    | { battle_started_at?: string | null }
    | Array<{ battle_started_at?: string | null }>
    | null
  const battleStartedAt = Array.isArray(eventRelation)
    ? eventRelation[0]?.battle_started_at
    : eventRelation?.battle_started_at
  if (!battleStartedAt) return []
  const matched = await findTrackedBattleIdsForEvent(db, guildId, battleStartedAt)
  return matched.map((battle) => battle.albionBattleId)
}

function normalizeAlbionBattleId(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
