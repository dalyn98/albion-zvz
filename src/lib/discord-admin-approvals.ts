import 'server-only'

import { CAP } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase-admin'
import { tenantUrl } from '@/lib/tenant-resolver'
import { log } from '@/lib/log'
import { resolveDiscordAdminApprovalActor } from '@/lib/discord-admin-auth'
import {
  approveCraftOrderTaskForActor,
  approveDonationRequestForActor,
  approveEventPayoutRequestForActor,
  approveExchangeRequestForActor,
  approveRegearAsCraftedForActor,
  approveRegearFromStockForActor,
  approveRegearRequestForActor,
  approveShopOrderForActor,
  rejectCraftOrderTaskForActor,
  rejectDonationRequestForActor,
  rejectEventPayoutRequestForActor,
  rejectExchangeRequestForActor,
  rejectRegearRequestForActor,
  rejectShopOrderForActor,
  type AdminApprovalActor,
} from '@/lib/admin-approval-service'
import {
  ephemeralReply,
  messageUpdateReply,
  modalReply,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  INTERACTION_TYPE_MODAL_SUBMIT,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
  type DiscordMessageComponent,
} from '@/lib/discord-interactions'
import type { AdminNotificationTopic } from '@/lib/admin-notification-topics'
import { resolveSupportedLocale, type Locale } from '@/i18n/locales'
import { getAppSetting } from '@/lib/app-settings'
import { parseAdminNotificationLocale } from '@/lib/admin-notification-locale'

const CUSTOM_ID_PREFIX = 'agm_admin:v1'
const REJECT_NOTE_INPUT_ID = 'note'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DISCORD_API = 'https://discord.com/api/v10'

export type AdminApprovalKind =
  | 'regear'
  | 'exchange'
  | 'donation'
  | 'shop'
  | 'event_payout'
  | 'craft'

export type AdminApprovalAction =
  | 'prompt_approve'
  | 'prompt_stock'
  | 'prompt_crafted'
  | 'confirm_approve'
  | 'confirm_stock'
  | 'confirm_crafted'
  | 'prompt_reject'
  | 'reject_submit'
  | 'cancel'

export type AdminApprovalResolution =
  | 'approved'
  | 'stocked'
  | 'crafted'
  | 'rejected'

interface AdminApprovalCustomId {
  kind: AdminApprovalKind
  action: AdminApprovalAction
  sourceId: string
}

interface AdminApprovalMessages {
  approveButton: string
  rejectButton: string
  openButton: string
  regearSilverButton: string
  regearStockButton: string
  regearCraftButton: string
  confirmApproveButton: string
  confirmRejectButton: string
  cancelButton: string
  unsupported: string
  notAuthorized: string
  notInGuild: string
  guildNotLinked: string
  confirmApprove: string
  confirmStock: string
  confirmCrafted: string
  cancelDone: string
  rejectModalTitle: string
  rejectModalLabel: string
  rejectModalPlaceholder: string
  approved: string
  stocked: string
  crafted: string
  rejected: string
  failed: string
  handledButton: string
}

const KIND_SOURCE_TABLES: Record<AdminApprovalKind, string> = {
  regear: 'regear_requests',
  exchange: 'exchange_requests',
  donation: 'donation_requests',
  shop: 'shop_orders',
  event_payout: 'event_payout_requests',
  craft: 'craft_tasks',
}

const KIND_TOPICS: Record<AdminApprovalKind, AdminNotificationTopic> = {
  regear: 'regear',
  exchange: 'exchange',
  donation: 'donation',
  shop: 'shop',
  event_payout: 'event_payout',
  craft: 'craft',
}

const REQUIRED_CAPS: Record<AdminApprovalKind, readonly bigint[]> = {
  regear: [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION],
  exchange: [CAP.EXCHANGE_APPROVE],
  donation: [CAP.DONATION_APPROVE],
  shop: [CAP.INVENTORY_DELIVER],
  event_payout: [CAP.EVENT_MANAGE],
  craft: [CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER],
}

