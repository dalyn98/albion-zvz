import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function routeSources(root: string): Array<{ path: string; source: string }> {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return routeSources(path)
    return entry.name === 'route.ts'
      ? [{ path: path.replace(`${process.cwd()}/`, ''), source: readFileSync(path, 'utf8') }]
      : []
  })
}

const apiRoot = join(process.cwd(), 'src', 'app', 'api')
const routes = routeSources(apiRoot)

describe('API route guard contract', () => {
  it('routes every cron endpoint through the shared authorization and lease guard', () => {
    const violations = routes
      .filter(({ path }) => path.includes('/api/cron/'))
      .filter(({ source }) => !source.includes('withCronRun('))
      .map(({ path }) => path)

    expect(violations).toEqual([])
  })

  it('protects every operational admin endpoint with super-admin or cron auth', () => {
    const violations = routes
      .filter(({ path }) => path.includes('/api/admin/'))
      .filter(
        ({ source }) =>
          !source.includes('getSuperAdminSession(') &&
          !source.includes('validateCronRequest(') &&
          !(
            source.includes('getSession(') &&
            source.includes('session?.isAdmin')
          ),
      )
      .map(({ path }) => path)

    expect(violations).toEqual([])
  })

  it('keeps the test-session route behind both environment and secret gates', () => {
    const route = routes.find(({ path }) => path.endsWith('/api/test/auth/session/route.ts'))
    expect(route?.source).toContain('isTestAuthRouteEnabled()')
    expect(route?.source).toContain('isValidTestAuthSecret(')
  })
})
