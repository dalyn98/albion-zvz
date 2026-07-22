import 'server-only'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import {
  ephemeralReply,
  type DiscordInteractionOption,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import {
  type DiscordCommandActor,
  type DiscordCommandTenant,
} from '@/lib/discord-command-auth'
import {
  discordApprovalKindLabel,
  discordStatusLabel,
  formatDiscordCommandMessage,
  type DiscordCommandSuiteMessages,
} from '@/lib/discord-command-suite-messages'
import type { Locale } from '@/i18n/locales'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { resolveSiphonPlayer } from '@/lib/siphon/member-siphon'
import { loadMemberSiphonAccount } from '@/lib/siphon/member-siphon-account-server'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { canonicalShopQuality } from '@/lib/shop/quality'
import { markPublicShopCacheStale } from '@/lib/shop/cache'
import { listShopOrdersForMember } from '@/lib/shop/member-queries'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { CAP, hasAnyCapability, hasCapability } from '@/lib/permissions'
import {
  buildAdminApprovalMessageComponents,
  loadDiscordAdminApprovalMessages,
  type AdminApprovalKind,
} from '@/lib/discord-admin-approvals'
import { logAdminAction } from '@/lib/admin-audit'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import type { EventCategory } from '@/types'
import {
  DISCORD_COMMAND_UUID_PATTERN,
  MAX_DISCORD_COMMAND_MEMO_LENGTH,
  createDiscordCommandWebLink,
  formatDiscordTimestamp,
  formatNumber,
  integerOption,
  stringOption,
  truncate,
  webButton,
} from '@/lib/discord-command-suite-shared'

const MAX_MEMO_LENGTH = MAX_DISCORD_COMMAND_MEMO_LENGTH
const UUID_PATTERN = DISCORD_COMMAND_UUID_PATTERN

export async function handleSiphon(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  includeHistory: boolean,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const gate = await getAlbionOnboardingGateState(actor.discordId, tenant.id)
  const player = resolveSiphonPlayer(gate)
  if (player.status === 'unverified') return ephemeralReply(messages.siphonUnverified)
  const result = await loadMemberSiphonAccount({
    db: getAdminClient(),
    guildId: tenant.id,
    player: player.player,
    operatingStart: await getLogOperatingStart('siphon', tenant.id),
    recentLimit: includeHistory ? 10 : 0,
  })
  if ('error' in result) throw new Error(result.error)
  const account = result.account
  if (!includeHistory) {
    return ephemeralReply([
      formatDiscordCommandMessage(messages.siphonBalanceTitle, { player: account.player }),
      formatDiscordCommandMessage(messages.siphonBalanceLine, {
        deposited: formatNumber(account.deposited),
        withdrawn: formatNumber(account.withdrawn),
        net: formatNumber(account.net),
      }),
    ].join('\n'), {
      components: await webButton(tenant, actor.discordId, '/me/siphon', messages.openWeb),
    })
  }
  const lines = account.rows.map((row) => {
    const sign = row.quantity > 0 ? '+' : ''
    return `${formatDiscordTimestamp(row.loggedAt)} · **${sign}${formatNumber(row.quantity)}** · ${truncate(row.itemNameRaw, 80)}`
  })
  return ephemeralReply([
    messages.siphonHistoryTitle,
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/me/siphon', messages.openWeb),
  })
}

export async function handleShopStatus(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const orders = await listShopOrdersForMember(getAdminClient(), tenant.id, actor.discordId, 10)
  const lines = orders.map((order) => {
    const items = order.items
      .slice(0, 3)
      .map((item) => `${item.nameKo}×${item.quantity}`)
      .join(', ')
    return formatDiscordCommandMessage(messages.shopStatusLine, {
      when: formatDiscordTimestamp(order.createdAt),
      status: discordStatusLabel(order.status, messages),
      points: formatNumber(order.totalPoints),
      items: items || '-',
    })
  })
  return ephemeralReply([
    messages.shopStatusTitle,
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/shop', messages.openWeb),
  })
}

interface ShopInventoryRow {
  id: string
  unique_name: string
  enchant: number
  stock: number
  name_ko: string
  manual_price: number | null
  auto_price_silver: number | null
}

async function submitSingleShopItem(input: {
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  inventory: ShopInventoryRow
  quantity: number
  memo: string | null
  messages: DiscordCommandSuiteMessages
}): Promise<{ response: DiscordInteractionResponse; total?: number }> {
  if (input.quantity < 1 || input.quantity > 2_147_483_647 || input.inventory.stock < input.quantity) {
    return { response: ephemeralReply(input.messages.invalidInput) }
  }
  const discountRate = parseShopDiscountRate(
    await getAppSetting('shop_discount_rate', '1', input.tenant.id),
  )
  const unitPoints = computePointPrice({
    manualPrice: input.inventory.manual_price,
    autoPriceSilver: input.inventory.auto_price_silver,
    discountRate,
  })
  if (unitPoints == null) {
    return {
      response: ephemeralReply(input.messages.shopPriceUnavailable, {
        components: await webButton(
          input.tenant,
          input.actor.discordId,
          '/shop',
          input.messages.openWeb,
        ),
      }),
    }
  }
  const catalogUnitSilver =
    typeof input.inventory.manual_price === 'number' && input.inventory.manual_price >= 0
      ? input.inventory.manual_price
      : typeof input.inventory.auto_price_silver === 'number' &&
          input.inventory.auto_price_silver > 0
        ? input.inventory.auto_price_silver
        : null
  const total = unitPoints * input.quantity
  if (!Number.isSafeInteger(total) || total < 1 || total > 2_147_483_647) {
    return { response: ephemeralReply(input.messages.invalidInput) }
  }
  const db = getAdminClient()
  const points = await getMemberSpendablePointBalance(db, input.tenant.id, input.actor.discordId)
  if (points.error || points.spendable < total) {
    return { response: ephemeralReply(input.messages.invalidInput) }
  }
  const { data: orderId, error } = await db.rpc('submit_shop_order', {
    p_guild_id: input.tenant.id,
    p_discord_id: input.actor.discordId,
    p_username: input.actor.username,
    p_total_points: total,
    p_member_note: input.memo,
    p_price_review_required: false,
    p_lines: [{
      unique_name: input.inventory.unique_name,
      enchant: input.inventory.enchant,
      quality: canonicalShopQuality(),
      name_ko: input.inventory.name_ko,
      quantity: input.quantity,
      unit_points: unitPoints,
      subtotal_points: total,
      pricing_source: 'catalog',
      catalog_unit_silver_snapshot: catalogUnitSilver,
      member_quote_unit_silver: null,
      member_quote_unit_points: null,
      member_quote_city: null,
      member_quote_note: null,
      member_quote_evidence_url: null,
    }],
  })
  if (error || !orderId) return { response: ephemeralReply(input.messages.invalidInput) }
  markPublicShopCacheStale(input.tenant.id)
  revalidatePath('/shop')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId: input.tenant.id,
    topic: 'shop',
    sourceTable: 'shop_orders',
    sourceId: orderId as string,
    title: input.messages.shopOrderAdminTitle,
    body: formatDiscordCommandMessage(input.messages.shopOrderAdminBody, {
      member: input.actor.username,
      item: input.inventory.name_ko,
      quantity: input.quantity,
      points: formatNumber(total),
    }),
    url: `/admin/dashboard/approvals?tab=shop&order=${encodeURIComponent(String(orderId))}#shop-order-${encodeURIComponent(String(orderId))}`,
  })
  return {
    total,
    response: ephemeralReply(formatDiscordCommandMessage(input.messages.shopOrdered, {
      item: input.inventory.name_ko,
      quantity: input.quantity,
      points: formatNumber(total),
    }), {
      components: await webButton(
        input.tenant,
        input.actor.discordId,
        '/shop',
        input.messages.openWeb,
      ),
    }),
  }
}

