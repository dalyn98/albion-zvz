'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { buildPublicActivityUrl } from '@/lib/member-activity-public-url'

const PUBLIC_ACTIVITY_TRUST_STATUSES = ['roster_matched', 'trusted'] as const

export interface SetMyActivityVisibilityResult {
  ok: boolean
  enabled?: boolean
  publicUrl?: string
  error?: string
}

export interface SetMyLeaderboardVisibilityResult {
  ok: boolean
  enabled?: boolean
  error?: string
}

export async function setMyActivityVisibility(
  guildId: string,
  enabled: boolean,
): Promise<SetMyActivityVisibilityResult> {
  const session = await getSession()
  if (!session || !session.isMember) {
    return { ok: false, error: 'unauthorized' }
  }

  const db = getAdminClient()
  const nextToken = enabled ? undefined : crypto.randomUUID()
  const { data, error } = await db
    .from('account_albion_tenant_links')
    .update({
      public_activity_enabled: enabled,
      public_activity_enabled_at: enabled ? new Date().toISOString() : null,
      ...(!enabled
        ? {
            public_leaderboard_enabled: false,
            public_leaderboard_enabled_at: null,
          }
        : {}),
      ...(nextToken ? { public_activity_token: nextToken } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .in('trust_status', PUBLIC_ACTIVITY_TRUST_STATUSES)
    .not('albion_player_id', 'is', null)
    .is('revoked_at', null)
    .select('public_activity_token, public_activity_enabled')
    .maybeSingle()

  if (error) return { ok: false, error: 'save_failed' }
  if (!data) return { ok: false, error: 'not_found' }

  const token = data.public_activity_token as string
  revalidatePath('/me')
  revalidatePath(`/me/activity/${guildId}`)
  revalidatePath(`/public/u/${token}`)

  return {
    ok: true,
    enabled: Boolean(data.public_activity_enabled),
    publicUrl: buildPublicActivityUrl(token),
  }
}

export async function setMyLeaderboardVisibility(
  guildId: string,
  enabled: boolean,
): Promise<SetMyLeaderboardVisibilityResult> {
  const session = await getSession()
  if (!session || !session.isMember) {
    return { ok: false, error: 'unauthorized' }
  }

  const db = getAdminClient()
  let query = db
    .from('account_albion_tenant_links')
    .update({
      public_leaderboard_enabled: enabled,
      public_leaderboard_enabled_at: enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .in('trust_status', PUBLIC_ACTIVITY_TRUST_STATUSES)
    .not('albion_player_id', 'is', null)
    .is('revoked_at', null)
  if (enabled) {
    query = query.eq('public_activity_enabled', true)
  }

  const { data, error } = await query
    .select('public_activity_token, public_leaderboard_enabled')
    .maybeSingle()
  if (error) return { ok: false, error: 'save_failed' }
  if (!data) return { ok: false, error: 'activity_must_be_public' }

  revalidatePath('/me')
  revalidatePath(`/me/activity/${guildId}`)
  revalidatePath(`/public/u/${String(data.public_activity_token)}`)
  return {
    ok: true,
    enabled: data.public_leaderboard_enabled === true,
  }
}
