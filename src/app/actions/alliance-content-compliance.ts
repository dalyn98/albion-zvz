'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireCapability } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { requireAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import { getAllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'
import { getYoutubeVideoProofId, normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { logAdminAction } from '@/lib/admin-audit'
import { getAdminClient } from '@/lib/supabase-admin'

export type AllianceContentActionResult =
  | { ok: true }
  | { ok: false; code: string }

interface AllianceContentPolicyInput {
  sessionGapMinutes: number
  weeklyMinSessions: number
  weeklyMinParticipationRate: number
}

interface ManualParticipationInput {
  sessionId: string
  memberDiscordId: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_DISCORD_ID_LENGTH = 128
const MAX_CONFIRM_BATTLE_SELECTION = 100
const MAX_EXCLUDE_BATTLE_SELECTION = 500
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
    const db = await requireCapability(CAP.STATS_VIEW)
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
    const db = await requireCapability(CAP.STATS_VIEW)
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
    !isIntegerInRange(input.weeklyMinSessions, 0, 20) ||
    !isIntegerInRange(input.weeklyMinParticipationRate, 0, 100)
  ) {
    return { ok: false, code: 'invalidPolicy' }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.STATS_VIEW)
    const { error } = await db
      .from('alliance_content_policies')
      .update({
        session_gap_minutes: input.sessionGapMinutes,
        weekly_min_sessions: input.weeklyMinSessions,
        weekly_min_participation_rate: input.weeklyMinParticipationRate,
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
    const db = await requireCapability(CAP.STATS_VIEW)
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
    const session = await getSession()
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
    if (error) return failureFromDatabaseError(error.message)
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
  if (!isUuid(submissionId) || (decision !== 'approve' && decision !== 'reject')) {
    return { ok: false, code: 'invalidReview' }
  }
  const reviewNote = normalizeOptionalReviewNote(reviewNoteInput)
  if (reviewNote === undefined) return { ok: false, code: 'invalidReviewNote' }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.STATS_VIEW)
    const { error } = await db.rpc('review_alliance_content_video', {
      p_guild_id: guildId,
      p_submission_id: submissionId,
      p_admin_discord_id: session.discordId,
      p_decision: decision,
      p_review_note: reviewNote,
    })
    if (error) return failureFromDatabaseError(error.message)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: decision === 'approve' ? 'alliance_content.video.approve' : 'alliance_content.video.reject',
      targetId: submissionId,
      targetKind: 'alliance_content_video_submission',
      details: { reviewNote },
    })
    revalidateAllianceContentPaths()
    return { ok: true }
  } catch (error) {
    return failureFromError(error)
  }
}

function revalidateAllianceContentPaths(): void {
  revalidatePath('/admin/dashboard/content-compliance')
  revalidatePath('/me/content-compliance')
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
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > REVIEW_NOTE_MAX_LENGTH) return undefined
  return trimmed
}

function failureFromError(error: unknown): AllianceContentActionResult {
  if (error instanceof Error) return failureFromDatabaseError(error.message)
  return { ok: false, code: 'requestFailed' }
}

function failureFromDatabaseError(message: string): AllianceContentActionResult {
  const knownCode = message.match(/ALLIANCE_CONTENT_[A-Z_]+/)?.[0]
  return { ok: false, code: knownCode ?? 'requestFailed' }
}
