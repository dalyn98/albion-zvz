import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES = ['ko', 'ja', 'en', 'zh'] as const

type Messages = {
  adminGuide: { battles: { body: string } }
  publicFaq: { a3: string }
  demo: { battles: { notice: string; ctaDescription: string } }
}

function messages(locale: (typeof LOCALES)[number]): Messages {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as Messages
}

describe('product copy integrity', () => {
  it('describes tenant battle collection with the deployed five-minute cadence', () => {
    const vercelConfig = readFileSync(join(process.cwd(), 'vercel.ts'), 'utf8')
    expect(vercelConfig).toContain(
      "{ path: '/api/cron/battle-tracker', schedule: '*/5 * * * *' }",
    )

    const hourlyPattern = /매시간|hourly|every hour|毎時|每小时/i
    for (const locale of LOCALES) {
      const doc = messages(locale)
      expect(doc.adminGuide.battles.body, locale).not.toMatch(hourlyPattern)
      expect(doc.demo.battles.notice, locale).not.toMatch(hourlyPattern)
      expect(doc.demo.battles.ctaDescription, locale).not.toMatch(hourlyPattern)
      expect(doc.adminGuide.battles.body, locale).toContain('5')
      expect(doc.demo.battles.notice, locale).toContain('5')
      expect(doc.demo.battles.ctaDescription, locale).toContain('5')
    }
  })

  it('describes the free offer as beta-period access in every locale', () => {
    expect(Object.fromEntries(LOCALES.map((locale) => [locale, messages(locale).publicFaq.a3]))).toEqual({
      ko: '정식 출시 전 베타 기간에는 모든 기능을 무료로 사용할 수 있습니다.',
      ja: '正式リリース前のベータ期間中は、すべての機能を無料で利用できます。',
      en: 'All features are free during the beta period before the full release.',
      zh: '正式发布前的测试阶段，所有功能均可免费使用。',
    })
  })
})
