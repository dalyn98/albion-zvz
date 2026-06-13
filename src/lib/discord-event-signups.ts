import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getAlbionEventAccessGateState } from '@/lib/albion-identity'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isLocale, type Locale } from '@/i18n/locales'
import { SLOT_KEYS, SLOT_ROLES, type GearOption, type SlotKey, type SlotRole, type SlotSpells } from '@/types'
import { eventSlotCode, parseEventSlotCode } from '@/lib/event-slot-codes'
import {
  buildSlotSignupGearSummary,
  buildSlotSignupSpellSummary,
  type SlotSignupPicks,
} from '@/lib/slot-signup-confirmation'
import { log } from '@/lib/log'
import {
  ephemeralReply,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  modalReply,
  type DiscordActionRowComponent,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
  type DiscordMessageComponent,
} from '@/lib/discord-interactions'

const CUSTOM_ID_PREFIX = 'agm_evt:v1'
const SLOT_CODE_INPUT_ID = 'slot_code'
const BROWSE_PAGE_SIZE = 10
const DEFAULT_LOCALE = 'en' satisfies Locale
const ALL_ROLES_VALUE = 'all'
const DISCORD_SELECT_OPTION_LIMIT = 25
const UNSELECTED_GEAR_INDEX = '-'
const DISCORD_UNSUPPORTED_GEAR_KINDS: readonly SlotKey[] = [
  'head',
  'shoes',
  'offhand',
  'potion',
  'food',
  'cape',
  'mount',
]
const BASE_SLOT_SELECT =
  'id, slot_number, role_name, weapon_name, mount_name, weapon_options, mount_options, assigned_discord_id, requested_discord_id, is_hidden, is_solo_bomb, parties!inner(event_id, party_number, name, is_bomb_squad)'
const SIGNUP_SLOT_SELECT =
  'id, slot_number, role_name, notes, spells, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, mount_name, mount_id, assigned_discord_id, requested_discord_id, is_hidden, is_solo_bomb, weapon_options, head_options, armor_options, shoes_options, offhand_options, potion_options, food_options, cape_options, mount_options, conditional_options, parties!inner(event_id, party_number, name, is_bomb_squad)'
const DISCORD_MESSAGE_UPDATE_ACTIONS: readonly InteractionActionKind[] = [
  'intent_roles',
  'browse_role',
  'browse_page',
  'gp',
  'ga',
  'slot',
  'confirm',
  'cancel',
]

type DiscordGearPickKind = 'weapon' | 'armor'
type InteractionActionKind =
  | 'intent'
  | 'intent_roles'
  | 'code'
  | 'code_submit'
  | 'browse'
  | 'browse_role'
  | 'browse_page'
  | 'gp'
  | 'ga'
  | 'slot'
  | 'confirm'
  | 'cancel'
  | 'status'

interface DiscordGearSelection {
  weaponIndex: number | null
  armorIndex: number | null
}

interface DiscordGearSelectionPlan {
  requiredKinds: DiscordGearPickKind[]
  optionsByKind: Record<DiscordGearPickKind, GearOption[]>
  armorOptionsByWeaponId?: Record<string, GearOption[]>
}

export interface DiscordEventSignupPanelLabels {
  intentButton: string
  codeButton: string
  browseButton: string
  statusButton: string
  openButton: string
}

export interface DiscordEventSignupMessages extends DiscordEventSignupPanelLabels {
  unsupported: string
  notInGuild: string
  guildNotLinked: string
  eventNotFound: string
  eventNotPublished: string
  battleStarted: string
  notEligible: string
  albionVerificationRequired: string
  intentSelectPlaceholder: string
  intentSaved: string
  browseSelectPlaceholder: string
  browseTitle: string
  browseEmpty: string
  browseAllButton: string
  previousButton: string
  nextButton: string
  gearSelectTitle: string
  gearWeaponPlaceholder: string
  gearArmorPlaceholder: string
  gearApplyButton: string
  confirmTitle: string
  confirmRoleLabel: string
  confirmMemoLabel: string
  confirmMemoEmpty: string
  confirmGearLabel: string
  confirmGearEmpty: string
  confirmSpellLabel: string
  confirmSpellEmpty: string
  confirmHint: string
  confirmApplyButton: string
  confirmCancelButton: string
  confirmCancelled: string
  codeModalTitle: string
  codeModalLabel: string
  codeModalPlaceholder: string
  codeInvalid: string
  codeRequiresWeb: string
  slotApplied: string
  slotPending: string
  slotTaken: string
  alreadyInEvent: string
  statusAssigned: string
  statusPending: string
  statusTentative: string
  statusNone: string
  gearLabels: Record<SlotKey, string>
}

interface TenantContext {
  id: string
  slug: string
  name: string
  createdByDiscordId: string | null
  memberRoleIds: string[]
  adminRoleIds: string[]
}

interface InteractionContext {
  tenant: TenantContext
  discordId: string
  username: string
  memberRoleIds: string[]
  messages: DiscordEventSignupMessages
}

interface EventRow {
  id: string
  title: string
  status: string
  battle_started_at: string | null
}

interface SlotRow {
  id: string
  slot_number: number
  role_name: string | null
  notes?: string | null
  spells?: SlotSpells | null
  weapon_name: string | null
  weapon_id?: string | null
  head_name?: string | null
  head_id?: string | null
  armor_name?: string | null
  armor_id?: string | null
  shoes_name?: string | null
  shoes_id?: string | null
  offhand_name?: string | null
  offhand_id?: string | null
  potion_name?: string | null
  potion_id?: string | null
  food_name?: string | null
  food_id?: string | null
  cape_name?: string | null
  cape_id?: string | null
  mount_name?: string | null
  mount_id?: string | null
  weapon_options?: GearOption[] | null
  head_options?: GearOption[] | null
  armor_options?: GearOption[] | null
  shoes_options?: GearOption[] | null
  offhand_options?: GearOption[] | null
  potion_options?: GearOption[] | null
  food_options?: GearOption[] | null
  cape_options?: GearOption[] | null
  mount_options?: GearOption[] | null
  conditional_options?: Record<string, unknown> | null
  assigned_discord_id: string | null
  requested_discord_id: string | null
  is_hidden: boolean | null
  is_solo_bomb: boolean | null
  parties:
    | {
        party_number: number
        name: string | null
        is_bomb_squad: boolean | null
      }
    | {
        party_number: number
        name: string | null
        is_bomb_squad: boolean | null
      }[]
    | null
}

interface InteractionAction {
  kind: InteractionActionKind
  eventId: string
  roleKey?: string
  page?: number
  gearKind?: DiscordGearPickKind
  gearSelection?: DiscordGearSelection
  code?: string
  slotId?: string
}

export interface DiscordEventSlotButtonRowSlot {
  id: string
  slot_number: number
  parties:
    | {
        party_number: number
        name: string | null
        is_bomb_squad: boolean | null
      }
    | {
        party_number: number
        name: string | null
        is_bomb_squad: boolean | null
      }[]
    | null
}

export interface DiscordEventEmptySlotLineSlot extends DiscordEventSlotButtonRowSlot {
  role_name: string | null
  weapon_name: string | null
  mount_name?: string | null
  weapon_options?: GearOption[] | null
  mount_options?: GearOption[] | null
}

