export type AdminEventWorkspaceSection = 'events' | 'templates'
export type AdminShopView = 'overview' | 'sync' | 'catalog' | 'settings'

export function isMemberEventsWorkspace(pathname: string | null): boolean {
  return pathname === '/events'
}

export function resolveAdminEventWorkspaceSection(
  value: string | undefined,
): AdminEventWorkspaceSection {
  return value === 'templates' ? 'templates' : 'events'
}

export function resolveAdminShopView(value: string | undefined): AdminShopView {
  if (value === 'sync' || value === 'catalog' || value === 'settings')
    return value
  return 'overview'
}
