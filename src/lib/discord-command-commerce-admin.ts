import 'server-only'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import {
  ephemeralReply,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
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
import { resolveSiphonPlayer } from '@/lib/siphon/member-siphon'
import { loadMemberSiphonAccount } from '@/lib/siphon/member-siphon-account-server'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { listShopOrdersForMember } from '@/lib/shop/member-queries'
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
import {
  prepareShopOrderApplicationCommand,
  type PreparedShopOrderApplicationCommand,
  type ShopOrderCommandInput,
} from '@/lib/shop-order-application-command'
import { prepareEventStartApplicationCommand } from '@/lib/event-start-application-command'
import { createDiscordApplicationCommandConfirmation } from '@/lib/discord-application-command-confirmations'
import { ApplicationCommandError } from '@/lib/application-command'

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

function shopConfirmationItems(
  prepared: PreparedShopOrderApplicationCommand,
): string {
  return prepared.orderLines
    .slice(0, 3)
    .map((line) =>
      `${line.nameKo}${line.enchant > 0 ? ` .${line.enchant}` : ''} × ${formatNumber(line.quantity)}`
    )
    .join(', ')
}

async function confirmSingleShopItem(input: {
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  payload: DiscordInteractionPayload
  inventoryId: string
  quantity: number
  memo: string | null
  messages: DiscordCommandSuiteMessages
}): Promise<DiscordInteractionResponse> {
  const request: ShopOrderCommandInput = {
    lines: [{ inventoryId: input.inventoryId, quantity: input.quantity }],
    memberNote: input.memo ?? '',
  }
  let prepared: PreparedShopOrderApplicationCommand
  try {
    prepared = await prepareShopOrderApplicationCommand({
      guildId: input.tenant.id,
      actorDiscordId: input.actor.discordId,
    }, request)
  } catch (error) {
    if (
      error instanceof ApplicationCommandError &&
      (error.code === 'shop_quote_required' || error.code === 'shop_price_changed')
    ) {
      return ephemeralReply(input.messages.shopPriceUnavailable, {
        components: await webButton(
          input.tenant,
          input.actor.discordId,
          '/shop',
          input.messages.openWeb,
        ),
      })
    }
    return ephemeralReply(input.messages.invalidInput)
  }
  return createDiscordApplicationCommandConfirmation({
    tenant: input.tenant,
    actor: input.actor,
    payload: input.payload,
    commandName: 'shop.order',
    requestPayload: prepared.confirmedInput as unknown as Record<string, unknown>,
    summary: formatDiscordCommandMessage(input.messages.shopOrderConfirmation, {
      items: shopConfirmationItems(prepared),
      points: formatNumber(prepared.total),
      balance: formatNumber(prepared.spendableBefore),
    }),
    messages: input.messages,
  })
}

export async function handleShopOrder(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  payload: DiscordInteractionPayload,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const inventoryId = stringOption(options, 'item')
  const quantity = integerOption(options, 'quantity')
  const memo = stringOption(options, 'memo')
  if (!inventoryId || !quantity || (memo?.length ?? 0) > MAX_MEMO_LENGTH) {
    return ephemeralReply(messages.invalidInput)
  }
  if (!UUID_PATTERN.test(inventoryId)) return ephemeralReply(messages.invalidInput)
  return confirmSingleShopItem({
    tenant,
    actor,
    payload,
    inventoryId,
    quantity,
    memo,
    messages,
  })
}

export async function handleShopReorder(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  payload: DiscordInteractionPayload,
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
    .select('id')
    .eq('guild_id', tenant.id)
    .eq('unique_name', line.unique_name)
    .eq('enchant', line.enchant)
    .limit(1)
  if (inventoryError) throw new Error(inventoryError.message)
  const inventoryId = inventoryRows?.[0]?.id as string | undefined
  if (!inventoryId) return ephemeralReply(messages.invalidInput)
  return confirmSingleShopItem({
    tenant,
    actor,
    payload,
    inventoryId,
    quantity: Number(line.quantity),
    memo,
    messages,
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
  _tenantId: string,
  actor: DiscordCommandActor,
): Promise<Set<EventCategory>> {
  if (
    actor.isAdmin ||
    hasCapability(actor.capabilities, CAP.EVENT_MANAGE)
  ) {
    return new Set<EventCategory>(['전투', 'FF', '갱킹'])
  }
  const categories = new Set<EventCategory>()
  if (hasCapability(actor.capabilities, CAP.EVENT_CREATE_COMBAT)) {
    categories.add('전투')
  }
  if (hasCapability(actor.capabilities, CAP.EVENT_CREATE_FF)) {
    categories.add('FF')
  }
  if (hasCapability(actor.capabilities, CAP.EVENT_CREATE_GANKING)) {
    categories.add('갱킹')
  }
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
  payload: DiscordInteractionPayload,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const eventId = stringOption(options, 'event')
  if (!eventId || !UUID_PATTERN.test(eventId)) return ephemeralReply(messages.invalidInput)
  try {
    const prepared = await prepareEventStartApplicationCommand({
      guildId: tenant.id,
      actorDiscordId: actor.discordId,
      actorUsername: actor.username,
      source: 'discord',
      correlationId: payload.id,
      idempotencyKey: randomUUID(),
      isAdmin: actor.isAdmin,
      capabilities: actor.capabilities,
      eventCreatorCategories: [...await eventCreatorCategories(tenant.id, actor)],
    }, { eventId })
    return createDiscordApplicationCommandConfirmation({
      tenant,
      actor,
      payload,
      commandName: 'event.start',
      requestPayload: prepared.requestPayload,
      summary: formatDiscordCommandMessage(messages.eventStartConfirmation, {
        title: prepared.title,
      }),
      messages,
    })
  } catch (error) {
    if (
      error instanceof ApplicationCommandError &&
      error.code === 'event_start_not_authorized'
    ) {
      return ephemeralReply(messages.notAuthorized)
    }
    return ephemeralReply(messages.invalidInput)
  }
}