export async function loadDiscordEventSignupMessages(
  locale: Locale = DEFAULT_LOCALE,
): Promise<DiscordEventSignupMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordEventSignup ?? {}) as Record<string, string>
  const gearNs = (dict.gear ?? {}) as Record<string, string>
  return {
    unsupported: ns.unsupported ?? 'This event action is not supported.',
    notInGuild: ns.notInGuild ?? 'Use this inside a Discord server.',
    guildNotLinked: ns.guildNotLinked ?? 'This guild is not linked to AlbionGuildManager.',
    eventNotFound: ns.eventNotFound ?? 'Event not found.',
    eventNotPublished: ns.eventNotPublished ?? 'This event is not published yet.',
    battleStarted: ns.battleStarted ?? 'This event has already started.',
    notEligible: ns.notEligible ?? 'You are not eligible to apply to this event.',
    albionVerificationRequired: ns.albionVerificationRequired ?? 'Albion verification is required. Open the event page: {url}',
    intentButton: ns.intentButton ?? 'Intent',
    codeButton: ns.codeButton ?? 'Code',
    browseButton: ns.browseButton ?? 'Browse',
    statusButton: ns.statusButton ?? 'My status',
    openButton: ns.openButton ?? 'Open',
    intentSelectPlaceholder: ns.intentSelectPlaceholder ?? 'Choose possible roles',
    intentSaved: ns.intentSaved ?? 'Intent saved for **{title}**: {roles}',
    browseSelectPlaceholder: ns.browseSelectPlaceholder ?? 'Filter empty slots by role',
    browseTitle: ns.browseTitle ?? '**{title}** empty slots · {role} · page {page}/{pages}',
    browseEmpty: ns.browseEmpty ?? 'No empty slots for this filter. Open the event page for the full roster.',
    browseAllButton: ns.browseAllButton ?? 'All',
    previousButton: ns.previousButton ?? 'Previous',
    nextButton: ns.nextButton ?? 'Next',
    gearSelectTitle: ns.gearSelectTitle ?? '**{title}** `{code}` needs gear choices.',
    gearWeaponPlaceholder: ns.gearWeaponPlaceholder ?? 'Choose weapon',
    gearArmorPlaceholder: ns.gearArmorPlaceholder ?? 'Choose armor',
    gearApplyButton: ns.gearApplyButton ?? 'Apply',
    confirmTitle: ns.confirmTitle ?? '**{title}** `{code}` signup confirmation',
    confirmRoleLabel: ns.confirmRoleLabel ?? 'Role',
    confirmMemoLabel: ns.confirmMemoLabel ?? 'Notes',
    confirmMemoEmpty: ns.confirmMemoEmpty ?? 'No notes',
    confirmGearLabel: ns.confirmGearLabel ?? 'Gear',
    confirmGearEmpty: ns.confirmGearEmpty ?? 'No fixed gear',
    confirmSpellLabel: ns.confirmSpellLabel ?? 'Spells',
    confirmSpellEmpty: ns.confirmSpellEmpty ?? 'No spell settings',
    confirmHint: ns.confirmHint ?? 'Press confirm to submit this slot signup.',
    confirmApplyButton: ns.confirmApplyButton ?? 'Confirm signup',
    confirmCancelButton: ns.confirmCancelButton ?? 'Cancel',
    confirmCancelled: ns.confirmCancelled ?? 'Signup cancelled.',
    codeModalTitle: ns.codeModalTitle ?? 'Apply by slot code',
    codeModalLabel: ns.codeModalLabel ?? 'Slot code',
    codeModalPlaceholder: ns.codeModalPlaceholder ?? 'A01',
    codeInvalid: ns.codeInvalid ?? 'Enter a valid slot code such as A01.',
    codeRequiresWeb: ns.codeRequiresWeb ?? 'This slot requires gear choices. Open the event page: {url}',
    slotApplied: ns.slotApplied ?? 'Applied to **{code}** for **{title}**.',
    slotPending: ns.slotPending ?? 'Request submitted for **{code}**. A caller or manager must approve it.',
    slotTaken: ns.slotTaken ?? 'That slot is no longer available.',
    alreadyInEvent: ns.alreadyInEvent ?? 'You already have a slot or pending request in this event.',
    statusAssigned: ns.statusAssigned ?? 'You are assigned to **{code}** · {role}.',
    statusPending: ns.statusPending ?? 'Your request for **{code}** · {role} is pending.',
    statusTentative: ns.statusTentative ?? 'You marked intent for: {roles}.',
    statusNone: ns.statusNone ?? 'No signup found yet. Use intent, code, or browse below.',
    gearLabels: SLOT_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: gearNs[key] ?? key }),
      {} as Record<SlotKey, string>,
    ),
  }
}

export function buildDiscordEventSignupComponents(input: {
  eventId: string
  eventUrl: string
  labels: DiscordEventSignupPanelLabels
}): DiscordMessageComponent[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: input.labels.intentButton,
          custom_id: customId('intent', input.eventId),
        },
        {
          type: 2,
          style: 2,
          label: input.labels.codeButton,
          custom_id: customId('code', input.eventId),
        },
        {
          type: 2,
          style: 2,
          label: input.labels.browseButton,
          custom_id: customId('browse', input.eventId),
        },
        {
          type: 2,
          style: 2,
          label: input.labels.statusButton,
          custom_id: customId('status', input.eventId),
        },
        {
          type: 2,
          style: 5,
          label: input.labels.openButton,
          url: input.eventUrl,
        },
      ],
    },
  ]
}

export async function handleDiscordEventInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const messages = await resolveMessages(payload)
  const action = parseCustomId(payload.data?.custom_id)
  if (!action) return ephemeralReply(messages.unsupported)

  if (action.kind === 'code') {
    return modalReply({
      customId: customId('code_submit', action.eventId),
      title: messages.codeModalTitle,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: SLOT_CODE_INPUT_ID,
              style: 1,
              label: messages.codeModalLabel,
              placeholder: messages.codeModalPlaceholder,
              min_length: 2,
              max_length: 12,
              required: true,
            },
          ],
        },
      ],
    })
  }

  const context = await resolveContext(payload, messages)
  if ('error' in context) return ephemeralReply(context.error)

  switch (action.kind) {
    case 'intent':
      return showIntentRoleSelect(action.eventId, context)
    case 'intent_roles':
      return submitIntentRoles(action.eventId, payload.data?.values ?? [], context)
    case 'code_submit':
      return applyByCode(action.eventId, readModalInput(payload, SLOT_CODE_INPUT_ID), context)
    case 'browse':
      return showBrowsePage(action.eventId, [], 0, context)
    case 'browse_role':
      return showBrowsePage(action.eventId, normalizeBrowseRoleFilterValues(payload.data?.values ?? []), 0, context)
    case 'browse_page':
      return showBrowsePage(
        action.eventId,
        decodeBrowseRoleFilterKey(action.roleKey ?? ALL_ROLES_VALUE),
        action.page ?? 0,
        context,
      )
    case 'gp':
      return action.slotId && action.gearKind && action.gearSelection
        ? updateGearSelection(
            action.eventId,
            action.slotId,
            action.gearKind,
            action.gearSelection,
            payload.data?.values ?? [],
            context,
          )
        : ephemeralReply(context.messages.unsupported)
    case 'ga':
      return action.slotId && action.gearSelection
        ? applyBySlotIdWithGearSelection(action.eventId, action.slotId, action.gearSelection, context)
        : ephemeralReply(context.messages.unsupported)
    case 'confirm':
      return action.slotId && action.gearSelection
        ? applyConfirmedSlotSignup(action.eventId, action.slotId, action.gearSelection, context)
        : ephemeralReply(context.messages.unsupported, { components: [] })
    case 'cancel':
      return ephemeralReply(context.messages.confirmCancelled, { components: [] })
    case 'slot':
      return action.slotId
        ? applyBySlotId(action.eventId, action.slotId, context)
        : applyByCode(action.eventId, action.code ?? '', context)
    case 'status':
      return showMyStatus(action.eventId, context)
  }
}

