import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locales'

function flattenMessages(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenMessages(child, prefix ? `${prefix}.${key}` : key),
  )
}

function loadMessages(locale: Locale): Map<string, unknown> {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as unknown
  return new Map(flattenMessages(raw).filter(([key]) => !key.startsWith('superAdmin.')))
}

function placeholderSignature(value: unknown): string {
  if (typeof value !== 'string' || !value.includes('{')) return ''
  const names = new Set<string>()

  function visit(elements: readonly MessageFormatElement[]): void {
    for (const element of elements) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        names.add(element.value)
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        Object.values(element.options).forEach((option) => visit(option.value))
      }
      if (element.type === TYPE.tag) visit(element.children)
    }
  }

  visit(parse(value))
  return [...names].sort().join(',')
}

describe('all supported locale messages', () => {
  const documents = new Map(SUPPORTED_LOCALES.map((locale) => [locale, loadMessages(locale)]))
  const baseline = documents.get('ko')!
  const baselineKeys = [...baseline.keys()].sort()

  it('keeps the complete non-super-admin key set equal across every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect([...documents.get(locale)!.keys()].sort(), locale).toEqual(baselineKeys)
    }
  })

  it('keeps ICU placeholder names equal across every locale', () => {
    for (const key of baselineKeys) {
      const signatures = SUPPORTED_LOCALES.map((locale) =>
        placeholderSignature(documents.get(locale)!.get(key)),
      )
      expect(new Set(signatures).size, key).toBe(1)
    }
  })
})
