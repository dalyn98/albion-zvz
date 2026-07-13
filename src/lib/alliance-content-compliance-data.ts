import 'server-only'

import {
  buildAllianceContentSessionCandidates,
  type AllianceContentBattleInput,
} from '@/lib/alliance-content-compliance'
import { getAdminClient } from '@/lib/supabase-admin'

export interface AllianceContentPolicy {
  sessionGapMinutes: number
  weeklyMinSessions: number
  weeklyMinParticipationRate: number
  videoEverySessions: number
  videoDueDays: number
}

export interface AllianceContentCandidate {
  battleRecordIds: string[]
  startedAt: string
  endedAt: string
  participantCount: number
}

export interface AllianceContentSessionSummary {
  id: string
  startedAt: string
  endedAt: string
  confirmedAt: string
  participantCount: number
}

export interface AllianceContentSubmissionSummary {
  id: string
  discordId: string
  username: string
  videoUrl: string
  submittedAt: string
  dueAt: string
}

export interface AllianceContentAdminDashboard {
  policy: AllianceContentPolicy
  candidates: AllianceContentCandidate[]
  sessions: AllianceContentSessionSummary[]
  pendingSubmissions: AllianceContentSubmissionSummary[]
}

export interface MyAllianceContentRequirement {
  id: string
  dueAt: string
  status: 'open' | 'submitted' | 'approved' | 'overdue' | 'waived'
  sessions: Array<{ id: string; endedAt: string }>
  submission: { id: string; status: 'pending' | 'approved' | 'rejected'; videoUrl: string } | null
}

export interface MyAllianceContentCompliance {
  policy: AllianceContentPolicy
  weekSessionCount: number
  weekTotalSessions: number
  weekParticipationRate: number
  requirements: MyAllianceContentRequirement[]
}

interface PolicyRow {
  session_gap_minutes: number
  weekly_min_sessions: number
  weekly_min_participation_rate: number
  video_every_sessions: number
  video_due_days: number
}

interface SessionRow {
  id: string
  started_at: string
  ended_at: string
  confirmed_at: string
}

interface ParticipationRow {
  session_id: string
}

interface RequirementRow {
  id: string
  due_at: string
  status: MyAllianceContentRequirement['status']
}

interface RequirementSessionRow {
  requirement_id: string
  session_id: string
}

interface SubmissionRow {
  id: string
  requirement_id: string
  session_id: string
  status: 'pending' | 'approved' | 'rejected'
  video_url: string
  discord_id: string
  submitted_at: string
}

const DEFAULT_POLICY: AllianceContentPolicy = {
  sessionGapMinutes: 90,
  weeklyMinSessions: 3,
  weeklyMinParticipationRate: 0,
  videoEverySessions: 3,
  videoDueDays: 7,
}

export async function getAllianceContentAdminDashboard(
  guildId: string,
): Promise<AllianceContentAdminDashboard> {
  const db = getAdminClient()
  const [policy, candidateInputs, sessionsResult, pendingResult] = await Promise.all([
    getAllianceContentPolicy(guildId),
    loadAllianceContentCandidateInputs(guildId),
    db
      .from('alliance_content_sessions')
      .select('id, started_at, ended_at, confirmed_at')
      .eq('guild_id', guildId)
      .order('ended_at', { ascending: false })
      .limit(30),
    db
      .from('alliance_content_video_submissions')
      .select('id, requirement_id, session_id, status, video_url, discord_id, submitted_at')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
      .limit(50),
  ])
  if (sessionsResult.error) throw new Error(sessionsResult.error.message)
  if (pendingResult.error) throw new Error(pendingResult.error.message)

  const sessionRows = (sessionsResult.data ?? []) as SessionRow[]
  const sessionIds = sessionRows.map((row) => row.id)
  const participationResult = sessionIds.length === 0
    ? { data: [] as ParticipationRow[], error: null }
    : await db
      .from('alliance_content_participations')
      .select('session_id')
      .eq('guild_id', guildId)
      .in('session_id', sessionIds)
  if (participationResult.error) throw new Error(participationResult.error.message)
  const participantCounts = countBy(
    (participationResult.data ?? []) as ParticipationRow[],
    (row) => row.session_id,
  )

  const pendingRows = (pendingResult.data ?? []) as SubmissionRow[]
  const pendingRequirementIds = pendingRows.map((row) => row.requirement_id)
  const requirementResult = pendingRequirementIds.length === 0
    ? { data: [] as RequirementRow[], error: null }
    : await db
      .from('alliance_content_video_requirements')
      .select('id, due_at, status')
      .eq('guild_id', guildId)
      .in('id', pendingRequirementIds)
  if (requirementResult.error) throw new Error(requirementResult.error.message)
  const dueAtByRequirement = new Map(
    ((requirementResult.data ?? []) as RequirementRow[]).map((row) => [row.id, row.due_at]),
  )

  const pendingDiscordIds = Array.from(new Set(pendingRows.map((row) => row.discord_id)))
  const avatarResult = pendingDiscordIds.length === 0
    ? { data: [] as Array<{ discord_id: string; username: string }>, error: null }
    : await db
      .from('guild_avatars')
      .select('discord_id, username')
      .eq('guild_id', guildId)
      .in('discord_id', pendingDiscordIds)
  if (avatarResult.error) throw new Error(avatarResult.error.message)
  const usernameByDiscordId = new Map(
    (avatarResult.data ?? []).map((row) => [row.discord_id as string, row.username as string]),
  )

  return {
    policy,
    candidates: buildAllianceContentSessionCandidates(candidateInputs, policy.sessionGapMinutes).map(
      (candidate) => ({
        ...candidate,
        participantCount: candidate.participantAlbionIds.length,
      }),
    ),
    sessions: sessionRows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      confirmedAt: row.confirmed_at,
      participantCount: participantCounts.get(row.id) ?? 0,
    })),
    pendingSubmissions: pendingRows.map((row) => ({
      id: row.id,
      discordId: row.discord_id,
      username: usernameByDiscordId.get(row.discord_id) ?? row.discord_id,
      videoUrl: row.video_url,
      submittedAt: row.submitted_at,
      dueAt: dueAtByRequirement.get(row.requirement_id) ?? row.submitted_at,
    })),
  }
}

