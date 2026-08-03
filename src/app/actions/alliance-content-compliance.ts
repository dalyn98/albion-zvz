'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireCapability, requireCurrentMutationSession } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { requireAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import { getAllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'
import { getYoutubeVideoProofId, normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { logAdminAction } from '@/lib/admin-audit'
import { getAdminClient } from '@/lib/supabase-admin'
import { MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH } from '@/lib/member-gameplay-video'

type AllianceContentActionFailure = { ok: false; code: string }

export type AllianceContentActionResult = { ok: true } | AllianceContentActionFailure

export interface AllianceContentBulkReviewResult {
  ok: boolean
  reviewedIds: string[]
  failedIds: string[]
  code?: string
}

interface AllianceContentPolicyInput {
  sessionGapMinutes: number
  sessionTargetEnabled: boolean
  weeklyMinSessions: number
  weeklyMinParticipationRate: number
  participationDaysTargetEnabled: boolean
  weeklyMinParticipationDays: number
}

interface ManualParticipationInput {
  sessionId: string
  memberDiscordId: string
}

interface MemberGameplayVideoInput {
  videoUrl: string
  reflectionNote?: string
}

interface InvalidateMemberGameplayVideoInput {
  uploadId: string
  reason: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_DISCORD_ID_LENGTH = 128
const MAX_CONFIRM_BATTLE_SELECTION = 100
const MAX_EXCLUDE_BATTLE_SELECTION = 500
const MAX_VIDEO_REVIEW_SELECTION = 50
const VIDEO_REVIEW_BATCH_SIZE = 10
const BATTLE_ELIGIBILITY_QUERY_BATCH_SIZE = 100
const REVIEW_NOTE_MAX_LENGTH = 500

export async function confirmAllianceContentSession(
  battleRecordIds: string[],
): Promise<AllianceContentActionResult> {
  if (!isUuidList(battleRecordIds, MAX_CONFIRM_BATTLE_SELECTION)) {
    return { ok: false, code: 'invalidBattleSelection' }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.CONTENT_COMPLIANCE_MANAGE)
    const dashboard = await getAllianceContentAdminDashboard(guildId)
    const isPendingCandidate = dashboard.candidates.some((candidate) =>
      hasSameValues(candidate.battleRecordIds, battleRecordIds),
    )
    if (!isPendingCandidate) return { ok: false, code: 'invalidBattleSelection' }
    const { data, error } = await db.rpc('confirm_alliance_content_session', {
      p_guild_id: guildId,
      p_battle_record_ids: battleRecordIds,
      p_admin_discord_id: session.discordId,
    })
    if (error) return failureFromDatabaseError(error.message)

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'alliance_content.session.confirm',
      targetId: typeof data === 'string' ? data : null,
      targetKind: 'alliance_content_session',
      details: { battleRecordCount: battleRecordIds.length },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function excludeAllianceContentBattles(
  battleRecordIds: string[],
  exclusionReason?: string,
): Promise<AllianceContentActionResult> {
  if (!isUuidList(battleRecordIds, MAX_EXCLUDE_BATTLE_SELECTION)) {
    return { ok: false, code: 'invalidBattleSelection' }
  }
  const normalizedExclusionReason = normalizeOptionalReviewNote(exclusionReason)
  if (normalizedExclusionReason === undefined) return { ok: false, code: 'invalidReviewNote' }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.CONTENT_COMPLIANCE_MANAGE)
    const eligibleBattleRecordIds = new Set<string>()
    for (let offset = 0; offset < battleRecordIds.length; offset += BATTLE_ELIGIBILITY_QUERY_BATCH_SIZE) {
      const selectionBatch = battleRecordIds.slice(offset, offset + BATTLE_ELIGIBILITY_QUERY_BATCH_SIZE)
      const { data: eligible, error: eligibleError } = await db
        .from('tenant_zvz_battle_records')
        .select('battle_record_id')
        .eq('guild_id', guildId)
        .in('battle_record_id', selectionBatch)
      if (eligibleError) return { ok: false, code: 'invalidBattleSelection' }
      for (const row of eligible ?? []) {
        eligibleBattleRecordIds.add(row.battle_record_id as string)
      }
    }
    if (eligibleBattleRecordIds.size !== battleRecordIds.length) {
      return { ok: false, code: 'invalidBattleSelection' }
    }
    const { error } = await db.from('alliance_content_excluded_battles').upsert(
      battleRecordIds.map((battleRecordId) => ({
        guild_id: guildId,
        battle_record_id: battleRecordId,
        excluded_by_discord_id: session.discordId,
      })),
      { onConflict: 'guild_id,battle_record_id' },
    )
    if (error) return failureFromDatabaseError(error.message)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'alliance_content.battle.exclude',
      targetKind: 'battle',
      details: {
        battleRecordCount: battleRecordIds.length,
        exclusionReason: normalizedExclusionReason,
      },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function updateAllianceContentPolicy(
  input: AllianceContentPolicyInput,
): Promise<AllianceContentActionResult> {
  if (
    !isIntegerInRange(input.sessionGapMinutes, 15, 240) ||
    typeof input.sessionTargetEnabled !== 'boolean' ||
    !isIntegerInRange(input.weeklyMinSessions, 0, 20) ||
    !isIntegerInRange(input.weeklyMinParticipationRate, 0, 100) ||
    typeof input.participationDaysTargetEnabled !== 'boolean' ||
    !isIntegerInRange(input.weeklyMinParticipationDays, 0, 7) ||
    (!input.sessionTargetEnabled && !input.participationDaysTargetEnabled) ||
    (input.participationDaysTargetEnabled && input.weeklyMinParticipationDays === 0)
  ) {
    return { ok: false, code: 'invalidPolicy' }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.CONTENT_COMPLIANCE_MANAGE)
    const { error } = await db
      .from('alliance_content_policies')
      .update({
        session_gap_minutes: input.sessionGapMinutes,
        session_target_enabled: input.sessionTargetEnabled,
        weekly_min_sessions: input.weeklyMinSessions,
        weekly_min_participation_rate: input.weeklyMinParticipationRate,
        participation_days_target_enabled: input.participationDaysTargetEnabled,
        weekly_min_participation_days: input.weeklyMinParticipationDays,
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
    if (error) return failureFromDatabaseError(error.message)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'alliance_content.policy.update',
      targetId: guildId,
      targetKind: 'alliance_content_policy',
      details: { ...input },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function addAllianceContentManualParticipation(
  input: ManualParticipationInput,
): Promise<AllianceContentActionResult> {
  if (!isUuid(input.sessionId) || !isBoundedNonEmptyText(input.memberDiscordId, MAX_DISCORD_ID_LENGTH)) {
    return { ok: false, code: 'invalidManualParticipation' }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.CONTENT_COMPLIANCE_MANAGE)
    const { data, error } = await db.rpc('add_alliance_content_manual_participation', {
      p_guild_id: guildId,
      p_session_id: input.sessionId,
      p_discord_id: input.memberDiscordId,
    })
    if (error) return failureFromDatabaseError(error.message)

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'alliance_content.participation.add',
      targetId: input.sessionId,
      targetKind: 'alliance_content_session',
      targetDiscordId: input.memberDiscordId,
      details: { source: 'admin_override', added: data === true },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function submitAllianceContentVideo(input: {
  requirementId: string
  sessionId: string
  videoUrl: string
}): Promise<AllianceContentActionResult> {
  if (!isUuid(input.requirementId) || !isUuid(input.sessionId) || input.videoUrl.length > 2_000) {
    return { ok: false, code: 'invalidVideo' }
  }
  const videoUrl = normalizeYoutubeVideoProofUrl(input.videoUrl)
  const youtubeVideoId = getYoutubeVideoProofId(input.videoUrl)
  if (!videoUrl || !youtubeVideoId) return { ok: false, code: 'invalidVideo' }

  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session?.isMember) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const { error } = await getAdminClient().rpc('submit_alliance_content_video', {
      p_guild_id: guildId,
      p_requirement_id: input.requirementId,
      p_session_id: input.sessionId,
      p_discord_id: session.discordId,
      p_youtube_video_id: youtubeVideoId,
      p_video_url: videoUrl,
    })
    if (error?.code === '23505') {
      return { ok: false, code: 'ALLIANCE_CONTENT_VIDEO_ALREADY_USED' }
    }
    if (error) return failureFromDatabaseError(error.message)
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function submitMemberGameplayVideo(
  input: MemberGameplayVideoInput,
): Promise<AllianceContentActionResult> {
  if (
    !input
    || typeof input !== 'object'
    || typeof input.videoUrl !== 'string'
    || input.videoUrl.length > 2_000
  ) {
    return { ok: false, code: 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL' }
  }
  const reflectionNote = normalizeOptionalBoundedText(
    input.reflectionNote,
    MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH,
  )
  if (reflectionNote === undefined) {
    return { ok: false, code: 'MEMBER_GAMEPLAY_VIDEO_REFLECTION_TOO_LONG' }
  }
  const videoUrl = normalizeYoutubeVideoProofUrl(input.videoUrl)
  const youtubeVideoId = getYoutubeVideoProofId(input.videoUrl)
  if (!videoUrl || !youtubeVideoId) {
    return { ok: false, code: 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL' }
  }

  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session?.isMember) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const { error } = await getAdminClient().rpc('submit_member_gameplay_video', {
      p_guild_id: guildId,
      p_discord_id: session.discordId,
      p_youtube_video_id: youtubeVideoId,
      p_video_url: videoUrl,
      p_reflection_note: reflectionNote,
    })
    if (error) return failureFromDatabaseError(error.message)
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function invalidateMemberGameplayVideo(
  input: InvalidateMemberGameplayVideoInput,
): Promise<AllianceContentActionResult> {
  if (typeof input?.uploadId !== 'string' || !isUuid(input.uploadId)) {
    return { ok: false, code: 'MEMBER_GAMEPLAY_VIDEO_NOT_INVALIDATABLE' }
  }
  const reason = normalizeOptionalBoundedText(input.reason, REVIEW_NOTE_MAX_LENGTH)
  if (!reason) {
    return {
      ok: false,
      code: reason === undefined
        ? 'MEMBER_GAMEPLAY_VIDEO_INVALIDATION_REASON_TOO_LONG'
        : 'MEMBER_GAMEPLAY_VIDEO_INVALIDATION_REASON_REQUIRED',
    }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.EXCHANGE_APPROVE)
    const { data, error } = await db
      .from('member_gameplay_video_uploads')
      .update({
        status: 'invalidated',
        invalidated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', input.uploadId)
      .eq('status', 'submitted')
      .select('id, discord_id')
      .maybeSingle()
    if (error) return failureFromDatabaseError(error.message)
    if (!data) return { ok: false, code: 'MEMBER_GAMEPLAY_VIDEO_NOT_INVALIDATABLE' }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member.gameplay_video.invalidate',
      targetId: data.id as string,
      targetKind: 'member',
      targetDiscordId: data.discord_id as string,
      details: { reason },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

export async function reviewAllianceContentVideo(
  submissionId: string,
  decision: 'approve' | 'reject',
  reviewNoteInput?: string,
): Promise<AllianceContentActionResult> {
  const result = await reviewAllianceContentVideos([submissionId], decision, reviewNoteInput)
  return result.ok
    ? { ok: true }
    : { ok: false, code: result.code ?? 'requestFailed' }
}

export async function reviewAllianceContentVideos(
  submissionIds: string[],
  decision: 'approve' | 'reject',
  reviewNoteInput?: string,
): Promise<AllianceContentBulkReviewResult> {
  const emptyResult = { reviewedIds: [], failedIds: [] }
  if (!isUuidList(submissionIds, MAX_VIDEO_REVIEW_SELECTION)) {
    return { ok: false, ...emptyResult, code: 'invalidReviewSelection' }
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, ...emptyResult, code: 'invalidReview' }
  }
  const reviewNote = normalizeOptionalReviewNote(reviewNoteInput)
  if (reviewNote === undefined) {
    return { ok: false, ...emptyResult, code: 'invalidReviewNote' }
  }
  if (decision === 'reject' && !reviewNote) {
    return { ok: false, ...emptyResult, code: 'reviewNoteRequired' }
  }

  try {
    const session = await getSession()
    if (!session) {
      return { ok: false, reviewedIds: [], failedIds: submissionIds, code: 'unauthorized' }
    }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.CONTENT_COMPLIANCE_MANAGE)
    let reviewResults: Array<{ id: string; code: string | null }> = []

    for (let offset = 0; offset < submissionIds.length; offset += VIDEO_REVIEW_BATCH_SIZE) {
      const batch = submissionIds.slice(offset, offset + VIDEO_REVIEW_BATCH_SIZE)
      const batchResults = await Promise.all(batch.map(async (submissionId) => {
        try {
          const { error } = await db.rpc('review_alliance_content_video', {
            p_guild_id: guildId,
            p_submission_id: submissionId,
            p_admin_discord_id: session.discordId,
            p_decision: decision,
            p_review_note: reviewNote,
          })
          return {
            id: submissionId,
            code: error ? failureFromDatabaseError(error.message).code : null,
          }
        } catch (error) {
          return { id: submissionId, code: failureFromError(error).code }
        }
      }))
      reviewResults = [...reviewResults, ...batchResults]
    }

    const reviewedIds = reviewResults
      .filter((result) => result.code === null)
      .map((result) => result.id)
    const failedResults = reviewResults.filter((result) => result.code !== null)
    const failedIds = failedResults.map((result) => result.id)

    if (reviewedIds.length > 0) {
      await Promise.all(reviewedIds.map((submissionId) => logAdminAction({
        guildId,
        adminDiscordId: session.discordId,
        action: decision === 'approve' ? 'alliance_content.video.approve' : 'alliance_content.video.reject',
        targetId: submissionId,
        targetKind: 'alliance_content_video_submission',
        details: { reviewNote },
      })))
      revalidateAllianceContentPaths()
    }

    return {
      ok: failedIds.length === 0,
      reviewedIds,
      failedIds,
      ...(failedResults[0]?.code ? { code: failedResults[0].code } : {}),
    }
  } catch (error) {
    return {
      ok: false,
      reviewedIds: [],
      failedIds: submissionIds,
      code: failureFromError(error).code,
    }
  }
}

function revalidateAllianceContentPaths(): void {
  revalidatePath('/admin/dashboard/content-compliance')
  revalidatePath('/me/content-compliance')
  revalidatePath('/me/wallet')
  revalidatePath('/me')
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function isUuidList(value: unknown, maxLength: number): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= maxLength
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && isUuid(item))
}

function hasSameValues(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightValues = new Set(right)
  return left.every((value) => rightValues.has(value))
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isBoundedNonEmptyText(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && value === value.trim()
}

function normalizeOptionalReviewNote(value: unknown): string | null | undefined {
  return normalizeOptionalBoundedText(value, REVIEW_NOTE_MAX_LENGTH)
}

function normalizeOptionalBoundedText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) return undefined
  return trimmed
}

function failureFromError(error: unknown): AllianceContentActionFailure {
  if (error instanceof Error) return failureFromDatabaseError(error.message)
  return { ok: false, code: 'requestFailed' }
}

function failureFromDatabaseError(message: string): AllianceContentActionFailure {
  const knownCode = message.match(/(?:ALLIANCE_CONTENT|MEMBER_GAMEPLAY_VIDEO)_[A-Z_]+/)?.[0]
  return { ok: false, code: knownCode ?? 'requestFailed' }
}
