import { getAppSetting } from '@/lib/app-settings'
import {
  LOG_OPERATING_START_KEYS,
  parseStoredLogOperatingStart,
  type LogOperatingStartDomain,
} from '@/lib/log-operating-start'

export async function getLogOperatingStart(
  domain: LogOperatingStartDomain,
  guildId: string,
): Promise<Date | null> {
  const raw = await getAppSetting(LOG_OPERATING_START_KEYS[domain], '', guildId)
  return parseStoredLogOperatingStart(raw)
}
