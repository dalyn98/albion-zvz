import 'server-only'

import {
  identityFromMember,
  mapDiscordLocale,
  type DiscordGuildMemberBulk,
  type DiscordUser,
} from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { removeGuestRecordForMember } from '@/lib/guest-membership-transition'
import { isLocale, type Locale } from '@/i18n/locales'
import { log } from '@/lib/log'
import { resolveUserCapabilities, serializeCapabilities } from '@/lib/permissions'
import { resolveEffectiveSiteUsername } from '@/lib/site-nickname-override'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveTenantLoginAccess } from '@/lib/tenant-login-access'
import type { TenantDiscordConfig } from '@/lib/tenant'
import type { SessionPayload } from '@/lib/session'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export type DiscordMemberSessionMode = 'member' | 'bomb_squad_caller' | 'alliance_candidate'

export interface DiscordMemberSessionResult {
  session: SessionPayload
  preferredLocale: Locale | null
  mode: DiscordMemberSessionMode
}

type RoleSettingKey =
  | 'event_creator_role_ids'
  | 'event_creator_role_ids_combat'
  | 'event_creator_role_ids_ff'
  | 'event_creator_role_ids_ganking'
  | 'bomb_squad_caller_role_ids'
  | 'active_member_role_ids'

async function loadRoleIdSetting(key: RoleSettingKey, guildId: string): Promise<string[]> {
  try {
    const raw = await getAppSetting(key, '[]', guildId)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
  } catch {
    return []
  }
}

export function resolveDiscordMemberPostLoginPath(
  returnTo: string,
  preferredLanguage: string | null,
): string {
  if (isLocale(preferredLanguage)) return returnTo
  return `/welcome-language?return=${encodeURIComponent(returnTo)}`
}

export async function buildDiscordMemberSession(input: {
  tenant: TenantDiscordConfig
  discordId: string
  user: DiscordUser
  member: DiscordGuildMemberBulk
  preferredLocale: string | null
}): Promise<DiscordMemberSessionResult> {
  const { tenant, discordId, user } = input
  const member = { ...input.member, user: input.member.user ?? user }
  const activeMemberRoleIds = await loadRoleIdSetting('active_member_role_ids', tenant.id)
  const effectiveMemberRoleIds =
    activeMemberRoleIds.length > 0 ? activeMemberRoleIds : tenant.memberRoleIds
  const identity = identityFromMember(member, effectiveMemberRoleIds, tenant.adminRoleIds)
  const isTenantOwner = tenant.createdByDiscordId === discordId
  const [legacyIds, combatIds, ffIds, gankingIds, bombSquadCallerRoleIds] = await Promise.all([
    loadRoleIdSetting('event_creator_role_ids', tenant.id),
    loadRoleIdSetting('event_creator_role_ids_combat', tenant.id),
    loadRoleIdSetting('event_creator_role_ids_ff', tenant.id),
    loadRoleIdSetting('event_creator_role_ids_ganking', tenant.id),
    loadRoleIdSetting('bomb_squad_caller_role_ids', tenant.id),
  ])
  const memberRoleSet = new Set(member.roles)
  const isBombSquadCaller = bombSquadCallerRoleIds.some((id) => memberRoleSet.has(id))
  const { data: overrideRow } = await getAdminClient()
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', tenant.id)
    .eq('discord_id', discordId)
    .maybeSingle()
  const { isAdmin, isMember } = resolveTenantLoginAccess({
    identity,
    hasAdminOverride: !!overrideRow,
    isTenantOwner,
  })
  const isAllianceCandidate = !isMember && !isAdmin
  const hasLegacy = legacyIds.some((id) => memberRoleSet.has(id))
  const eventCreatorCategories: EventCategory[] = isAdmin
    ? [...EVENT_CATEGORIES]
    : isMember
      ? [
          ...(hasLegacy || combatIds.some((id) => memberRoleSet.has(id))
            ? (['전투'] as const)
            : []),
          ...(hasLegacy || ffIds.some((id) => memberRoleSet.has(id))
            ? (['FF'] as const)
            : []),
          ...(hasLegacy || gankingIds.some((id) => memberRoleSet.has(id))
            ? (['갱킹'] as const)
            : []),
        ]
      : []
  const canCreateEvents = isAdmin || eventCreatorCategories.length > 0
  const fallbackDisplayName = identity?.username ?? member.nick ?? user.global_name ?? user.username
  const displayName = await resolveEffectiveSiteUsername(discordId, fallbackDisplayName)
  const db = getAdminClient()

  if (isMember || isBombSquadCaller) {
    try {
      await upsertGuildAvatar(
        tenant.id,
        discordId,
        displayName,
        user.avatar,
        isAdmin,
        isBombSquadCaller,
        { usernameIsEffective: true },
      )
    } catch (error) {
      log.error('[discord-member-session] upsertGuildAvatar failed', error, {
        tenant_id: tenant.id,
        discord_id: discordId,
      })
    }
  }

  if (isMember) {
    await removeGuestRecordForMember(db, {
      guildId: tenant.id,
      discordId,
      source: 'member_login',
    })
  }

  const { data: langRow } = await db
    .from('guild_avatars')
    .select('preferred_language')
    .eq('guild_id', tenant.id)
    .eq('discord_id', discordId)
    .maybeSingle()
  let preferred = langRow?.preferred_language ?? null
  if (!isLocale(preferred)) {
    const fromBrowser = isLocale(input.preferredLocale) ? input.preferredLocale : null
    const preferredFromLocale = fromBrowser ?? mapDiscordLocale(user.locale)
    if (preferredFromLocale) {
      const { error: langError } = await db
        .from('guild_avatars')
        .update({ preferred_language: preferredFromLocale })
        .eq('guild_id', tenant.id)
        .eq('discord_id', discordId)
      if (langError) {
        log.error('[discord-member-session] save preferred_language failed', langError, {
          tenant_id: tenant.id,
          discord_id: discordId,
        })
      } else {
        preferred = preferredFromLocale
      }
    }
  }

  let capabilitiesBits = 0n
  try {
    capabilitiesBits = isMember
      ? await resolveUserCapabilities(getAdminClient(), {
          guildId: tenant.id,
          discordId,
          discordRoleIds: member.roles,
          isLegacyAdmin: isAdmin,
        })
      : 0n
  } catch (error) {
    log.error('[discord-member-session] resolveUserCapabilities failed', error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
  }

  const mode: DiscordMemberSessionMode = isMember
    ? 'member'
    : isBombSquadCaller
      ? 'bomb_squad_caller'
      : 'alliance_candidate'
  return {
    session: {
      discordId,
      username: displayName,
      avatar: user.avatar,
      isMember,
      isAdmin,
      isGuest: false,
      isBombSquadCaller,
      isLocalGuildAccount: false,
      isAllianceCandidate,
      canCreateEvents,
      eventCreatorCategories,
      eventScope: null,
      guildId: tenant.id,
      capabilities: serializeCapabilities(capabilitiesBits),
      issuedAt: Date.now(),
    },
    preferredLocale: isLocale(preferred) ? preferred : null,
    mode,
  }
}
