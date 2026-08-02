'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { publicActionError } from '@/lib/public-action-error'
import { isPostgresNonNegativeInt } from '@/lib/postgres-int'
import { processEventParticipationNotificationOutbox } from '@/lib/event-participation-closeout-server'
import {
  EVENT_PARTICIPATION_REWARD_MAX,
  type EventParticipationEvidenceStatus,
} from '@/lib/event-participation-closeout'
import { log } from '@/lib/log'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ENTRIES = 2000
const MAX_MEMO_LENGTH = 500
const MAX_TEXT_LENGTH = 128
const MAX_NOTE_LENGTH = 500
const MAX_ROLE_LENGTH = 64
const MAX_ROLES = 20
const MAX_ACTIVITY_BATTLE_COUNT = 10000

const EVIDENCE_STATUSES: ReadonlySet<string> = new Set([
  'activity_confirmed',
  'activity_not_found',
  'activity_only',
  'not_checked',
])

export interface FinalizeEventParticipationEntryInput {
  discordId: string
  username: string
  source: 'slot' | 'manual'
  included: boolean
  roleNames: string[]
  evidenceStatus: EventParticipationEvidenceStatus
  activityBattleCount: number
  note?: string | null
}

export interface FinalizeEventParticipationCloseoutInput {
  eventId: string
  idempotencyKey: string
  rewardPerMember: number
  memo?: string | null
  entries: FinalizeEventParticipationEntryInput[]
}

export interface FinalizeEventParticipationCloseoutResult {
  error?: string
  closeout?: {
    id: string
    eventId: string
    participantCount: number
    totalReward: number
    finalizedAt: string
    replayed: boolean
  }
}

export interface SetEventParticipationAutoCloseoutPausedResult {
  error?: string
  paused?: boolean
}

function cleanBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean || clean.length > max) return null
  return clean
}

function normalizeEntries(
  value: unknown,
): FinalizeEventParticipationEntryInput[] | null {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null
  const seen = new Set<string>()
  const normalized: FinalizeEventParticipationEntryInput[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const row = raw as Record<string, unknown>
    const discordId = cleanBoundedText(row.discordId, MAX_TEXT_LENGTH)
    const username = cleanBoundedText(row.username, MAX_TEXT_LENGTH)
    if (!discordId || !username || seen.has(discordId)) return null
    if (row.source !== 'slot' && row.source !== 'manual') return null
    if (typeof row.included !== 'boolean') return null
    if (row.source === 'manual' && !row.included) return null
    if (!Array.isArray(row.roleNames) || row.roleNames.length > MAX_ROLES) {
      return null
    }
    const roleNames = Array.from(
      new Set(
        row.roleNames.map((role) => cleanBoundedText(role, MAX_ROLE_LENGTH)),
      ),
    )
    if (roleNames.some((role) => role === null)) return null
    if (
      typeof row.evidenceStatus !== 'string' ||
      !EVIDENCE_STATUSES.has(row.evidenceStatus)
    ) {
      return null
    }
    if (
      typeof row.activityBattleCount !== 'number' ||
      !Number.isInteger(row.activityBattleCount) ||
      row.activityBattleCount < 0 ||
      row.activityBattleCount > MAX_ACTIVITY_BATTLE_COUNT
    ) {
      return null
    }
    const note =
      row.note === null || row.note === undefined || row.note === ''
        ? null
        : cleanBoundedText(row.note, MAX_NOTE_LENGTH)
    if (
      row.note !== null &&
      row.note !== undefined &&
      row.note !== '' &&
      note === null
    ) {
      return null
    }
    seen.add(discordId)
    normalized.push({
      discordId,
      username,
      source: row.source,
      included: row.included,
      roleNames: roleNames as string[],
      evidenceStatus: row.evidenceStatus as EventParticipationEvidenceStatus,
      activityBattleCount: row.activityBattleCount,
      note,
    })
  }
  return normalized
}

function knownErrorKey(message: string): string | null {
  const mappings: Array<[string, string]> = [
    ['event_participation_closeout_event_not_ended', 'eventNotEnded'],
    ['event_participation_closeout_legacy_payout_exists', 'legacyPayoutExists'],
    ['event_participation_closeout_already_finalized', 'alreadyFinalized'],
    [
      'event_participation_closeout_idempotency_conflict',
      'idempotencyConflict',
    ],
    ['event_participation_closeout_slot_roster_changed', 'rosterChanged'],
    [
      'event_participation_closeout_manual_member_unknown',
      'unknownManualMember',
    ],
    ['event_not_found', 'eventNotFound'],
    ['event_not_published', 'eventNotPublished'],
    [
      'event_participation_auto_closeout_not_enabled',
      'autoCloseoutNotEnabled',
    ],
  ]
  return mappings.find(([code]) => message.includes(code))?.[1] ?? null
}

