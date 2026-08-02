'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession, sessionHas } from '@/lib/session'
import { requireCurrentMutationSession, requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getEventGuestProfile } from '@/lib/event-guest-profile'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { getAlbionEventAccessGateState } from '@/lib/albion-identity'
import type { GearOption, SlotKey } from '@/types'
import {
  consumeEventGuestRequestBudget,
  createEventGuestManagementSecret,
  hashEventGuestManagementSecret,
} from '@/lib/event-guest-security'

export type SlotPicks = Partial<Record<SlotKey, GearOption>>

type SlotActionTranslator = Awaited<ReturnType<typeof getTranslations<'slotAction'>>>
type GearTranslator = Awaited<ReturnType<typeof getTranslations<'gear'>>>

type RpcCodeKey =
  | 'slotNotFound'
  | 'slotTaken'
  | 'slotPending'
  | 'alreadyInEvent'
  | 'slotEmpty'
  | 'notOwner'
  | 'noPendingRequest'
  | 'gearPicksRequired'
  | 'guestCharacterAlreadyApplied'
  | 'guestRecruitmentClosed'
  | 'guestApplicationClosed'

const RPC_CODE_KEYS: Record<string, RpcCodeKey> = {
  SLOT_NOT_FOUND: 'slotNotFound',
  SLOT_TAKEN: 'slotTaken',
  SLOT_PENDING: 'slotPending',
  ALREADY_IN_EVENT: 'alreadyInEvent',
  SLOT_EMPTY: 'slotEmpty',
  NOT_OWNER: 'notOwner',
  NO_PENDING_REQUEST: 'noPendingRequest',
  GEAR_PICKS_REQUIRED: 'gearPicksRequired',
  GUEST_CHARACTER_ALREADY_APPLIED: 'guestCharacterAlreadyApplied',
  GUEST_RECRUITMENT_CLOSED: 'guestRecruitmentClosed',
  GUEST_APPLICATION_CLOSED: 'guestApplicationClosed',
}

function mapRpcError(
  message: string,
  tAction: SlotActionTranslator,
  tGear: GearTranslator,
): string {
  if (
    message.includes('event_regear_roster_locked') ||
    message.includes('event_regear_participant_locked')
  ) {
    return tAction('battleAlreadyStarted')
  }
  const required = message.match(/GEAR_CHOICE_REQUIRED:(\w+)/)
  if (required) {
    const slotKey = required[1] as SlotKey
    const label = safeGearLabel(slotKey, tGear)
    return tAction('gearChoiceRequired', { label })
  }
  const notInOptions = message.match(/GEAR_NOT_IN_OPTIONS:(\w+)/)
  if (notInOptions) {
    const slotKey = notInOptions[1] as SlotKey
    const label = safeGearLabel(slotKey, tGear)
    return tAction('gearNotInOptions', { label })
  }
  for (const [code, key] of Object.entries(RPC_CODE_KEYS)) {
    if (message.includes(code)) return tAction(key)
  }
  return tAction('serverError')
}

function safeGearLabel(slotKey: SlotKey, tGear: GearTranslator): string {
  try {
    return tGear(slotKey)
  } catch {
    return slotKey
  }
}

function revalidateSlotAssignmentSurfaces(
  eventId: string | null | undefined,
  partyNumber: number | null | undefined,
  discordId: string | null | undefined,
): void {
  revalidatePath('/')
  if (eventId) {
    revalidatePath(`/events/${eventId}`)
    revalidatePath(`/admin/dashboard/events/${eventId}`)
    if (partyNumber) revalidatePath(`/events/${eventId}/party/${partyNumber}`)
  }
  revalidatePath('/me')
  revalidatePath('/members')
  revalidatePath('/admin/dashboard/stats')
  if (discordId) revalidatePath(`/members/${discordId}`)
}

