import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import {
  buildEventParticipationCloseoutModel,
  type EventParticipationAssignmentSeed,
  type EventParticipationCloseoutModel,
} from '@/lib/event-participation-closeout'
import type { EventReport } from '@/lib/event-report'
import { listTentativeSignupsForGuild } from '@/lib/event-tentative-signups'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { formatSilver } from '@/lib/silver'
import { log } from '@/lib/log'
import { isDiscordId } from '@/lib/discord-id'

export interface EventParticipationCloseoutReceiptEntry {
  id: string
  discordId: string
  username: string
  source: 'slot' | 'manual'
  decision: 'included' | 'excluded'
  roleNames: string[]
  evidenceStatus:
    | 'activity_confirmed'
    | 'activity_not_found'
    | 'activity_only'
    | 'not_checked'
  activityBattleCount: number
  decisionNote: string | null
  rewardAmount: number
}

export interface EventParticipationCloseoutReceipt {
  id: string
  eventId: string
  rewardPerMember: number
  participantCount: number
  excludedSlotCount: number
  manualParticipantCount: number
  totalReward: number
  memo: string | null
  finalizedByUsername: string
  finalizedAt: string
  entries: EventParticipationCloseoutReceiptEntry[]
}

export interface EventParticipationCloseoutState extends EventParticipationCloseoutModel {
  activityChecked: boolean
  canFinalizeNow: boolean
  legacyPayoutStatus: 'pending' | 'approved' | null
  receipt: EventParticipationCloseoutReceipt | null
}

interface LoadStateInput {
  guildId: string
  eventId: string
  battleStartedAt: string
  assignments: readonly EventParticipationAssignmentSeed[]
  report: EventReport
}

type DirectoryRow = {
  discord_id: string | null
  username: string | null
  albion_nickname?: string | null
  avatar?: string | null
}

type CloseoutHeaderRow = {
  id: string
  event_id: string
  reward_per_member: number
  final_participant_count: number
  excluded_slot_count: number
  manual_participant_count: number
  total_reward: number | string
  memo: string | null
  finalized_by_username: string
  finalized_at: string
}

type CloseoutEntryRow = {
  id: string
  discord_id: string
  username: string
  source: 'slot' | 'manual'
  decision: 'included' | 'excluded'
  role_names: string[] | null
  activity_evidence_status: EventParticipationCloseoutReceiptEntry['evidenceStatus']
  activity_battle_count: number
  decision_note: string | null
  reward_amount: number
}

function normalizeDirectoryRows(
  avatarRows: readonly DirectoryRow[],
  guestRows: readonly DirectoryRow[],
) {
  const directory = new Map<
    string,
    {
      discordId: string
      username: string
      albionNickname: string | null
      avatar: string | null
    }
  >()
  for (const row of [...avatarRows, ...guestRows]) {
    const discordId = row.discord_id?.trim()
    const username = row.username?.trim()
    if (!discordId || !username) continue
    const current = directory.get(discordId)
    directory.set(discordId, {
      discordId,
      username: current?.username || username,
      albionNickname:
        current?.albionNickname || row.albion_nickname?.trim() || null,
      avatar: current?.avatar || row.avatar?.trim() || null,
    })
  }
  return [...directory.values()]
}

function normalizeLegacyPayoutStatus(
  rows: readonly { status: string | null }[],
): 'pending' | 'approved' | null {
  if (rows.some((row) => row.status === 'approved')) return 'approved'
  if (rows.some((row) => row.status === 'pending')) return 'pending'
  return null
}

export async function loadEventParticipationCloseoutState(
  input: LoadStateInput,
): Promise<EventParticipationCloseoutState> {
  const db = getAdminClient()
  const [
    avatarResult,
    guestResult,
    tentativeResult,
    closeoutResult,
    legacyResult,
  ] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, username, albion_nickname, avatar')
      .eq('guild_id', input.guildId)
      .is('withdrawn_at', null)
      .order('username'),
    db
      .from('guests')
      .select('discord_id, username, avatar')
      .eq('guild_id', input.guildId)
      .order('username'),
    listTentativeSignupsForGuild(input.eventId, input.guildId),
    db
      .from('event_participation_closeouts')
      .select(
        'id, event_id, reward_per_member, final_participant_count, excluded_slot_count, manual_participant_count, total_reward, memo, finalized_by_username, finalized_at',
      )
      .eq('guild_id', input.guildId)
      .eq('event_id', input.eventId)
      .maybeSingle(),
    db
      .from('event_payout_requests')
      .select('status')
      .eq('guild_id', input.guildId)
      .eq('event_id', input.eventId)
      .in('status', ['pending', 'approved']),
  ])

  const queryError =
    avatarResult.error ||
    guestResult.error ||
    closeoutResult.error ||
    legacyResult.error
  if (queryError) {
    throw new Error(
      `event participation closeout state failed: ${queryError.message}`,
    )
  }
  if (tentativeResult.error) {
    throw new Error(
      `event participation closeout tentative state failed: ${tentativeResult.error}`,
    )
  }

  const activityChecked = input.report.attendance.linkedBattleCount > 0
  const model = buildEventParticipationCloseoutModel({
    assignments: input.assignments,
    activities: input.report.attendance.participants.map((participant) => ({
      discordId: participant.discord_id,
      username: participant.username,
      battleCount: participant.battleCount,
      albionPlayerId: participant.albion_player_id,
    })),
    tentative: tentativeResult.rows.map((row) => ({
      discordId: row.discord_id,
      username: row.username,
      possibleRoles: row.possible_roles,
      notes: row.notes,
    })),
    directory: normalizeDirectoryRows(
      (avatarResult.data ?? []) as DirectoryRow[],
      (guestResult.data ?? []) as DirectoryRow[],
    ),
    activityChecked,
  })

  const header = closeoutResult.data as CloseoutHeaderRow | null
  let receipt: EventParticipationCloseoutReceipt | null = null
  if (header) {
    const { data: entryRows, error: entriesError } = await db
      .from('event_participation_closeout_entries')
      .select(
        'id, discord_id, username, source, decision, role_names, activity_evidence_status, activity_battle_count, decision_note, reward_amount',
      )
      .eq('guild_id', input.guildId)
      .eq('closeout_id', header.id)
      .order('decision', { ascending: false })
      .order('username', { ascending: true })
    if (entriesError) {
      throw new Error(
        `event participation closeout entries failed: ${entriesError.message}`,
      )
    }
    receipt = {
      id: header.id,
      eventId: header.event_id,
      rewardPerMember: header.reward_per_member,
      participantCount: header.final_participant_count,
      excludedSlotCount: header.excluded_slot_count,
      manualParticipantCount: header.manual_participant_count,
      totalReward: Number(header.total_reward),
      memo: header.memo,
      finalizedByUsername: header.finalized_by_username,
      finalizedAt: header.finalized_at,
      entries: ((entryRows ?? []) as CloseoutEntryRow[]).map((row) => ({
        id: row.id,
        discordId: row.discord_id,
        username: row.username,
        source: row.source,
        decision: row.decision,
        roleNames: row.role_names ?? [],
        evidenceStatus: row.activity_evidence_status,
        activityBattleCount: row.activity_battle_count,
        decisionNote: row.decision_note,
        rewardAmount: row.reward_amount,
      })),
    }
  }

  return {
    ...model,
    activityChecked,
    canFinalizeNow:
      Date.parse(input.battleStartedAt) <= Date.now() - 60 * 60 * 1000,
    legacyPayoutStatus: normalizeLegacyPayoutStatus(
      (legacyResult.data ?? []) as { status: string | null }[],
    ),
    receipt,
  }
}