async function loadShopInventory(
  guildId: string,
  inventoryId: string,
): Promise<ShopInventoryRow | null> {
  if (!UUID_PATTERN.test(inventoryId)) return null
  const { data, error } = await getAdminClient()
    .from('shop_inventory')
    .select('id, unique_name, enchant, stock, name_ko, manual_price, auto_price_silver')
    .eq('guild_id', guildId)
    .eq('id', inventoryId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as ShopInventoryRow | null
}

export async function handleShopOrder(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const inventoryId = stringOption(options, 'item')
  const quantity = integerOption(options, 'quantity')
  const memo = stringOption(options, 'memo')
  if (!inventoryId || !quantity || (memo?.length ?? 0) > MAX_MEMO_LENGTH) {
    return ephemeralReply(messages.invalidInput)
  }
  const inventory = await loadShopInventory(tenant.id, inventoryId)
  if (!inventory) return ephemeralReply(messages.invalidInput)
  return (await submitSingleShopItem({ tenant, actor, inventory, quantity, memo, messages })).response
}

export async function handleShopReorder(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const orderId = stringOption(options, 'order')
  const memo = stringOption(options, 'memo')
  if (!orderId || !UUID_PATTERN.test(orderId) || (memo?.length ?? 0) > MAX_MEMO_LENGTH) {
    return ephemeralReply(messages.invalidInput)
  }
  const db = getAdminClient()
  const { data: order } = await db
    .from('shop_orders')
    .select('id')
    .eq('guild_id', tenant.id)
    .eq('discord_id', actor.discordId)
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return ephemeralReply(messages.invalidInput)
  const { data: lines, error: linesError } = await db
    .from('shop_order_items')
    .select('unique_name, enchant, quantity')
    .eq('guild_id', tenant.id)
    .eq('order_id', orderId)
  if (linesError) throw new Error(linesError.message)
  if (!lines || lines.length !== 1) {
    return ephemeralReply(messages.shopPriceUnavailable, {
      components: await webButton(tenant, actor.discordId, '/shop', messages.openWeb),
    })
  }
  const line = lines[0]
  const { data: inventoryRows, error: inventoryError } = await db
    .from('shop_inventory')
    .select('id, unique_name, enchant, stock, name_ko, manual_price, auto_price_silver')
    .eq('guild_id', tenant.id)
    .eq('unique_name', line.unique_name)
    .eq('enchant', line.enchant)
    .limit(1)
  if (inventoryError) throw new Error(inventoryError.message)
  const inventory = inventoryRows?.[0] as ShopInventoryRow | undefined
  if (!inventory) return ephemeralReply(messages.invalidInput)
  const result = await submitSingleShopItem({
    tenant,
    actor,
    inventory,
    quantity: Number(line.quantity),
    memo,
    messages,
  })
  if (!result.total) return result.response
  return ephemeralReply(formatDiscordCommandMessage(messages.shopReordered, {
    points: formatNumber(result.total),
  }), {
    components: await webButton(tenant, actor.discordId, '/shop', messages.openWeb),
  })
}

const APPROVAL_CAPS = [
  CAP.REGEAR_APPROVE,
  CAP.REGEAR_EDIT_PRICE,
  CAP.REGEAR_BULK_ACTION,
  CAP.EXCHANGE_APPROVE,
  CAP.DONATION_APPROVE,
  CAP.INVENTORY_DELIVER,
  CAP.EVENT_MANAGE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
] as const

const APPROVAL_KIND_CAPS: Record<AdminApprovalKind, readonly bigint[]> = {
  regear: [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION],
  exchange: [CAP.EXCHANGE_APPROVE],
  donation: [CAP.DONATION_APPROVE],
  shop: [CAP.INVENTORY_DELIVER],
  event_payout: [CAP.EVENT_MANAGE],
  craft: [CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER],
}

const APPROVAL_KINDS = Object.keys(APPROVAL_KIND_CAPS) as AdminApprovalKind[]

interface PendingApprovalRow {
  kind: AdminApprovalKind
  id: string
  at: string
  summary: string
}

function relatedRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function approvalNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function approvalSummary(
  template: string,
  values: Record<string, string | number>,
): string {
  return truncate(
    formatDiscordCommandMessage(template, values)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    180,
  )
}

async function loadPendingApprovalKind(
  guildId: string,
  kind: AdminApprovalKind,
  messages: DiscordCommandSuiteMessages,
): Promise<PendingApprovalRow[]> {
  const db = getAdminClient()
  if (kind === 'regear') {
    const { data, error } = await db
      .from('regear_requests')
      .select('id, username, event_title_snapshot, role_name, payout_silver, claimed_silver, created_at')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      kind,
      id: row.id,
      at: row.created_at,
      summary: approvalSummary(messages.approvalRegearSummary, {
        member: row.username,
        event: row.event_title_snapshot,
        role: row.role_name,
        silver: formatNumber(approvalNumber(row.payout_silver ?? row.claimed_silver)),
      }),
    }))
  }
  if (kind === 'exchange') {
    const { data, error } = await db
      .from('exchange_requests')
      .select('id, username, silver, created_at')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      kind,
      id: row.id,
      at: row.created_at,
      summary: approvalSummary(messages.approvalExchangeSummary, {
        member: row.username,
        silver: formatNumber(approvalNumber(row.silver)),
      }),
    }))
  }
  if (kind === 'donation') {
    const { data, error } = await db
      .from('donation_requests')
      .select('id, username, silver, created_at')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      kind,
      id: row.id,
      at: row.created_at,
      summary: approvalSummary(messages.approvalDonationSummary, {
        member: row.username,
        silver: formatNumber(approvalNumber(row.silver)),
      }),
    }))
  }
  if (kind === 'shop') {
    const { data, error } = await db
      .from('shop_orders')
      .select('id, username, total_points, created_at, shop_order_items(name_ko, quantity)')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => {
      const firstItem = row.shop_order_items?.[0]
      const itemCount = row.shop_order_items?.length ?? 0
      const item = firstItem
        ? `${firstItem.name_ko}×${firstItem.quantity}${itemCount > 1 ? ` +${itemCount - 1}` : ''}`
        : '-'
      return {
        kind,
        id: row.id,
        at: row.created_at,
        summary: approvalSummary(messages.approvalShopSummary, {
          member: row.username,
          item,
          points: formatNumber(approvalNumber(row.total_points)),
        }),
      }
    })
  }
  if (kind === 'event_payout') {
    const { data, error } = await db
      .from('event_payout_requests')
      .select('id, created_by_username, participant_count, total_silver, created_at, events(title)')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      kind,
      id: row.id,
      at: row.created_at,
      summary: approvalSummary(messages.approvalEventPayoutSummary, {
        member: row.created_by_username,
        event: relatedRow(row.events)?.title ?? '-',
        count: approvalNumber(row.participant_count),
        silver: formatNumber(approvalNumber(row.total_silver)),
      }),
    }))
  }
  const { data, error } = await db
    .from('craft_tasks')
    .select('id, crafter_username, order_quantity, created_at, craft_orders!inner(item_name, unit_price_silver)')
    .eq('guild_id', guildId)
    .eq('task_kind', 'guild_order')
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const order = relatedRow(row.craft_orders)
    const quantity = approvalNumber(row.order_quantity)
    const silver = approvalNumber(order?.unit_price_silver) * quantity
    return {
      kind,
      id: row.id,
      at: row.created_at,
      summary: approvalSummary(messages.approvalCraftSummary, {
        member: row.crafter_username ?? '-',
        item: order?.item_name ?? '-',
        quantity,
        silver: formatNumber(silver),
      }),
    }
  })
}