export async function assignSlot(
  slotId: string,
  picks: SlotPicks = {},
  idempotencyKey?: string,
): Promise<{
  error?: string
  pending?: boolean
  managementPath?: string
}> {
  const tAction = await getTranslations('slotAction')
  const tGear = await getTranslations('gear')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }

  // Filter out empty picks before sending — the RPC treats a missing kind the
  // same as an explicit null, so trimming keeps the payload minimal.
  // 솔로밤은 free-form 픽이라 id 가 비어 있는 "자유" 픽도 허용 — name 만
  // 채워져 있으면 유효한 입력으로 취급.
  const cleanPicks: Record<string, GearOption> = {}
  for (const key of Object.keys(picks) as SlotKey[]) {
    const pick = picks[key]
    if (pick && pick.name) {
      cleanPicks[key] = { name: pick.name, id: pick.id ?? '' }
    }
  }
  const payload = Object.keys(cleanPicks).length > 0 ? cleanPicks : null

  const db = getAdminClient()
  const sessionGuildId = await getSessionGuildId(session)

  // Hidden slots are intentionally invisible to members — guard the action so
  // a crafted request with a stale slot id can't silently bypass the UI hide.
  // The party's bomb-squad flag decides whether the action returns pending:true
  // (bomb squad) or pending:false (regular).
  let slotLookup = db
    .from('slots')
    .select(
      'guild_id, is_hidden, parties!inner(is_bomb_squad, event_id, party_number, events!inner(battle_started_at, regear_policy_version_id))',
    )
    .eq('id', slotId)

  slotLookup = session.eventScope
    ? slotLookup.eq('parties.event_id', session.eventScope)
    : slotLookup.eq('guild_id', sessionGuildId)

  const { data: slotCheck, error: slotLookupError } = await slotLookup
    .maybeSingle()
  if (slotLookupError) return { error: await publicActionError(slotLookupError, 'actions/member') }
  if (!slotCheck) return { error: tAction('slotNotFound') }
  if (slotCheck.is_hidden) return { error: tAction('slotNotFound') }
  const guildId = (slotCheck.guild_id as string | null) ?? sessionGuildId
  const partyJoin = slotCheck.parties as
    | {
        is_bomb_squad: boolean | null
        event_id: string
        party_number: number
        events:
          | { battle_started_at: string | null; regear_policy_version_id: string | null }
          | { battle_started_at: string | null; regear_policy_version_id: string | null }[]
          | null
      }
    | {
        is_bomb_squad: boolean | null
        event_id: string
        party_number: number
        events:
          | { battle_started_at: string | null; regear_policy_version_id: string | null }
          | { battle_started_at: string | null; regear_policy_version_id: string | null }[]
          | null
      }[]
    | null
  const partyObj = Array.isArray(partyJoin) ? partyJoin[0] : partyJoin
  const assignEventJoin = partyObj?.events
  const assignEvent = Array.isArray(assignEventJoin)
    ? assignEventJoin[0]
    : assignEventJoin
  if (assignEvent?.battle_started_at || assignEvent?.regear_policy_version_id) {
    return { error: tAction('battleAlreadyStarted') }
  }
  const isBomb = !!partyObj?.is_bomb_squad
  const albionEventGate = session.isGuest
    ? null
    : await getAlbionEventAccessGateState({
        discordId: session.discordId,
        guildId,
        isMember: session.isMember === true,
        isAdmin: session.isAdmin === true,
      })
  if (albionEventGate?.memberOnboardingRequired || albionEventGate?.memberEventVerificationRequired) {
    return { error: tAction('albionVerificationRequired') }
  }
  const canApplyAsAlliance =
    !session.isMember &&
    !session.isGuest &&
    (albionEventGate?.allianceEventAllowed ?? false)
  const canApplyAsAdmin = session.isAdmin === true
  // Guests and verified same-alliance participants can sign up for slots too.
  if (!session.isMember && !session.isGuest && !canApplyAsAlliance && !canApplyAsAdmin) {
    return { error: tAction('noMemberRole') }
  }

  // 이벤트 스코프 게스트는 자신이 초대받은 이벤트 슬롯만 지원 가능. 다른
  // 이벤트의 slotId 로 crafted 요청이 오면 차단.
  if (session.isGuest && session.eventScope && partyObj?.event_id !== session.eventScope) {
    return { error: tAction('guestWrongEvent') }
  }
  if (session.eventScope && partyObj?.event_id !== session.eventScope) {
    return { error: tAction('slotNotFound') }
  }
  let displayUsername = session.username
  let guestProfile: Awaited<ReturnType<typeof getEventGuestProfile>> = null
  if (session.isGuest && partyObj?.event_id === session.eventScope) {
    guestProfile = await getEventGuestProfile(guildId, partyObj.event_id, session.discordId)
    if (!guestProfile?.albionCharacterName) {
      return { error: tAction('guestProfileRequired') }
    }
    displayUsername = guestProfile.displayName
  }

  let managementPath: string | undefined
  let error: { message: string } | null = null
  if (session.isGuest && partyObj?.event_id === session.eventScope) {
    const attemptId =
      typeof idempotencyKey === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      )
        ? idempotencyKey
        : crypto.randomUUID()
    const withinBudget = await consumeEventGuestRequestBudget({
      db,
      headers: await headers(),
      guildId,
      eventId: partyObj.event_id,
      action: 'slot',
      subject: session.discordId,
      bucketSeconds: 300,
      limit: 20,
    }).catch(() => false)
    if (!withinBudget) return { error: tAction('guestTemporarilyLimited') }
    const managementSecret = createEventGuestManagementSecret()
    const managementSecretHash =
      await hashEventGuestManagementSecret(managementSecret)
    const result = await db.rpc('assign_guest_event_slot', {
      p_guild_id: guildId,
      p_event_id: partyObj.event_id,
      p_guest_id: session.discordId,
      p_slot_id: slotId,
      p_username: displayUsername,
      p_picks: payload,
      p_idempotency_key: attemptId,
      p_management_secret_hash: managementSecretHash,
    })
    error = result.error
    if (!error) managementPath = `/guest/manage#${managementSecret}`
  } else {
    const result = await db.rpc('assign_slot', {
      p_slot_id: slotId,
      p_discord_id: session.discordId,
      p_username: displayUsername,
      p_picks: payload,
    })
    error = result.error
  }
  if (error) return { error: mapRpcError(error.message, tAction, tGear) }

  revalidateSlotAssignmentSurfaces(partyObj?.event_id, partyObj?.party_number, session.discordId)
  return { pending: isBomb, managementPath }
}

