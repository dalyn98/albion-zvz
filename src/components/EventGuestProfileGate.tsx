'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { saveEventGuestProfile } from '@/app/actions/event-guest-profile'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/i18n/locales'
import type { EventGuestProfile } from '@/lib/event-guest-profile'
import DiscordIcon from '@/components/DiscordIcon'
import { useBodyScrollLock } from './useBodyScrollLock'

interface Props {
  eventId: string
  inviteToken?: string | null
  initialProfile: EventGuestProfile | null
  discordLoginHref?: string | null
}

export default function EventGuestProfileGate({
  eventId,
  inviteToken = null,
  initialProfile,
  discordLoginHref = null,
}: Props) {
  const t = useTranslations('eventGuestProfile')
  const activeLocale = useLocale() as Locale
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? '')
  const [characterName, setCharacterName] = useState(initialProfile?.albionCharacterName ?? '')
  const [locale, setLocale] = useState<Locale>(initialProfile?.preferredLanguage ?? activeLocale)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const open = initialProfile === null
  useBodyScrollLock(open)
  if (!open) return null

  const handleSubmit = (formData: FormData) => {
    const nextName = String(formData.get('displayName') ?? '')
    const nextCharacterName = String(formData.get('characterName') ?? '')
    const nextLocale = String(formData.get('locale') ?? '')
    setError('')
    startTransition(async () => {
      const result = await saveEventGuestProfile({
        eventId,
        inviteToken,
        displayName: nextName,
        characterName: nextCharacterName,
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-guest-profile-title"
      aria-describedby="event-guest-profile-description"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 px-4 py-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
    >
      <form
        action={handleSubmit}
        className="my-auto max-h-[calc(100dvh-3rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-[28px] bg-gray-950 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_24px_80px_rgba(0,0,0,0.55)] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]">
            <UserRound size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2
              id="event-guest-profile-title"
              className="text-balance text-xl font-bold text-white"
            >
              {t('title')}
            </h2>
            <p
              id="event-guest-profile-description"
              className="text-pretty text-sm leading-relaxed text-gray-400"
            >
              {t('description')}
            </p>
          </div>
        </div>

        {discordLoginHref && (
          <section className="rounded-2xl bg-[#5865F2]/10 p-4 shadow-[0_0_0_1px_rgba(129,140,248,0.3)]">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/20">
                <DiscordIcon size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]">
                  <ShieldCheck size={12} aria-hidden="true" />
                  {t('discordRecommended')}
                </span>
                <p className="mt-2 text-pretty text-xs leading-relaxed text-indigo-100/75">
                  {t('discordDescription')}
                </p>
              </div>
            </div>
            <a
              href={discordLoginHref}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] pl-4 pr-3.5 text-sm font-bold text-white shadow-lg shadow-[#5865F2]/20 transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#6875F5] hover:shadow-xl hover:shadow-[#5865F2]/25 active:scale-[0.96]"
            >
              <DiscordIcon size={17} />
              <span>{t('discordOptional')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </section>
        )}

        <section
          className={discordLoginHref
            ? 'space-y-4 rounded-2xl bg-white/[0.025] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'space-y-4'}
        >
          {discordLoginHref && (
            <div>
              <h3 className="text-sm font-bold text-white">{t('anonymousTitle')}</h3>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-gray-500">
                {t('anonymousDescription')}
              </p>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-300">{t('characterLabel')}</span>
            <input
              name="characterName"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              maxLength={64}
              required
              autoComplete="off"
              placeholder={t('characterPlaceholder')}
              className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 text-sm text-white placeholder:text-gray-600 outline-none transition-[border-color,box-shadow] duration-150 focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.12)]"
            />
            <span className="text-pretty text-[11px] leading-relaxed text-gray-500">
              {t('characterHelp')}
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-300">{t('nicknameLabel')}</span>
            <input
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={32}
              placeholder={t('nicknamePlaceholder')}
              className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 text-sm text-white placeholder:text-gray-600 outline-none transition-[border-color,box-shadow] duration-150 focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.12)]"
            />
            <span className="text-pretty text-[11px] leading-relaxed text-gray-500">
              {t('nicknameHelp')}
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-300">{t('languageLabel')}</span>
            <select
              name="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 text-sm text-white outline-none transition-[border-color,box-shadow] duration-150 focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.12)]"
            >
              {SUPPORTED_LOCALES.map((item) => (
                <option key={item} value={item}>
                  {LOCALE_LABELS[item]}
                </option>
              ))}
            </select>
            <span className="text-pretty text-[11px] text-gray-500">{t('languageHelp')}</span>
          </label>

          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-xl bg-red-500/10 px-3 py-2.5 text-pretty text-xs text-red-200 shadow-[0_0_0_1px_rgba(239,68,68,0.3)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 pl-4 pr-3.5 text-sm font-bold text-black shadow-lg shadow-amber-500/10 transition-[background-color,transform,box-shadow] duration-150 hover:bg-amber-400 hover:shadow-xl hover:shadow-amber-500/15 active:scale-[0.96] disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none disabled:active:scale-100"
          >
            {isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            <span>{isPending ? t('saving') : t('save')}</span>
            {!isPending && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </section>
      </form>
    </div>
  )
}
