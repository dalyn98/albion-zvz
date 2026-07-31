import 'server-only'

import { cache } from 'react'
import { getAppSetting } from '@/lib/app-settings'
import {
  getGuildMemberByBot,
  identityFromMember,
  type DiscordGuildMemberBulk,
} from '@/lib/discord'
import {
  CAP,
  hasCapability,
  resolveUserCapabilities,
  serializeCapabilities,
} from '@/lib/permissions'
import type { SessionPayload } from '@/lib/session-verify'
import { isSuperAdmin } from '@/lib/super-admin'
import { isTestAuthRouteEnabled } from '@/lib/test-auth-session'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getSessionGuildId,
  getTenantDiscordConfig,
  type TenantDiscordConfig,
} from '@/lib/tenant'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export interface LiveDiscordAuthorization {
  session: SessionPayload
  discordRoleIds: string[]
  tenant: TenantDiscordConfig
}

function parseRoleIds(raw: string): string[] {
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.length > 0,
    )
  } catch {
    return []
  }
}

function eventCreatorCategories(bits: bigint): EventCategory[] {
  if (hasCapability(bits, CAP.GUILD_ADMIN) ||
      hasCapability(bits, CAP.EVENT_MANAGE)) {
    return [...EVENT_CATEGORIES]
  }
  const categories: EventCategory[] = []
  if (hasCapability(bits, CAP.EVENT_CREATE_COMBAT)) categories.push('전투')
  if (hasCapability(bits, CAP.EVENT_CREATE_FF)) categories.push('FF')
  if (hasCapability(bits, CAP.EVENT_CREATE_GANKING)) categories.push('갱킹')
  return categories
}

export async function resolveDiscordAuthorization(input: {
  tenant: TenantDiscordConfig
  discordId: string
  member: DiscordGuildMemberBulk
  previousSession?: SessionPayload | null
  issuedAt?: number
  authenticatedAt?: number
}): Promise<LiveDiscordAuthorization | null> {
  if (!input.member.user || input.member.user.id !== input.discordId) return null

  const db = getAdminClient()
  const activeMemberRoleIds = parseRoleIds(
    await getAppSetting('active_member_role_ids', '[]', input.tenant.id),
  )
  const effectiveMemberRoleIds =
    activeMemberRoleIds.length > 0
      ? activeMemberRoleIds
      : input.tenant.memberRoleIds
  // Administrator/event/caller authority no longer comes from these legacy
  // arrays. They remain write-through projections for older Discord command
  // paths while this resolver reads the capability mapping directly.
  const identity = identityFromMember(
    input.member,
    effectiveMemberRoleIds,
    [],
  )

  const { data: adminOverride, error: adminOverrideError } = await db
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', input.tenant.id)
    .eq('discord_id', input.discordId)
    .maybeSingle()
  if (adminOverrideError) throw new Error(adminOverrideError.message)

  const isTenantOwner =
    input.tenant.createdByDiscordId === input.discordId
  const hasBootstrapAdminAccess = isTenantOwner || !!adminOverride
  let capabilities = await resolveUserCapabilities(db, {
    guildId: input.tenant.id,
    discordId: input.discordId,
    discordRoleIds: input.member.roles,
    isLegacyAdmin: hasBootstrapAdminAccess,
  })

  const isAdmin =
    hasBootstrapAdminAccess ||
    hasCapability(capabilities, CAP.GUILD_ADMIN)
  const isMember = (identity?.isMember ?? false) || isAdmin

  // An external bomb-squad caller may manage only the party they were assigned
  // to. A capability-bearing Discord role must never turn that caller into a
  // general guild member.
  if (!isMember) capabilities &= CAP.BOMB_SQUAD_CALL
  const isBombSquadCaller =
    hasCapability(capabilities, CAP.BOMB_SQUAD_CALL)
  const categories = isMember
    ? eventCreatorCategories(capabilities)
    : []
  const user = input.member.user
  const previous = input.previousSession

  return {
    tenant: input.tenant,
    discordRoleIds: [...input.member.roles],
    session: {
      discordId: input.discordId,
      username:
        input.member.nick ||
        user.global_name ||
        user.username ||
        previous?.username ||
        input.discordId,
      avatar: user.avatar ?? previous?.avatar ?? null,
      isMember,
      isAdmin,
      isGuest: false,
      isBombSquadCaller,
      isLocalGuildAccount: false,
      isAllianceCandidate: !isMember && !isBombSquadCaller,
      canCreateEvents: categories.length > 0,
      eventCreatorCategories: categories,
      eventScope: null,
      guildId: input.tenant.id,
      capabilities: serializeCapabilities(capabilities),
      authenticatedAt:
        input.authenticatedAt ??
        previous?.authenticatedAt ??
        0,
      issuedAt: input.issuedAt ?? previous?.issuedAt ?? Date.now(),
    },
  }
}

async function loadLiveDiscordAuthorization(
  session: SessionPayload,
): Promise<LiveDiscordAuthorization | null> {
  if (
    session.isGuest ||
    session.isLocalGuildAccount ||
    !session.discordId
  ) {
    return null
  }

  // Browser smoke sessions are synthetic and have no Discord snowflake.
  // This bypass is impossible in production because the test-auth feature
  // itself is fail-closed whenever VERCEL_ENV/NODE_ENV is production.
  if (
    session.discordId.startsWith('test-auth:') &&
    isTestAuthRouteEnabled()
  ) {
    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant || tenant.status !== 'active') return null
    return {
      tenant,
      discordRoleIds: [],
      session: { ...session, guildId },
    }
  }

  // A platform super-admin may intentionally impersonate a tenant without
  // joining that tenant's Discord server. Their separate allowlist remains the
  // source of authority.
  if (isSuperAdmin(session.discordId)) {
    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant || tenant.status !== 'active') return null
    return {
      tenant,
      discordRoleIds: [],
      session: { ...session, guildId },
    }
  }

  const guildId = await getSessionGuildId(session)
  const tenant = await getTenantDiscordConfig(guildId)
  if (!tenant || tenant.status !== 'active') return null
  const member = await getGuildMemberByBot(
    tenant.discordGuildId,
    session.discordId,
  )
  if (!member) return null
  return resolveDiscordAuthorization({
    tenant,
    discordId: session.discordId,
    member,
    previousSession: session,
  })
}

// React cache deduplicates Discord + DB authorization reads inside one RSC or
// Server Action request. It is intentionally not a cross-request cache: every
// protected command observes the current Discord role membership.
export const resolveLiveDiscordAuthorization = cache(
  loadLiveDiscordAuthorization,
)
