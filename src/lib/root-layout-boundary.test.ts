import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('root layout boundary', () => {
  it('keeps the root layout static and free of request/session chrome', () => {
    const source = read('src/app/layout.tsx')

    expect(source).toContain("import './globals.css'")
    expect(source).toContain('<html')
    expect(source).toContain('<body')
    expect(source).not.toContain("from 'next/headers'")
    expect(source).not.toContain('getSession')
    expect(source).not.toContain('getMessages')
    expect(source).not.toContain('NextIntlClientProvider')
    expect(source).not.toContain('AppShell')
    expect(source).not.toContain('SystemNoticesBanner')
    expect(source).not.toContain('ToastProvider')
  })

  it('moves app chrome and public intl providers into route groups', () => {
    const appShellLayout = 'src/app/(app-shell)/layout.tsx'
    const publicShellLayout = 'src/app/(public-shell)/layout.tsx'
    const publicIntlLayouts = [
      {
        layout: 'src/app/(public-shell)/public/(marketing)/layout.tsx',
        provider: 'MarketingIntlProvider',
      },
      {
        layout: 'src/app/(public-shell)/demo/layout.tsx',
        provider: 'SafeIntlProvider',
      },
      {
        layout: 'src/app/(public-shell)/public/u/layout.tsx',
        provider: 'SafeIntlProvider',
      },
      {
        layout: 'src/app/(public-shell)/tactics/share/layout.tsx',
        provider: 'SafeIntlProvider',
      },
    ]

    expect(existsSync(join(process.cwd(), appShellLayout))).toBe(true)
    expect(read(appShellLayout)).toContain('AppShell')
    expect(read(appShellLayout)).toContain('SafeIntlProvider')

    expect(existsSync(join(process.cwd(), publicShellLayout))).toBe(true)
    expect(read(publicShellLayout)).not.toContain('NextIntlClientProvider')
    expect(read(publicShellLayout)).not.toContain('getSession')
    expect(read(publicShellLayout)).not.toMatch(/import .*AppShell|<AppShell/)

    expect(read('src/components/MarketingIntlProvider.tsx')).toContain('SafeIntlProvider')
    expect(read('src/components/SafeIntlProvider.tsx')).toContain('NextIntlClientProvider')

    for (const { layout, provider } of publicIntlLayouts) {
      expect(existsSync(join(process.cwd(), layout)), layout).toBe(true)
      expect(read(layout), layout).toContain(provider)
      expect(read(layout), layout).not.toContain('getSession')
      expect(read(layout), layout).not.toMatch(/import .*AppShell|<AppShell/)
    }
  })

  it('configures a global timezone for next-intl server and client providers', () => {
    const requestConfig = read('src/i18n/request.ts')
    const safeProvider = read('src/components/SafeIntlProvider.tsx')

    expect(requestConfig).toContain("import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'")
    expect(requestConfig).toContain('timeZone: DEFAULT_TENANT_TIMEZONE')
    expect(safeProvider).toContain("import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'")
    expect(safeProvider).toContain('timeZone={props.timeZone ?? DEFAULT_TENANT_TIMEZONE}')
  })
})