export async function loadDiscordAdminApprovalMessages(
  locale: Locale = 'ko',
): Promise<AdminApprovalMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordAdminApproval ?? {}) as Partial<AdminApprovalMessages>
  return {
    approveButton: ns.approveButton ?? '승인',
    rejectButton: ns.rejectButton ?? '거절',
    openButton: ns.openButton ?? '상세보기',
    regearSilverButton: ns.regearSilverButton ?? '실버 승인',
    regearStockButton: ns.regearStockButton ?? '재고 출고',
    regearCraftButton: ns.regearCraftButton ?? '제작 큐',
    confirmApproveButton: ns.confirmApproveButton ?? '확정 승인',
    confirmRejectButton: ns.confirmRejectButton ?? '확정 거절',
    cancelButton: ns.cancelButton ?? '취소',
    unsupported: ns.unsupported ?? '지원하지 않는 승인 작업입니다.',
    notAuthorized: ns.notAuthorized ?? '이 작업을 처리할 권한이 없습니다.',
    notInGuild: ns.notInGuild ?? 'Discord 서버 안에서만 사용할 수 있습니다.',
    guildNotLinked: ns.guildNotLinked ?? '연결된 AGM 길드를 찾을 수 없습니다.',
    confirmApprove: ns.confirmApprove ?? '이 요청을 승인하시겠습니까?',
    confirmStock: ns.confirmStock ?? '이 리기어를 길드 재고에서 출고하시겠습니까?',
    confirmCrafted: ns.confirmCrafted ?? '이 리기어를 제작 큐로 보내시겠습니까?',
    cancelDone: ns.cancelDone ?? '작업을 취소했습니다.',
    rejectModalTitle: ns.rejectModalTitle ?? '거절 사유',
    rejectModalLabel: ns.rejectModalLabel ?? '사유',
    rejectModalPlaceholder: ns.rejectModalPlaceholder ?? '필요하면 사유를 입력하세요.',
    approved: ns.approved ?? '승인되었습니다.',
    stocked: ns.stocked ?? '재고 출고로 승인되었습니다.',
    crafted: ns.crafted ?? '제작 큐로 보냈습니다.',
    rejected: ns.rejected ?? '거절되었습니다.',
    failed: ns.failed ?? '처리하지 못했습니다: {error}',
    handledButton: ns.handledButton ?? '{status} · {actor}',
  }
}

function resolveAdminApprovalLocale(payload: DiscordInteractionPayload): Locale {
  const raw = payload.locale ?? payload.guild_locale ?? 'ko'
  return resolveSupportedLocale(raw) ?? 'ko'
}

export function resolveAdminApprovalKind(input: {
  topic: AdminNotificationTopic
  sourceTable: string
  sourceId: string
}): AdminApprovalKind | null {
  if (!UUID_RE.test(input.sourceId)) return null
  for (const [kind, table] of Object.entries(KIND_SOURCE_TABLES) as Array<[AdminApprovalKind, string]>) {
    if (KIND_TOPICS[kind] === input.topic && table === input.sourceTable) return kind
  }
  return null
}

export function buildAdminApprovalCustomId(
  kind: AdminApprovalKind,
  action: AdminApprovalAction,
  sourceId: string,
): string {
  return [CUSTOM_ID_PREFIX, kind, action, sourceId].join(':')
}

export function isDiscordAdminApprovalCustomId(raw: string | undefined): boolean {
  return !!raw?.startsWith(`${CUSTOM_ID_PREFIX}:`)
}

export function parseAdminApprovalCustomId(raw: string | undefined): AdminApprovalCustomId | null {
  if (!isDiscordAdminApprovalCustomId(raw)) return null
  const [, , kind, action, sourceId] = raw?.split(':') ?? []
  if (!isAdminApprovalKind(kind)) return null
  if (!isAdminApprovalAction(action)) return null
  if (!sourceId || !UUID_RE.test(sourceId)) return null
  if ((action === 'prompt_stock' || action === 'confirm_stock' || action === 'prompt_crafted' || action === 'confirm_crafted') && kind !== 'regear') {
    return null
  }
  return { kind, action, sourceId }
}

