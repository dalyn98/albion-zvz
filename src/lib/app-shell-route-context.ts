interface AppShellRouteContextInput {
  pathname: string
  hostKind: string
  isPublicByPathname: boolean
  isMarketingByPathname: boolean
  shouldSkipSessionByPathname: boolean
}

export interface AppShellRouteContext {
  isPublic: boolean
  isMarketing: boolean
  shouldSkipSession: boolean
}

export function resolveAppShellRouteContext(
  input: AppShellRouteContextInput,
): AppShellRouteContext {
  const isTenantAppHome =
    input.hostKind === 'tenant' && input.pathname === '/'

  return {
    isPublic: input.isPublicByPathname && !isTenantAppHome,
    isMarketing: input.isMarketingByPathname && !isTenantAppHome,
    shouldSkipSession:
      input.shouldSkipSessionByPathname && !isTenantAppHome,
  }
}
