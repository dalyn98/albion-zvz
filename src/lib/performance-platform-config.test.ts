import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('performance platform configuration', () => {
  it('runs only the automatic regear pipeline through the verified Seoul dependency path', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')

    expect(config).toContain("regions: ['icn1']")
    expect(config.match(/path:\s*'\/api\/cron\//g)).toHaveLength(6)
    expect(config).toContain(
      "{ path: '/api/cron/event-auto-start', schedule: '* * * * *' }",
    )
    expect(config).toContain(
      "path: '/api/cron/event-participation-notifications'",
    )
    expect(config).toContain(
      "{ path: '/api/cron/auto-regear', schedule: '2-59/10 * * * *' }",
    )
    expect(config).toContain("schedule: '6-59/10 * * * *'")
    expect(config).toContain(
      "{ path: '/api/cron/account-albion-sync', schedule: '30 19 * * *' }",
    )
    for (const disabledJob of [
      'admin-notification-digest',
      'albion-roster-sync',
      'daily-maintenance',
      'event-imminent',
      'killbot-feed',
      'member-sync',
      'public-battlelog',
      'public-battlelog-recovery',
      'public-battlelog-rollups',
      'search-console-sync',
      'shop-price-sync',
      'support-ai',
      'support-tickets',
      'tenant-lifecycle',
    ]) {
      expect(config).not.toContain(`path: '/api/cron/${disabledJob}'`)
    }
  })

  it('uses one typed Vercel configuration source', () => {
    const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

    expect(() => readFileSync(join(root, 'vercel.json'), 'utf8')).toThrow()
    expect(packageJson).toContain('"@vercel/config"')
  })

  it('collects real-user Core Web Vitals from the root layout', () => {
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8')
    const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

    expect(layout).toContain("from '@vercel/speed-insights/next'")
    expect(layout).toContain('<SpeedInsights />')
    expect(layout).toContain("process.env.VERCEL === '1'")
    expect(packageJson).toContain('"@vercel/speed-insights"')
  })
})
