'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireCapability } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { requireAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
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

export async function confirmAllianceContentSession(
  battleRecordIds: string[],
): Promise<AllianceContentActionResult> {
  if (!isUuidList(battleRecordIds, 100)) return { ok: false, code: 'invalidBattleSelection' }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.STATS_VIEW)
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
): Promise<AllianceContentActionResult> {
  if (!isUuidList(battleRecordIds, 100)) return { ok: false, code: 'invalidBattleSelection' }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    await requireAllianceContentComplianceAvailable(guildId)
    const db = await requireCapability(CAP.STATS_VIEW)
    const { data: eligible, error: eligibleError } = await db
      .from('tenant_zvz_battle_records')
      .select('battle_record_id')
      .eq('guild_id', guildId)
      .in('battle_record_id', battleRecordIds)
    if (eligibleError || new Set((eligible ?? []).map((row) => row.battle_record_id as string)).size !== battleRecordIds.length) {
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
      details: { battleRecordCount: battleRecordIds.length },
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
): Promise<AllianceContentActionResult> {
  if (!isUuid(submissionId) || (decision !== 'approve' && decision !== 'reject')) {
    return { ok: false, code: 'invalidReview' }
  }

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
      p_review_note: null,
    })
    if (error) return failureFromDatabaseError(error.message)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: decision === 'approve' ? 'alliance_content.video.approve' : 'alliance_content.video.reject',
      targetId: submissionId,
      targetKind: 'alliance_content_video_submission',
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

function isUuidList(value: string[], maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && new Set(value).size === value.length && value.every(isUuid)
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isBoundedNonEmptyText(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && value === value.trim()
}

function failureFromError(error: unknown): AllianceContentActionResult {
  if (error instanceof Error) return failureFromDatabaseError(error.message)
  return { ok: false, code: 'requestFailed' }
}

function failureFromDatabaseError(message: string): AllianceContentActionResult {
  const knownCode = message.match(/ALLIANCE_CONTENT_[A-Z_]+/)?.[0]
  return { ok: false, code: knownCode ?? 'requestFailed' }
}
