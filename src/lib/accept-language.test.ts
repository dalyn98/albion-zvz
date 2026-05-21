import { describe, expect, it } from 'vitest'
import { detectLocaleFromAcceptLanguage } from './accept-language'

describe('detectLocaleFromAcceptLanguage', () => {
  it('matches supported regional language tags', () => {
    expect(detectLocaleFromAcceptLanguage('en-US,en;q=0.8')).toBe('en')
    expect(detectLocaleFromAcceptLanguage('ja-JP,ja;q=0.9,en;q=0.5')).toBe('ja')
    expect(detectLocaleFromAcceptLanguage('zh-TW,zh;q=0.7,en;q=0.3')).toBe('zh')
  })

  it('respects q-value priority', () => {
    expect(detectLocaleFromAcceptLanguage('en;q=0.4,ko;q=0.9,ja;q=0.8')).toBe('ko')
  })

  it('falls back when no supported language exists', () => {
    expect(detectLocaleFromAcceptLanguage('fr-FR,es;q=0.8')).toBe('ko')
    expect(detectLocaleFromAcceptLanguage(null, 'en')).toBe('en')
  })
})
