import 'server-only'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import {
  ephemeralReply,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import {
  resolveDiscordCommandActor,
  type DiscordCommandActor,
  type DiscordCommandTenant,
} from '@/lib/discord-command-auth'
import {
  discordPointReasonLabel,
  formatDiscordCommandMessage,
  loadDiscordCommandSuiteMessages,
  type DiscordCommandSuiteMessages,
} from '@/lib/discord-command-suite-messages'
import type { Locale } from '@/i18n/locales'
import {
  getMemberSpendablePointBalance,
  listMemberPointLedgerEntries,
} from '@/lib/point-ledger'
import { getMemberPendingRequestCounts } from '@/lib/member-pending-counts'
import {
  buildDiscordEventSignupComponents,
  handleDiscordEventInteraction,
  loadDiscordEventSignupMessages,
} from '@/lib/discord-event-signups'
import { log } from '@/lib/log'
import {
  handleBattleStats,
  handleCraftClaim,
  handleCraftDeliver,
  handleCraftList,
  handleCraftPickup,
  handleCraftRelease,
  handleLeaderboard,
  handleMemberStats,
  handleRegearStatus,
} from '@/lib/discord-command-stats-craft'
import {
  handleAdminApprovals,
  handleAdminEventCreate,
  handleAdminEventStart,
  handleShopOrder,
  handleShopReorder,
  handleShopStatus,
  handleSiphon,
} from '@/lib/discord-command-commerce-admin'
import {
  DISCORD_COMMAND_UUID_PATTERN,
  MAX_DISCORD_COMMAND_MEMO_LENGTH,
  createDiscordCommandWebLink,
  formatDiscordTimestamp,
  formatNumber,
  integerOption,
  stringOption,
  truncate,
  userOption,
  webButton,
  type AgmCommandPath,
} from '@/lib/discord-command-suite-shared'

export {
  AGM_COMMAND_PATHS,
  parseDiscordAgmCommand,
  type AgmCommandPath,
} from '@/lib/discord-command-suite-shared'
export { handleDiscordCommandAutocomplete } from '@/lib/discord-command-autocomplete'

const MAX_MEMO_LENGTH = MAX_DISCORD_COMMAND_MEMO_LENGTH
const UUID_PATTERN = DISCORD_COMMAND_UUID_PATTERN

async function requireActor(input: {
  tenant: DiscordCommandTenant
  payload: DiscordInteractionPayload
  messages: DiscordCommandSuiteMessages
  member?: boolean
}): Promise<DiscordCommandActor | DiscordInteractionResponse> {
  const resolved = await resolveDiscordCommandActor({
    tenant: input.tenant,
    payload: input.payload,
    requireMember: input.member !== false,
  })
  if (resolved.ok) return resolved.actor
  return ephemeralReply(
    resolved.error === 'not_member' ? input.messages.notMember : input.messages.invalidInput,
  )
}

function isResponse(
  value: DiscordCommandActor | DiscordInteractionResponse,
): value is DiscordInteractionResponse {
  return 'type' in value
}

export async function handleDiscordCommandSuite(input: {
  path: AgmCommandPath
  options: readonly DiscordInteractionOption[]
  tenant: DiscordCommandTenant
  payload: DiscordInteractionPayload
  locale: Locale
}): Promise<DiscordInteractionResponse> {
  const messages = await loadDiscordCommandSuiteMessages(input.locale)
  if (input.path === 'event.next') {
    return handleEventNext(input.tenant, input.payload, input.locale, messages)
  }
  if (input.path === 'event.browse' || input.path === 'event.status') {
    return handleEventPanelAction(
      input.tenant,
      input.payload,
      input.path === 'event.browse' ? 'browse' : 'status',
      messages,
    )
  }
  const actorOrResponse = await requireActor({
    tenant: input.tenant,
    payload: input.payload,
    messages,
    member: input.path !== 'event.cancel' && !input.path.startsWith('admin.'),
  })
  if (isResponse(actorOrResponse)) return actorOrResponse
  const actor = actorOrResponse
  if (
    input.path.startsWith('craft.') &&
    (await getAppSetting('craft_regear_enabled', 'false', input.tenant.id)) !== 'true'
  ) {
    return ephemeralReply(messages.craftDisabled)
  }

  switch (input.path) {
    case 'me.summary':
      return handleMemberSummary(input.tenant, actor, messages)
    case 'event.cancel':
      return handleEventCancel(input.tenant, actor, input.options, messages)
    case 'wallet.send':
      return handleWalletSend(input.tenant, input.payload, actor, input.options, messages)
    case 'wallet.history':
      return handleWalletHistory(input.tenant, actor, messages)
    case 'stats.me':
      return handleMemberStats(input.tenant, actor, actor.discordId, input.options, messages)
    case 'stats.member':
      return handleMemberStats(
        input.tenant,
        actor,
        userOption(input.options, 'member'),
        input.options,
        messages,
      )
    case 'stats.leaderboard':
      return handleLeaderboard(input.tenant, actor, input.options, messages)
    case 'stats.battle':
      return handleBattleStats(input.tenant, actor, input.options, messages)
    case 'regear.eligible':
      return ephemeralReply(messages.regearEligibleReady, {
        components: await webButton(input.tenant, actor.discordId, '/regear', messages.openWeb),
      })
    case 'regear.status':
      return handleRegearStatus(input.tenant, actor, messages)
    case 'craft.queue':
      return handleCraftList(input.tenant, actor, 'queue', messages)
    case 'craft.mine':
      return handleCraftList(input.tenant, actor, 'mine', messages)
    case 'craft.claim':
      return handleCraftClaim(input.tenant, actor, input.options, messages)
    case 'craft.release':
      return handleCraftRelease(actor, input.options, messages)
    case 'craft.deliver':
      return handleCraftDeliver(input.tenant, actor, input.options, messages)
    case 'craft.pickup':
      return handleCraftPickup(actor, input.options, messages)
    case 'siphon.balance':
      return handleSiphon(input.tenant, actor, false, messages)
    case 'siphon.history':
      return handleSiphon(input.tenant, actor, true, messages)
    case 'shop.status':
      return handleShopStatus(input.tenant, actor, messages)
    case 'shop.order':
      return handleShopOrder(input.tenant, actor, input.options, messages)
    case 'shop.reorder':
      return handleShopReorder(input.tenant, actor, input.options, messages)
    case 'admin.approvals':
      return handleAdminApprovals(input.tenant, actor, input.options, input.locale, messages)
    case 'admin.event-create':
      return handleAdminEventCreate(input.tenant, actor, input.options, messages)
    case 'admin.event-start':
      return handleAdminEventStart(input.tenant, actor, input.options, messages)
    default:
      return ephemeralReply(messages.invalidInput)
  }
}

interface UpcomingEvent {
  id: string
  title: string
  gatherAt: string | null
}

async function findNextEvent(guildId: string): Promise<UpcomingEvent | null> {
  const { data, error } = await getAdminClient()
    .from('events')
    .select('id, title, gather_at')
    .eq('guild_id', guildId)
    .eq('status', 'published')
    .is('battle_started_at', null)
    .gte('gather_at', new Date().toISOString())
    .order('gather_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
    ? { id: data.id as string, title: data.title as string, gatherAt: data.gather_at as string | null }
    : null
}

async function handleMemberSummary(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const db = getAdminClient()
  const [points, pending, nextEvent] = await Promise.all([
    getMemberSpendablePointBalance(db, tenant.id, actor.discordId),
    getMemberPendingRequestCounts(db, tenant.id, actor.discordId),
    findNextEvent(tenant.id),
  ])
  if (points.error) throw new Error(points.error)
  const event = nextEvent
    ? `${nextEvent.title} · ${formatDiscordTimestamp(nextEvent.gatherAt)}`
    : messages.noUpcomingEvent
  return ephemeralReply([
    formatDiscordCommandMessage(messages.summaryTitle, { name: tenant.name }),
    formatDiscordCommandMessage(messages.summaryBody, {
      balance: formatNumber(points.balance),
      spendable: formatNumber(points.spendable),
      regear: pending.regear,
      exchange: pending.exchange,
      donation: pending.donation,
      event,
    }),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/me', messages.openWeb),
  })
}

async function handleEventNext(
  tenant: DiscordCommandTenant,
  payload: DiscordInteractionPayload,
  locale: Locale,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const discordId = payload.member?.user?.id ?? payload.user?.id ?? null
  if (!discordId) return ephemeralReply(messages.invalidInput)
  const event = await findNextEvent(tenant.id)
  if (!event) {
    return ephemeralReply(messages.noUpcomingEvent, {
      components: await webButton(tenant, discordId, '/events', messages.openWeb),
    })
  }
  const signupMessages = await loadDiscordEventSignupMessages(locale)
  const eventUrl = await createDiscordCommandWebLink(
    tenant,
    discordId,
    `/events/${event.id}`,
  )
  return ephemeralReply(
    formatDiscordCommandMessage(messages.eventTitle, {
      title: event.title,
      when: formatDiscordTimestamp(event.gatherAt),
    }),
    {
      components: buildDiscordEventSignupComponents({
        eventId: event.id,
        eventUrl,
        labels: signupMessages,
      }),
    },
  )
}

async function handleEventPanelAction(
  tenant: DiscordCommandTenant,
  payload: DiscordInteractionPayload,
  action: 'browse' | 'status',
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const event = await findNextEvent(tenant.id)
  if (!event) return ephemeralReply(messages.noUpcomingEvent)
  return handleDiscordEventInteraction({
    ...payload,
    type: INTERACTION_TYPE_MESSAGE_COMPONENT,
    data: { ...payload.data, custom_id: `agm_evt:v1:${action}:${event.id}` },
  })
}

const CLEAR_EVENT_ASSIGNMENT_FIELDS = {
  assigned_discord_id: null,
  assigned_username: null,
  assigned_weapon_name: null,
  assigned_weapon_id: null,
  assigned_head_name: null,
  assigned_head_id: null,
  assigned_armor_name: null,
  assigned_armor_id: null,
  assigned_shoes_name: null,
  assigned_shoes_id: null,
  assigned_offhand_name: null,
  assigned_offhand_id: null,
  assigned_potion_name: null,
  assigned_potion_id: null,
  assigned_food_name: null,
  assigned_food_id: null,
  assigned_cape_name: null,
  assigned_cape_id: null,
  assigned_mount_name: null,
  assigned_mount_id: null,
} as const

const CLEAR_EVENT_REQUEST_FIELDS = {
  requested_discord_id: null,
  requested_username: null,
  requested_picks: null,
  requested_at: null,
} as const

export function buildOwnedEventSignupClearPatch(
  slot: {
    assigned_discord_id?: string | null
    requested_discord_id?: string | null
  },
  actorDiscordId: string,
): Record<string, null> | null {
  const clearAssignment = slot.assigned_discord_id === actorDiscordId
  const clearRequest = slot.requested_discord_id === actorDiscordId
  if (!clearAssignment && !clearRequest) return null
  return {
    ...(clearAssignment ? CLEAR_EVENT_ASSIGNMENT_FIELDS : {}),
    ...(clearRequest ? CLEAR_EVENT_REQUEST_FIELDS : {}),
  }
}

export function canCancelEventSignup(
  event: { battle_started_at?: string | null; category?: string | null },
): boolean {
  return !event.battle_started_at || event.category === 'FF' || event.category === '갱킹'
}

async function handleEventCancel(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const eventId = stringOption(options, 'event')
  if (!eventId || !UUID_PATTERN.test(eventId)) return ephemeralReply(messages.invalidInput)
  const db = getAdminClient()
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, status, battle_started_at, category, recruitment_mode')
    .eq('guild_id', tenant.id)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) throw new Error(eventError.message)
  if (
    !event ||
    event.status !== 'published' ||
    !canCancelEventSignup(event)
  ) {
    return ephemeralReply(messages.invalidInput)
  }
  if (event.recruitment_mode === 'build_sheet') {
    return ephemeralReply(messages.eventCancelRequiresWeb, {
      components: await webButton(
        tenant,
        actor.discordId,
        `/events/${eventId}`,
        messages.openWeb,
      ),
    })
  }

  const { data: slots, error: slotError } = await db
    .from('slots')
    .select('id, assigned_discord_id, requested_discord_id, parties!inner(event_id)')
    .eq('guild_id', tenant.id)
    .eq('parties.event_id', eventId)
    .or(`assigned_discord_id.eq.${actor.discordId},requested_discord_id.eq.${actor.discordId}`)
  if (slotError) throw new Error(slotError.message)
  let changed = 0
  for (const slot of slots ?? []) {
    const clearPatch = buildOwnedEventSignupClearPatch(slot, actor.discordId)
    if (!clearPatch) continue
    let update = db
      .from('slots')
      .update(clearPatch)
      .eq('guild_id', tenant.id)
      .eq('id', slot.id)
    if (slot.assigned_discord_id === actor.discordId) {
      update = update.eq('assigned_discord_id', actor.discordId)
    }
    if (slot.requested_discord_id === actor.discordId) {
      update = update.eq('requested_discord_id', actor.discordId)
    }
    const { data: updated, error } = await update.select('id').maybeSingle()
    if (error) throw new Error(error.message)
    if (updated) changed += 1
  }
  const { error: tentativeError, count } = await db
    .from('event_tentative_signups')
    .delete({ count: 'exact' })
    .eq('guild_id', tenant.id)
    .eq('event_id', eventId)
    .eq('discord_id', actor.discordId)
  if (tentativeError) throw new Error(tentativeError.message)
  changed += count ?? 0
  if (changed === 0) return ephemeralReply(messages.eventCancelNone)
  revalidatePath(`/events/${eventId}`)
  return ephemeralReply(formatDiscordCommandMessage(messages.eventCancelled, {
    title: event.title as string,
  }))
}

async function handleWalletSend(
  tenant: DiscordCommandTenant,
  payload: DiscordInteractionPayload,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const targetId = userOption(options, 'member')
  const amount = integerOption(options, 'amount')
  const memo = stringOption(options, 'memo')
  if (!targetId || !amount || amount < 1 || amount > 2_147_483_647) {
    return ephemeralReply(messages.invalidInput)
  }
  if (targetId === actor.discordId || (memo?.length ?? 0) > MAX_MEMO_LENGTH) {
    return ephemeralReply(messages.invalidInput)
  }
  const gate = await getAlbionOnboardingGateState(actor.discordId, tenant.id)
  if (!gate.resourceTrusted) return ephemeralReply(messages.notMember)
  const db = getAdminClient()
  const { data: target } = await db
    .from('guild_avatars')
    .select('discord_id, username, withdrawn_at')
    .eq('guild_id', tenant.id)
    .eq('discord_id', targetId)
    .maybeSingle()
  if (!target || target.withdrawn_at) return ephemeralReply(messages.notMember)
  const points = await getMemberSpendablePointBalance(db, tenant.id, actor.discordId)
  if (points.error || points.spendable < amount) return ephemeralReply(messages.invalidInput)
  const targetName =
    payload.data?.resolved?.members?.[targetId]?.nick?.trim() ||
    payload.data?.resolved?.users?.[targetId]?.global_name?.trim() ||
    payload.data?.resolved?.users?.[targetId]?.username?.trim() ||
    (target.username as string | null) ||
    `<@${targetId}>`
  const { error } = await db.rpc('transfer_points', {
    p_from: actor.discordId,
    p_guild_id: tenant.id,
    p_transfers: [{
      discord_id: targetId,
      username: targetName,
      amount,
      memo,
    }],
  })
  if (error) {
    log.warn('[discord-command-suite] point transfer failed', { error: error.message })
    return ephemeralReply(messages.invalidInput)
  }
  revalidatePath('/me')
  revalidatePath(`/members/${actor.discordId}`)
  revalidatePath(`/members/${targetId}`)
  return ephemeralReply(formatDiscordCommandMessage(messages.transferReady, {
    member: targetName,
    amount: formatNumber(amount),
  }))
}

async function handleWalletHistory(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const result = await listMemberPointLedgerEntries(
    getAdminClient(),
    tenant.id,
    actor.discordId,
    { limit: 10 },
  )
  if (result.error) throw new Error(result.error)
  const lines = result.rows.map((row) => {
    const sign = row.delta > 0 ? '+' : ''
    const memo = row.memo ? ` · ${truncate(row.memo, 60)}` : ''
    return formatDiscordCommandMessage(messages.historyLine, {
      when: formatDiscordTimestamp(row.createdAt),
      delta: `${sign}${formatNumber(row.delta)}`,
      reason: discordPointReasonLabel(row.reason, messages),
      memo,
    })
  })
  return ephemeralReply(
    [messages.historyTitle, ...(lines.length ? lines : [messages.noResults])].join('\n'),
    { components: await webButton(tenant, actor.discordId, '/me/wallet', messages.openWeb) },
  )
}
