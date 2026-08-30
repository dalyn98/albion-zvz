import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('performance platform configuration', () => {
  it('keeps the website in Seoul without registering background cron work', () => {
    const config = readFileSync(join(root, 'vercel.ts'), 'utf8')
    const productionVerify = readFileSync(
      join(root, '.github/workflows/production-verify.yml'),
      'utf8',
    )

    expect(config).toContain("regions: ['icn1']")
    expect(config).not.toContain('crons:')
    expect(config).not.toContain("path: '/api/cron/")
    expect(productionVerify).not.toContain('schedule:')
    expect(productionVerify).not.toContain('cron:')
  })

  it('uses one typed Vercel configuration source', () => {
    const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

    expect(() => readFileSync(join(root, 'vercel.json'), 'utf8')).toThrow()
    expect(packageJson).toContain('"@vercel/config"')
  })

  it('does not load paid observability clients from the root layout', () => {
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8')
    const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

    expect(layout).not.toContain('@vercel/speed-insights')
    expect(layout).not.toContain('<SpeedInsights />')
    expect(packageJson).not.toContain('"@vercel/speed-insights"')
    expect(packageJson).not.toContain('"@sentry/nextjs"')
  })
})
