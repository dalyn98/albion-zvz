import { getAppSetting } from '@/lib/app-settings'
import { getTenantDiscordConfig } from '@/lib/tenant'

export interface AdminPermissionRoleSettings {
  adminRoleIds: string[]
  eventCreatorRoleIds: string[]
  eventCreatorCombatRoleIds: string[]
  eventCreatorFfRoleIds: string[]
  eventCreatorGankingRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
}

export function parseRoleIdsSetting(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

export async function loadAdminPermissionRoleSettings(
  tenantId: string,
): Promise<AdminPermissionRoleSettings> {
  const tenantConfig = await getTenantDiscordConfig(tenantId)
  const [
    eventCreatorRoleIdsRaw,
    eventCreatorCombatIdsRaw,
    eventCreatorFfIdsRaw,
    eventCreatorGankingIdsRaw,
    bombSquadCallerRoleIdsRaw,
    activeMemberRoleIdsRaw,
    lastMemberSyncAtRaw,
  ] = await Promise.all([
    getAppSetting('event_creator_role_ids', '[]', tenantId),
    getAppSetting('event_creator_role_ids_combat', '[]', tenantId),
    getAppSetting('event_creator_role_ids_ff', '[]', tenantId),
    getAppSetting('event_creator_role_ids_ganking', '[]', tenantId),
    getAppSetting('bomb_squad_caller_role_ids', '[]', tenantId),
    getAppSetting('active_member_role_ids', '[]', tenantId),
    getAppSetting('last_member_sync_at', '', tenantId),
  ])

  return {
    adminRoleIds: tenantConfig?.adminRoleIds ?? [],
    eventCreatorRoleIds: parseRoleIdsSetting(eventCreatorRoleIdsRaw),
    eventCreatorCombatRoleIds: parseRoleIdsSetting(eventCreatorCombatIdsRaw),
    eventCreatorFfRoleIds: parseRoleIdsSetting(eventCreatorFfIdsRaw),
    eventCreatorGankingRoleIds: parseRoleIdsSetting(eventCreatorGankingIdsRaw),
    bombSquadCallerRoleIds: parseRoleIdsSetting(bombSquadCallerRoleIdsRaw),
    activeMemberRoleIds: parseRoleIdsSetting(activeMemberRoleIdsRaw),
    lastMemberSyncAt: lastMemberSyncAtRaw || null,
  }
}
