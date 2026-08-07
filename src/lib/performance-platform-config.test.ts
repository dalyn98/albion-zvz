import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('performance platform configuration', () => {
  it('runs Vercel functions through the verified Seoul dependency path and preserves every cron', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')

    expect(config).toContain("regions: ['icn1']")
    expect(config.match(/path:\s*'\/api\/cron\//g)).toHaveLength(19)
    expect(config).toContain(
      "path: '/api/cron/event-participation-notifications'",
    )
    expect(config).toContain("path: '/api/cron/support-tickets'")
    expect(config).toContain("path: '/api/cron/support-ai'")
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog', schedule: '3-59/5 * * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog-recovery', schedule: '17 * * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog-rollups', schedule: '19 */6 * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/daily-maintenance', schedule: '0 18 * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/auto-regear', schedule: '2-59/10 * * * *' }",
    )
    expect(config).toContain("schedule: '6-59/10 * * * *'")
    expect(config).toContain(
      "{ path: '/api/cron/support-ai', schedule: '7-59/15 * * * *' }",
    )
    expect(config).not.toContain("path: '/api/cron/cleanup-screenshots'")
    expect(config).not.toContain("path: '/api/cron/craft-expire'")
    expect(config).not.toContain("path: '/api/cron/member-trade-expire'")
    expect(config).toContain(
      "{ path: '/api/cron/tenant-lifecycle', schedule: '20 18 * * *' }",
    )
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