export async function getMyAllianceContentCompliance(
  guildId: string,
  discordId: string,
): Promise<MyAllianceContentCompliance> {
  const db = getAdminClient()
  const [policy, allSessionsResult, memberParticipationsResult, requirementsResult] = await Promise.all([
    getAllianceContentPolicy(guildId),
    db
      .from('alliance_content_sessions')
      .select('id, ended_at')
      .eq('guild_id', guildId)
      .eq('is_counted', true)
      .gte('ended_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    db
      .from('alliance_content_participations')
      .select('session_id')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId),
    db
      .from('alliance_content_video_requirements')
      .select('id, due_at, status')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .order('due_at', { ascending: true }),
  ])
  if (allSessionsResult.error) throw new Error(allSessionsResult.error.message)
  if (memberParticipationsResult.error) throw new Error(memberParticipationsResult.error.message)
  if (requirementsResult.error) throw new Error(requirementsResult.error.message)

  const weekSessionIds = new Set((allSessionsResult.data ?? []).map((row) => row.id as string))
  const memberParticipations = (memberParticipationsResult.data ?? []) as ParticipationRow[]
  const weekSessionCount = memberParticipations.filter((row) => weekSessionIds.has(row.session_id)).length
  const weekTotalSessions = weekSessionIds.size
  const requirementRows = (requirementsResult.data ?? []) as RequirementRow[]
  const requirementIds = requirementRows.map((row) => row.id)
  const [requirementSessionsResult, submissionsResult, sessionDetailsResult] = await Promise.all([
    requirementIds.length === 0
      ? Promise.resolve({ data: [] as RequirementSessionRow[], error: null })
      : db
        .from('alliance_content_video_requirement_sessions')
        .select('requirement_id, session_id')
        .eq('guild_id', guildId)
        .in('requirement_id', requirementIds),
    requirementIds.length === 0
      ? Promise.resolve({ data: [] as SubmissionRow[], error: null })
      : db
        .from('alliance_content_video_submissions')
        .select('id, requirement_id, session_id, status, video_url, discord_id, submitted_at')
        .eq('guild_id', guildId)
        .in('requirement_id', requirementIds)
        .order('submitted_at', { ascending: false }),
    memberParticipations.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; ended_at: string }>, error: null })
      : db
        .from('alliance_content_sessions')
        .select('id, ended_at')
        .eq('guild_id', guildId)
        .in('id', memberParticipations.map((row) => row.session_id)),
  ])
  if (requirementSessionsResult.error) throw new Error(requirementSessionsResult.error.message)
  if (submissionsResult.error) throw new Error(submissionsResult.error.message)
  if (sessionDetailsResult.error) throw new Error(sessionDetailsResult.error.message)

  const sessionEndedAt = new Map(
    (sessionDetailsResult.data ?? []).map((row) => [row.id as string, row.ended_at as string]),
  )
  const sessionsByRequirement = new Map<string, Array<{ id: string; endedAt: string }>>()
  for (const row of (requirementSessionsResult.data ?? []) as RequirementSessionRow[]) {
    const sessions = sessionsByRequirement.get(row.requirement_id) ?? []
    sessions.push({ id: row.session_id, endedAt: sessionEndedAt.get(row.session_id) ?? '' })
    sessionsByRequirement.set(row.requirement_id, sessions)
  }
  const submissionByRequirement = new Map<string, SubmissionRow>()
  for (const row of (submissionsResult.data ?? []) as SubmissionRow[]) {
    if (!submissionByRequirement.has(row.requirement_id)) {
      submissionByRequirement.set(row.requirement_id, row)
    }
  }

  return {
    policy,
    weekSessionCount,
    weekTotalSessions,
    weekParticipationRate: weekTotalSessions === 0 ? 0 : Math.round((weekSessionCount / weekTotalSessions) * 100),
    requirements: requirementRows.map((row) => {
      const submission = submissionByRequirement.get(row.id)
      const status = row.status === 'open' && Date.parse(row.due_at) < Date.now() ? 'overdue' : row.status
      return {
        id: row.id,
        dueAt: row.due_at,
        status,
        sessions: (sessionsByRequirement.get(row.id) ?? []).sort(
          (left, right) => left.endedAt.localeCompare(right.endedAt),
        ),
        submission: submission
          ? { id: submission.id, status: submission.status, videoUrl: submission.video_url }
          : null,
      }
    }),
  }
}

