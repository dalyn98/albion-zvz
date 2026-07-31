import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import {
  TACTICS_EXPERIMENTAL_SETTING_KEY,
  isTacticsExperimentalSettingEnabled,
} from './feature'

export async function isTacticsExperimentalEnabled(
  guildId: string,
): Promise<boolean> {
  const value = await getAppSetting(
    TACTICS_EXPERIMENTAL_SETTING_KEY,
    'false',
    guildId,
  )
  return isTacticsExperimentalSettingEnabled(value)
}

export async function requireTacticsExperimentalEnabled(
  guildId: string,
): Promise<void> {
  if (!(await isTacticsExperimentalEnabled(guildId))) {
    throw new TacticsExperimentalDisabledError()
  }
}

export class TacticsExperimentalDisabledError extends Error {
  constructor() {
    super('TACTICS_EXPERIMENTAL_DISABLED')
    this.name = 'TacticsExperimentalDisabledError'
  }
}

export function isTacticsExperimentalDisabledError(
  error: unknown,
): error is TacticsExperimentalDisabledError {
  return error instanceof TacticsExperimentalDisabledError
}
