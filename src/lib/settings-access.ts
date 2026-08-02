import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'

export type SettingsTabKey =
  | 'guild'
  | 'features'
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
  roleRewards: boolean
  workspaceLifecycle: boolean
}

export const SETTINGS_PAGE_CAPABILITIES = [
  CAP.SETTINGS_GENERAL,
  CAP.SETTINGS_TOGGLES,
  CAP.SETTINGS_GUILD_PROFILE,
  CAP.SETTINGS_PERMISSIONS,
  CAP.INVENTORY_MANAGE,
  CAP.CHEST_LOG_PASTE,
  CAP.SIPHON_MANAGE,
  CAP.WORKSPACE_DELETE,
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
    // 역할 보상 액션은 아직 legacy admin gate 를 사용한다.
    roleRewards: isAdmin,
    workspaceLifecycle: can([CAP.WORKSPACE_DELETE]),
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
    access.workspaceLifecycle
  ) {
    tabs.push('guild')
  }
  if (access.toggles) tabs.push('features')
  if (access.permissions) tabs.push('permissions')
  if (access.notifications) tabs.push('notifications')
  if (access.general || access.toggles) tabs.push('events')
  if (access.general || access.toggles || access.roleRewards) tabs.push('regear')
  if (access.guildProfile) tabs.push('landing')

  return tabs
}
