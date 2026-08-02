import 'server-only'

import {
  buildAllianceContentAdminCandidatePreviews,
  selectAllianceContentBattleParticipantIds,
  type AllianceContentBattleInput,
  type AllianceContentCandidateMemberLink,
  type AllianceContentCandidateParticipant,
  type AllianceContentCandidateRosterMember,
} from '@/lib/alliance-content-compliance'
import { isAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import {
  buildAllianceContentStats,
  type AllianceContentStats,
} from '@/lib/alliance-content-compliance-stats'
import { parseRawBattle } from '@/lib/albion-battles'
import { getAdminClient } from '@/lib/supabase-admin'
import { tenantDateKey, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getAppSetting } from '@/lib/app-settings'
import {
  EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS,
  gameplayVideoEligibleUntil,
  hasRecentGameplayVideo,
} from '@/lib/member-gameplay-video'

export interface AllianceContentPolicy {
  sessionGapMinutes: number
  sessionTargetEnabled: boolean
  weeklyMinSessions: number
  weeklyMinParticipationRate: number
  participationDaysTargetEnabled: boolean
  weeklyMinParticipationDays: number
  videoEverySessions: number
  videoDueDays: number
}

export interface AllianceContentCandidate {
  battleRecordIds: string[]
  startedAt: string
  endedAt: string
  participantCount: number
  participants: AllianceContentCandidateParticipant[]
}

export interface AllianceContentSessionSummary {
  id: string
  startedAt: string
  endedAt: string
  confirmedAt: string
  battleCount: number
  participantCount: number
  participants: AllianceContentSessionParticipant[]
}

export interface AllianceContentSessionParticipant {
  discordId: string
  username: string
}

export interface AllianceContentAvailableMember {
  discordId: string
  username: string
}

export interface AllianceContentSubmissionSummary {
  id: string
  discordId: string
  username: string
  videoUrl: string
  submittedAt: string
  dueAt: string
  source: 'direct' | 'regear'
  sourceRegearRequestId: string | null
}

export interface AllianceContentExchangeRestriction {
  discordId: string
  blockedUntil: string
  reason: string
}

export interface AllianceContentRecentGameplayVideo {
  id: string
  discordId: string
  videoUrl: string
  uploadedAt: string
  eligibleUntil: string
  reflectionNote: string | null
}

export interface AllianceContentAdminDashboard {
  policy: AllianceContentPolicy
  exchangeRecentGameplayVideoRequired: boolean
  stats: AllianceContentStats
  candidates: AllianceContentCandidate[]
  sessions: AllianceContentSessionSummary[]
  activeMembers: AllianceContentAvailableMember[]
  pendingSubmissions: AllianceContentSubmissionSummary[]
  exchangeRestrictions: AllianceContentExchangeRestriction[]
  recentGameplayVideos: AllianceContentRecentGameplayVideo[]
}

export interface MyAllianceContentRequirement {
  id: string
  dueAt: string
  status: 'open' | 'submitted' | 'approved' | 'overdue' | 'waived'
  sessions: Array<{ id: string; endedAt: string }>
  submission: { id: string; status: 'pending' | 'approved' | 'rejected'; videoUrl: string } | null
}

export interface MyAllianceContentSessionDetail {
  id: string
  startedAt: string
  endedAt: string
  battleCount: number
  participantCount: number
  didParticipate: boolean
}

export interface MyAllianceContentCompliance {
  policy: AllianceContentPolicy
  weekSessionCount: number
  weekTotalSessions: number
  weekParticipationRate: number
  weekParticipationDayCount: number
  weekTotalActiveDays: number
  confirmedSessions: MyAllianceContentSessionDetail[]
  requirements: MyAllianceContentRequirement[]
  recentVideoUpload: {
    videoUrl: string
    uploadedAt: string
    eligibleUntil: string
    isExchangeEligible: boolean
    reflectionNote: string | null
  } | null
}

interface PolicyRow {
  session_gap_minutes: number
  session_target_enabled: boolean
  weekly_min_sessions: number
  weekly_min_participation_rate: number
  participation_days_target_enabled: boolean
  weekly_min_participation_days: number
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
  discord_id: string
}

interface StatsSessionRow {
  id: string
  ended_at: string
}

interface StatsRequirementRow {
  discord_id: string
  status: 'open' | 'submitted' | 'approved' | 'overdue' | 'waived'
}

interface SessionBattleRow {
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
  submission_source?: 'direct' | 'regear' | null
  source_regear_request_id?: string | null
}

interface ActiveMemberRow {
  discord_id: string
  username: string
  albion_player_id: string
}

interface ExchangeRestrictionRow {
  discord_id: string
  blocked_until: string
  reason: string
}

interface GameplayVideoUploadRow {
  id: string
  discord_id: string
  video_url: string
  uploaded_at: string
  reflection_note: string | null
}

const DEFAULT_POLICY: AllianceContentPolicy = {
  sessionGapMinutes: 90,
  sessionTargetEnabled: true,
  weeklyMinSessions: 3,
  weeklyMinParticipationRate: 0,
  participationDaysTargetEnabled: false,
  weeklyMinParticipationDays: 0,
  videoEverySessions: 3,
  videoDueDays: 7,
}

export async function getAllianceContentAdminDashboard(
  guildId: string,
  options: { includeExchangeRestrictions?: boolean } = {},
): Promise<AllianceContentAdminDashboard> {
  // 페이지/액션/RPC 게이트와 별개로 데이터 로더도 기능이 비활성화된 tenant의
  // battle ledger를 읽지 않는다.
  if (!(await isAllianceContentComplianceAvailable(guildId))) {
    return emptyAllianceContentAdminDashboard()
  }

  const db = getAdminClient()
  const statsNow = new Date()
  const statsCutoff = new Date(statsNow.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const recentGameplayVideoCutoff = new Date(
    statsNow.getTime() - EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const [
    timeZone,
    policy,
    exchangeRecentGameplayVideoRequiredSetting,
    candidateInputs,
    sessionsResult,
    statsSessionsResult,
    pendingResult,
  ] = await Promise.all([
    getTenantTimezone(guildId),
    getAllianceContentPolicy(guildId),
    getAppSetting('exchange_recent_gameplay_video_required', 'true', guildId),
    loadAllianceContentCandidateInputs(guildId),
    db
      .from('alliance_content_sessions')
      .select('id, started_at, ended_at, confirmed_at')
      .eq('guild_id', guildId)
      .order('ended_at', { ascending: false })
      .limit(30),
    db
      .from('alliance_content_sessions')
      .select('id, ended_at')
      .eq('guild_id', guildId)
      .eq('is_counted', true)
      .gte('ended_at', statsCutoff)
      .lte('ended_at', statsNow.toISOString())
      .order('ended_at', { ascending: false }),
    db
      .from('alliance_content_video_submissions')
      .select('id, requirement_id, session_id, status, video_url, discord_id, submitted_at, submission_source, source_regear_request_id')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
      .limit(50),
  ])
  if (sessionsResult.error) throw new Error(sessionsResult.error.message)
  if (statsSessionsResult.error) throw new Error(statsSessionsResult.error.message)
  if (pendingResult.error) throw new Error(pendingResult.error.message)

  const sessionRows = (sessionsResult.data ?? []) as SessionRow[]
  const sessionIds = sessionRows.map((row) => row.id)
  const statsSessionRows = (statsSessionsResult.data ?? []) as StatsSessionRow[]
  const statsSessionIds = statsSessionRows.map((row) => row.id)
  const [
    participationResult,
    statsParticipationResult,
    statsRequirementsResult,
    sessionBattlesResult,
    activeMembersResult,
    activeRosterResult,
  ] = await Promise.all([
    sessionIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[], error: null })
      : db
        .from('alliance_content_participations')
        .select('session_id, discord_id')
        .eq('guild_id', guildId)
        .in('session_id', sessionIds),
    statsSessionIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[], error: null })
      : db
        .from('alliance_content_participations')
        .select('session_id, discord_id')
        .eq('guild_id', guildId)
        .in('session_id', statsSessionIds),
    db
      .from('alliance_content_video_requirements')
      .select('discord_id, status')
      .eq('guild_id', guildId)
      .in('status', ['open', 'submitted', 'overdue']),
    sessionIds.length === 0
      ? Promise.resolve({ data: [] as SessionBattleRow[], error: null })
      : db
        .from('alliance_content_session_battles')
        .select('session_id')
        .eq('guild_id', guildId)
        .in('session_id', sessionIds),
    db
      .from('guild_avatars')
      .select('discord_id, username, albion_player_id')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .not('albion_player_id', 'is', null)
      .order('username', { ascending: true }),
    db
      .from('albion_guild_members')
      .select('albion_player_id, albion_player_name')
      .eq('guild_id', guildId)
      .is('left_at', null),
  ])
  if (participationResult.error) throw new Error(participationResult.error.message)
  if (statsParticipationResult.error) throw new Error(statsParticipationResult.error.message)
  if (statsRequirementsResult.error) throw new Error(statsRequirementsResult.error.message)
  if (sessionBattlesResult.error) throw new Error(sessionBattlesResult.error.message)
  if (activeMembersResult.error) throw new Error(activeMembersResult.error.message)
  if (activeRosterResult.error) throw new Error(activeRosterResult.error.message)
  const participationRows = (participationResult.data ?? []) as ParticipationRow[]
  const participantCounts = countBy(
    participationRows,
    (row) => row.session_id,
  )
  const participantsBySession = groupBy(participationRows, (row) => row.session_id)
  const battleCounts = countBy(
    (sessionBattlesResult.data ?? []) as SessionBattleRow[],
    (row) => row.session_id,
  )
  const activeMemberRows = (activeMembersResult.data ?? []) as ActiveMemberRow[]
  const activeMembers = activeMemberRows
    .map((member) => ({ discordId: member.discord_id, username: member.username }))
  const usernameByDiscordId = new Map(activeMembers.map((member) => [member.discordId, member.username]))
  const activeRosterMembers: AllianceContentCandidateRosterMember[] = (activeRosterResult.data ?? [])
    .map((member) => ({
      albionPlayerId: member.albion_player_id as string,
      albionPlayerName: member.albion_player_name as string,
    }))
  const candidateMemberLinks: AllianceContentCandidateMemberLink[] = activeMemberRows.map((member) => ({
    discordId: member.discord_id,
    username: member.username,
    albionPlayerId: member.albion_player_id,
  }))

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
  for (const row of avatarResult.data ?? []) {
    if (!usernameByDiscordId.has(row.discord_id as string)) {
      usernameByDiscordId.set(row.discord_id as string, row.username as string)
    }
  }

  const [exchangeRestrictionsResult, recentGameplayVideosResult] =
    options.includeExchangeRestrictions
      ? await Promise.all([
        db
          .from('member_exchange_restrictions')
          .select('discord_id, blocked_until, reason')
          .eq('guild_id', guildId)
          .gt('blocked_until', statsNow.toISOString())
          .order('blocked_until', { ascending: true }),
        db
          .from('member_gameplay_video_uploads')
          .select('id, discord_id, video_url, uploaded_at, reflection_note')
          .eq('guild_id', guildId)
          .eq('status', 'submitted')
          .gte('uploaded_at', recentGameplayVideoCutoff)
          .order('uploaded_at', { ascending: false }),
      ])
      : [
        { data: [] as ExchangeRestrictionRow[], error: null },
        { data: [] as GameplayVideoUploadRow[], error: null },
      ]
  if (exchangeRestrictionsResult.error) {
    throw new Error(exchangeRestrictionsResult.error.message)
  }
  if (recentGameplayVideosResult.error) {
    throw new Error(recentGameplayVideosResult.error.message)
  }
  const latestGameplayVideoByMember = new Map<string, GameplayVideoUploadRow>()
  for (const row of (recentGameplayVideosResult.data ?? []) as GameplayVideoUploadRow[]) {
    if (!latestGameplayVideoByMember.has(row.discord_id)) {
      latestGameplayVideoByMember.set(row.discord_id, row)
    }
  }

  return {
    policy,
    exchangeRecentGameplayVideoRequired:
      exchangeRecentGameplayVideoRequiredSetting !== 'false',
    stats: buildAllianceContentStats({
      now: statsNow,
      timeZone,
      policy,
      members: activeMembers,
      sessions: statsSessionRows.map((row) => ({ id: row.id, endedAt: row.ended_at })),
      participations: ((statsParticipationResult.data ?? []) as ParticipationRow[]).map((row) => ({
        sessionId: row.session_id,
        discordId: row.discord_id,
      })),
      requirements: ((statsRequirementsResult.data ?? []) as StatsRequirementRow[]).map((row) => ({
        discordId: row.discord_id,
        status: row.status,
      })),
    }),
    candidates: buildAllianceContentAdminCandidatePreviews(
      candidateInputs,
      policy.sessionGapMinutes,
      activeRosterMembers,
      candidateMemberLinks,
    ).map((candidate) => ({
      ...candidate,
      participantCount: candidate.participants.length,
    })),
    sessions: sessionRows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      confirmedAt: row.confirmed_at,
      battleCount: battleCounts.get(row.id) ?? 0,
      participantCount: participantCounts.get(row.id) ?? 0,
      participants: (participantsBySession.get(row.id) ?? [])
        .map((participant) => ({
          discordId: participant.discord_id,
          username: usernameByDiscordId.get(participant.discord_id) ?? participant.discord_id,
        }))
        .sort((left, right) => left.username.localeCompare(right.username)),
    })),
    activeMembers,
    pendingSubmissions: pendingRows.map((row) => ({
      id: row.id,
      discordId: row.discord_id,
      username: usernameByDiscordId.get(row.discord_id) ?? row.discord_id,
      videoUrl: row.video_url,
      submittedAt: row.submitted_at,
      dueAt: dueAtByRequirement.get(row.requirement_id) ?? row.submitted_at,
      source: row.submission_source === 'regear' ? 'regear' : 'direct',
      sourceRegearRequestId: row.source_regear_request_id ?? null,
    })),
    exchangeRestrictions: (
      (exchangeRestrictionsResult.data ?? []) as ExchangeRestrictionRow[]
    ).map((row) => ({
      discordId: row.discord_id,
      blockedUntil: row.blocked_until,
      reason: row.reason,
    })),
    recentGameplayVideos: Array.from(latestGameplayVideoByMember.values()).flatMap((row) => {
      const eligibleUntil = gameplayVideoEligibleUntil(row.uploaded_at)
      return eligibleUntil
        ? [{
            id: row.id,
            discordId: row.discord_id,
            videoUrl: row.video_url,
            uploadedAt: row.uploaded_at,
            eligibleUntil,
            reflectionNote: row.reflection_note,
          }]
        : []
    }),
  }
}

