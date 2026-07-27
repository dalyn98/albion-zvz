import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('performance platform configuration', () => {
  it('runs Vercel functions beside the Sydney Supabase project and preserves every cron', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')

    expect(config).toContain("regions: ['syd1']")
    expect(config.match(/path:\s*'\/api\/cron\//g)).toHaveLength(15)
    expect(config).toContain(
      "{ path: '/api/cron/public-battlelog', schedule: '17 * * * *' }",
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
