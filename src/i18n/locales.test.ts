import { describe, expect, it } from 'vitest'
import {
  getHreflangLocale,
  getIntlLocale,
  getLocaleDirection,
  resolveSupportedLocale,
  SUPPORTED_LOCALES,
} from './locales'

describe('Albion supported locales', () => {
  it('covers all 17 Albion Online interface languages', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(17)
    expect(new Set(SUPPORTED_LOCALES).size).toBe(17)
  })

  it('normalizes browser and legacy locale tags', () => {
    expect(resolveSupportedLocale('zh_CN')).toBe('zh')
    expect(resolveSupportedLocale('zh-Hant-TW')).toBe('zh-Hant')
    expect(resolveSupportedLocale('es-AR')).toBe('es-419')
    expect(resolveSupportedLocale('pt')).toBe('pt-BR')
    expect(resolveSupportedLocale('ar-SA')).toBe('ar')
    expect(resolveSupportedLocale('nl-NL')).toBeNull()
  })

  it('publishes valid HTML and Google-facing language metadata', () => {
    expect(getIntlLocale('zh')).toBe('zh-Hans')
    expect(getHreflangLocale('es-419')).toBe('es')
    expect(getHreflangLocale('zh-Hant')).toBe('zh-Hant')
    expect(getLocaleDirection('ar')).toBe('rtl')
    expect(getLocaleDirection('en')).toBe('ltr')
  })
})