export function shouldDeferDiscordEventInteraction(payload: DiscordInteractionPayload): boolean {
  const action = parseCustomId(payload.data?.custom_id)
  return !!action && action.kind !== 'code' && !!payload.application_id && !!payload.token
}

export function shouldUpdateDiscordEventInteractionMessage(payload: DiscordInteractionPayload): boolean {
  const action = parseCustomId(payload.data?.custom_id)
  return (
    payload.type === INTERACTION_TYPE_MESSAGE_COMPONENT &&
    !!action &&
    DISCORD_MESSAGE_UPDATE_ACTIONS.includes(action.kind)
  )
}

function customId(kind: InteractionAction['kind'], eventId: string, extra: string[] = []): string {
  return [CUSTOM_ID_PREFIX, kind, eventId, ...extra].join(':')
}

function parseCustomId(raw: string | undefined): InteractionAction | null {
  if (!raw?.startsWith(`${CUSTOM_ID_PREFIX}:`)) return null
  const [, , kind, eventId, ...rest] = raw.split(':')
  if (!eventId || !isUuid(eventId)) return null

  switch (kind) {
    case 'intent':
    case 'intent_roles':
    case 'code':
    case 'code_submit':
    case 'browse':
    case 'browse_role':
    case 'status':
      return { kind, eventId }
    case 'gp': {
      const slotId = rest[0] ?? ''
      const gearKind = decodeDiscordGearPickKind(rest[1] ?? '')
      if (!isUuid(slotId) || !gearKind) return null
      return {
        kind,
        eventId,
        slotId,
        gearKind,
        gearSelection: {
          weaponIndex: decodeGearIndex(rest[2] ?? UNSELECTED_GEAR_INDEX),
          armorIndex: decodeGearIndex(rest[3] ?? UNSELECTED_GEAR_INDEX),
        },
      }
    }
    case 'ga': {
      const slotId = rest[0] ?? ''
      if (!isUuid(slotId)) return null
      return {
        kind,
        eventId,
        slotId,
        gearSelection: {
          weaponIndex: decodeGearIndex(rest[1] ?? UNSELECTED_GEAR_INDEX),
          armorIndex: decodeGearIndex(rest[2] ?? UNSELECTED_GEAR_INDEX),
        },
      }
    }
    case 'confirm': {
      const slotId = rest[0] ?? ''
      if (!isUuid(slotId)) return null
      return {
        kind,
        eventId,
        slotId,
        gearSelection: {
          weaponIndex: decodeGearIndex(rest[1] ?? UNSELECTED_GEAR_INDEX),
          armorIndex: decodeGearIndex(rest[2] ?? UNSELECTED_GEAR_INDEX),
        },
      }
    }
    case 'cancel':
      return { kind, eventId }
    case 'browse_page':
      return {
        kind,
        eventId,
        roleKey: safeDecodeURIComponent(rest[0] ?? ALL_ROLES_VALUE),
        page: Math.max(0, Number.parseInt(rest[1] ?? '0', 10) || 0),
      }
    case 'slot':
      return isUuid(rest[0] ?? '')
        ? { kind, eventId, slotId: rest[0] }
        : { kind, eventId, code: rest[0] ?? '' }
    default:
      return null
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function resolveMessages(payload: DiscordInteractionPayload): Promise<DiscordEventSignupMessages> {
  const locale = normalizeDiscordLocale(payload.locale)
  return loadDiscordEventSignupMessages(locale)
}

function normalizeDiscordLocale(raw: string | undefined | null): Locale {
  if (isLocale(raw)) return raw
  const primary = raw?.split('-')[0]
  return isLocale(primary) ? primary : DEFAULT_LOCALE
}

async function resolveContext(
  payload: DiscordInteractionPayload,
  messages: DiscordEventSignupMessages,
): Promise<InteractionContext | { error: string }> {
  if (!payload.guild_id) return { error: messages.notInGuild }
  const discordId = payload.member?.user?.id ?? payload.user?.id ?? null
  if (!discordId) return { error: messages.notEligible }

  const tenant = await findActiveTenantByDiscordGuild(payload.guild_id)
  if (!tenant) return { error: messages.guildNotLinked }

  return {
    tenant,
    discordId,
    username: getInvokerDisplayName(payload) ?? `<@${discordId}>`,
    memberRoleIds: payload.member?.roles ?? [],
    messages,
  }
}

async function findActiveTenantByDiscordGuild(discordGuildId: string): Promise<TenantContext | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, name, created_by_discord_id, member_role_ids, admin_role_ids')
    .eq('discord_guild_id', discordGuildId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    log.error('[discord-event-signups] tenant lookup failed', error, { discord_guild_id: discordGuildId })
    return null
  }
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    createdByDiscordId: (data.created_by_discord_id as string | null) ?? null,
    memberRoleIds: (data.member_role_ids as string[] | null) ?? [],
    adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
  }
}

function getInvokerDisplayName(payload: DiscordInteractionPayload): string | null {
  return (
    payload.member?.nick?.trim() ||
    payload.member?.user?.global_name?.trim() ||
    payload.member?.user?.username?.trim() ||
    payload.user?.global_name?.trim() ||
    payload.user?.username?.trim() ||
    null
  )
}

async function isSiteAdmin(context: InteractionContext): Promise<boolean> {
  if (context.tenant.createdByDiscordId === context.discordId) return true
  if (context.tenant.adminRoleIds.some((roleId) => context.memberRoleIds.includes(roleId))) return true

  const db = getAdminClient()
  const { data } = await db
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', context.tenant.id)
    .eq('discord_id', context.discordId)
    .maybeSingle()
  return !!data
}

async function isActiveMember(context: InteractionContext): Promise<boolean> {
  const roleIds = await loadActiveMemberRoleIds(context.tenant.id, context.tenant.memberRoleIds)
  return roleIds.some((roleId) => context.memberRoleIds.includes(roleId))
}

async function loadActiveMemberRoleIds(guildId: string, fallback: string[]): Promise<string[]> {
  const raw = await getAppSetting('active_member_role_ids', '[]', guildId)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const ids = parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
      if (ids.length > 0) return ids
    }
  } catch {
    // Fall through to tenant seed role IDs.
  }
  return fallback
}

async function ensureEventAccess(
  eventId: string,
  context: InteractionContext,
  options: { requireNotStarted: boolean },
): Promise<
  | {
      ok: true
      event: EventRow
      eventUrl: string
      isAdmin: boolean
      isMember: boolean
      allianceAllowed: boolean
    }
  | { ok: false; error: string }
> {
  const event = await loadEvent(eventId, context.tenant.id)
  if (!event) return { ok: false, error: context.messages.eventNotFound }
  if (event.status !== 'published') return { ok: false, error: context.messages.eventNotPublished }
  if (options.requireNotStarted && event.battle_started_at) {
    return { ok: false, error: context.messages.battleStarted }
  }

  const [isAdminResult, isMemberResult] = await Promise.all([
    isSiteAdmin(context),
    isActiveMember(context),
  ])
  const isAdmin = isAdminResult
  const isMember = isAdmin || isMemberResult
  const gate = await getAlbionEventAccessGateState({
    discordId: context.discordId,
    guildId: context.tenant.id,
    isMember,
    isAdmin,
  })
  const eventUrl = tenantUrl(context.tenant.slug, `/events/${eventId}`)
  if (gate.memberOnboardingRequired || gate.memberEventVerificationRequired) {
    return {
      ok: false,
      error: format(context.messages.albionVerificationRequired, { url: eventUrl }),
    }
  }
  const allianceAllowed = !isMember && !isAdmin && gate.allianceEventAllowed
  if (!isMember && !isAdmin && !allianceAllowed) {
    return { ok: false, error: context.messages.notEligible }
  }

  return { ok: true, event, eventUrl, isAdmin, isMember, allianceAllowed }
}