function approvalWebPath(kind: AdminApprovalKind): string {
  return kind === 'regear'
    ? '/admin/dashboard/approvals?origin=all'
    : `/admin/dashboard/approvals?tab=${kind}`
}

export async function handleAdminApprovals(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  locale: Locale,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  if (!hasAnyCapability(actor.capabilities, APPROVAL_CAPS)) {
    return ephemeralReply(messages.notAuthorized)
  }
  const rawKind = stringOption(options, 'kind') ?? 'all'
  const kindFilter = rawKind === 'all' || APPROVAL_KINDS.includes(rawKind as AdminApprovalKind)
    ? rawKind
    : 'all'
  const visibleKinds = APPROVAL_KINDS.filter((kind) =>
    hasAnyCapability(actor.capabilities, APPROVAL_KIND_CAPS[kind]) &&
    (kindFilter === 'all' || kind === kindFilter)
  )
  const rows = (await Promise.all(
    visibleKinds.map((kind) => loadPendingApprovalKind(tenant.id, kind, messages)),
  ))
    .flat()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 5)
  const approvalMessages = await loadDiscordAdminApprovalMessages(locale)
  const components = (await Promise.all(rows.map(async (row, index) =>
    buildAdminApprovalMessageComponents({
      kind: row.kind,
      sourceId: row.id,
      url: await createDiscordCommandWebLink(
        tenant,
        actor.discordId,
        approvalWebPath(row.kind),
      ),
      tenantSlug: tenant.slug,
      messages: approvalMessages,
      labelPrefix: String(index + 1),
    })
  ))).flat()
  const lines = rows.map((row, index) => formatDiscordCommandMessage(messages.approvalLine, {
    index: index + 1,
    kind: discordApprovalKindLabel(row.kind, messages),
    summary: row.summary,
    when: formatDiscordTimestamp(row.at),
    id: row.id.slice(0, 8),
  }))
  return ephemeralReply([
    messages.approvalsTitle,
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: components.length
      ? components
      : await webButton(
          tenant,
          actor.discordId,
          '/admin/dashboard/approvals',
          messages.openWeb,
        ),
  })
}

