import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Bell, Languages } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getMyDmPreference } from '@/app/actions/notifications'
import { getMyPreferredLanguage } from '@/app/actions/language'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import DmToggle from '@/components/DmToggle'
import CategoryDmPrefs from '@/components/CategoryDmPrefs'
import MyTimezoneSetting from '@/components/MyTimezoneSetting'
import LanguageSetting from '@/components/LanguageSetting'

export const dynamic = 'force-dynamic'

export default async function MySettingsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/settings')
  }

  const t = await getTranslations('mySettings')
  const [dmPref, { locale: preferredLocale }, activeLocale] = await Promise.all([
    getMyDmPreference(),
    getMyPreferredLanguage(),
    getLocale(),
  ])
  const {
    enabled,
    categories: categoryPrefs,
    timezoneOverride,
    guildDefaultTimezone,
  } = dmPref
  // DB 값 > 현재 활성 로케일 > 기본값 순으로 fallback. 마이그레이션 직후
  // preferred_language 가 null 인 기존 사용자는 활성 로케일이 표시되어야 한다.
  const initialLocale: Locale = preferredLocale
    ?? (isLocale(activeLocale) ? activeLocale : DEFAULT_LOCALE)

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-xs text-gray-500 mt-1">{t('description')}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Languages size={11} />
          {t('languageGroup')}
        </h2>
        <LanguageSetting initialLocale={initialLocale} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Bell size={11} />
          {t('notificationsGroup')}
        </h2>
        <DmToggle initialEnabled={enabled} />
        <CategoryDmPrefs
          initialCategories={categoryPrefs}
          masterEnabled={enabled}
        />
        <MyTimezoneSetting
          initialOverride={timezoneOverride}
          guildDefaultTimezone={guildDefaultTimezone}
          masterEnabled={enabled}
        />
      </section>
    </main>
  )
}
