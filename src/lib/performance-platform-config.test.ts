import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('performance platform configuration', () => {
  it('runs Vercel functions through the verified Seoul dependency path and preserves every cron', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')

    expect(config).toContain("regions: ['icn1']")
    expect(config.match(/path:\s*'\/api\/cron\//g)).toHaveLength(20)
    expect(config).toContain(
      "path: '/api/cron/event-participation-notifications'",
    )
    expect(config).toContain("path: '/api/cron/support-tickets'")
    expect(config).toContain("path: '/api/cron/support-ai'")
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog', schedule: '*/5 * * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog-recovery', schedule: '17 * * * *' }",
    )
    expect(config).toContain(
      "{ path: '/api/cron/tenant-lifecycle', schedule: '20 18 * * *' }",
    )
  })

  it('uses one typed Vercel configuration source', () => {
    const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

    expect(() => readFileSync(join(root, 'vercel.json'), 'utf8')).toThrow()
    expect(packageJson).toContain('"@vercel/config"')
  })

  it('relays only authenticated Supabase requests without injecting credentials', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')
    const adminClient = readFileSync(
      join(root, 'src/lib/supabase-admin.ts'),
      'utf8',
    )

    expect(config).toContain("source: '/api/_supabase/:path*'")
    expect(config).toContain(
      "destination: 'https://vyucnuraaniktvfrgqxg.supabase.co/:path*'",
    )
    expect(config).toContain("matchers.header('apikey')")
    expect(config).toContain("matchers.header('authorization')")
    expect(config).not.toContain('requestHeaders')
    expect(adminClient).toContain(
      "'https://albion-guildmanager.com/api/_supabase'",
    )
    expect(adminClient).toContain("process.env.VERCEL_ENV === 'production'")
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
