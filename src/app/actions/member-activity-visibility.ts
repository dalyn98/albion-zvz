'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { buildPublicActivityUrl } from '@/lib/member-activity-public-url'

export interface SetMyActivityVisibilityResult {
  ok: boolean
  enabled?: boolean
  publicUrl?: string
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
  const { data, error } = await db
    .from('account_albion_tenant_links')
    .update({
      public_activity_enabled: enabled,
      public_activity_enabled_at: enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
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
