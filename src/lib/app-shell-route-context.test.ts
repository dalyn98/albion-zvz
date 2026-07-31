import { describe, expect, it } from 'vitest'
import { resolveAppShellRouteContext } from './app-shell-route-context'

describe('resolveAppShellRouteContext', () => {
  it('keeps the tenant root inside the authenticated app shell', () => {
    expect(resolveAppShellRouteContext({
      pathname: '/',
      hostKind: 'tenant',
      isPublicByPathname: true,
      isMarketingByPathname: true,
      shouldSkipSessionByPathname: true,
    })).toEqual({
      isPublic: false,
      isMarketing: false,
      shouldSkipSession: false,
    })
  })

  it('keeps the canonical root classified as public marketing', () => {
    expect(resolveAppShellRouteContext({
      pathname: '/',
      hostKind: 'root',
      isPublicByPathname: true,
      isMarketingByPathname: true,
      shouldSkipSessionByPathname: true,
    })).toEqual({
      isPublic: true,
      isMarketing: true,
      shouldSkipSession: true,
    })
  })

  it('does not change ordinary tenant application routes', () => {
    expect(resolveAppShellRouteContext({
      pathname: '/events',
      hostKind: 'tenant',
      isPublicByPathname: false,
      isMarketingByPathname: false,
      shouldSkipSessionByPathname: false,
    })).toEqual({
      isPublic: false,
      isMarketing: false,
      shouldSkipSession: false,
    })
  })
})
