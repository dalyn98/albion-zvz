import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locales'

const LOCALES = SUPPORTED_LOCALES

type Messages = {
  adminGuide: { battles: { body: string } }
  publicFaq: { a3: string }
  demo: { battles: { notice: string; ctaDescription: string } }
}

function messages(locale: Locale): Messages {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as Messages
}

describe('product copy integrity', () => {
  it('describes automatic tenant battle collection as paused', () => {
    const vercelConfig = readFileSync(join(process.cwd(), 'vercel.ts'), 'utf8')
    expect(vercelConfig).not.toContain("path: '/api/cron/battle-tracker'")

    const activeCadencePattern =
      /5분마다|5-minute|every 5 minutes|5分ごと|每 ?5 ?分钟|toutes les 5 minutes|alle 5 Minuten|cada 5 minutos|co 5 minut|каждые 5 минут|ogni 5 minuti|setiap 5 menit|كل 5 دقائق|her 5 dakikada/i
    const pausedPattern =
      /중지|停止|paused|已暂停|已暫停|suspendue|pausiert|pausada|wstrzym|приостановлен|sospesa|dijeda|متوقف|duraklatıldı/i
    for (const locale of LOCALES) {
      const doc = messages(locale)
      expect(doc.adminGuide.battles.body, locale).not.toMatch(activeCadencePattern)
      expect(doc.demo.battles.notice, locale).not.toMatch(activeCadencePattern)
      expect(doc.demo.battles.ctaDescription, locale).not.toMatch(activeCadencePattern)
      expect(doc.adminGuide.battles.body, locale).toMatch(pausedPattern)
      expect(doc.demo.battles.notice, locale).toMatch(pausedPattern)
      expect(doc.demo.battles.ctaDescription, locale).toMatch(pausedPattern)
    }
  })

  it('describes the free offer as beta-period access in every locale', () => {
    const copy = Object.fromEntries(LOCALES.map((locale) => [locale, messages(locale).publicFaq.a3]))
    expect(copy).toMatchObject({
      ko: '정식 출시 전 베타 기간에는 모든 기능을 무료로 사용할 수 있습니다.',
      ja: '正式リリース前のベータ期間中は、すべての機能を無料で利用できます。',
      en: 'All features are free during the beta period before the full release.',
      zh: '正式发布前的测试阶段，所有功能均可免费使用。',
    })
    for (const locale of LOCALES) expect(copy[locale]?.trim(), locale).toBeTruthy()
  })
})
