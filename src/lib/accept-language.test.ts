import { describe, expect, it } from 'vitest'
import { detectLocaleFromAcceptLanguage } from './accept-language'

describe('detectLocaleFromAcceptLanguage', () => {
  it('matches supported regional language tags', () => {
    expect(detectLocaleFromAcceptLanguage('en-US,en;q=0.8')).toBe('en')
    expect(detectLocaleFromAcceptLanguage('ja-JP,ja;q=0.9,en;q=0.5')).toBe('ja')
    expect(detectLocaleFromAcceptLanguage('zh-CN,zh;q=0.7,en;q=0.3')).toBe('zh')
  })

  it('distinguishes Albion regional and script variants', () => {
    expect(detectLocaleFromAcceptLanguage('zh-TW,zh;q=0.7')).toBe('zh-Hant')
    expect(detectLocaleFromAcceptLanguage('zh-HK')).toBe('zh-Hant')
    expect(detectLocaleFromAcceptLanguage('es-ES,es;q=0.8')).toBe('es-ES')
    expect(detectLocaleFromAcceptLanguage('es-MX,es;q=0.8')).toBe('es-419')
    expect(detectLocaleFromAcceptLanguage('pt-PT,pt;q=0.8')).toBe('pt-PT')
    expect(detectLocaleFromAcceptLanguage('pt-BR,pt;q=0.8')).toBe('pt-BR')
  })

  it('respects q-value priority', () => {
    expect(detectLocaleFromAcceptLanguage('en;q=0.4,ko;q=0.9,ja;q=0.8')).toBe('ko')
  })

  it('falls back when no supported language exists', () => {
    expect(detectLocaleFromAcceptLanguage('nl-NL')).toBe('en')
    expect(detectLocaleFromAcceptLanguage(null, 'en')).toBe('en')
  })
})
