import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES = ['ko', 'ja', 'en', 'zh'] as const
const BASE_LOCALE = 'ko'
const SUPER_ADMIN_PREFIX = 'superAdmin.'

type Locale = (typeof LOCALES)[number]

function loadMessages(locale: Locale): unknown {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as unknown
}

function flattenMessages(value: unknown, prefix = ''): Map<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).reduce((out, [key, child]) => {
      for (const [childKey, childValue] of flattenMessages(
        child,
        prefix ? `${prefix}.${key}` : key,
      )) {
        out.set(childKey, childValue)
      }
      return out
    }, new Map<string, unknown>())
  }

  return new Map([[prefix, value]])
}

function placeholderNames(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const names = new Set<string>()
  const pattern = /{\s*([A-Za-z_$][\w$]*)\s*(?:[,}]|$)/g
  for (const match of value.matchAll(pattern)) {
    names.add(match[1])
  }
  return [...names].sort()
}

describe('i18n message parity', () => {
  const messages = Object.fromEntries(
    LOCALES.map((locale) => [locale, flattenMessages(loadMessages(locale))]),
  ) as Record<Locale, Map<string, unknown>>
  const baseMessages = messages[BASE_LOCALE]
  const requiredBaseKeys = [...baseMessages.keys()]
    .filter((key) => !key.startsWith(SUPER_ADMIN_PREFIX))
    .sort()

  it('keeps non-super-admin message keys identical across all locales', () => {
    const offenders: string[] = []

    for (const locale of LOCALES) {
      const localeKeys = [...messages[locale].keys()]
        .filter((key) => !key.startsWith(SUPER_ADMIN_PREFIX))
        .sort()
      const missing = requiredBaseKeys.filter((key) => !messages[locale].has(key))
      const extra = localeKeys.filter((key) => !baseMessages.has(key))

      if (missing.length > 0) offenders.push(`${locale} missing: ${missing.join(', ')}`)
      if (extra.length > 0) offenders.push(`${locale} extra: ${extra.join(', ')}`)
    }

    expect(offenders).toEqual([])
  })

  it('keeps placeholder variable names identical for keys present in each locale', () => {
    const offenders: string[] = []

    for (const locale of LOCALES.filter((locale) => locale !== BASE_LOCALE)) {
      for (const [key, baseValue] of baseMessages) {
        if (!messages[locale].has(key)) continue
        const basePlaceholders = placeholderNames(baseValue)
        const localePlaceholders = placeholderNames(messages[locale].get(key) ?? null)

        if (basePlaceholders.join('|') !== localePlaceholders.join('|')) {
          offenders.push(
            `${locale}.${key}: expected {${basePlaceholders.join(',')}} got {${localePlaceholders.join(',')}}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps shop quote labels in the namespaces used by the catalog UI', () => {
    const requiredKeys = [
      'shopCatalog.quoteRequired',
      'shopCatalog.cart.quotePendingTotal',
      'shopCatalog.cart.quoteRequiredHint',
      'shopCatalog.cart.quoteInvalidHint',
      'shopCatalog.cart.quoteRequiredLine',
      'shopCatalog.cart.quoteUnitSilverPlaceholder',
      'shopCatalog.cart.quotePending',
    ]
    const misplacedKeys = [
      'shopCatalog.itemType.quoteRequired',
      'time.quotePendingTotal',
      'time.quoteRequiredHint',
      'time.quoteInvalidHint',
    ]

    for (const locale of LOCALES) {
      for (const key of requiredKeys) {
        expect(messages[locale].has(key), `${locale}.${key}`).toBe(true)
      }
      for (const key of misplacedKeys) {
        expect(messages[locale].has(key), `${locale}.${key}`).toBe(false)
      }
    }
  })

  it('keeps slot role labels untranslated across every locale', () => {
    const canonicalLabels = new Map([
      ['slotRole.caller', 'Caller'],
      ['slotRole.offtank', 'Offense Tanker'],
      ['slotRole.deftank', 'Defense Tanker'],
      ['slotRole.support', 'Support'],
      ['slotRole.healer', 'Healer'],
      ['slotRole.dps', 'DPS'],
      ['slotRole.engageDps', 'Engage DPS'],
      ['slotRole.brawlerDps', 'Brawler DPS'],
      ['slotRole.battlemount', 'Battle Mount'],
      ['slotRole.other', 'Other'],
    ])

    for (const locale of LOCALES) {
      for (const [key, label] of canonicalLabels) {
        expect(messages[locale].get(key), `${locale}.${key}`).toBe(label)
      }
    }
  })
})
