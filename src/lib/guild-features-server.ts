import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import {
  buildGuildFeatureSnapshot,
  isGuildFeatureUseAllowed,
  type ConfigurableGuildFeatureKey,
  type GuildFeatureEntry,
  type GuildFeatureKey,
  type GuildFeatureSnapshot,
  type GuildFeatureUse,
  type GuildFeatureUseBoundary,
} from '@/lib/guild-features'

export class GuildFeatureUseBlockedError extends Error {
  readonly featureKey: GuildFeatureKey
  readonly use: GuildFeatureUse
  readonly state: GuildFeatureEntry['state']

  constructor(
    featureKey: GuildFeatureKey,
    use: GuildFeatureUse,
    state: GuildFeatureEntry['state'],
  ) {
    super(`GUILD_FEATURE_USE_BLOCKED:${featureKey}:${state}:${use}`)
    this.name = 'GuildFeatureUseBlockedError'
    this.featureKey = featureKey
    this.use = use
    this.state = state
  }
}

export async function loadGuildFeatureSnapshot(
  guildId: string,
): Promise<GuildFeatureSnapshot> {
  const { data, error } = await getAdminClient()
    .from('guild_feature_states')
    .select('feature_key,state,config')
    .eq('guild_id', guildId)

  if (error) throw new Error(`GUILD_FEATURE_STATE_LOAD_FAILED:${error.code}`)
  return buildGuildFeatureSnapshot(data ?? [])
}

export async function getGuildFeature(
  guildId: string,
  featureKey: GuildFeatureKey,
): Promise<GuildFeatureEntry> {
  return (await loadGuildFeatureSnapshot(guildId))[featureKey]
}

export async function checkGuildFeatureUse(
  guildId: string,
  boundary: GuildFeatureUseBoundary,
): Promise<{ allowed: boolean; feature: GuildFeatureEntry }> {
  const feature = await getGuildFeature(guildId, boundary.key)
  return {
    allowed: isGuildFeatureUseAllowed(feature.state, boundary.use),
    feature,
  }
}

export async function requireGuildFeatureUse(
  guildId: string,
  featureKey: ConfigurableGuildFeatureKey,
  use: GuildFeatureUse,
): Promise<GuildFeatureEntry> {
  const feature = await getGuildFeature(guildId, featureKey)
  if (!isGuildFeatureUseAllowed(feature.state, use)) {
    throw new GuildFeatureUseBlockedError(featureKey, use, feature.state)
  }
  return feature
}

export function isGuildFeatureUseBlockedError(
  error: unknown,
): error is GuildFeatureUseBlockedError {
  return error instanceof GuildFeatureUseBlockedError
}
