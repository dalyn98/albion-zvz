import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { mapDiscordLocale } from '@/lib/discord'
import {
  autocompleteReply,
  type DiscordAutocompleteChoice,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import {
  resolveDiscordCommandActor,
  type DiscordCommandActor,
  type DiscordCommandTenant,
} from '@/lib/discord-command-auth'
import { CAP, hasCapability } from '@/lib/permissions'
import type { EventCategory } from '@/types'
import { listShopOrdersForMember } from '@/lib/shop/member-queries'
import { loadCraftProfile } from '@/lib/discord-command-stats-craft'
import {
  EVENT_CREATE_CAP,
  eventCreatorCategories,
} from '@/lib/discord-command-commerce-admin'
import {
  DISCORD_COMMAND_UUID_PATTERN,
  autocompleteLabel,
  parseDiscordAgmCommand,
  type AgmCommandPath,
} from '@/lib/discord-command-suite-shared'
import {
  discordBattleOutcomeLabel,
  discordStatusLabel,
  loadDiscordCommandSuiteMessages,
  type DiscordCommandSuiteMessages,
} from '@/lib/discord-command-suite-messages'
import { isCraftedRegearSupported } from '@/lib/regear-support-server'
import { resolveGuildFeatureForDiscordCommand } from '@/lib/guild-features'
import { checkGuildFeatureUse } from '@/lib/guild-features-server'

const CURRENT_EVENT_LOOKBACK_MS = 12 * 60 * 60 * 1000

function focusedOption(options: readonly DiscordInteractionOption[]): DiscordInteractionOption | null {
  for (const current of options) {
    if (current.focused) return current
    const nested = focusedOption(current.options ?? [])
    if (nested) return nested
  }
  return null
}

async function loadTenantForAutocomplete(
  discordGuildId: string | undefined,
): Promise<DiscordCommandTenant | null> {
  if (!discordGuildId) return null
  const { data } = await getAdminClient()
    .from('tenants')
    .select('id, slug, name, created_by_discord_id, admin_role_ids')
    .eq('discord_guild_id', discordGuildId)
    .eq('status', 'active')
    .maybeSingle()
  return data
    ? {
        id: data.id as string,
        slug: data.slug as string,
        name: data.name as string,
        createdByDiscordId: (data.created_by_discord_id as string | null) ?? null,
        adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
      }
    : null
}

function autocompleteSearch(payload: DiscordInteractionPayload): string {
  const focused = focusedOption(payload.data?.options ?? [])
  return typeof focused?.value === 'string' ? focused.value.trim().slice(0, 80) : ''
}

async function cancellableEventIds(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
): Promise<string[]> {
  const db = getAdminClient()
  const [{ data: slots }, { data: tentative }] = await Promise.all([
    db
      .from('slots')
      .select('parties!inner(event_id)')
      .eq('guild_id', tenant.id)
      .or(`assigned_discord_id.eq.${actor.discordId},requested_discord_id.eq.${actor.discordId}`),
    db
      .from('event_tentative_signups')
      .select(
        'event_id, events!inner(tentative_snapshot_version_id)',
      )
      .eq('guild_id', tenant.id)
      .eq('discord_id', actor.discordId)
      .is('events.tentative_snapshot_version_id', null),
  ])
  const ids = new Set<string>()
  for (const slot of slots ?? []) {
    const party = Array.isArray(slot.parties) ? slot.parties[0] : slot.parties
    if (party?.event_id) ids.add(party.event_id as string)
  }
  for (const signup of tentative ?? []) {
    if (signup.event_id) ids.add(signup.event_id as string)
  }
  return [...ids]
}

async function autocompleteEvents(input: {
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  mode: 'cancel' | 'start'
  search: string
}): Promise<DiscordAutocompleteChoice[]> {
  const currentWindowStart = new Date(Date.now() - CURRENT_EVENT_LOOKBACK_MS).toISOString()
  let query = getAdminClient()
    .from('events')
    .select('id, title, gather_at')
    .eq('guild_id', input.tenant.id)
    .eq('status', 'published')
    .gte('gather_at', currentWindowStart)
    .order('gather_at', { ascending: true, nullsFirst: false })
    .limit(25)
  if (input.mode === 'cancel') {
    const eventIds = await cancellableEventIds(input.tenant, input.actor)
    if (eventIds.length === 0) return []
    query = query
      .in('id', eventIds)
      .neq('recruitment_mode', 'build_sheet')
      .is('battle_started_at', null)
  } else if (!hasCapability(input.actor.capabilities, CAP.EVENT_MANAGE)) {
    query = query.is('battle_started_at', null)
    const legacyCategories = await eventCreatorCategories(input.tenant.id, input.actor)
    const categories = (Object.keys(EVENT_CREATE_CAP) as EventCategory[]).filter((category) =>
      legacyCategories.has(category) ||
      hasCapability(input.actor.capabilities, EVENT_CREATE_CAP[category])
    )
    if (categories.length === 0) return []
    query = query.eq('created_by', input.actor.discordId).in('category', categories)
  } else {
    query = query.is('battle_started_at', null)
  }
  if (input.search) {
    query = query.ilike('title', `%${input.search.replace(/[%_,]/g, '')}%`)
  }
  const { data } = await query
  return (data ?? []).map((event) => ({
    name: autocompleteLabel(`${event.title} · ${event.gather_at ? new Date(event.gather_at).toISOString().slice(0, 16).replace('T', ' ') : '-'}`),
    value: event.id as string,
  }))
}

async function autocompleteBattles(
  tenant: DiscordCommandTenant,
  search: string,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordAutocompleteChoice[]> {
  let query = getAdminClient()
    .from('guild_battle_views')
    .select('id, albion_battle_id, result_estimate, opponent_force_name, started_at')
    .eq('tenant_id', tenant.id)
    .eq('relation_scope', 'direct')
    .eq('view_policy', 'default_meaningful')
    .eq('activity_kind', 'zvz')
  if (search) {
    const normalized = search.replace(/^#/, '').trim()
    query = /^\d+$/.test(normalized)
      ? query.eq('albion_battle_id', normalized)
      : query.ilike('opponent_force_name', `%${normalized.replace(/[%_,]/g, '')}%`)
  }
  const { data } = await query
    .order('started_at', { ascending: false })
    .limit(25)
  return (data ?? []).flatMap((row): DiscordAutocompleteChoice[] => {
    const battleId = String(row.albion_battle_id ?? '')
    if (!battleId) return []
    return [{
      name: autocompleteLabel(`#${battleId} · ${discordBattleOutcomeLabel(row.result_estimate, messages)} · ${row.opponent_force_name ?? '-'} · ${String(row.started_at).slice(0, 10)}`),
      value: row.id as string,
    }]
  })
}

async function autocompleteCraftTasks(input: {
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  path: AgmCommandPath
  search: string
}): Promise<DiscordAutocompleteChoice[]> {
  const status = input.path === 'craft.claim'
    ? 'queued'
    : input.path === 'craft.pickup'
      ? 'delivered'
      : 'claimed'
  let query = getAdminClient()
    .from('craft_tasks')
    .select('id, status, crafter_discord_id, regear_requests!inner(discord_id, username, event_title_snapshot, role_name)')
    .eq('guild_id', input.tenant.id)
    .eq('status', status)
    .order('created_at', { ascending: true })
  if (status === 'claimed') query = query.eq('crafter_discord_id', input.actor.discordId)
  if (status === 'delivered') query = query.eq('regear_requests.discord_id', input.actor.discordId)
  if (input.search) {
    if (DISCORD_COMMAND_UUID_PATTERN.test(input.search)) {
      query = query.eq('id', input.search)
    } else {
      const search = input.search.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim()
      if (search) {
        query = query.or(
          `username.ilike.*${search}*,event_title_snapshot.ilike.*${search}*,role_name.ilike.*${search}*`,
          { referencedTable: 'regear_requests' },
        )
      }
    }
  }
  const { data } = await query.limit(25)
  return (data ?? []).flatMap((row): DiscordAutocompleteChoice[] => {
    const request = Array.isArray(row.regear_requests) ? row.regear_requests[0] : row.regear_requests
    const label = `${request?.event_title_snapshot ?? '-'} · ${request?.role_name ?? '-'} · ${request?.username ?? '-'}`
    return [{ name: autocompleteLabel(label), value: row.id as string }]
  })
}

async function autocompleteShopItems(
  tenant: DiscordCommandTenant,
  search: string,
): Promise<DiscordAutocompleteChoice[]> {
  let query = getAdminClient()
    .from('shop_inventory')
    .select('id, name_ko, enchant, stock, manual_price, auto_price_silver')
    .eq('guild_id', tenant.id)
    .gt('stock', 0)
    .order('name_ko', { ascending: true })
    .limit(25)
  if (search) query = query.ilike('name_ko', `%${search.replace(/[%_,]/g, '')}%`)
  const { data } = await query
  return (data ?? []).map((item) => ({
    name: autocompleteLabel(`${item.name_ko}${item.enchant > 0 ? ` .${item.enchant}` : ''} · ×${item.stock}`),
    value: item.id as string,
  }))
}

async function autocompleteShopOrders(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  search: string,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordAutocompleteChoice[]> {
  const orders = await listShopOrdersForMember(getAdminClient(), tenant.id, actor.discordId, 25)
  return orders.flatMap((order): DiscordAutocompleteChoice[] => {
    const items = order.items.map((item) => `${item.nameKo}×${item.quantity}`).join(', ')
    if (search && !items.toLowerCase().includes(search.toLowerCase()) &&
        !order.id.startsWith(search)) return []
    return [{
      name: autocompleteLabel(`${items || order.id.slice(0, 8)} · ${order.totalPoints}p · ${discordStatusLabel(order.status, messages)}`),
      value: order.id,
    }]
  })
}

export async function handleDiscordCommandAutocomplete(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  if (payload.data?.name !== 'agm') return autocompleteReply([])
  const parsed = parseDiscordAgmCommand(payload)
  const tenant = await loadTenantForAutocomplete(payload.guild_id)
  if (!parsed.path || !tenant) return autocompleteReply([])
  const search = autocompleteSearch(payload)

  const actorResult = await resolveDiscordCommandActor({
    tenant,
    payload,
    requireMember: parsed.path !== 'event.cancel' && !parsed.path.startsWith('admin.'),
  })
  if (!actorResult.ok) return autocompleteReply([])
  const actor = actorResult.actor
  const featureBoundary = resolveGuildFeatureForDiscordCommand(parsed.path)
  if (featureBoundary) {
    const access = await checkGuildFeatureUse(tenant.id, featureBoundary)
    if (!access.allowed) return autocompleteReply([])
  }
  const locale = mapDiscordLocale(payload.locale) ?? mapDiscordLocale(payload.guild_locale) ?? 'en'
  const messages = await loadDiscordCommandSuiteMessages(locale)
  if (parsed.path === 'event.cancel') {
    return autocompleteReply(await autocompleteEvents({
      tenant,
      actor,
      mode: 'cancel',
      search,
    }))
  }
  if (parsed.path === 'admin.event-start') {
    return autocompleteReply(await autocompleteEvents({
      tenant,
      actor,
      mode: 'start',
      search,
    }))
  }
  if (parsed.path === 'stats.battle') {
    return autocompleteReply(await autocompleteBattles(tenant, search, messages))
  }
  if (
    parsed.path === 'craft.claim' ||
    parsed.path === 'craft.release' ||
    parsed.path === 'craft.deliver' ||
    parsed.path === 'craft.pickup'
  ) {
    if (!(await isCraftedRegearSupported(tenant.id))) {
      return autocompleteReply([])
    }
    const requiresCurrentCrafter = parsed.path === 'craft.claim' || parsed.path === 'craft.deliver'
    if (requiresCurrentCrafter) {
      const profile = await loadCraftProfile(actor)
      if (!profile.isCrafter && !actor.isAdmin) return autocompleteReply([])
    }
    return autocompleteReply(await autocompleteCraftTasks({
      tenant,
      actor,
      path: parsed.path,
      search,
    }))
  }
  if (parsed.path === 'shop.order') {
    return autocompleteReply(await autocompleteShopItems(tenant, search))
  }
  if (parsed.path === 'shop.reorder') {
    return autocompleteReply(await autocompleteShopOrders(tenant, actor, search, messages))
  }
  return autocompleteReply([])
}
