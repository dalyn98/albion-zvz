'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { saveEventGuestProfile } from '@/app/actions/event-guest-profile'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/i18n/locales'
import type { EventGuestProfile } from '@/lib/event-guest-profile'

interface Props {
  eventId: string
  inviteToken?: string | null
  initialProfile: EventGuestProfile | null
}

export default function EventGuestProfileGate({ eventId, inviteToken = null, initialProfile }: Props) {
  const t = useTranslations('eventGuestProfile')
  const activeLocale = useLocale() as Locale
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? '')
  const [locale, setLocale] = useState<Locale>(initialProfile?.preferredLanguage ?? activeLocale)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const open = initialProfile === null
  if (!open) return null

  const handleSubmit = (formData: FormData) => {
    const nextName = String(formData.get('displayName') ?? '')
    const nextLocale = String(formData.get('locale') ?? '')
    setError('')
    startTransition(async () => {
      const result = await saveEventGuestProfile({
        eventId,
        inviteToken,
        displayName: nextName,
        locale: nextLocale,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4 py-6">
      <form
        action={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-950 p-5 shadow-2xl space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">{t('title')}</h2>
          <p className="text-xs text-gray-400 leading-relaxed">{t('description')}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-gray-300">{t('nicknameLabel')}</span>
          <input
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={32}
            required
            autoFocus
            placeholder={t('nicknamePlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-amber-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-gray-300">{t('languageLabel')}</span>
          <select
            name="locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
          >
            {SUPPORTED_LOCALES.map((item) => (
              <option key={item} value={item}>
                {LOCALE_LABELS[item]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-gray-500">{t('languageHelp')}</span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {isPending ? t('saving') : t('save')}
        </button>
      </form>
    </div>
  )
}
