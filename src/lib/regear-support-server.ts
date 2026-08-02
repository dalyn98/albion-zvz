import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import {
  REGEAR_SUPPORT_DISABLED_ERROR,
  resolveRegearSupportConfiguration,
  type RegearSupportConfiguration,
  type RegearSupportState,
} from '@/lib/regear-support'
import { getGuildFeature } from '@/lib/guild-features-server'

export async function getRegearSupportConfiguration(
  guildId: string,
): Promise<RegearSupportConfiguration> {
  const [craftRegearEnabledRaw, feature] = await Promise.all([
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getGuildFeature(guildId, 'supply'),
  ])
  const featureMode = feature.config.mode === 'craft'
    ? 'true'
    : feature.config.mode === 'silver'
      ? 'false'
      : craftRegearEnabledRaw
  return resolveRegearSupportConfiguration({
    supportRaw: feature.state === 'enabled' || feature.state === 'draining'
      ? 'true'
      : feature.state === 'setup_required'
        ? ''
        : 'false',
    craftRegearEnabledRaw: featureMode,
  })
}

export async function isRegearIntakeEnabled(guildId: string): Promise<boolean> {
  return (await getGuildFeature(guildId, 'supply')).state === 'enabled'
}

export async function getRegearSupportState(
  guildId: string,
): Promise<RegearSupportState> {
  return (await getRegearSupportConfiguration(guildId)).state
}

export async function isRegearSupported(guildId: string): Promise<boolean> {
  return (await getRegearSupportConfiguration(guildId)).supported
}

export async function isCraftedRegearSupported(guildId: string): Promise<boolean> {
  const configuration = await getRegearSupportConfiguration(guildId)
  return (
    configuration.supported &&
    configuration.fulfillmentMode === 'crafted'
  )
}

export async function assertRegearSupported(guildId: string): Promise<void> {
  if (!(await isRegearSupported(guildId))) {
    throw new Error(REGEAR_SUPPORT_DISABLED_ERROR)
  }
}

export async function assertRegearIntakeEnabled(guildId: string): Promise<void> {
  if (!(await isRegearIntakeEnabled(guildId))) {
    throw new Error(REGEAR_SUPPORT_DISABLED_ERROR)
  }
}
