import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/events/[id]/state/route.ts'),
  'utf8',
)

describe('event state route security boundary', () => {
  it('validates event identifiers before database work and rate-limits snapshot reads', () => {
    expect(routeSource).toContain('parseEventStateId')
    expect(routeSource).toContain('checkEventStateRateLimit')
    expect(routeSource).toContain("status: 429")
    expect(routeSource).toContain("status: 503")
    expect(routeSource).toContain('session.eventScope !== id')
    expect(routeSource).not.toContain('resolvePublicEventPageGuildId')
    expect(routeSource).not.toContain("searchParams.get('invite')")
    expect(routeSource.indexOf('const id = parseEventStateId')).toBeLessThan(
      routeSource.indexOf('const db = getAdminClient()'),
    )
  })
})
