import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'

export type SettingsTabKey =
  | 'guild'
  | 'permissions'
  | 'notifications'
  | 'events'
  | 'regear'
  | 'landing'

export interface SettingsAccessFlags {
  general: boolean
  toggles: boolean
  permissions: boolean
  notifications: boolean
  guildProfile: boolean
  shopChestLogStart: boolean
  siphonLogStart: boolean
  lootAuditLogStart: boolean
  roleRewards: boolean
}

export const SETTINGS_PAGE_CAPABILITIES = [
  CAP.SETTINGS_GENERAL,
  CAP.SETTINGS_TOGGLES,
  CAP.SETTINGS_GUILD_PROFILE,
  CAP.SETTINGS_PERMISSIONS,
  CAP.INVENTORY_MANAGE,
  CAP.CHEST_LOG_PASTE,
  CAP.SIPHON_MANAGE,
] as const

export function getSettingsAccessFlags(
  isAdmin: boolean,
  rawCapabilities: string | null | undefined,
): SettingsAccessFlags {
  const bits = parseCapabilities(rawCapabilities)
  const can = (caps: readonly bigint[]): boolean =>
    isAdmin || hasAnyCapability(bits, caps)

  return {
    general: can([CAP.SETTINGS_GENERAL]),
    toggles: can([CAP.SETTINGS_TOGGLES]),
    permissions: can([CAP.SETTINGS_PERMISSIONS]),
    notifications: can([CAP.SETTINGS_PERMISSIONS]),
    guildProfile: can([CAP.SETTINGS_GUILD_PROFILE]),
    shopChestLogStart: can([CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE]),
    siphonLogStart: can([CAP.SIPHON_MANAGE]),
    lootAuditLogStart: can([CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE]),
    // 역할 보상 액션은 아직 legacy admin gate 를 사용한다.
    roleRewards: isAdmin,
  }
}

export function getAvailableSettingsTabs(
  access: SettingsAccessFlags,
): SettingsTabKey[] {
  const tabs: SettingsTabKey[] = []

  if (
    access.general ||
    access.toggles ||
    access.shopChestLogStart ||
    access.siphonLogStart ||
    access.lootAuditLogStart
  ) {
    tabs.push('guild')
  }
  if (access.permissions) tabs.push('permissions')
  if (access.notifications) tabs.push('notifications')
  if (access.general || access.toggles) tabs.push('events')
  if (access.general || access.toggles || access.roleRewards) tabs.push('regear')
  if (access.guildProfile) tabs.push('landing')

  return tabs
}
