import { getAppSetting } from '@/lib/app-settings'

export interface AdminPermissionRoleSettings {
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
  const [activeMemberRoleIdsRaw, lastMemberSyncAtRaw] = await Promise.all([
    getAppSetting('active_member_role_ids', '[]', tenantId),
    getAppSetting('last_member_sync_at', '', tenantId),
  ])

  return {
    activeMemberRoleIds: parseRoleIdsSetting(activeMemberRoleIdsRaw),
    lastMemberSyncAt: lastMemberSyncAtRaw || null,
  }
}
