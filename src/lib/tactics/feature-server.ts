import 'server-only'

import { getGuildFeature } from '@/lib/guild-features-server'

export async function isTacticsExperimentalEnabled(
  guildId: string,
): Promise<boolean> {
  return (await getGuildFeature(guildId, 'tactics')).state === 'enabled'
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