async function loadEvent(eventId: string, guildId: string): Promise<EventRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select('id, title, status, battle_started_at')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) {
    log.error('[discord-event-signups] event lookup failed', error, { guild_id: guildId, event_id: eventId })
    return null
  }
  return data as EventRow | null
}

function showIntentRoleSelect(
  eventId: string,
  context: InteractionContext,
): DiscordInteractionResponse {
  return ephemeralReply(context.messages.intentSelectPlaceholder, {
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: customId('intent_roles', eventId),
            placeholder: context.messages.intentSelectPlaceholder,
            min_values: 1,
            max_values: SLOT_ROLES.length,
            options: SLOT_ROLES.map((role) => ({ label: role, value: role })),
          },
        ],
      },
    ],
  })
}

async function submitIntentRoles(
  eventId: string,
  values: string[],
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: true })
  if (!access.ok) return ephemeralReply(access.error)

  const roles = values.filter((value): value is SlotRole =>
    (SLOT_ROLES as readonly string[]).includes(value),
  )
  if (roles.length === 0) return showIntentRoleSelect(eventId, context)

  const db = getAdminClient()
  const { error } = await db
    .from('event_tentative_signups')
    .upsert(
      {
        guild_id: context.tenant.id,
        event_id: eventId,
        discord_id: context.discordId,
        username: context.username,
        possible_roles: roles,
        notes: null,
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
  if (error) {
    log.error('[discord-event-signups] tentative upsert failed', error, {
      guild_id: context.tenant.id,
      event_id: eventId,
      discord_id: context.discordId,
    })
    return ephemeralReply(context.messages.unsupported)
  }

  return ephemeralReply(
    format(context.messages.intentSaved, {
      title: access.event.title,
      roles: roles.join(', '),
    }),
  )
}

async function showBrowsePage(
  eventId: string,
  roleFilter: readonly SlotRole[],
  page: number,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: false })
  if (!access.ok) return ephemeralReply(access.error)

  const normalizedRoles = normalizeBrowseRoleFilterValues(roleFilter)
  const slots = await listEmptySlots(eventId, context.tenant.id, normalizedRoles)
  const totalPages = Math.max(1, Math.ceil(slots.length / BROWSE_PAGE_SIZE))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const visible = slots.slice(safePage * BROWSE_PAGE_SIZE, (safePage + 1) * BROWSE_PAGE_SIZE)
  const roleLabel = browseRoleFilterLabel(normalizedRoles, context.messages)

  if (visible.length === 0) {
    return ephemeralReply(context.messages.browseEmpty, {
      components: [
        ...buildDiscordEventBrowseFilterComponents({
          eventId,
          roleFilter: normalizedRoles,
          messages: context.messages,
        }),
        buildOpenButtonRow(access.eventUrl, context.messages),
      ],
    })
  }

  const lines = visible.map((slot) => formatDiscordEventEmptySlotLine(slot))

  return ephemeralReply(
    [
      format(context.messages.browseTitle, {
        title: access.event.title,
        role: roleLabel,
        page: String(safePage + 1),
        pages: String(totalPages),
      }),
      ...lines,
    ].join('\n'),
    {
      components: [
        ...buildDiscordEventBrowseFilterComponents({
          eventId,
          roleFilter: normalizedRoles,
          messages: context.messages,
        }),
        ...buildDiscordEventSlotButtonRows(eventId, visible),
        buildDiscordEventBrowseNavRow(eventId, normalizedRoles, safePage, totalPages, context.messages, access.eventUrl),
      ],
    },
  )
}

export function buildDiscordEventBrowseFilterComponents(
  input: {
    eventId: string
    roleFilter: readonly SlotRole[]
    messages: Pick<DiscordEventSignupMessages, 'browseSelectPlaceholder' | 'browseAllButton'>
  },
): DiscordMessageComponent[] {
  const normalizedRoles = normalizeBrowseRoleFilterValues(input.roleFilter)
  const rows: DiscordMessageComponent[] = [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: customId('browse_role', input.eventId),
          placeholder: input.messages.browseSelectPlaceholder,
          min_values: 1,
          max_values: SLOT_ROLES.length,
          options: SLOT_ROLES.map((slotRole) => ({
            label: slotRole,
            value: slotRole,
            default: normalizedRoles.includes(slotRole),
          })),
        },
      ],
    },
  ]
  if (normalizedRoles.length > 0) {
    rows.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: input.messages.browseAllButton,
          custom_id: customId('browse_page', input.eventId, [
            ALL_ROLES_VALUE,
            '0',
            'all',
          ]),
        },
      ],
    })
  }
  return rows
}

export function buildDiscordEventSlotButtonRows(
  eventId: string,
  slots: DiscordEventSlotButtonRowSlot[],
): DiscordMessageComponent[] {
  const buttons = slots.map((slot) => {
    const party = normalizeParty(slot.parties)
    const code = eventSlotCode({ partyNumber: party?.party_number ?? 0, slotNumber: slot.slot_number })
    return {
      type: 2 as const,
      style: 2 as const,
      label: code,
      custom_id: customId('slot', eventId, [slot.id]),
    }
  })

  const rows: DiscordActionRowComponent[] = []
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: 1, components: buttons.slice(i, i + 5) })
  }
  return rows
}

export function formatDiscordEventEmptySlotLine(slot: DiscordEventEmptySlotLineSlot): string {
  const party = normalizeParty(slot.parties)
  const code = eventSlotCode({ partyNumber: party?.party_number ?? 0, slotNumber: slot.slot_number })
  const role = slot.role_name || '-'
  const primaryGear = primaryGearSummary(slot)
  const gear = primaryGear ? ` · ${primaryGear}` : ''
  return `\`${code}\` · ${partyName(party)} · ${role}${gear}`
}

function primaryGearSummary(slot: DiscordEventEmptySlotLineSlot): string | null {
  if (slot.role_name === 'BM') {
    return gearChoiceSummary(slot.mount_name ?? null, slot.mount_options ?? null)
  }
  return gearChoiceSummary(slot.weapon_name, slot.weapon_options ?? null)
}

function gearChoiceSummary(fixedName: string | null, rawOptions: unknown): string | null {
  const options = readGearOptions(rawOptions)
  if (options && options.length > 0) {
    const first = options[0]?.name.trim()
    if (!first) return null
    return options.length > 1 ? `${first} +${options.length - 1}` : first
  }
  return fixedName?.trim() || null
}

export function buildDiscordEventBrowseNavRow(
  eventId: string,
  roleFilter: readonly SlotRole[],
  page: number,
  totalPages: number,
  messages: Pick<DiscordEventSignupMessages, 'previousButton' | 'nextButton' | 'openButton'>,
  eventUrl: string,
): DiscordMessageComponent {
  const encodedRole = encodeURIComponent(encodeBrowseRoleFilterKey(roleFilter))
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: messages.previousButton,
        custom_id: customId('browse_page', eventId, [
          encodedRole,
          String(Math.max(0, page - 1)),
          'prev',
        ]),
        disabled: page <= 0,
      },
      {
        type: 2,
        style: 2,
        label: messages.nextButton,
        custom_id: customId('browse_page', eventId, [
          encodedRole,
          String(Math.min(totalPages - 1, page + 1)),
          'next',
        ]),
        disabled: page >= totalPages - 1,
      },
      {
        type: 2,
        style: 5,
        label: messages.openButton,
        url: eventUrl,
      },
    ],
  }
}

