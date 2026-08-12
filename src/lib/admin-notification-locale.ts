import {
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type Locale,
} from '@/i18n/locales'

export const DEFAULT_ADMIN_NOTIFICATION_LOCALE: Locale = DEFAULT_LOCALE

export function parseAdminNotificationLocale(
  value: string | null | undefined,
): Locale {
  return resolveSupportedLocale(value) ?? DEFAULT_ADMIN_NOTIFICATION_LOCALE
}