export function buildAdminApprovalMessageComponents(input: {
  kind: AdminApprovalKind
  sourceId: string
  url?: string
  tenantSlug: string | null
  messages: AdminApprovalMessages
  labelPrefix?: string
}): DiscordMessageComponent[] {
  const absoluteUrl = input.url
    ? /^https?:\/\//i.test(input.url)
      ? input.url
      : tenantUrl(input.tenantSlug, input.url)
    : null
  const buttonLabel = (label: string): string =>
    input.labelPrefix ? `${input.labelPrefix} · ${label}` : label
  const components =
    input.kind === 'regear'
      ? [
          {
            type: 2 as const,
            style: 3 as const,
            label: buttonLabel(input.messages.regearSilverButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_approve', input.sourceId),
          },
          {
            type: 2 as const,
            style: 1 as const,
            label: buttonLabel(input.messages.regearStockButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_stock', input.sourceId),
          },
          {
            type: 2 as const,
            style: 2 as const,
            label: buttonLabel(input.messages.regearCraftButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_crafted', input.sourceId),
          },
          {
            type: 2 as const,
            style: 4 as const,
            label: buttonLabel(input.messages.rejectButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_reject', input.sourceId),
          },
        ]
      : [
          {
            type: 2 as const,
            style: 3 as const,
            label: buttonLabel(input.messages.approveButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_approve', input.sourceId),
          },
          {
            type: 2 as const,
            style: 4 as const,
            label: buttonLabel(input.messages.rejectButton),
            custom_id: buildAdminApprovalCustomId(input.kind, 'prompt_reject', input.sourceId),
          },
        ]
  return [
    {
      type: 1,
      components: [
        ...components,
        ...(absoluteUrl
              ? [{
                  type: 2 as const,
                  style: 5 as const,
                  label: buttonLabel(input.messages.openButton),
                  url: absoluteUrl,
                }]
          : []),
      ].slice(0, 5),
    },
  ]
}

export function shouldDeferDiscordAdminApprovalInteraction(
  payload: DiscordInteractionPayload,
): boolean {
  const action = parseAdminApprovalCustomId(payload.data?.custom_id)
  return (
    !!action &&
    !!payload.application_id &&
    !!payload.token &&
    (action.action.startsWith('confirm_') ||
      (payload.type === INTERACTION_TYPE_MODAL_SUBMIT && action.action === 'reject_submit'))
  )
}

export function shouldUpdateDiscordAdminApprovalInteractionMessage(
  payload: DiscordInteractionPayload,
): boolean {
  const action = parseAdminApprovalCustomId(payload.data?.custom_id)
  return (
    payload.type === INTERACTION_TYPE_MESSAGE_COMPONENT &&
    !!action &&
    (action.action === 'cancel' || action.action.startsWith('confirm_'))
  )
}

export async function handleDiscordAdminApprovalInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const messages = await loadDiscordAdminApprovalMessages(resolveAdminApprovalLocale(payload))
  const action = parseAdminApprovalCustomId(payload.data?.custom_id)
  if (!action) return ephemeralReply(messages.unsupported)

  if (action.action === 'cancel') {
    return messageUpdateReply(messages.cancelDone, { components: [] })
  }

  const auth = await resolveDiscordAdminApprovalActor(payload, REQUIRED_CAPS[action.kind])
  if (!auth.ok) {
    const message = authErrorMessage(auth.error, messages)
    return shouldUpdateDiscordAdminApprovalInteractionMessage(payload)
      ? messageUpdateReply(message, { components: [] })
      : ephemeralReply(message)
  }

  if (action.action === 'prompt_reject') {
    return modalReply({
      customId: buildAdminApprovalCustomId(action.kind, 'reject_submit', action.sourceId),
      title: messages.rejectModalTitle,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: REJECT_NOTE_INPUT_ID,
              style: 2,
              label: messages.rejectModalLabel,
              placeholder: messages.rejectModalPlaceholder,
              max_length: 500,
              required: false,
            },
          ],
        },
      ],
    })
  }

  if (action.action === 'prompt_approve' || action.action === 'prompt_stock' || action.action === 'prompt_crafted') {
    const confirmAction = promptToConfirmAction(action.action)
    return ephemeralReply(confirmMessage(action.action, messages), {
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: messages.confirmApproveButton,
              custom_id: buildAdminApprovalCustomId(action.kind, confirmAction, action.sourceId),
            },
            {
              type: 2,
              style: 2,
              label: messages.cancelButton,
              custom_id: buildAdminApprovalCustomId(action.kind, 'cancel', action.sourceId),
            },
          ],
        },
      ],
    })
  }

  if (payload.type === INTERACTION_TYPE_MESSAGE_COMPONENT && action.action.startsWith('confirm_')) {
    return handleConfirmedAction(action, auth.actor, payload, messages)
  }
  if (payload.type === INTERACTION_TYPE_MODAL_SUBMIT && action.action === 'reject_submit') {
    return handleRejectSubmit(action, auth.actor, payload, messages)
  }

  return ephemeralReply(messages.unsupported)
}