function buildOpenButtonRow(
  eventUrl: string,
  messages: DiscordEventSignupMessages,
): DiscordMessageComponent {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: messages.openButton,
        url: eventUrl,
      },
    ],
  }
}

export function buildDiscordEventGearSelectionComponents(input: {
  eventId: string
  slotId: string
  eventUrl: string
  weaponOptions: readonly GearOption[]
  armorOptions: readonly GearOption[]
  armorOptionsByWeaponId?: Record<string, readonly GearOption[]>
  selectedWeaponIndex: number | null
  selectedArmorIndex: number | null
  messages: Pick<
    DiscordEventSignupMessages,
    'gearWeaponPlaceholder' | 'gearArmorPlaceholder' | 'gearApplyButton' | 'openButton'
  >
}): DiscordMessageComponent[] {
  const plan: DiscordGearSelectionPlan = {
    requiredKinds: [
      ...(input.weaponOptions.length > 0 ? (['weapon'] as const) : []),
      ...(input.armorOptions.length > 0 ? (['armor'] as const) : []),
    ],
    optionsByKind: {
      weapon: [...input.weaponOptions],
      armor: [...input.armorOptions],
    },
    ...(input.armorOptionsByWeaponId
      ? { armorOptionsByWeaponId: cloneArmorOptionsByWeaponId(input.armorOptionsByWeaponId) }
      : {}),
  }
  const selection = normalizeGearSelectionForPlan(plan, {
    weaponIndex: input.selectedWeaponIndex,
    armorIndex: input.selectedArmorIndex,
  })

  return [
    ...plan.requiredKinds.map((kind): DiscordMessageComponent => {
      const waitsForWeapon = shouldWaitForWeaponBeforeArmor(plan, selection, kind)
      const options = waitsForWeapon ? [] : gearOptionsForSelection(plan, selection, kind)
      return {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: customId('gp', input.eventId, [
              input.slotId,
              encodeDiscordGearPickKind(kind),
              encodeGearIndex(selection.weaponIndex),
              encodeGearIndex(selection.armorIndex),
            ]),
            placeholder: kind === 'weapon'
              ? input.messages.gearWeaponPlaceholder
              : input.messages.gearArmorPlaceholder,
            min_values: 1,
            max_values: 1,
            disabled: waitsForWeapon,
            options: waitsForWeapon
              ? [{ label: input.messages.gearArmorPlaceholder, value: UNSELECTED_GEAR_INDEX }]
              : options.map((option, index) => ({
                  label: discordOptionLabel(option.name),
                  value: encodeGearIndex(index),
                  default: selectedGearIndex(selection, kind) === index,
                })),
          },
        ],
      }
    }),
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: input.messages.gearApplyButton,
          custom_id: customId('ga', input.eventId, [
            input.slotId,
            encodeGearIndex(selection.weaponIndex),
            encodeGearIndex(selection.armorIndex),
          ]),
          disabled: !isGearSelectionComplete(plan, selection),
        },
        {
          type: 2,
          style: 5,
          label: input.messages.openButton,
          url: input.eventUrl,
        },
      ],
    },
  ]
}

export function buildDiscordEventSignupConfirmationComponents(input: {
  eventId: string
  slotId: string
  eventUrl: string
  selection: DiscordGearSelection
  messages: Pick<DiscordEventSignupMessages, 'confirmApplyButton' | 'confirmCancelButton' | 'openButton'>
}): DiscordMessageComponent[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: input.messages.confirmApplyButton,
          custom_id: customId('confirm', input.eventId, [
            input.slotId,
            encodeGearIndex(input.selection.weaponIndex),
            encodeGearIndex(input.selection.armorIndex),
          ]),
        },
        {
          type: 2,
          style: 2,
          label: input.messages.confirmCancelButton,
          custom_id: customId('cancel', input.eventId, [input.slotId]),
        },
        {
          type: 2,
          style: 5,
          label: input.messages.openButton,
          url: input.eventUrl,
        },
      ],
    },
  ]
}

export function formatDiscordEventSignupConfirmationContent(input: {
  title: string
  code: string
  slot: SlotRow
  picks: SlotSignupPicks
  messages: Pick<
    DiscordEventSignupMessages,
    | 'confirmTitle'
    | 'confirmRoleLabel'
    | 'confirmMemoLabel'
    | 'confirmMemoEmpty'
    | 'confirmGearLabel'
    | 'confirmGearEmpty'
    | 'confirmSpellLabel'
    | 'confirmSpellEmpty'
    | 'confirmHint'
    | 'gearLabels'
  >
}): string {
  const memo = input.slot.notes?.trim() || input.messages.confirmMemoEmpty
  const gearRows = buildSlotSignupGearSummary(input.slot, input.picks)
  const gearLines = gearRows.length > 0
    ? gearRows.map((row) => `- ${input.messages.gearLabels[row.kind]}: ${row.name}`)
    : [`- ${input.messages.confirmGearEmpty}`]
  const spellRows = buildSlotSignupSpellSummary(input.slot, input.picks)
  const spellLines = spellRows.length > 0
    ? spellRows.map((row) => {
        const gearName = row.gearName ? ` (${row.gearName})` : ''
        return `- ${input.messages.gearLabels[row.kind]}${gearName}: ${formatDiscordSpellIds(row.spellIds)}`
      })
    : [`- ${input.messages.confirmSpellEmpty}`]

  return [
    format(input.messages.confirmTitle, {
      title: input.title,
      code: input.code,
    }),
    `${input.messages.confirmRoleLabel}: ${input.slot.role_name ?? '-'}`,
    `**${input.messages.confirmMemoLabel}:**`,
    ...formatDiscordMemoLines(memo),
    `${input.messages.confirmGearLabel}:`,
    ...gearLines,
    `${input.messages.confirmSpellLabel}:`,
    ...spellLines,
    '',
    input.messages.confirmHint,
  ].join('\n')
}

function formatDiscordMemoLines(memo: string): string[] {
  return memo.split(/\r?\n/).map((line) => `> ${line.trimEnd() || ' '}`)
}

function formatDiscordSpellIds(spellIds: readonly string[]): string {
  const visible = spellIds.slice(0, 6)
  const suffix = spellIds.length > visible.length ? ` +${spellIds.length - visible.length}` : ''
  return `${visible.join(', ')}${suffix}`
}

function showDiscordGearSelection(
  eventId: string,
  slot: SlotRow,
  canonicalCode: string,
  access: { event: EventRow; eventUrl: string },
  context: InteractionContext,
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
): DiscordInteractionResponse {
  const normalizedSelection = normalizeGearSelectionForPlan(plan, selection)
  return ephemeralReply(
    format(context.messages.gearSelectTitle, {
      title: access.event.title,
      code: canonicalCode,
    }),
    {
      components: buildDiscordEventGearSelectionComponents({
        eventId,
        slotId: slot.id,
        eventUrl: access.eventUrl,
        weaponOptions: plan.optionsByKind.weapon,
        armorOptions: plan.optionsByKind.armor,
        armorOptionsByWeaponId: plan.armorOptionsByWeaponId,
        selectedWeaponIndex: normalizedSelection.weaponIndex,
        selectedArmorIndex: normalizedSelection.armorIndex,
        messages: context.messages,
      }),
    },
  )
}

function showDiscordSignupConfirmation(
  eventId: string,
  slot: SlotRow,
  canonicalCode: string,
  access: { event: EventRow; eventUrl: string },
  context: InteractionContext,
  selection: DiscordGearSelection,
  picks: SlotSignupPicks,
): DiscordInteractionResponse {
  return ephemeralReply(
    formatDiscordEventSignupConfirmationContent({
      title: access.event.title,
      code: canonicalCode,
      slot,
      picks,
      messages: context.messages,
    }),
    {
      components: buildDiscordEventSignupConfirmationComponents({
        eventId,
        slotId: slot.id,
        eventUrl: access.eventUrl,
        selection,
        messages: context.messages,
      }),
    },
  )
}

