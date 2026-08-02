import 'server-only'

import { unstable_cache } from 'next/cache'
import { log } from '@/lib/log'
import {
  PUBLIC_GUILD_DIRECTORY_CACHE_REVALIDATE_SECONDS,
  PUBLIC_GUILD_DIRECTORY_CACHE_TAG,
} from '@/lib/guild-profile-cache'
import {
  PUBLIC_GUILD_DIRECTORY_SETTING_KEYS,
  buildPublicGuildDirectoryEntries,
  type PublicGuildDirectoryEntry,
} from '@/lib/public-guild-directory'
import { getAdminClient } from '@/lib/supabase-admin'
import { TENANT_DIRECTORY_CACHE_TAG } from '@/lib/tenant-cache'

export interface PublicGuildDirectoryResult {
  available: boolean
  entries: PublicGuildDirectoryEntry[]
}

async function queryPublicGuildDirectory(): Promise<PublicGuildDirectoryResult> {
  const db = getAdminClient()
  const { data: tenants, error: tenantError } = await db
    .from('tenants')
    .select('id,slug,name,status')
    .eq('status', 'active')

  if (tenantError) throw tenantError
  if (!tenants || tenants.length === 0) return { available: true, entries: [] }
  const guildIds = tenants.map((tenant) => tenant.id as string)
  const [settingsResult, featureResult, disputeResult] = await Promise.all([
    db
      .from('app_settings')
      .select('guild_id,key,value')
      .in('guild_id', guildIds)
      .in('key', [...PUBLIC_GUILD_DIRECTORY_SETTING_KEYS]),
    db
      .from('guild_feature_states')
      .select('guild_id,feature_key,state')
      .in('guild_id', guildIds)
      .eq('feature_key', 'public_guild_profile'),
    db
      .from('guild_home_ownership_disputes')
      .select('incumbent_guild_id,status')
      .in('incumbent_guild_id', guildIds)
      .eq('status', 'under_review'),
  ])

  if (settingsResult.error) throw settingsResult.error
  if (featureResult.error) throw featureResult.error
  if (disputeResult.error) throw disputeResult.error

  return {
    available: true,
    entries: buildPublicGuildDirectoryEntries({
      tenants: tenants.map((tenant) => ({
        id: tenant.id as string,
        slug: tenant.slug as string,
        name: tenant.name as string,
        status: tenant.status as string,
      })),
      settings: (settingsResult.data ?? []).map((row) => ({
        guild_id: row.guild_id as string,
        key: row.key as string,
        value: row.value as string,
      })),
      features: (featureResult.data ?? []).map((row) => ({
        guild_id: row.guild_id as string,
        feature_key: row.feature_key as string,
        state: row.state as string,
      })),
      disputes: (disputeResult.data ?? []).map((row) => ({
        incumbent_guild_id: row.incumbent_guild_id as string,
        status: row.status as string,
      })),
    }),
  }
}

const queryPublicGuildDirectoryCached = unstable_cache(
  queryPublicGuildDirectory,
  ['public-guild-directory-v1'],
  {
    revalidate: PUBLIC_GUILD_DIRECTORY_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_GUILD_DIRECTORY_CACHE_TAG, TENANT_DIRECTORY_CACHE_TAG],
  },
)

export async function loadPublicGuildDirectory(): Promise<PublicGuildDirectoryResult> {
  try {
    return await queryPublicGuildDirectoryCached()
  } catch (error) {
    log.error('[public-guild-directory] load failed', error)
    return { available: false, entries: [] }
  }
}