export async function setEventParticipationAutoCloseoutPaused(
  eventId: string,
  paused: boolean,
): Promise<SetEventParticipationAutoCloseoutPausedResult> {
  const t = await getTranslations('eventParticipationCloseout.actionErrors')
  try {
    if (!UUID_PATTERN.test(eventId ?? '') || typeof paused !== 'boolean') {
      return { error: t('invalidInput') }
    }
    const db = await requireAnyCapability([CAP.EVENT_MANAGE])
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc(
      'set_event_participation_auto_closeout_paused',
      {
        p_guild_id: guildId,
        p_event_id: eventId,
        p_paused: paused,
        p_actor_id: session.discordId,
        p_actor_username: session.username,
      },
    )
    if (error) {
      const errorKey = knownErrorKey(error.message)
      if (errorKey) return { error: t(errorKey as never) }
      return {
        error: await publicActionError(
          error,
          'actions/event-participation-auto-closeout',
        ),
      }
    }

    revalidatePath(`/events/${eventId}`)
    revalidatePath(`/events/${eventId}/report`)
    revalidatePath(`/admin/dashboard/events/${eventId}`)
    return { paused }
  } catch (error) {
    return {
      error: await publicActionError(
        error,
        'actions/event-participation-auto-closeout',
      ),
    }
  }
}

export async function finalizeEventParticipationCloseout(
  input: FinalizeEventParticipationCloseoutInput,
): Promise<FinalizeEventParticipationCloseoutResult> {
  const t = await getTranslations('eventParticipationCloseout.actionErrors')
  try {
    if (
      !input ||
      !UUID_PATTERN.test(input.eventId ?? '') ||
      !UUID_PATTERN.test(input.idempotencyKey ?? '') ||
      !isPostgresNonNegativeInt(input.rewardPerMember) ||
      input.rewardPerMember > EVENT_PARTICIPATION_REWARD_MAX
    ) {
      return { error: t('invalidInput') }
    }
    const memo = input.memo?.trim() || null
    if (memo && memo.length > MAX_MEMO_LENGTH) {
      return { error: t('memoTooLong', { max: MAX_MEMO_LENGTH }) }
    }
    const entries = normalizeEntries(input.entries)
    if (!entries) return { error: t('invalidRoster') }

    const db = await requireAnyCapability([CAP.EVENT_MANAGE])
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data, error } = await db.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: guildId,
        p_event_id: input.eventId,
        p_idempotency_key: input.idempotencyKey,
        p_reward_per_member: input.rewardPerMember,
        p_memo: memo,
        p_entries: entries,
        p_finalized_by: session.discordId,
        p_finalized_by_username: session.username,
      },
    )
    if (error) {
      const errorKey = knownErrorKey(error.message)
      if (errorKey) return { error: t(errorKey as never) }
      return {
        error: await publicActionError(
          error,
          'actions/event-participation-closeout',
        ),
      }
    }

    const payload = (data ?? {}) as Record<string, unknown>
    const closeoutId =
      typeof payload.closeoutId === 'string' ? payload.closeoutId : ''
    if (!UUID_PATTERN.test(closeoutId)) {
      throw new Error('event participation closeout returned an invalid id')
    }

    revalidatePath(`/events/${input.eventId}`)
    revalidatePath(`/events/${input.eventId}/report`)
    revalidatePath(`/admin/dashboard/events/${input.eventId}`)
    revalidatePath('/me')
    revalidatePath('/regear')
    revalidatePath('/', 'layout')

    after(async () => {
      try {
        await processEventParticipationNotificationOutbox({
          limit: 100,
          closeoutId,
        })
      } catch (notificationError) {
        log.error(
          '[event-participation-closeout] immediate notification drain failed',
          notificationError,
          {
            guild_id: guildId,
            event_id: input.eventId,
            closeout_id: closeoutId,
          },
        )
      }
    })

    return {
      closeout: {
        id: closeoutId,
        eventId:
          typeof payload.eventId === 'string' ? payload.eventId : input.eventId,
        participantCount: Number(payload.participantCount ?? 0),
        totalReward: Number(payload.totalReward ?? 0),
        finalizedAt:
          typeof payload.finalizedAt === 'string'
            ? payload.finalizedAt
            : new Date().toISOString(),
        replayed: payload.replayed === true,
      },
    }
  } catch (error) {
    return {
      error: await publicActionError(
        error,
        'actions/event-participation-closeout',
      ),
    }
  }
}