export function resolveDiscordGearSelectionPlan(
  slot: SlotRow,
): { kind: 'none' } | { kind: 'select'; plan: DiscordGearSelectionPlan } | { kind: 'web' } {
  if (slot.is_solo_bomb) {
    return { kind: 'web' }
  }

  for (const kind of DISCORD_UNSUPPORTED_GEAR_KINDS) {
    const options = readGearOptions(slot[`${kind}_options`])
    if (options === null || options.length > 0) return { kind: 'web' }
  }

  const weaponOptions = readGearOptions(slot.weapon_options ?? null)
  const armorOptions = readGearOptions(slot.armor_options ?? null)
  if (weaponOptions === null || armorOptions === null) return { kind: 'web' }

  const armorOptionsByWeaponId = readDiscordArmorOptionsByWeapon(
    slot.conditional_options ?? null,
    weaponOptions,
    armorOptions,
  )
  if (armorOptionsByWeaponId === null) return { kind: 'web' }

  if (weaponOptions.length > DISCORD_SELECT_OPTION_LIMIT) {
    return { kind: 'web' }
  }
  const armorOptionSets = armorOptionsByWeaponId
    ? weaponOptions.map((weapon) => armorOptionsByWeaponId[weapon.id] ?? armorOptions)
    : [armorOptions]
  if (armorOptionSets.some((options) => options.length > DISCORD_SELECT_OPTION_LIMIT)) {
    return { kind: 'web' }
  }

  const requiredKinds: DiscordGearPickKind[] = []
  if (weaponOptions.length > 0) requiredKinds.push('weapon')
  if (armorOptions.length > 0) requiredKinds.push('armor')
  if (requiredKinds.length === 0) return { kind: 'none' }

  return {
    kind: 'select',
    plan: {
      requiredKinds,
      optionsByKind: {
        weapon: weaponOptions,
        armor: armorOptions,
      },
      ...(armorOptionsByWeaponId ? { armorOptionsByWeaponId } : {}),
    },
  }
}

function readGearOptions(raw: unknown): GearOption[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw)) return null

  const options: GearOption[] = []
  for (const option of raw) {
    if (
      !option ||
      typeof option !== 'object' ||
      typeof (option as GearOption).id !== 'string' ||
      typeof (option as GearOption).name !== 'string' ||
      (option as GearOption).id.length === 0 ||
      (option as GearOption).name.length === 0
    ) {
      return null
    }
    options.push({
      id: (option as GearOption).id,
      name: (option as GearOption).name,
    })
  }
  return options
}

