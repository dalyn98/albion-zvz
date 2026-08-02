import 'server-only'

import {
  mapDiscordLocale,
  type DiscordGuildMemberBulk,
  type DiscordUser,
} from '@/lib/discord'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { removeGuestRecordForMember } from '@/lib/guest-membership-transition'
import { isLocale, type Locale } from '@/i18n/locales'
import { log } from '@/lib/log'
import { resolveDiscordAuthorization } from '@/lib/discord-live-authorization'
import { resolveEffectiveSiteUsername } from '@/lib/site-nickname-override'
import { getAdminClient } from '@/lib/supabase-admin'
import type { TenantDiscordConfig } from '@/lib/tenant'
import type { SessionPayload } from '@/lib/session'
import {
  loadGlobalAccessPreferences,
  setGlobalAccessPreferences,
} from '@/lib/global-access-preferences-server'

export type DiscordMemberSessionMode = 'member' | 'bomb_squad_caller' | 'alliance_candidate'

export interface DiscordMemberSessionResult {
  session: SessionPayload
  preferredLocale: Locale | null
  mode: DiscordMemberSessionMode
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
  authenticatedAt?: number
  previousSession?: SessionPayload | null
}): Promise<DiscordMemberSessionResult> {
  const { tenant, discordId, user } = input
  const member = { ...input.member, user: input.member.user ?? user }
  const authorization = await resolveDiscordAuthorization({
    tenant,
    discordId,
    member,
    issuedAt: Date.now(),
    authenticatedAt: input.authenticatedAt,
    previousSession: input.previousSession,
  })
  if (!authorization) throw new Error('Discord authorization unavailable')
  const {
    isAdmin,
    isMember,
    isBombSquadCaller,
  } = authorization.session
  const fallbackDisplayName =
    authorization.session.username ||
    member.nick ||
    user.global_name ||
    user.username
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

  const globalPreference = await loadGlobalAccessPreferences(discordId)
  let preferred = globalPreference?.preferredLanguage ?? null
  if (!isLocale(preferred)) {
    const fromBrowser = isLocale(input.preferredLocale) ? input.preferredLocale : null
    const preferredFromLocale = fromBrowser ?? mapDiscordLocale(user.locale)
    if (preferredFromLocale) {
      try {
        await setGlobalAccessPreferences({
          discordId,
          preferredLanguage: preferredFromLocale,
        })
        preferred = preferredFromLocale
      } catch (languageError) {
        log.error('[discord-member-session] save global preferred language failed', languageError, {
          tenant_id: tenant.id,
          discord_id: discordId,
        })
      }
    }
  }

  const mode: DiscordMemberSessionMode = isMember
    ? 'member'
    : isBombSquadCaller
      ? 'bomb_squad_caller'
      : 'alliance_candidate'
  return {
    session: {
      ...authorization.session,
      username: displayName,
      avatar: user.avatar,
    },
    preferredLocale: isLocale(preferred) ? preferred : null,
    mode,
  }
}