export async function cancelSlot(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const tGear = await getTranslations('gear')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  const sessionGuildId = await getSessionGuildId(session)

  const db = getAdminClient()

  // Every published event freezes its expected composition at operational
  // start. Actual participation is finalized separately after closeout.
  let slotLookup = db
    .from('slots')
    .select(
      'guild_id, party_id, parties!inner(event_id, party_number, events(battle_started_at, category, regear_policy_version_id))',
    )
    .eq('id', slotId)

  slotLookup = session.eventScope
    ? slotLookup.eq('parties.event_id', session.eventScope)
    : slotLookup.eq('guild_id', sessionGuildId)

  const { data: slotRow, error: slotLookupError } = await slotLookup
    .maybeSingle()
  if (slotLookupError) return { error: await publicActionError(slotLookupError, 'actions/member') }
  if (!slotRow) return { error: tAction('slotNotFound') }
  const partyJoin = slotRow.parties as
    | {
        event_id: string
        party_number: number
        events:
          | {
              battle_started_at: string | null
              category: string | null
              regear_policy_version_id: string | null
            }
          | {
              battle_started_at: string | null
              category: string | null
              regear_policy_version_id: string | null
            }[]
          | null
      }
    | {
        event_id: string
        party_number: number
        events:
          | {
              battle_started_at: string | null
              category: string | null
              regear_policy_version_id: string | null
            }
          | {
              battle_started_at: string | null
              category: string | null
              regear_policy_version_id: string | null
            }[]
          | null
      }[]
    | null
  const partyRow = Array.isArray(partyJoin) ? partyJoin[0] : partyJoin
  const eventJoin = partyRow?.events as
    | {
        battle_started_at: string | null
        category: string | null
        regear_policy_version_id: string | null
      }
    | {
        battle_started_at: string | null
        category: string | null
        regear_policy_version_id: string | null
      }[]
    | null
  const eventState = Array.isArray(eventJoin) ? eventJoin[0] : eventJoin
  if (
    eventState?.regear_policy_version_id ||
    eventState?.battle_started_at
  ) {
    return { error: tAction('battleAlreadyStarted') }
  }
  // 이벤트 스코프 게스트는 자기 이벤트의 슬롯만 취소 가능.
  if (session.isGuest && session.eventScope && partyRow?.event_id !== session.eventScope) {
    return { error: tAction('guestWrongEvent') }
  }
  if (session.eventScope && partyRow?.event_id !== session.eventScope) {
    return { error: tAction('slotNotFound') }
  }

  const { error } =
    session.isGuest && partyRow?.event_id === session.eventScope
      ? await db.rpc('cancel_guest_event_application', {
          p_guild_id: (slotRow.guild_id as string | null) ?? sessionGuildId,
          p_event_id: partyRow.event_id,
          p_guest_id: session.discordId,
        })
      : await db.rpc('cancel_slot', {
          p_slot_id: slotId,
          p_discord_id: session.discordId,
        })
  if (error) return { error: mapRpcError(error.message, tAction, tGear) }

  revalidateSlotAssignmentSurfaces(partyRow?.event_id, partyRow?.party_number, session.discordId)
  return {}
}