async function handleConfirmedAction(
  action: AdminApprovalCustomId,
  actor: AdminApprovalActor,
  payload: DiscordInteractionPayload,
  messages: AdminApprovalMessages,
): Promise<DiscordInteractionResponse> {
  const result =
    action.action === 'confirm_stock'
      ? await approveRegearFromStockForActor({ actor, id: action.sourceId })
      : action.action === 'confirm_crafted'
        ? await approveRegearAsCraftedForActor({ actor, id: action.sourceId })
        : await approveByKind(action.kind, actor, action.sourceId)

  const status = successStatus(action, messages)
  await recordInteraction({ payload, action, actor, result: result.error ? 'error' : 'success', error: result.error ?? null })
  if (result.error) {
    return messageUpdateReply(format(messages.failed, { error: result.error }), { components: [] })
  }

  await syncDiscordAdminApprovalNotification({
    kind: action.kind,
    sourceId: action.sourceId,
    actor,
    resolution: resolutionForAction(action),
    fallbackChannelId: payload.channel_id,
  })
  return messageUpdateReply(status, { components: [] })
}

async function handleRejectSubmit(
  action: AdminApprovalCustomId,
  actor: AdminApprovalActor,
  payload: DiscordInteractionPayload,
  messages: AdminApprovalMessages,
): Promise<DiscordInteractionResponse> {
  const note = readModalInput(payload, REJECT_NOTE_INPUT_ID)
  const result = await rejectByKind(action.kind, actor, action.sourceId, note)
  await recordInteraction({ payload, action, actor, result: result.error ? 'error' : 'success', error: result.error ?? null })
  if (result.error) return ephemeralReply(format(messages.failed, { error: result.error }))

  await syncDiscordAdminApprovalNotification({
    kind: action.kind,
    sourceId: action.sourceId,
    actor,
    resolution: 'rejected',
    fallbackChannelId: payload.channel_id,
  })
  return ephemeralReply(messages.rejected)
}

async function approveByKind(
  kind: AdminApprovalKind,
  actor: AdminApprovalActor,
  sourceId: string,
): Promise<{ error?: string }> {
  switch (kind) {
    case 'regear':
      return approveRegearRequestForActor({ actor, id: sourceId })
    case 'exchange':
      return approveExchangeRequestForActor({ actor, id: sourceId })
    case 'donation':
      return approveDonationRequestForActor({ actor, id: sourceId })
    case 'shop':
      return approveShopOrderForActor({ actor, id: sourceId })
    case 'event_payout':
      return approveEventPayoutRequestForActor({ actor, id: sourceId })
    case 'craft':
      return approveCraftOrderTaskForActor({ actor, id: sourceId })
  }
}

async function rejectByKind(
  kind: AdminApprovalKind,
  actor: AdminApprovalActor,
  sourceId: string,
  note: string,
): Promise<{ error?: string }> {
  switch (kind) {
    case 'regear':
      return rejectRegearRequestForActor({ actor, id: sourceId, reasonCode: 'other', notes: note })
    case 'exchange':
      return rejectExchangeRequestForActor({ actor, id: sourceId, notes: note })
    case 'donation':
      return rejectDonationRequestForActor({ actor, id: sourceId, notes: note })
    case 'shop':
      return rejectShopOrderForActor({ actor, id: sourceId, adminNote: note })
    case 'event_payout':
      return rejectEventPayoutRequestForActor({ actor, id: sourceId, notes: note })
    case 'craft':
      return rejectCraftOrderTaskForActor({ actor, id: sourceId, reason: note })
  }
}

async function recordInteraction(input: {
  payload: DiscordInteractionPayload
  action: AdminApprovalCustomId
  actor: AdminApprovalActor
  result: string
  error: string | null
}): Promise<void> {
  const { error } = await getAdminClient().from('admin_notification_interactions').upsert(
    {
      guild_id: input.actor.guildId,
      discord_interaction_id: input.payload.id,
      discord_channel_id: input.payload.channel_id ?? null,
      topic: KIND_TOPICS[input.action.kind],
      source_table: KIND_SOURCE_TABLES[input.action.kind],
      source_id: input.action.sourceId,
      action: input.action.action,
      actor_discord_id: input.actor.discordId,
      actor_username: input.actor.username,
      result: input.result,
      error: input.error,
    },
    { onConflict: 'discord_interaction_id' },
  )
  if (error) {
    log.error('[discord-admin-approvals] interaction record failed', error, {
      guild_id: input.actor.guildId,
      source_id: input.action.sourceId,
      action: input.action.action,
    })
  }
}

