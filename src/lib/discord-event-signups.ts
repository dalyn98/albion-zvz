import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getAlbionEventAccessGateState } from '@/lib/albion-identity'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isLocale, type Locale } from '@/i18n/locales'
import { SLOT_ROLES, type SlotRole } from '@/types'
import { eventSlotCode, parseEventSlotCode } from '@/lib/event-slot-codes'
import { log } from '@/lib/log'
import {
  ephemeralReply,
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
  previousButton: string
  nextButton: string
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
  weapon_name: string | null
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
  kind:
    | 'intent'
    | 'intent_roles'
    | 'code'
    | 'code_submit'
    | 'browse'
    | 'browse_role'
    | 'browse_page'
    | 'slot'
    | 'status'
  eventId: string
  role?: string
  page?: number
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

export async function loadDiscordEventSignupMessages(
  locale: Locale = DEFAULT_LOCALE,
): Promise<DiscordEventSignupMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordEventSignup ?? {}) as Record<string, string>
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
    previousButton: ns.previousButton ?? 'Previous',
    nextButton: ns.nextButton ?? 'Next',
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
      return showBrowseRoleSelect(action.eventId, context)
    case 'browse_role':
      return showBrowsePage(action.eventId, payload.data?.values?.[0] ?? ALL_ROLES_VALUE, 0, context)
    case 'browse_page':
      return showBrowsePage(action.eventId, action.role ?? ALL_ROLES_VALUE, action.page ?? 0, context)
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
    case 'browse_page':
      return {
        kind,
        eventId,
        role: decodeURIComponent(rest[0] ?? ALL_ROLES_VALUE),
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

function showBrowseRoleSelect(
  eventId: string,
  context: InteractionContext,
): DiscordInteractionResponse {
  return ephemeralReply(context.messages.browseSelectPlaceholder, {
    components: buildBrowseRoleSelect(eventId, context, ALL_ROLES_VALUE),
  })
}

async function showBrowsePage(
  eventId: string,
  roleFilter: string,
  page: number,
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const access = await ensureEventAccess(eventId, context, { requireNotStarted: false })
  if (!access.ok) return ephemeralReply(access.error)

  const normalizedRole = normalizeRoleFilter(roleFilter)
  const slots = await listEmptySlots(eventId, context.tenant.id, normalizedRole)
  const totalPages = Math.max(1, Math.ceil(slots.length / BROWSE_PAGE_SIZE))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const visible = slots.slice(safePage * BROWSE_PAGE_SIZE, (safePage + 1) * BROWSE_PAGE_SIZE)
  const roleLabel = normalizedRole === ALL_ROLES_VALUE ? 'All' : normalizedRole

  if (visible.length === 0) {
    return ephemeralReply(context.messages.browseEmpty, {
      components: [
        ...buildBrowseRoleSelect(eventId, context, normalizedRole),
        buildOpenButtonRow(access.eventUrl, context.messages),
      ],
    })
  }

  const lines = visible.map((slot) => {
    const party = normalizeParty(slot.parties)
    const code = eventSlotCode({ partyNumber: party?.party_number ?? 0, slotNumber: slot.slot_number })
    const role = slot.role_name || '-'
    const weapon = slot.weapon_name ? ` · ${slot.weapon_name}` : ''
    return `\`${code}\` · ${partyName(party)} · ${role}${weapon}`
  })

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
        ...buildBrowseRoleSelect(eventId, context, normalizedRole),
        ...buildDiscordEventSlotButtonRows(eventId, visible),
        buildDiscordEventBrowseNavRow(eventId, normalizedRole, safePage, totalPages, context.messages, access.eventUrl),
      ],
    },
  )
}

function buildBrowseRoleSelect(
  eventId: string,
  context: InteractionContext,
  role: string,
): DiscordMessageComponent[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: customId('browse_role', eventId),
          placeholder: context.messages.browseSelectPlaceholder,
          min_values: 1,
          max_values: 1,
          options: [
            { label: 'All', value: ALL_ROLES_VALUE, default: role === ALL_ROLES_VALUE },
            ...SLOT_ROLES.map((slotRole) => ({
              label: slotRole,
              value: slotRole,
              default: role === slotRole,
            })),
          ],
        },
      ],
    },
  ]
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

export function buildDiscordEventBrowseNavRow(
  eventId: string,
  role: string,
  page: number,
  totalPages: number,
  messages: Pick<DiscordEventSignupMessages, 'previousButton' | 'nextButton' | 'openButton'>,
  eventUrl: string,
): DiscordMessageComponent {
  const encodedRole = encodeURIComponent(role)
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

function normalizeRoleFilter(raw: string): string {
  if (raw === ALL_ROLES_VALUE) return ALL_ROLES_VALUE
  return (SLOT_ROLES as readonly string[]).includes(raw) ? raw : ALL_ROLES_VALUE
}

async function listEmptySlots(
  eventId: string,
  guildId: string,
  roleFilter: string,
): Promise<SlotRow[]> {
  const db = getAdminClient()
  let query = db
    .from('slots')
    .select('id, slot_number, role_name, weapon_name, assigned_discord_id, requested_discord_id, is_hidden, is_solo_bomb, parties!inner(event_id, party_number, name, is_bomb_squad)')
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
    .eq('is_hidden', false)
    .is('assigned_discord_id', null)
    .is('requested_discord_id', null)
  if (roleFilter !== ALL_ROLES_VALUE) query = query.eq('role_name', roleFilter)

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
  return assignLoadedSlot(eventId, slot, canonicalCode, access, context)
}

async function assignLoadedSlot(
  eventId: string,
  slot: SlotRow,
  canonicalCode: string,
  access: { event: EventRow; eventUrl: string },
  context: InteractionContext,
): Promise<DiscordInteractionResponse> {
  const db = getAdminClient()
  const { error } = await db.rpc('assign_slot', {
    p_slot_id: slot.id,
    p_discord_id: context.discordId,
    p_username: context.username,
    p_picks: null,
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
  )
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

  return assignLoadedSlot(eventId, slot, canonicalCode, access, context)
}

async function loadSlotByCode(
  eventId: string,
  guildId: string,
  parts: { partyNumber: number; slotNumber: number },
): Promise<SlotRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select('id, slot_number, role_name, weapon_name, assigned_discord_id, requested_discord_id, is_hidden, is_solo_bomb, parties!inner(event_id, party_number, name, is_bomb_squad)')
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
    .select('id, slot_number, role_name, weapon_name, assigned_discord_id, requested_discord_id, is_hidden, is_solo_bomb, parties!inner(event_id, party_number, name, is_bomb_squad)')
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