// Event managers / event owners / bomb-squad callers can remove someone from
// slots they manage before the event's effective regear roster is frozen.
export async function adminCancelSlot(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()

  const { data: slotRow, error: slotLookupError } = await db
    .from('slots')
    .select(
      'assigned_discord_id, is_solo_bomb, parties!inner(event_id, party_number, is_bomb_squad, caller_discord_id, events!inner(created_by, battle_started_at, regear_policy_version_id))',
    )
    .eq('guild_id', guildId)
    .eq('id', slotId)
    .maybeSingle()
  if (slotLookupError) return { error: await publicActionError(slotLookupError, 'actions/member') }
  if (!slotRow) return { error: tAction('slotNotFound') }
  const partyJoin = slotRow.parties as
    | {
        event_id: string
        party_number: number
        is_bomb_squad: boolean | null
        caller_discord_id: string | null
        events:
          | { created_by: string | null; battle_started_at: string | null; regear_policy_version_id: string | null }
          | { created_by: string | null; battle_started_at: string | null; regear_policy_version_id: string | null }[]
          | null
      }
    | {
        event_id: string
        party_number: number
        is_bomb_squad: boolean | null
        caller_discord_id: string | null
        events:
          | { created_by: string | null; battle_started_at: string | null; regear_policy_version_id: string | null }
          | { created_by: string | null; battle_started_at: string | null; regear_policy_version_id: string | null }[]
          | null
      }[]
    | null
  const party = Array.isArray(partyJoin) ? partyJoin[0] : partyJoin
  const event = Array.isArray(party?.events) ? party?.events[0] : party?.events
  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event?.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  const isBombSquadCaller =
    !slotRow.is_solo_bomb &&
    !!party?.is_bomb_squad &&
    !!party.caller_discord_id &&
    party.caller_discord_id === session.discordId
  if (!session.isAdmin && !isEventManager && !isEventOwner && !isBombSquadCaller) {
    return { error: tAction('slotAssignNotAuthorized') }
  }
  if (event?.battle_started_at || event?.regear_policy_version_id) {
    return { error: tAction('battleAlreadyStarted') }
  }
  if (!slotRow.assigned_discord_id) return { error: tAction('slotEmpty') }

  // Pass the current owner's discord id to cancel_slot so the RPC's
  // NOT_OWNER guard passes while we keep a single code path for the update.
  const { error } = await db.rpc('cancel_slot', {
    p_slot_id: slotId,
    p_discord_id: slotRow.assigned_discord_id,
  })
  if (error) return { error: mapRpcError(error.message, tAction, await getTranslations('gear')) }

  revalidateSlotAssignmentSurfaces(party?.event_id, party?.party_number, slotRow.assigned_discord_id)
  return {}
}

export interface MyParticipationEntry {
  event_id: string
  event_title: string
  gather_at: string | null
  gather_time: string
  role_name: string | null
  battle_started_at: string | null
}

// Events the signed-in member actually participated in — defined as events
// where the admin pressed "battle start" AND one of their slots was assigned
// to the member.
export async function listMyParticipation(): Promise<{
  entries: MyParticipationEntry[]
}> {
  const session = await getSession()
  if (!session) return { entries: [] }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'role_name, parties!inner(events!inner(id, title, gather_at, gather_time, battle_started_at, exclude_from_participation_stats))',
    )
    .eq('guild_id', guildId)
    .eq('assigned_discord_id', session.discordId)

  if (error) return { entries: [] }

  type JoinedEvent = {
    id: string
    title: string
    gather_at: string | null
    gather_time: string
    battle_started_at: string | null
    exclude_from_participation_stats: boolean | null
  }
  type Row = {
    role_name: string | null
    parties: { events: JoinedEvent | JoinedEvent[] } | { events: JoinedEvent | JoinedEvent[] }[]
  }

  // Dedupe by event_id — a member might fill multiple slots in the same event
  // (edge case, but possible with admin-assisted moves). Keep the first entry.
  const byEventId = new Map<string, MyParticipationEntry>()
  for (const row of (data ?? []) as Row[]) {
    const parties = Array.isArray(row.parties) ? row.parties[0] : row.parties
    if (!parties) continue
    const event = Array.isArray(parties.events) ? parties.events[0] : parties.events
    if (!event) continue
    if (event.exclude_from_participation_stats === true) continue
    if (!event.battle_started_at) continue
    if (byEventId.has(event.id)) continue
    byEventId.set(event.id, {
      event_id: event.id,
      event_title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: row.role_name,
      battle_started_at: event.battle_started_at,
    })
  }

  const entries = Array.from(byEventId.values()).sort((a, b) => {
    const at = a.gather_at ? new Date(a.gather_at).getTime() : 0
    const bt = b.gather_at ? new Date(b.gather_at).getTime() : 0
    return bt - at
  })
  return { entries }
}
