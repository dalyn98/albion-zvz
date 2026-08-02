'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import {
  isConfigurableGuildFeatureKey,
  type GuildFeatureState,
  type GuildFeatureTargetState,
} from '@/lib/guild-features'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { markPublicGuildProfileCacheStale } from '@/lib/guild-profile-cache'
import { logAdminAction } from '@/lib/admin-audit'
import { publicActionError } from '@/lib/public-action-error'

interface ChangeGuildFeatureStateInput {
  featureKey: string
  targetState: GuildFeatureTargetState
  config?: Record<string, unknown>
}

interface ChangeGuildFeatureStateResult {
  error?: string
  state?: GuildFeatureState
  openWork?: boolean
}

const TARGET_STATES = new Set<GuildFeatureTargetState>([
  'disabled',
  'setup_required',
  'enabled',
])

export async function changeGuildFeatureState(
  input: ChangeGuildFeatureStateInput,
): Promise<ChangeGuildFeatureStateResult> {
  const tErr = await getTranslations('adminActionError')
  if (
    !input ||
    typeof input !== 'object' ||
    !isConfigurableGuildFeatureKey(input.featureKey) ||
    !TARGET_STATES.has(input.targetState) ||
    (input.config !== undefined && (
      !input.config ||
      typeof input.config !== 'object' ||
      Array.isArray(input.config)
    ))
  ) {
    return { error: tErr('invalidInput') }
  }

  try {
    const db = await requireAnyCapability([CAP.SETTINGS_TOGGLES])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db.rpc('change_guild_feature_state', {
      p_guild_id: guildId,
      p_feature_key: input.featureKey,
      p_target_state: input.targetState,
      p_config: input.config ?? {},
      p_actor_discord_id: session.discordId,
    })
    if (error) {
      return {
        error: await publicActionError(error, 'actions/guild-features.change'),
      }
    }

    const result = data as {
      state?: GuildFeatureState
      openWork?: boolean
    } | null
    invalidateAppSettingsCache(guildId)
    if (input.featureKey === 'public_guild_profile') {
      await markPublicGuildProfileCacheStale(guildId)
    }
    revalidatePath('/', 'layout')
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/admin/dashboard', 'layout')
    revalidatePath('/shop')
    revalidatePath('/market')
    revalidatePath('/tactics')
    revalidatePath('/craft', 'layout')
    revalidatePath('/public/g/[slug]', 'page')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: {
        kind: 'guild_feature_state',
        featureKey: input.featureKey,
        targetState: input.targetState,
        resultingState: result?.state ?? input.targetState,
        openWork: result?.openWork === true,
      },
    })
    return {
      state: result?.state ?? input.targetState,
      openWork: result?.openWork === true,
    }
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/guild-features.change'),
    }
  }
}
