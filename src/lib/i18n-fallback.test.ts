import { describe, expect, it } from 'vitest'
import {
  formatIntlMessagePath,
  getIntlMessageFallback,
} from './i18n-fallback'

describe('i18n fallback', () => {
  it('keeps raw message paths visible outside production', () => {
    expect(formatIntlMessagePath('adminDashboard', 'title')).toBe('adminDashboard.title')
    expect(getIntlMessageFallback({ namespace: 'adminDashboard', key: 'title' }, 'test'))
      .toBe('adminDashboard.title')
  })

  it('does not expose message paths in production UI', () => {
    expect(getIntlMessageFallback({ namespace: 'adminDashboard', key: 'title' }, 'production'))
      .toBe('...')
    expect(getIntlMessageFallback({ key: 'adminDashboard.title' }, 'production'))
      .toBe('...')
  })
})