export async function syncDiscordAdminApprovalNotification(input: {
  kind: AdminApprovalKind
  sourceId: string
  actor: AdminApprovalActor
  resolution: AdminApprovalResolution
  fallbackChannelId?: string
}): Promise<void> {
  try {
    const locale = parseAdminNotificationLocale(
      await getAppSetting('admin_notification_locale', 'ko', input.actor.guildId),
    )
    const messages = await loadDiscordAdminApprovalMessages(locale)
    const status = resolutionStatus(input.resolution, messages)
    const db = getAdminClient()
    const topic = KIND_TOPICS[input.kind]
    const sourceTable = KIND_SOURCE_TABLES[input.kind]
    const { data, error } = await db
      .from('admin_notification_deliveries')
      .update({
        action_status: status,
        action_by_discord_id: input.actor.discordId,
        action_by_username: input.actor.username,
        action_at: new Date().toISOString(),
      })
      .eq('guild_id', input.actor.guildId)
      .eq('topic', topic)
      .eq('source_table', sourceTable)
      .eq('source_id', input.sourceId)
      .eq('delivery_kind', 'channel')
      .select('discord_channel_id, discord_message_id')
      .maybeSingle()
    if (error) {
      log.error('[discord-admin-approvals] delivery status update failed', error, {
        guild_id: input.actor.guildId,
        source_id: input.sourceId,
      })
      return
    }
    const channelId = (data?.discord_channel_id as string | null) ?? input.fallbackChannelId ?? null
    const messageId = (data?.discord_message_id as string | null) ?? null
    if (!channelId || !messageId) return
    await patchDiscordMessageComponents(channelId, messageId, {
      kind: input.kind,
      sourceId: input.sourceId,
      status,
      actorName: input.actor.username,
      messages,
    })
  } catch (error) {
    log.error('[discord-admin-approvals] notification sync failed', error, {
      guild_id: input.actor.guildId,
      source_id: input.sourceId,
      kind: input.kind,
      resolution: input.resolution,
    })
  }
}

async function patchDiscordMessageComponents(
  channelId: string,
  messageId: string,
  input: {
    kind: AdminApprovalKind
    sourceId: string
    status: string
    actorName: string
    messages: AdminApprovalMessages
  },
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) return
  const label = format(input.messages.handledButton, {
    status: input.status.replace(/\.$/, ''),
    actor: input.actorName,
  }).slice(0, 80)
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label,
              custom_id: buildAdminApprovalCustomId(input.kind, 'cancel', input.sourceId),
              disabled: true,
            },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    log.error('[discord-admin-approvals] message patch failed', new Error(text), {
      status: res.status,
      channel_id: channelId,
      message_id: messageId,
    })
  }
}

function successStatus(
  action: AdminApprovalCustomId,
  messages: AdminApprovalMessages,
): string {
  if (action.action === 'confirm_stock') return messages.stocked
  if (action.action === 'confirm_crafted') return messages.crafted
  return messages.approved
}

function resolutionForAction(action: AdminApprovalCustomId): AdminApprovalResolution {
  if (action.action === 'confirm_stock') return 'stocked'
  if (action.action === 'confirm_crafted') return 'crafted'
  return 'approved'
}

function resolutionStatus(
  resolution: AdminApprovalResolution,
  messages: AdminApprovalMessages,
): string {
  return messages[resolution]
}

function promptToConfirmAction(action: AdminApprovalAction): AdminApprovalAction {
  if (action === 'prompt_stock') return 'confirm_stock'
  if (action === 'prompt_crafted') return 'confirm_crafted'
  return 'confirm_approve'
}

function confirmMessage(action: AdminApprovalAction, messages: AdminApprovalMessages): string {
  if (action === 'prompt_stock') return messages.confirmStock
  if (action === 'prompt_crafted') return messages.confirmCrafted
  return messages.confirmApprove
}

function authErrorMessage(
  error: 'not_in_guild' | 'guild_not_linked' | 'not_authorized',
  messages: AdminApprovalMessages,
): string {
  if (error === 'not_in_guild') return messages.notInGuild
  if (error === 'guild_not_linked') return messages.guildNotLinked
  return messages.notAuthorized
}

function isAdminApprovalKind(value: string | undefined): value is AdminApprovalKind {
  return (
    value === 'regear' ||
    value === 'exchange' ||
    value === 'donation' ||
    value === 'shop' ||
    value === 'event_payout' ||
    value === 'craft'
  )
}

function isAdminApprovalAction(value: string | undefined): value is AdminApprovalAction {
  return (
    value === 'prompt_approve' ||
    value === 'prompt_stock' ||
    value === 'prompt_crafted' ||
    value === 'confirm_approve' ||
    value === 'confirm_stock' ||
    value === 'confirm_crafted' ||
    value === 'prompt_reject' ||
    value === 'reject_submit' ||
    value === 'cancel'
  )
}

function readModalInput(payload: DiscordInteractionPayload, customId: string): string {
  for (const row of payload.data?.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id === customId) return component.value?.trim() ?? ''
    }
  }
  return ''
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}
