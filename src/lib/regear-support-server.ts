import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import {
  REGEAR_SUPPORT_DISABLED_ERROR,
  resolveRegearSupportConfiguration,
  type RegearSupportConfiguration,
  type RegearSupportState,
} from '@/lib/regear-support'

export async function getRegearSupportConfiguration(
  guildId: string,
): Promise<RegearSupportConfiguration> {
  const [supportRaw, craftRegearEnabledRaw] = await Promise.all([
    getAppSetting('regear_support_enabled', '', guildId),
    getAppSetting('craft_regear_enabled', 'false', guildId),
  ])
  return resolveRegearSupportConfiguration({
    supportRaw,
    craftRegearEnabledRaw,
  })
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