export const EVENT_CREATE_CAP: Record<EventCategory, bigint> = {
  전투: CAP.EVENT_CREATE_COMBAT,
  FF: CAP.EVENT_CREATE_FF,
  갱킹: CAP.EVENT_CREATE_GANKING,
}

export async function eventCreatorCategories(
  tenantId: string,
  actor: DiscordCommandActor,
): Promise<Set<EventCategory>> {
  if (actor.isAdmin) return new Set<EventCategory>(['전투', 'FF', '갱킹'])
  const settingKeys = [
    'event_creator_role_ids',
    'event_creator_role_ids_combat',
    'event_creator_role_ids_ff',
    'event_creator_role_ids_ganking',
  ] as const
  const values = await Promise.all(settingKeys.map((key) => getAppSetting(key, '[]', tenantId)))
  const roleSet = new Set(actor.roleIds)
  const hasRole = (raw: string): boolean => {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.some((roleId) =>
        typeof roleId === 'string' && roleSet.has(roleId)
      )
    } catch {
      return false
    }
  }
  const hasLegacy = hasRole(values[0])
  const categories = new Set<EventCategory>()
  if (hasLegacy || hasRole(values[1])) categories.add('전투')
  if (hasLegacy || hasRole(values[2])) categories.add('FF')
  if (hasLegacy || hasRole(values[3])) categories.add('갱킹')
  return categories
}