function readDiscordArmorOptionsByWeapon(
  raw: Record<string, unknown> | null,
  weaponOptions: readonly GearOption[],
  armorOptions: readonly GearOption[],
): Record<string, GearOption[]> | null | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length === 0) {
    return undefined
  }
  if (Object.keys(raw).some((key) => key !== 'armor')) {
    return null
  }
  if (!raw.armor || typeof raw.armor !== 'object' || Array.isArray(raw.armor)) {
    return undefined
  }
  if (weaponOptions.length === 0 || armorOptions.length === 0) return null

  const weaponIds = new Set(weaponOptions.map((option) => option.id))
  const armorIds = new Set(armorOptions.map((option) => option.id))
  const out: Record<string, GearOption[]> = {}
  for (const [weaponId, rawOptions] of Object.entries(raw.armor as Record<string, unknown>)) {
    if (!weaponIds.has(weaponId)) return null
    const options = readGearOptions(rawOptions)
    if (options === null) return null
    const cleanOptions: GearOption[] = []
    const seen = new Set<string>()
    for (const option of options) {
      if (!armorIds.has(option.id) || seen.has(option.id)) return null
      seen.add(option.id)
      cleanOptions.push(option)
    }
    if (cleanOptions.length > 0) out[weaponId] = cleanOptions
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeGearSelectionForPlan(
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
): DiscordGearSelection {
  const weaponIndex = normalizeGearIndex(selection.weaponIndex, plan.optionsByKind.weapon)
  const selectionWithWeapon = { weaponIndex, armorIndex: null }
  return {
    weaponIndex,
    armorIndex: normalizeGearIndex(
      selection.armorIndex,
      gearOptionsForSelection(plan, selectionWithWeapon, 'armor'),
    ),
  }
}

function normalizeGearIndex(index: number | null, options: readonly GearOption[]): number | null {
  return index != null && index >= 0 && index < options.length ? index : null
}

function selectedGearIndex(selection: DiscordGearSelection, kind: DiscordGearPickKind): number | null {
  return kind === 'weapon' ? selection.weaponIndex : selection.armorIndex
}

function hasConditionalArmorOptions(plan: DiscordGearSelectionPlan): boolean {
  return !!plan.armorOptionsByWeaponId && Object.keys(plan.armorOptionsByWeaponId).length > 0
}

function shouldWaitForWeaponBeforeArmor(
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
  kind: DiscordGearPickKind,
): boolean {
  return kind === 'armor' && hasConditionalArmorOptions(plan) && selection.weaponIndex == null
}

function gearOptionsForSelection(
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
  kind: DiscordGearPickKind,
): readonly GearOption[] {
  if (kind === 'weapon') return plan.optionsByKind.weapon
  if (!hasConditionalArmorOptions(plan)) return plan.optionsByKind.armor
  const weapon = selection.weaponIndex == null
    ? null
    : plan.optionsByKind.weapon[selection.weaponIndex]
  if (!weapon) return []
  return plan.armorOptionsByWeaponId?.[weapon.id] ?? plan.optionsByKind.armor
}

function cloneArmorOptionsByWeaponId(
  optionsByWeaponId: Record<string, readonly GearOption[]>,
): Record<string, GearOption[]> {
  return Object.fromEntries(
    Object.entries(optionsByWeaponId).map(([weaponId, options]) => [
      weaponId,
      options.map((option) => ({ id: option.id, name: option.name })),
    ]),
  )
}

function isGearSelectionComplete(
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
): boolean {
  return plan.requiredKinds.every((kind) => {
    const index = selectedGearIndex(selection, kind)
    return index != null && !!gearOptionsForSelection(plan, selection, kind)[index]
  })
}

function buildGearPicksFromSelection(
  plan: DiscordGearSelectionPlan,
  selection: DiscordGearSelection,
): Record<string, GearOption> | null {
  if (!isGearSelectionComplete(plan, selection)) return null

  const picks: Record<string, GearOption> = {}
  for (const kind of plan.requiredKinds) {
    const index = selectedGearIndex(selection, kind)
    if (index == null) return null
    const option = gearOptionsForSelection(plan, selection, kind)[index]
    if (!option) return null
    picks[kind] = { id: option.id, name: option.name }
  }
  return picks
}

function encodeDiscordGearPickKind(kind: DiscordGearPickKind): 'w' | 'a' {
  return kind === 'weapon' ? 'w' : 'a'
}

function decodeDiscordGearPickKind(raw: string): DiscordGearPickKind | null {
  if (raw === 'w') return 'weapon'
  if (raw === 'a') return 'armor'
  return null
}

function encodeGearIndex(index: number | null): string {
  return index == null ? UNSELECTED_GEAR_INDEX : index.toString(36)
}

function decodeGearIndex(raw: string): number | null {
  if (!raw || raw === UNSELECTED_GEAR_INDEX) return null
  const parsed = Number.parseInt(raw, 36)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function discordOptionLabel(label: string): string {
  return label.length > 100 ? `${label.slice(0, 97)}...` : label
}

function normalizeBrowseRoleFilterValues(values: readonly string[]): SlotRole[] {
  if (values.includes(ALL_ROLES_VALUE)) return []
  const roles = SLOT_ROLES.filter((role) => values.includes(role))
  return roles.length === SLOT_ROLES.length ? [] : roles
}

function browseRoleFilterLabel(
  roleFilter: readonly SlotRole[],
  messages: Pick<DiscordEventSignupMessages, 'browseAllButton'>,
): string {
  const normalizedRoles = normalizeBrowseRoleFilterValues(roleFilter)
  return normalizedRoles.length === 0 ? messages.browseAllButton : normalizedRoles.join(', ')
}

function encodeBrowseRoleFilterKey(roleFilter: readonly SlotRole[]): string {
  const normalizedRoles = normalizeBrowseRoleFilterValues(roleFilter)
  if (normalizedRoles.length === 0) return ALL_ROLES_VALUE

  let mask = 0
  for (const role of normalizedRoles) {
    const index = SLOT_ROLES.indexOf(role)
    if (index >= 0) mask |= 1 << index
  }
  return `m${mask.toString(36)}`
}

function decodeBrowseRoleFilterKey(raw: string): SlotRole[] {
  const decoded = safeDecodeURIComponent(raw)
  if (!decoded || decoded === ALL_ROLES_VALUE) return []

  if (decoded.startsWith('m')) {
    const mask = Number.parseInt(decoded.slice(1), 36)
    if (Number.isFinite(mask) && mask > 0) {
      return normalizeBrowseRoleFilterValues(
        SLOT_ROLES.filter((_, index) => (mask & (1 << index)) !== 0),
      )
    }
  }

  return normalizeBrowseRoleFilterValues(decoded.split(','))
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function listEmptySlots(
  eventId: string,
  guildId: string,
  roleFilter: readonly SlotRole[],
): Promise<SlotRow[]> {
  const normalizedRoleFilter = normalizeBrowseRoleFilterValues(roleFilter)
  const db = getAdminClient()
  let query = db
    .from('slots')
    .select(BASE_SLOT_SELECT)
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
    .eq('is_hidden', false)
    .is('assigned_discord_id', null)
    .is('requested_discord_id', null)
  if (normalizedRoleFilter.length > 0) query = query.in('role_name', normalizedRoleFilter)

  const { data, error } = await query
  if (error) {
    log.error('[discord-event-signups] empty slot lookup failed', error, { guild_id: guildId, event_id: eventId })
    return []
  }

  return ((data ?? []) as SlotRow[]).sort((a, b) => {
    const partyA = normalizeParty(a.parties)?.party_number ?? 0
    const partyB = normalizeParty(b.parties)?.party_number ?? 0
    return partyA - partyB || a.slot_number - b.slot_number
  })
}

async function applyByCode(
  eventId: string,
  rawCode: string,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: true })
  if (!access.ok) return ephemeralReply(access.error)

  const parts = parseEventSlotCode(rawCode)
  if (!parts) return ephemeralReply(context.messages.codeInvalid)

  const slot = await loadSlotByCode(eventId, context.tenant.id, parts)
  if (!slot || slot.is_hidden) return ephemeralReply(context.messages.codeInvalid)
  if (slot.assigned_discord_id || slot.requested_discord_id) {
    return ephemeralReply(context.messages.slotTaken)
  }

  const canonicalCode = eventSlotCode(parts)
  return startLoadedSlotSignup(eventId, slot, canonicalCode, access, context)
}

async function assignLoadedSlot(
  eventId: string,
  slot: SlotRow,
  canonicalCode: string,
  access: { event: EventRow; eventUrl: string },
  context: InteractionContext,
  picks: Record<string, GearOption> | null,
  options: { clearComponents?: boolean } = {},
): Promise<DiscordInteractionResponse> {
  const db = getAdminClient()
  const { error } = await db.rpc('assign_slot', {
    p_slot_id: slot.id,
    p_discord_id: context.discordId,
    p_username: context.username,
    p_picks: picks,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('ALREADY_IN_EVENT')) return ephemeralReply(context.messages.alreadyInEvent)
    if (message.includes('SLOT_TAKEN') || message.includes('SLOT_PENDING')) return ephemeralReply(context.messages.slotTaken)
    if (message.includes('GEAR_CHOICE_REQUIRED') || message.includes('GEAR_PICKS_REQUIRED') || message.includes('GEAR_NOT_IN_OPTIONS')) {
      return ephemeralReply(format(context.messages.codeRequiresWeb, { url: access.eventUrl }))
    }
    log.error('[discord-event-signups] assign_slot failed', error, {
      guild_id: context.tenant.id,
      event_id: eventId,
      discord_id: context.discordId,
      slot_id: slot.id,
    })
    return ephemeralReply(context.messages.unsupported)
  }

  const party = normalizeParty(slot.parties)
  const isPending = !!party?.is_bomb_squad
  return ephemeralReply(
    format(isPending ? context.messages.slotPending : context.messages.slotApplied, {
      code: canonicalCode,
      title: access.event.title,
    }),
    options.clearComponents ? { components: [] } : {},
  )
}

async function startLoadedSlotSignup(
  eventId: string,
  slot: SlotRow,
  canonicalCode: string,
  access: { event: EventRow; eventUrl: string },
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const gearSelection = resolveDiscordGearSelectionPlan(slot)
  if (gearSelection.kind === 'none') {
    return showDiscordSignupConfirmation(
      eventId,
      slot,
      canonicalCode,
      access,
      context,
      { weaponIndex: null, armorIndex: null },
      null,
    )
  }
  if (gearSelection.kind === 'web') {
    return ephemeralReply(format(context.messages.codeRequiresWeb, { url: access.eventUrl }))
  }
  return showDiscordGearSelection(eventId, slot, canonicalCode, access, context, gearSelection.plan, {
    weaponIndex: null,
    armorIndex: null,
  })
}

async function applyBySlotId(
  eventId: string,
  slotId: string,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: true })
  if (!access.ok) return ephemeralReply(access.error)

  const slot = await loadSlotById(eventId, context.tenant.id, slotId)
  if (!slot || slot.is_hidden) return ephemeralReply(context.messages.codeInvalid)
  if (slot.assigned_discord_id || slot.requested_discord_id) {
    return ephemeralReply(context.messages.slotTaken)
  }

  const party = normalizeParty(slot.parties)
  if (!party) return ephemeralReply(context.messages.codeInvalid)
  const canonicalCode = eventSlotCode({
    partyNumber: party.party_number,
    slotNumber: slot.slot_number,
  })

  return startLoadedSlotSignup(eventId, slot, canonicalCode, access, context)
}

async function updateGearSelection(
  eventId: string,
  slotId: string,
  gearKind: DiscordGearPickKind,
  currentSelection: DiscordGearSelection,
  values: readonly string[],
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const loaded = await loadSignupSlotForInteraction(eventId, slotId, context)
  if (!loaded.ok) return ephemeralReply(loaded.error)

  const pickedIndex = decodeGearIndex(values[0] ?? UNSELECTED_GEAR_INDEX)
  const nextSelection = {
    ...currentSelection,
    [gearKind === 'weapon' ? 'weaponIndex' : 'armorIndex']: pickedIndex,
    ...(gearKind === 'weapon' && pickedIndex !== currentSelection.weaponIndex
      ? { armorIndex: null }
      : {}),
  }
  const gearSelection = resolveDiscordGearSelectionPlan(loaded.slot)
  if (gearSelection.kind === 'none') {
    return ephemeralReply(context.messages.unsupported)
  }
  if (gearSelection.kind === 'web') {
    return ephemeralReply(format(context.messages.codeRequiresWeb, { url: loaded.access.eventUrl }))
  }
  return showDiscordGearSelection(
    eventId,
    loaded.slot,
    loaded.canonicalCode,
    loaded.access,
    context,
    gearSelection.plan,
    nextSelection,
  )
}