interface ClaimedOutboxRow {
  id: string
  guild_id: string
  event_id: string
  closeout_id: string
  entry_id: string
  discord_id: string
  payload: {
    eventTitle?: unknown
    rewardPerMember?: unknown
  } | null
  attempts: number
}

export interface ProcessEventParticipationOutboxResult {
  claimed: number
  sent: number
  skipped: number
  failed: number
}

function safeOutboxError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.trim().slice(0, 1000) || 'unknown'
}

export async function processEventParticipationNotificationOutbox(options?: {
  limit?: number
  closeoutId?: string | null
}): Promise<ProcessEventParticipationOutboxResult> {
  const db = getAdminClient()
  const limit = Math.min(Math.max(1, options?.limit ?? 25), 100)
  const { data, error } = await db.rpc(
    'claim_event_participation_notification_outbox',
    {
      p_limit: limit,
      p_closeout_id: options?.closeoutId ?? null,
      p_lease_seconds: 300,
    },
  )
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as ClaimedOutboxRow[]
  const result: ProcessEventParticipationOutboxResult = {
    claimed: rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  for (const row of rows) {
    try {
      if (!isDiscordId(row.discord_id)) {
        const { error: updateError } = await db
          .from('event_participation_notification_outbox')
          .update({
            status: 'skipped',
            locked_at: null,
            last_error: null,
            sent_at: null,
          })
          .eq('guild_id', row.guild_id)
          .eq('id', row.id)
          .eq('status', 'processing')
        if (updateError) throw new Error(updateError.message)
        result.skipped += 1
        continue
      }
      const eventTitle =
        typeof row.payload?.eventTitle === 'string'
          ? row.payload.eventTitle
          : ''
      const rewardPerMember =
        typeof row.payload?.rewardPerMember === 'number' &&
        Number.isInteger(row.payload.rewardPerMember) &&
        row.payload.rewardPerMember >= 0
          ? row.payload.rewardPerMember
          : 0
      const dmResult = await sendLocalizedDiscordDmToUser(
        row.discord_id,
        row.guild_id,
        (tDm) => ({
          title: tDm('eventParticipationFinalizedTitle'),
          body:
            rewardPerMember > 0
              ? tDm('eventParticipationFinalizedBody', {
                  event: eventTitle,
                  silver: formatSilver(rewardPerMember),
                })
              : tDm('eventParticipationFinalizedNoRewardBody', {
                  event: eventTitle,
                }),
          url: `/events/${row.event_id}/report`,
        }),
      )

      const status =
        dmResult.attempted === 0
          ? 'skipped'
          : dmResult.succeeded > 0
            ? 'sent'
            : 'failed'
      const { error: updateError } = await db
        .from('event_participation_notification_outbox')
        .update({
          status,
          locked_at: null,
          last_error: status === 'failed' ? 'discord_dm_delivery_failed' : null,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('guild_id', row.guild_id)
        .eq('id', row.id)
        .eq('status', 'processing')
      if (updateError) throw new Error(updateError.message)
      result[status] += 1
    } catch (error) {
      result.failed += 1
      const message = safeOutboxError(error)
      const { error: updateError } = await db
        .from('event_participation_notification_outbox')
        .update({
          status: 'failed',
          locked_at: null,
          last_error: message,
        })
        .eq('guild_id', row.guild_id)
        .eq('id', row.id)
        .eq('status', 'processing')
      if (updateError) {
        log.error(
          '[event-participation-closeout] failed to release notification outbox row',
          updateError,
          {
            guild_id: row.guild_id,
            outbox_id: row.id,
          },
        )
      }
    }
  }

  return result
}
