import 'server-only'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { sendLocalizedDiscordDmToUser, sendLocalizedDiscordDmsToUsers } from '@/lib/discord-dm-localized'
import { formatSilver } from '@/lib/silver'
import { logAdminAction } from '@/lib/admin-audit'
import {
  isValidRoleRegearPayoutRate,
  resolveRegearApprovalPayout,
  resolveRegearPayoutRatePercent,
} from '@/lib/regear-payout'
import {
  parseRegearPolicySnapshot,
  resolveSnapshotPayoutRatePercent,
} from '@/lib/regear-event-policy'
import {
  craftRegearSlots,
  normalizeCraftRegearSlots,
  type CraftRegearSlot,
} from '@/lib/regear-craft-slots'
import { checkBuildSnapshotStock, autoTrackSuffixesFromItemIds } from '@/lib/inventory'
import { isRegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type { BuildSnapshot } from '@/types'
import {
  loadOverchargePayoutRatePercent,
  loadPayoutRatePercent,
  loadVideoPayoutRatePercent,
} from '@/app/actions/regear-admin-types'
import { markPublicShopCacheStale } from '@/lib/shop/cache'
import { isRegearSupported } from '@/lib/regear-support-server'

const ADMIN_NOTE_MAX_LENGTH = 1000
const PICKUP_NOTE_MAX_LENGTH = 300
const MAX_ORDER_TOTAL_POINTS = 2_147_483_647

type AdminDbClient = ReturnType<typeof getAdminClient>
type AdminActionTranslateValues = Record<string, string | number>
export type AdminActionTranslator = (
  key: string,
  values?: AdminActionTranslateValues,
) => string

export interface AdminApprovalActor {
  guildId: string
  discordGuildId?: string
  discordId: string
  username: string
}

interface ActorApprovalInput {
  actor: AdminApprovalActor
  db?: AdminDbClient
  tErr?: AdminActionTranslator
}

interface IdApprovalInput extends ActorApprovalInput {
  id: string
}

interface PayoutParticipant {
  discord_id: string
  username: string
}

function dbFor(input: ActorApprovalInput): AdminDbClient {
  return input.db ?? getAdminClient()
}

function tErr(input: ActorApprovalInput, key: string, values?: AdminActionTranslateValues): string {
  if (input.tErr) return input.tErr(key, values)
  if (key === 'alreadyHandled') return '이미 처리된 요청입니다.'
  if (key === 'unauthorized') return '권한이 없습니다.'
  if (key === 'serverError') return '서버 오류가 발생했습니다.'
  if (key === 'regearSupportDisabled') return '이 길드는 리기어 미지원 상태입니다.'
  return key
}

function revalidateShopSurfaces(guildId: string): void {
  markPublicShopCacheStale(guildId)
  revalidatePath('/shop')
}

async function loadRolePayoutRatePercent(
  db: AdminDbClient,
  guildId: string,
  roleName: string | null | undefined,
): Promise<number | null> {
  const normalizedRoleName = roleName?.trim()
  if (!normalizedRoleName) return null
  const { data } = await db
    .from('role_rewards')
    .select('payout_rate_percent')
    .eq('guild_id', guildId)
    .eq('role_name', normalizedRoleName)
    .maybeSingle()
  const raw = data?.payout_rate_percent
  return isValidRoleRegearPayoutRate(raw) ? raw : null
}

async function loadEffectivePayoutRatePercent(
  db: AdminDbClient,
  guildId: string,
  roleName: string | null | undefined,
  videoProofUrl: string | null | undefined,
  policySnapshot: unknown,
  requestType: string | null | undefined,
): Promise<number> {
  const snapshot = parseRegearPolicySnapshot(policySnapshot)
  if (snapshot) {
    return resolveSnapshotPayoutRatePercent(snapshot, Boolean(videoProofUrl), 100)
  }
  if (requestType === 'overcharge') {
    return loadOverchargePayoutRatePercent(guildId)
  }
  const [baseRatePercent, videoRatePercent, roleRatePercent] = await Promise.all([
    loadPayoutRatePercent(guildId),
    loadVideoPayoutRatePercent(guildId),
    loadRolePayoutRatePercent(db, guildId, roleName),
  ])
  return resolveRegearPayoutRatePercent({
    baseRatePercent,
    roleRatePercent,
    videoRatePercent,
    hasVideoProof: Boolean(videoProofUrl),
  })
}

function resolveCraftIncludedSlots(
  requestedSlots: unknown,
  includeCape?: boolean,
): CraftRegearSlot[] {
  return typeof includeCape === 'boolean'
    ? craftRegearSlots(includeCape)
    : normalizeCraftRegearSlots(requestedSlots, false)
}

export async function approveExchangeRequestForActor(
  input: IdApprovalInput,
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const { error } = await db.rpc('approve_exchange_request', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('EXCHANGE_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    if (error.message.includes('INSUFFICIENT_BALANCE')) return { error: tErr(input, 'insufficientBalanceForExchange') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('exchange_requests')
    .select('discord_id, silver')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('exchangeApprovedTitle'),
      body: tDm('exchangeApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'exchange.approve',
    targetId: id,
    targetKind: 'exchange',
    targetDiscordId: row?.discord_id ?? null,
    details: { silver: row?.silver ?? 0, source: 'discord' },
  })
  return {}
}

export async function rejectExchangeRequestForActor(
  input: IdApprovalInput & { notes: string },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const notes = input.notes.trim()
  const { error } = await db.rpc('reject_exchange_request', {
    p_id: id,
    p_notes: notes || null,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('EXCHANGE_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('exchange_requests')
    .select('discord_id, silver')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('exchangeRejectedTitle'),
      body: tDm('exchangeRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'exchange.reject',
    targetId: id,
    targetKind: 'exchange',
    targetDiscordId: row?.discord_id ?? null,
    details: { silver: row?.silver ?? 0, notes: notes || null, source: 'discord' },
  })
  return {}
}

export async function approveDonationRequestForActor(
  input: IdApprovalInput,
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const { error } = await db.rpc('approve_donation_request', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('DONATION_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/donations')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('donation_requests')
    .select('discord_id, silver')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('donationApprovedTitle'),
      body: tDm('donationApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'donation.approve',
    targetId: id,
    targetKind: 'donation',
    targetDiscordId: row?.discord_id ?? null,
    details: { silver: row?.silver ?? 0, source: 'discord' },
  })
  return {}
}

export async function rejectDonationRequestForActor(
  input: IdApprovalInput & { notes: string },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const notes = input.notes.trim()
  const { error } = await db.rpc('reject_donation_request', {
    p_id: id,
    p_notes: notes || null,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('DONATION_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/donations')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('donation_requests')
    .select('discord_id, silver')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('donationRejectedTitle'),
      body: tDm('donationRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'donation.reject',
    targetId: id,
    targetKind: 'donation',
    targetDiscordId: row?.discord_id ?? null,
    details: { silver: row?.silver ?? 0, notes: notes || null, source: 'discord' },
  })
  return {}
}

export async function approveEventPayoutRequestForActor(
  input: IdApprovalInput,
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const { error } = await db.rpc('approve_event_payout_request', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('EVENT_PAYOUT_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('event_payout_requests')
    .select('silver_per_member, participants, events(title)')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  const participants = (row?.participants ?? []) as PayoutParticipant[]
  const event = row?.events as { title?: string } | { title?: string }[] | null
  const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
  const eventTitle = liveTitle || tErr(input, 'deletedEvent')
  const silver = row?.silver_per_member ?? 0
  const discordIds = participants
    .map((member) => member.discord_id)
    .filter((discordId): discordId is string => Boolean(discordId))
  void sendLocalizedDiscordDmsToUsers(discordIds, actor.guildId, (tDm) => ({
    title: tDm('eventPayoutApprovedTitle'),
    body: tDm('eventPayoutApprovedBody', {
      event: eventTitle,
      silver: formatSilver(silver),
    }),
    url: '/me',
  }))
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'event.payout.approve',
    targetId: id,
    targetKind: 'event',
    details: { silverPerMember: silver, participantCount: participants.length, eventTitle, source: 'discord' },
  })
  return {}
}

export async function rejectEventPayoutRequestForActor(
  input: IdApprovalInput & { notes: string },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const notes = input.notes.trim()
  const { error } = await db.rpc('reject_event_payout_request', {
    p_id: id,
    p_notes: notes || null,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('EVENT_PAYOUT_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/', 'layout')
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'event.payout.reject',
    targetId: id,
    targetKind: 'event',
    details: { notes: notes || null, source: 'discord' },
  })
  return {}
}

export async function approveShopOrderForActor(
  input: IdApprovalInput & {
    adminNote?: string
    totalPointsOverride?: number | null
    pickupNote?: string | null
  },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const trimmedNote = input.adminNote?.trim() || null
  if (trimmedNote && trimmedNote.length > ADMIN_NOTE_MAX_LENGTH) {
    return { error: tErr(input, 'adminNoteTooLong', { max: ADMIN_NOTE_MAX_LENGTH }) }
  }
  const trimmedPickupNote = input.pickupNote?.trim() || null
  if (trimmedPickupNote && trimmedPickupNote.length > PICKUP_NOTE_MAX_LENGTH) {
    return { error: tErr(input, 'pickupNoteTooLong', { max: PICKUP_NOTE_MAX_LENGTH }) }
  }
  let normalizedTotalOverride: number | null = null
  if (input.totalPointsOverride !== undefined && input.totalPointsOverride !== null) {
    const parsed = Number(input.totalPointsOverride)
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_ORDER_TOTAL_POINTS) {
      return { error: tErr(input, 'shopOrderTotalInvalid') }
    }
    normalizedTotalOverride = parsed
  }
  let requestedTotalPoints: number | null = null
  if (normalizedTotalOverride !== null) {
    const { data: orderRow, error: orderErr } = await db
      .from('shop_orders')
      .select('total_points')
      .eq('guild_id', actor.guildId)
      .eq('id', id)
      .eq('status', 'pending')
      .maybeSingle()
    if (orderErr) return { error: orderErr.message }
    requestedTotalPoints = (orderRow?.total_points as number | null | undefined) ?? null
  }
  const { error } = await db.rpc('approve_shop_order', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_guild_id: actor.guildId,
    p_admin_note: trimmedNote,
    p_total_points_override: normalizedTotalOverride,
    p_pickup_note: trimmedPickupNote,
  })
  if (error) {
    if (error.message.includes('INVALID_TOTAL_POINTS')) return { error: tErr(input, 'shopOrderTotalInvalid') }
    if (error.message.includes('INSUFFICIENT_BALANCE')) return { error: tErr(input, 'insufficientPoints') }
    if (error.message.includes('INSUFFICIENT_STOCK')) return { error: tErr(input, 'orderInsufficientStock') }
    if (error.message.includes('ORDER_NOT_PENDING')) return { error: tErr(input, 'orderAlreadyProcessed') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/admin/dashboard/shop')
  revalidateShopSurfaces(actor.guildId)
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'shop.order.approve',
    targetId: id,
    targetKind: 'shop_order',
    details: {
      adminNote: trimmedNote,
      pickupNote: trimmedPickupNote,
      source: 'discord',
      ...(normalizedTotalOverride !== null
        ? { requestedTotalPoints, approvedTotalPoints: normalizedTotalOverride }
        : {}),
    },
  })
  return {}
}

export async function rejectShopOrderForActor(
  input: IdApprovalInput & { adminNote?: string },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const trimmedNote = input.adminNote?.trim() || null
  if (trimmedNote && trimmedNote.length > ADMIN_NOTE_MAX_LENGTH) {
    return { error: tErr(input, 'adminNoteTooLong', { max: ADMIN_NOTE_MAX_LENGTH }) }
  }
  const { error } = await db.rpc('reject_shop_order', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_guild_id: actor.guildId,
    p_admin_note: trimmedNote,
  })
  if (error) {
    if (error.message.includes('ORDER_NOT_PENDING')) return { error: tErr(input, 'orderAlreadyProcessed') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/admin/dashboard/shop')
  revalidateShopSurfaces(actor.guildId)
  revalidatePath('/', 'layout')
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'shop.order.reject',
    targetId: id,
    targetKind: 'shop_order',
    details: { adminNote: trimmedNote, source: 'discord' },
  })
  return {}
}

export async function approveCraftOrderTaskForActor(
  input: IdApprovalInput,
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const { data: task } = await db
    .from('craft_tasks')
    .select('crafter_discord_id, order_quantity, craft_order_id, craft_orders!inner(item_name, item_id, unit_price_silver)')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()

  const { error } = await db.rpc('approve_craft_order_task', {
    p_task_id: id,
    p_guild_id: actor.guildId,
    p_admin_discord_id: actor.discordId,
  })
  if (error) {
    if (error.message.includes('CRAFT_TASK_NOT_FOUND')) return { error: tErr(input, 'craftTaskNotFound') }
    if (error.message.includes('CRAFT_TASK_NOT_DELIVERED')) return { error: tErr(input, 'craftTaskNotDeliverable') }
    if (error.message.includes('CRAFT_TASK_NOT_GUILD_ORDER')) return { error: tErr(input, 'craftTaskKindMismatch') }
    return { error: error.message }
  }
  const order = task?.craft_orders
    ? Array.isArray(task.craft_orders) ? task.craft_orders[0] : task.craft_orders
    : null
  const orderItemId = order?.item_id as string | undefined
  if (orderItemId) {
    void autoTrackSuffixesFromItemIds(actor.guildId, [orderItemId])
  }
  if (task?.crafter_discord_id) {
    const payout =
      order && typeof order.unit_price_silver !== 'undefined'
        ? Number(order.unit_price_silver) * Number(task.order_quantity ?? 0)
        : 0
    const itemLabel = order?.item_name ?? order?.item_id ?? ''
    void sendLocalizedDiscordDmToUser(task.crafter_discord_id as string, actor.guildId, (tDm) => ({
      title: tDm('craftOrderApprovedTitle'),
      body: tDm('craftOrderApprovedBody', {
        item: itemLabel,
        quantity: String(task.order_quantity ?? 0),
        silver: String(payout),
      }),
      url: '/me',
    }))
  }
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/craft/orders')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function rejectCraftOrderTaskForActor(
  input: IdApprovalInput & { reason: string },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  const reason = input.reason.trim()
  const { data: task } = await db
    .from('craft_tasks')
    .select('crafter_discord_id, craft_orders!inner(item_name, item_id)')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.rpc('reject_craft_order_task', {
    p_task_id: id,
    p_guild_id: actor.guildId,
    p_admin_discord_id: actor.discordId,
    p_reason: reason || null,
  })
  if (error) {
    if (error.message.includes('CRAFT_TASK_NOT_FOUND')) return { error: tErr(input, 'craftTaskNotFound') }
    if (error.message.includes('CRAFT_TASK_NOT_DELIVERED')) return { error: tErr(input, 'craftTaskNotDeliverable') }
    if (error.message.includes('CRAFT_TASK_NOT_GUILD_ORDER')) return { error: tErr(input, 'craftTaskKindMismatch') }
    return { error: error.message }
  }
  if (task?.crafter_discord_id) {
    const order = Array.isArray(task.craft_orders) ? task.craft_orders[0] : task.craft_orders
    const itemLabel = order?.item_name ?? order?.item_id ?? ''
    void sendLocalizedDiscordDmToUser(task.crafter_discord_id as string, actor.guildId, (tDm) => ({
      title: tDm('craftOrderRejectedTitle'),
      body: tDm('craftOrderRejectedBody', {
        item: itemLabel,
        reason: reason || '-',
      }),
      url: '/craft/orders',
    }))
  }
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/craft/orders')
  revalidatePath('/', 'layout')
  return {}
}

export async function approveRegearRequestForActor(
  input: IdApprovalInput & { overrideSilver?: number },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  if (!(await isRegearSupported(actor.guildId))) {
    return { error: tErr(input, 'regearSupportDisabled') }
  }
  const { data: pending } = await db
    .from('regear_requests')
    .select('claimed_silver, silver, base_silver, role_name, video_proof_url, regear_policy_snapshot, request_type')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle()
  const claimed = pending?.claimed_silver ?? 0
  const capSilver = Math.max(pending?.silver ?? 0, pending?.base_silver ?? 0, claimed)
  const ratePercent = await loadEffectivePayoutRatePercent(
    db,
    actor.guildId,
    pending?.role_name,
    pending?.video_proof_url,
    pending?.regear_policy_snapshot,
    pending?.request_type,
  )
  const payoutResult = resolveRegearApprovalPayout({
    claimedSilver: claimed,
    ratePercent,
    overrideSilver: input.overrideSilver,
    capSilver,
  })
  if ('error' in payoutResult) {
    if (payoutResult.error === 'nonNegativeInteger') return { error: tErr(input, 'nonNegativeInteger') }
    return { error: tErr(input, 'payoutExceedsClaim', { claimed: capSilver.toLocaleString() }) }
  }
  const payout = payoutResult.payoutSilver
  const { error } = await db.rpc('approve_regear_request', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
    p_payout_silver: payout,
  })
  if (error) {
    if (error.message.includes('REGEAR_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/craft/queue')
  revalidatePath('/craft/my-tasks')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('regear_requests')
    .select('discord_id, event_title_snapshot, payout_silver')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('regearApprovedTitle'),
      body: tDm('regearApprovedBody', {
        event: row.event_title_snapshot ?? '',
        silver: formatSilver(row.payout_silver ?? payout),
      }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'regear.approve',
    targetId: id,
    targetKind: 'regear',
    targetDiscordId: row?.discord_id ?? null,
    details: { mode: 'silver', claimedSilver: claimed, payoutSilver: payout, eventTitle: row?.event_title_snapshot ?? null, source: 'discord' },
  })
  return {}
}

export async function approveRegearFromStockForActor(
  input: IdApprovalInput & { overrideSilver?: number; includeCape?: boolean },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  if (!(await isRegearSupported(actor.guildId))) {
    return { error: tErr(input, 'regearSupportDisabled') }
  }
  const { data: pending } = await db
    .from('regear_requests')
    .select('claimed_silver, silver, base_silver, role_name, video_proof_url, regear_policy_snapshot, build_snapshot, craft_requested_slots, fulfillment_mode, status, request_type')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (!pending || pending.status !== 'pending') return { error: tErr(input, 'alreadyHandled') }
  if (pending.fulfillment_mode !== 'crafted') return { error: tErr(input, 'regearNotCraftedMode') }
  const buildSnapshot = (pending.build_snapshot as BuildSnapshot | null) ?? null
  if (!buildSnapshot) return { error: tErr(input, 'regearMissingBuildSnapshot') }
  const includedSlots = resolveCraftIncludedSlots(pending.craft_requested_slots, input.includeCape)
  const stockCheck = await checkBuildSnapshotStock(actor.guildId, buildSnapshot, { includedSlots })
  if (!stockCheck.allSufficient) {
    const missing = stockCheck.perItem.filter((p) => !p.sufficient).map((p) => p.itemId)
    return { error: tErr(input, 'regearInsufficientStock', { items: missing.join(', ') }) }
  }
  const claimed = pending.claimed_silver ?? 0
  const capSilver = Math.max(pending.silver ?? 0, pending.base_silver ?? 0, claimed)
  const ratePercent = await loadEffectivePayoutRatePercent(
    db,
    actor.guildId,
    pending.role_name,
    pending.video_proof_url,
    pending.regear_policy_snapshot,
    pending.request_type,
  )
  const payoutResult = resolveRegearApprovalPayout({
    claimedSilver: claimed,
    ratePercent,
    overrideSilver: input.overrideSilver,
    capSilver,
  })
  if ('error' in payoutResult) {
    if (payoutResult.error === 'nonNegativeInteger') return { error: tErr(input, 'nonNegativeInteger') }
    return { error: tErr(input, 'payoutExceedsClaim', { claimed: capSilver.toLocaleString() }) }
  }
  const payout = payoutResult.payoutSilver
  const { error } = await db.rpc('approve_regear_from_stock', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
    p_payout_silver: payout,
    p_item_ids: stockCheck.itemIdsForRpc,
    p_included_slots: includedSlots,
  })
  if (error) {
    const msg = error.message
    if (msg.includes('REGEAR_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    if (msg.includes('REGEAR_NOT_CRAFTED_MODE')) return { error: tErr(input, 'regearNotCraftedMode') }
    if (msg.includes('INSUFFICIENT_STOCK')) {
      const itemId = msg.split('INSUFFICIENT_STOCK:')[1]?.trim() ?? ''
      return { error: tErr(input, 'regearInsufficientStock', { items: itemId }) }
    }
    return { error: msg }
  }
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('regear_requests')
    .select('discord_id, event_title_snapshot')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('regearStockedTitle'),
      body: tDm('regearStockedBody', { event: row.event_title_snapshot ?? '' }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'regear.approve',
    targetId: id,
    targetKind: 'regear',
    targetDiscordId: row?.discord_id ?? null,
    details: { mode: 'stock', claimedSilver: claimed, payoutSilver: payout, includedSlots, eventTitle: row?.event_title_snapshot ?? null, source: 'discord' },
  })
  return {}
}

export async function approveRegearAsCraftedForActor(
  input: IdApprovalInput & { overrideSilver?: number; includeCape?: boolean },
): Promise<{ error?: string }> {
  const db = dbFor(input)
  const { actor, id } = input
  if (!(await isRegearSupported(actor.guildId))) {
    return { error: tErr(input, 'regearSupportDisabled') }
  }
  const { data: pending } = await db
    .from('regear_requests')
    .select('claimed_silver, silver, base_silver, role_name, video_proof_url, regear_policy_snapshot, build_snapshot, craft_requested_slots, fulfillment_mode, status, request_type')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (!pending || pending.status !== 'pending') return { error: tErr(input, 'alreadyHandled') }
  if (pending.fulfillment_mode !== 'crafted') return { error: tErr(input, 'regearNotCraftedMode') }
  const buildSnapshot = (pending.build_snapshot as BuildSnapshot | null) ?? null
  if (!buildSnapshot) return { error: tErr(input, 'regearMissingBuildSnapshot') }
  const includedSlots = resolveCraftIncludedSlots(pending.craft_requested_slots, input.includeCape)
  const claimed = pending.claimed_silver ?? 0
  const capSilver = Math.max(pending.silver ?? 0, pending.base_silver ?? 0, claimed)
  const ratePercent = await loadEffectivePayoutRatePercent(
    db,
    actor.guildId,
    pending.role_name,
    pending.video_proof_url,
    pending.regear_policy_snapshot,
    pending.request_type,
  )
  const payoutResult = resolveRegearApprovalPayout({
    claimedSilver: claimed,
    ratePercent,
    overrideSilver: input.overrideSilver,
    capSilver,
  })
  if ('error' in payoutResult) {
    if (payoutResult.error === 'nonNegativeInteger') return { error: tErr(input, 'nonNegativeInteger') }
    return { error: tErr(input, 'payoutExceedsClaim', { claimed: capSilver.toLocaleString() }) }
  }
  const payout = payoutResult.payoutSilver
  const { error } = await db.rpc('approve_regear_as_crafted', {
    p_id: id,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
    p_payout_silver: payout,
    p_included_slots: includedSlots,
  })
  if (error) {
    const msg = error.message
    if (msg.includes('REGEAR_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    if (msg.includes('REGEAR_NOT_CRAFTED_MODE')) return { error: tErr(input, 'regearNotCraftedMode') }
    return { error: msg }
  }
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/craft/queue')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('regear_requests')
    .select('discord_id, event_title_snapshot')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, (tDm) => ({
      title: tDm('regearCraftedTitle'),
      body: tDm('regearCraftedBody', { event: row.event_title_snapshot ?? '' }),
      url: '/me',
    }))
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'regear.approve',
    targetId: id,
    targetKind: 'regear',
    targetDiscordId: row?.discord_id ?? null,
    details: { mode: 'crafted', claimedSilver: claimed, payoutSilver: payout, includedSlots, eventTitle: row?.event_title_snapshot ?? null, source: 'discord' },
  })
  return {}
}

export async function rejectRegearRequestForActor(
  input: IdApprovalInput & { reasonCode: string; notes: string },
): Promise<{ error?: string }> {
  if (!isRegearRejectReasonCode(input.reasonCode)) return { error: tErr(input, 'invalidRejectReason') }
  const db = dbFor(input)
  const { actor, id } = input
  if (!(await isRegearSupported(actor.guildId))) {
    return { error: tErr(input, 'regearSupportDisabled') }
  }
  const notes = input.notes.trim()
  const { error } = await db.rpc('reject_regear_request', {
    p_id: id,
    p_notes: notes || null,
    p_reason_code: input.reasonCode,
    p_admin_id: actor.discordId,
    p_admin_username: actor.username,
    p_guild_id: actor.guildId,
  })
  if (error) {
    if (error.message.includes('REGEAR_NOT_PENDING')) return { error: tErr(input, 'alreadyHandled') }
    if (error.message.includes('INVALID_REJECT_REASON_CODE')) return { error: tErr(input, 'invalidRejectReason') }
    return { error: error.message }
  }
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/me')
  revalidatePath('/regear')
  revalidatePath('/', 'layout')
  const { data: row } = await db
    .from('regear_requests')
    .select('discord_id, event_title_snapshot')
    .eq('guild_id', actor.guildId)
    .eq('id', id)
    .maybeSingle()
  if (row?.discord_id) {
    void sendLocalizedDiscordDmToUser(row.discord_id, actor.guildId, async (tDm, locale) => {
      const tReason = await getTranslations({ locale, namespace: 'regearRejectReason' })
      const reasonLabel = tReason(input.reasonCode)
      const bodyText = notes
        ? tDm('regearRejectedBodyWithReason', {
            event: row.event_title_snapshot ?? '',
            reason: reasonLabel,
            notes,
          })
        : tDm('regearRejectedBodyReasonOnly', {
            event: row.event_title_snapshot ?? '',
            reason: reasonLabel,
          })
      return { title: tDm('regearRejectedTitle'), body: bodyText, url: '/me' }
    })
  }
  await logAdminAction({
    guildId: actor.guildId,
    adminDiscordId: actor.discordId,
    action: 'regear.reject',
    targetId: id,
    targetKind: 'regear',
    targetDiscordId: row?.discord_id ?? null,
    details: { reasonCode: input.reasonCode, notes: notes || null, eventTitle: row?.event_title_snapshot ?? null, source: 'discord' },
  })
  return {}
}