async function applyBySlotIdWithGearSelection(
  eventId: string,
  slotId: string,
  selection: DiscordGearSelection,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const loaded = await loadSignupSlotForInteraction(eventId, slotId, context)
  if (!loaded.ok) return ephemeralReply(loaded.error)

  const gearSelection = resolveDiscordGearSelectionPlan(loaded.slot)
  if (gearSelection.kind === 'none') {
    return showDiscordSignupConfirmation(
      eventId,
      loaded.slot,
      loaded.canonicalCode,
      loaded.access,
      context,
      { weaponIndex: null, armorIndex: null },
      null,
    )
  }
  if (gearSelection.kind === 'web') {
    return ephemeralReply(format(context.messages.codeRequiresWeb, { url: loaded.access.eventUrl }))
  }

  const normalizedSelection = normalizeGearSelectionForPlan(gearSelection.plan, selection)
  const picks = buildGearPicksFromSelection(gearSelection.plan, normalizedSelection)
  if (!picks) {
    return showDiscordGearSelection(
      eventId,
      loaded.slot,
      loaded.canonicalCode,
      loaded.access,
      context,
      gearSelection.plan,
      normalizedSelection,
    )
  }

  return showDiscordSignupConfirmation(
    eventId,
    loaded.slot,
    loaded.canonicalCode,
    loaded.access,
    context,
    normalizedSelection,
    picks,
  )
}

async function applyConfirmedSlotSignup(
  eventId: string,
  slotId: string,
  selection: DiscordGearSelection,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const loaded = await loadSignupSlotForInteraction(eventId, slotId, context)
  if (!loaded.ok) return ephemeralReply(loaded.error, { components: [] })

  const gearSelection = resolveDiscordGearSelectionPlan(loaded.slot)
  if (gearSelection.kind === 'none') {
    return assignLoadedSlot(
      eventId,
      loaded.slot,
      loaded.canonicalCode,
      loaded.access,
      context,
      null,
      { clearComponents: true },
    )
  }
  if (gearSelection.kind === 'web') {
    return ephemeralReply(
      format(context.messages.codeRequiresWeb, { url: loaded.access.eventUrl }),
      { components: [] },
    )
  }

  const normalizedSelection = normalizeGearSelectionForPlan(gearSelection.plan, selection)
  const picks = buildGearPicksFromSelection(gearSelection.plan, normalizedSelection)
  if (!picks) {
    return showDiscordGearSelection(
      eventId,
      loaded.slot,
      loaded.canonicalCode,
      loaded.access,
      context,
      gearSelection.plan,
      normalizedSelection,
    )
  }

  return assignLoadedSlot(
    eventId,
    loaded.slot,
    loaded.canonicalCode,
    loaded.access,
    context,
    picks,
    { clearComponents: true },
  )
}

async function loadSignupSlotForInteraction(
  eventId: string,
  slotId: string,
  context: InteractionContext,
): Promise<
  | {
      ok: true
      access: { event: EventRow; eventUrl: string }
      slot: SlotRow
      canonicalCode: string
    }
  | { ok: false; error: string }
> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: true })
  if (!access.ok) return { ok: false, error: access.error }

  const slot = await loadSlotById(eventId, context.tenant.id, slotId)
  if (!slot || slot.is_hidden) return { ok: false, error: context.messages.codeInvalid }
  if (slot.assigned_discord_id || slot.requested_discord_id) {
    return { ok: false, error: context.messages.slotTaken }
  }

  const party = normalizeParty(slot.parties)
  if (!party) return { ok: false, error: context.messages.codeInvalid }
  return {
    ok: true,
    access,
    slot,
    canonicalCode: eventSlotCode({
      partyNumber: party.party_number,
      slotNumber: slot.slot_number,
    }),
  }
}

async function loadSlotByCode(
  eventId: string,
  guildId: string,
  parts: { partyNumber: number; slotNumber: number },
): Promise<SlotRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(SIGNUP_SLOT_SELECT)
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
    .eq('parties.party_number', parts.partyNumber)
    .eq('slot_number', parts.slotNumber)
    .maybeSingle()
  if (error) {
    log.error('[discord-event-signups] slot code lookup failed', error, {
      guild_id: guildId,
      event_id: eventId,
      code: eventSlotCode(parts),
    })
    return null
  }
  return data as SlotRow | null
}

async function loadSlotById(
  eventId: string,
  guildId: string,
  slotId: string,
): Promise<SlotRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(SIGNUP_SLOT_SELECT)
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
    .eq('id', slotId)
    .maybeSingle()
  if (error) {
    log.error('[discord-event-signups] slot id lookup failed', error, {
      guild_id: guildId,
      event_id: eventId,
      slot_id: slotId,
    })
    return null
  }
  return data as SlotRow | null
}

async function showMyStatus(
  eventId: string,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: false })
  if (!access.ok) return ephemeralReply(access.error)

  const db = getAdminClient()
  const [slotRes, tentativeRes] = await Promise.all([
    db
      .from('slots')
      .select('slot_number, role_name, assigned_discord_id, requested_discord_id, parties!inner(event_id, party_number, name, is_bomb_squad)')
      .eq('guild_id', context.tenant.id)
      .eq('parties.event_id', eventId)
      .or(`assigned_discord_id.eq.${context.discordId},requested_discord_id.eq.${context.discordId}`)
      .limit(1)
      .maybeSingle(),
    db
      .from('event_tentative_signups')
      .select('possible_roles')
      .eq('guild_id', context.tenant.id)
      .eq('event_id', eventId)
      .eq('discord_id', context.discordId)
      .maybeSingle(),
  ])
  if (slotRes.error) {
    log.error('[discord-event-signups] status slot lookup failed', slotRes.error, {
      guild_id: context.tenant.id,
      event_id: eventId,
      discord_id: context.discordId,
    })
  }

  const slot = slotRes.data as SlotRow | null
  if (slot) {
    const party = normalizeParty(slot.parties)
    const code = party
      ? eventSlotCode({ partyNumber: party.party_number, slotNumber: slot.slot_number })
      : '-'
    const role = slot.role_name ?? '-'
    return ephemeralReply(
      format(
        slot.assigned_discord_id === context.discordId
          ? context.messages.statusAssigned
          : context.messages.statusPending,
        { code, role },
      ),
      { components: [buildOpenButtonRow(access.eventUrl, context.messages)] },
    )
  }

  const roles = Array.isArray(tentativeRes.data?.possible_roles)
    ? tentativeRes.data.possible_roles.filter((role): role is string => typeof role === 'string')
    : []
  if (roles.length > 0) {
    return ephemeralReply(format(context.messages.statusTentative, { roles: roles.join(', ') }), {
      components: [buildOpenButtonRow(access.eventUrl, context.messages)],
    })
  }

  return ephemeralReply(context.messages.statusNone, {
    components: buildDiscordEventSignupComponents({
      eventId,
      eventUrl: access.eventUrl,
      labels: context.messages,
    }),
  })
}

function normalizeParty(slotParties: SlotRow['parties']): {
  party_number: number
  name: string | null
  is_bomb_squad: boolean | null
} | null {
  return Array.isArray(slotParties) ? slotParties[0] ?? null : slotParties
}

function partyName(party: ReturnType<typeof normalizeParty>): string {
  if (!party) return '-'
  return party.name?.trim() || `P${party.party_number}`
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