function emptyAllianceContentAdminDashboard(): AllianceContentAdminDashboard {
  return {
    policy: DEFAULT_POLICY,
    exchangeRecentGameplayVideoRequired: true,
    stats: buildAllianceContentStats({
      now: new Date(),
      timeZone: DEFAULT_TENANT_TIMEZONE,
      policy: DEFAULT_POLICY,
      members: [],
      sessions: [],
      participations: [],
      requirements: [],
    }),
    candidates: [],
    sessions: [],
    activeMembers: [],
    pendingSubmissions: [],
    exchangeRestrictions: [],
    recentGameplayVideos: [],
  }
}

export async function getMyAllianceContentCompliance(
  guildId: string,
  discordId: string,
): Promise<MyAllianceContentCompliance> {
  const db = getAdminClient()
  const now = new Date()
  const [
    timeZone,
    policy,
    allSessionsResult,
    recentSessionsResult,
    memberParticipationsResult,
    requirementsResult,
    recentVideoUploadResult,
  ] = await Promise.all([
    getTenantTimezone(guildId),
    getAllianceContentPolicy(guildId),
    db
      .from('alliance_content_sessions')
      .select('id, ended_at')
      .eq('guild_id', guildId)
      .eq('is_counted', true)
      .gte('ended_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .lte('ended_at', now.toISOString()),
    db
      .from('alliance_content_sessions')
      .select('id, started_at, ended_at, confirmed_at')
      .eq('guild_id', guildId)
      .eq('is_counted', true)
      .order('ended_at', { ascending: false })
      .limit(30),
    db
      .from('alliance_content_participations')
      .select('session_id, discord_id')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId),
    db
      .from('alliance_content_video_requirements')
      .select('id, due_at, status')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .order('due_at', { ascending: true }),
    db
      .from('member_gameplay_video_uploads')
      .select('id, discord_id, video_url, uploaded_at, reflection_note')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .eq('status', 'submitted')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (allSessionsResult.error) throw new Error(allSessionsResult.error.message)
  if (recentSessionsResult.error) throw new Error(recentSessionsResult.error.message)
  if (memberParticipationsResult.error) throw new Error(memberParticipationsResult.error.message)
  if (requirementsResult.error) throw new Error(requirementsResult.error.message)
  if (recentVideoUploadResult.error) throw new Error(recentVideoUploadResult.error.message)

  const weekSessions = (allSessionsResult.data ?? []) as StatsSessionRow[]
  const weekSessionIds = new Set(weekSessions.map((row) => row.id))
  const weekDateKeyBySessionId = new Map(
    weekSessions.map((row) => [row.id, tenantDateKey(row.ended_at, timeZone)]),
  )
  const memberParticipations = (memberParticipationsResult.data ?? []) as ParticipationRow[]
  const weekParticipationSessionIds = new Set(
    memberParticipations
      .filter((row) => weekSessionIds.has(row.session_id))
      .map((row) => row.session_id),
  )
  const weekSessionCount = weekParticipationSessionIds.size
  const weekTotalSessions = weekSessionIds.size
  const weekParticipationDayCount = new Set(
    Array.from(weekParticipationSessionIds)
      .map((sessionId) => weekDateKeyBySessionId.get(sessionId))
      .filter((dateKey): dateKey is string => dateKey !== undefined),
  ).size
  const weekTotalActiveDays = new Set(weekDateKeyBySessionId.values()).size
  const requirementRows = (requirementsResult.data ?? []) as RequirementRow[]
  const requirementIds = requirementRows.map((row) => row.id)
  const recentSessionRows = (recentSessionsResult.data ?? []) as SessionRow[]
  const recentSessionIds = recentSessionRows.map((row) => row.id)
  const [requirementSessionsResult, submissionsResult, sessionDetailsResult, recentParticipationResult, recentBattlesResult] = await Promise.all([
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
    recentSessionIds.length === 0
      ? Promise.resolve({ data: [] as ParticipationRow[], error: null })
      : db
        .from('alliance_content_participations')
        .select('session_id, discord_id')
        .eq('guild_id', guildId)
        .in('session_id', recentSessionIds),
    recentSessionIds.length === 0
      ? Promise.resolve({ data: [] as SessionBattleRow[], error: null })
      : db
        .from('alliance_content_session_battles')
        .select('session_id')
        .eq('guild_id', guildId)
        .in('session_id', recentSessionIds),
  ])
  if (requirementSessionsResult.error) throw new Error(requirementSessionsResult.error.message)
  if (submissionsResult.error) throw new Error(submissionsResult.error.message)
  if (sessionDetailsResult.error) throw new Error(sessionDetailsResult.error.message)
  if (recentParticipationResult.error) throw new Error(recentParticipationResult.error.message)
  if (recentBattlesResult.error) throw new Error(recentBattlesResult.error.message)

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
  const recentParticipantCounts = countBy(
    (recentParticipationResult.data ?? []) as ParticipationRow[],
    (row) => row.session_id,
  )
  const recentBattleCounts = countBy(
    (recentBattlesResult.data ?? []) as SessionBattleRow[],
    (row) => row.session_id,
  )
  const memberParticipationIds = new Set(memberParticipations.map((row) => row.session_id))
  const recentVideoUploadRow = recentVideoUploadResult.data as GameplayVideoUploadRow | null
  const recentVideoEligibleUntil = recentVideoUploadRow
    ? gameplayVideoEligibleUntil(recentVideoUploadRow.uploaded_at)
    : null

  return {
    policy,
    weekSessionCount,
    weekTotalSessions,
    weekParticipationRate: weekTotalSessions === 0 ? 0 : Math.round((weekSessionCount / weekTotalSessions) * 100),
    weekParticipationDayCount,
    weekTotalActiveDays,
    confirmedSessions: recentSessionRows.map((session) => ({
      id: session.id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      battleCount: recentBattleCounts.get(session.id) ?? 0,
      participantCount: recentParticipantCounts.get(session.id) ?? 0,
      didParticipate: memberParticipationIds.has(session.id),
    })),
    recentVideoUpload: recentVideoUploadRow && recentVideoEligibleUntil
      ? {
          videoUrl: recentVideoUploadRow.video_url,
          uploadedAt: recentVideoUploadRow.uploaded_at,
          eligibleUntil: recentVideoEligibleUntil,
          isExchangeEligible: hasRecentGameplayVideo(recentVideoUploadRow.uploaded_at),
          reflectionNote: recentVideoUploadRow.reflection_note,
        }
      : null,
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
    .select('session_gap_minutes, session_target_enabled, weekly_min_sessions, weekly_min_participation_rate, participation_days_target_enabled, weekly_min_participation_days, video_every_sessions, video_due_days')
    .eq('guild_id', guildId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return DEFAULT_POLICY
  const row = data as PolicyRow
  return {
    sessionGapMinutes: row.session_gap_minutes,
    sessionTargetEnabled: row.session_target_enabled,
    weeklyMinSessions: row.weekly_min_sessions,
    weeklyMinParticipationRate: row.weekly_min_participation_rate,
    participationDaysTargetEnabled: row.participation_days_target_enabled,
    weeklyMinParticipationDays: row.weekly_min_participation_days,
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
      .order('started_at', { ascending: false })
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
      .select('id, started_at, ended_at, raw_battle')
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
    .map((row) => {
      const battleRecordId = row.id as string
      const rawBattle = parseRawBattle(row.raw_battle)
      const rawParticipantAlbionIds = rawBattle
        ? Object.values(rawBattle.players).map((player) => player.id)
        : []
      return {
        battleRecordId,
        startedAt: (row.started_at as string) ?? startedAtByBattleId.get(battleRecordId) ?? '',
        endedAt: row.ended_at as string,
        participantAlbionIds: selectAllianceContentBattleParticipantIds(
          Array.from(participantsByBattleId.get(battleRecordId) ?? []),
          rawParticipantAlbionIds,
        ),
      }
    })
}

function countBy<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = key(row)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function groupBy<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const value = key(row)
    groups.set(value, [...(groups.get(value) ?? []), row])
  }
  return groups
}