async function canCreateEventCategory(
  tenantId: string,
  actor: DiscordCommandActor,
  category: EventCategory,
): Promise<boolean> {
  if (
    hasCapability(actor.capabilities, CAP.EVENT_MANAGE) ||
    hasCapability(actor.capabilities, EVENT_CREATE_CAP[category])
  ) return true
  return (await eventCreatorCategories(tenantId, actor)).has(category)
}

export async function handleAdminEventCreate(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const title = stringOption(options, 'title')
  const categoryRaw = stringOption(options, 'category')
  const category: EventCategory =
    categoryRaw === 'FF' || categoryRaw === '갱킹' ? categoryRaw : '전투'
  if (!title || title.length > 100) return ephemeralReply(messages.invalidInput)
  if (!(await canCreateEventCategory(tenant.id, actor, category))) {
    return ephemeralReply(messages.notAuthorized)
  }
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .insert({
      guild_id: tenant.id,
      title,
      gather_time: '',
      gather_at: null,
      gather_location: '',
      special_notes: null,
      status: 'draft',
      category,
      recruitment_mode: 'slots',
      exclude_from_participation_stats: false,
      created_by: actor.discordId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  await Promise.all([
    logAdminAction({
      guildId: tenant.id,
      adminDiscordId: actor.discordId,
      action: 'event.create',
      targetId: data.id,
      targetKind: 'event',
      details: { kind: 'draft', title, category, source: 'discord' },
    }),
    logTenantOnboardingEvent({
      guildId: tenant.id,
      actorDiscordId: actor.discordId,
      eventType: 'first_event_created',
      details: { eventId: data.id, title, category, source: 'discord' },
    }),
  ])
  revalidatePath('/admin/dashboard/events')
  return ephemeralReply(formatDiscordCommandMessage(messages.eventDraftCreated, { title }), {
    components: await webButton(
      tenant,
      actor.discordId,
      `/admin/dashboard/events/${data.id}`,
      messages.openWeb,
    ),
  })
}

export async function handleAdminEventStart(
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
    .select('id, title, status, category, created_by, battle_started_at')
    .eq('guild_id', tenant.id)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) throw new Error(eventError.message)
  if (!event || event.status !== 'published' || event.battle_started_at) {
    return ephemeralReply(messages.invalidInput)
  }
  const canManage = hasCapability(actor.capabilities, CAP.EVENT_MANAGE)
  const category: EventCategory = event.category === 'FF' || event.category === '갱킹'
    ? event.category
    : '전투'
  const canStartOwn = event.created_by === actor.discordId &&
    await canCreateEventCategory(tenant.id, actor, category)
  if (!canManage && !canStartOwn) return ephemeralReply(messages.notAuthorized)
  const startedAt = new Date().toISOString()
  const { data: started, error } = await db
    .from('events')
    .update({ battle_started_at: startedAt })
    .eq('guild_id', tenant.id)
    .eq('id', eventId)
    .is('battle_started_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!started) return ephemeralReply(messages.invalidInput)
  await logAdminAction({
    guildId: tenant.id,
    adminDiscordId: actor.discordId,
    action: 'event.update',
    targetId: eventId,
    targetKind: 'event',
    details: { kind: 'battle_start', startedAt, source: 'discord' },
  })
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  return ephemeralReply(formatDiscordCommandMessage(messages.eventStarted, {
    title: event.title,
  }))
}
