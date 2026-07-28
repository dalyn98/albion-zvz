import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import { isAllianceContentComplianceEnabled } from '@/lib/alliance-content-compliance'

export async function isAllianceContentComplianceAvailable(guildId: string): Promise<boolean> {
  const enabledSetting = await getAppSetting(
    'alliance_content_compliance_enabled',
    'false',
    guildId,
  )
  return isAllianceContentComplianceEnabled(enabledSetting)
}

export async function requireAllianceContentComplianceAvailable(guildId: string): Promise<void> {
  if (!(await isAllianceContentComplianceAvailable(guildId))) {
    throw new Error('ALLIANCE_CONTENT_FEATURE_UNAVAILABLE')
  }
}
