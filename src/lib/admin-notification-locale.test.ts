import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/i18n/locales'
import {
  DEFAULT_ADMIN_NOTIFICATION_LOCALE,
  parseAdminNotificationLocale,
} from './admin-notification-locale'

describe('admin notification locale', () => {
  it.each(SUPPORTED_LOCALES)('accepts supported locale %s', (locale) => {
    expect(parseAdminNotificationLocale(locale)).toBe(locale)
  })

  it('normalizes Discord-style locale tags and falls back safely', () => {
    expect(parseAdminNotificationLocale('en-US')).toBe('en')
    expect(parseAdminNotificationLocale('zh-TW')).toBe('zh-Hant')
    expect(parseAdminNotificationLocale('unsupported')).toBe(
      DEFAULT_ADMIN_NOTIFICATION_LOCALE,
    )
    expect(parseAdminNotificationLocale(null)).toBe(
      DEFAULT_ADMIN_NOTIFICATION_LOCALE,
    )
  })

  it('keeps shared admin notification producers off request-local translations', () => {
    const producers = [
      'src/app/actions/craft-orders.ts',
      'src/app/actions/donation.ts',
      'src/app/actions/exchange.ts',
      'src/app/actions/regear.ts',
      'src/app/actions/regear-tracked-deaths.ts',
      'src/app/actions/shop-member.ts',
      'src/lib/auto-regear.ts',
      'src/lib/discord-application-command-confirmations.ts',
      'src/lib/discord-commands.ts',
      'src/lib/domain-outbox-delivery.ts',
      'src/lib/event-participation-closeout-server.ts',
    ]

    for (const file of producers) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(
        /getTranslations\(\s*['"]adminNotificationMessages['"]\s*\)/,
      )
      expect(source, file).not.toMatch(
        /getTranslations\(\s*\{[\s\S]{0,120}locale:\s*['"]ko['"][\s\S]{0,120}adminNotificationMessages/,
      )
      expect(source, file).toContain('getAdminNotificationTranslations')
    }
  })

  it('uses the guild locale for shared approval message updates', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/discord-admin-approvals.ts'),
      'utf8',
    )
    expect(source).toContain("getAppSetting('admin_notification_locale'")
    expect(source).toContain('loadDiscordAdminApprovalMessages(locale)')
  })
})
