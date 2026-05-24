import { getAppSetting } from '@/lib/app-settings'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  LOG_OPERATING_START_KEYS,
  parseLogOperatingStart,
  type LogOperatingStartDomain,
} from '@/lib/log-operating-start'

export async function getLogOperatingStart(
  domain: LogOperatingStartDomain,
  guildId: string,
): Promise<Date | null> {
  const [raw, timezone] = await Promise.all([
    getAppSetting(LOG_OPERATING_START_KEYS[domain], '', guildId),
    getTenantTimezone(guildId),
  ])
  return parseLogOperatingStart(raw, timezone)
}
