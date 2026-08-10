import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locales'

const LOCALES = SUPPORTED_LOCALES

interface Messages {
  publicFeatures: Record<string, string>
  craftQueue: Record<string, string>
  demo: {
    craft: Record<string, string>
  }
}

function loadMessages(locale: Locale): Messages {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as Messages
}

const FORBIDDEN_CRAFT_AGGREGATE_COPY: Partial<Record<Locale, RegExp>> = {
  ko: /자재\s*BoM|장비\/재료|재료\s*합산/,
  en: /material\s*BoM|raw materials|material aggregate|equipment and materials/i,
  ja: /材料\s*BoM|装備・素材|素材合計/,
  zh: /材料\s*BoM|原材料|材料汇总|材料明细|装备和材料/,
}

describe('craft regear public copy', () => {
  it('does not claim raw-material or BoM aggregation for crafted regear', () => {
    for (const locale of LOCALES) {
      const messages = loadMessages(locale)
      const checkedCopy = [
        messages.publicFeatures.f5Bullet2,
        messages.craftQueue.myTasksPageDescription,
        messages.craftQueue.myTasksLinkHint,
        messages.craftQueue.aggregateMineTitle,
        messages.craftQueue.aggregateMineHint,
        messages.craftQueue.aggregateHint,
        messages.demo.craft.myTasksNotice,
        messages.demo.craft.linkMyTasks,
      ].join('\n')

      const forbidden = FORBIDDEN_CRAFT_AGGREGATE_COPY[locale]
      if (forbidden) expect(checkedCopy).not.toMatch(forbidden)
    }
  })
})
