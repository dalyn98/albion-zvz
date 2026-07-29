import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import { isMenheraAllianceContentComplianceEnabled } from '@/lib/alliance-content-compliance'
import { getTenantDiscordConfig } from '@/lib/tenant'

export async function isAllianceContentComplianceAvailable(guildId: string): Promise<boolean> {
  const [tenant, enabledSetting] = await Promise.all([
    getTenantDiscordConfig(guildId),
    getAppSetting('alliance_content_compliance_enabled', 'false', guildId),
  ])
  return isMenheraAllianceContentComplianceEnabled(tenant?.slug, enabledSetting)
}

export async function requireAllianceContentComplianceAvailable(guildId: string): Promise<void> {
  if (!(await isAllianceContentComplianceAvailable(guildId))) {
    throw new Error('ALLIANCE_CONTENT_FEATURE_UNAVAILABLE')
  }
}