async function getAllianceContentPolicy(guildId: string): Promise<AllianceContentPolicy> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('alliance_content_policies')
    .select('session_gap_minutes, weekly_min_sessions, weekly_min_participation_rate, video_every_sessions, video_due_days')
    .eq('guild_id', guildId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return DEFAULT_POLICY
  const row = data as PolicyRow
  return {
    sessionGapMinutes: row.session_gap_minutes,
    weeklyMinSessions: row.weekly_min_sessions,
    weeklyMinParticipationRate: row.weekly_min_participation_rate,
    videoEverySessions: row.video_every_sessions,
    videoDueDays: row.video_due_days,
  }
}

async function loadAllianceContentCandidateInputs(guildId: string): Promise<AllianceContentBattleInput[]> {
  const db = getAdminClient()
  const [trackedResult, assignedResult, excludedResult] = await Promise.all([
    db
      .from('tenant_zvz_battle_records')
      .select('battle_record_id, started_at')
      .eq('guild_id', guildId)
      .order('started_at', { ascending: true })
      .limit(500),
    db
      .from('alliance_content_session_battles')
      .select('battle_record_id')
      .eq('guild_id', guildId),
    db
      .from('alliance_content_excluded_battles')
      .select('battle_record_id')
      .eq('guild_id', guildId),
  ])
  if (trackedResult.error) throw new Error(trackedResult.error.message)
  if (assignedResult.error) throw new Error(assignedResult.error.message)
  if (excludedResult.error) throw new Error(excludedResult.error.message)

  const assigned = new Set((assignedResult.data ?? []).map((row) => row.battle_record_id as string))
  const excluded = new Set((excludedResult.data ?? []).map((row) => row.battle_record_id as string))
  const startedAtByBattleId = new Map<string, string>()
  for (const row of trackedResult.data ?? []) {
    const battleRecordId = row.battle_record_id as string
    if (!assigned.has(battleRecordId) && !excluded.has(battleRecordId)) {
      startedAtByBattleId.set(battleRecordId, row.started_at as string)
    }
  }
  const battleIds = Array.from(startedAtByBattleId.keys())
  if (battleIds.length === 0) return []

  const [battleResult, participantsResult] = await Promise.all([
    db
      .from('battle_records')
      .select('id, started_at, ended_at')
      .in('id', battleIds),
    db
      .from('battle_participant_snapshots')
      .select('battle_record_id, entity_albion_id')
      .eq('participant_type', 'player')
      .in('battle_record_id', battleIds),
  ])
  if (battleResult.error) throw new Error(battleResult.error.message)
  if (participantsResult.error) throw new Error(participantsResult.error.message)

  const participantsByBattleId = new Map<string, Set<string>>()
  for (const row of participantsResult.data ?? []) {
    const battleRecordId = row.battle_record_id as string
    const participantIds = participantsByBattleId.get(battleRecordId) ?? new Set<string>()
    participantIds.add(row.entity_albion_id as string)
    participantsByBattleId.set(battleRecordId, participantIds)
  }

  return (battleResult.data ?? [])
    .filter((row) => typeof row.ended_at === 'string')
    .map((row) => ({
      battleRecordId: row.id as string,
      startedAt: (row.started_at as string) ?? startedAtByBattleId.get(row.id as string) ?? '',
      endedAt: row.ended_at as string,
      participantAlbionIds: Array.from(participantsByBattleId.get(row.id as string) ?? []),
    }))
}

function countBy<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = key(row)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}
