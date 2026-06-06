import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import {
  applySiteNicknameOverride,
  normalizeDiscordId,
  normalizeSiteNickname,
} from '@/lib/site-nickname'

interface SiteNicknameOverrideRow {
  discord_id?: unknown
  nickname?: unknown
}

interface StoreError {
  code?: string
  message?: string
}

export function isSiteNicknameOverrideStoreUnavailableError(error: StoreError): boolean {
  const message = error.message ?? ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (message.includes('site_user_nickname_overrides') &&
      (message.includes('Could not find') || message.includes('does not exist')))
  )
}

export async function getSiteNicknameOverride(discordId: string): Promise<string | null> {
  const normalizedDiscordId = normalizeDiscordId(discordId)
  if (!normalizedDiscordId) return null

  const { data, error } = await getAdminClient()
    .from('site_user_nickname_overrides')
    .select('nickname')
    .eq('discord_id', normalizedDiscordId)
    .maybeSingle()

  if (error) {
    if (!isSiteNicknameOverrideStoreUnavailableError(error)) {
      log.error('[site-nickname-override] lookup failed', error, {
        discord_id: normalizedDiscordId,
      })
    }
    return null
  }

  return typeof data?.nickname === 'string' ? normalizeSiteNickname(data.nickname) : null
}

export async function listSiteNicknameOverridesByDiscordIds(
  discordIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(
    new Set(discordIds.map((id) => normalizeDiscordId(id)).filter((id): id is string => !!id)),
  )
  if (uniqueIds.length === 0) return new Map()

  const { data, error } = await getAdminClient()
    .from('site_user_nickname_overrides')
    .select('discord_id, nickname')
    .in('discord_id', uniqueIds)

  if (error) {
    if (!isSiteNicknameOverrideStoreUnavailableError(error)) {
      log.error('[site-nickname-override] batch lookup failed', error, {
        count: uniqueIds.length,
      })
    }
    return new Map()
  }

  const result = new Map<string, string>()
  for (const row of (data ?? []) as SiteNicknameOverrideRow[]) {
    if (typeof row.discord_id !== 'string' || typeof row.nickname !== 'string') continue
    const normalizedNickname = normalizeSiteNickname(row.nickname)
    if (normalizedNickname) result.set(row.discord_id, normalizedNickname)
  }
  return result
}

export async function resolveEffectiveSiteUsername(
  discordId: string,
  fallbackUsername: string,
): Promise<string> {
  const override = await getSiteNicknameOverride(discordId)
  return applySiteNicknameOverride(fallbackUsername, override)
}
