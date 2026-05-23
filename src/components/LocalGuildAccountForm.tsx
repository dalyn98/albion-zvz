'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, LogIn, UserPlus } from 'lucide-react'
import {
  loginLocalGuildAccount,
  registerLocalGuildAccount,
} from '@/app/actions/local-guild-account'
import { ALBION_SERVERS, type AlbionServer } from '@/lib/albion-gameinfo'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'

type Mode = 'login' | 'register'

interface Props {
  returnTo: string
  initialServer: AlbionServer | null
  initialLocale: Locale
}

export default function LocalGuildAccountForm({
  returnTo,
  initialServer,
  initialLocale,
}: Props) {
  const t = useTranslations('localGuildAccount')
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [server, setServer] = useState<AlbionServer>(initialServer ?? 'east')
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [guildCode, setGuildCode] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    startTransition(async () => {
      const payload = { server, nickname, password, guildCode, locale, returnTo }
      const result =
        mode === 'register'
          ? await registerLocalGuildAccount(payload)
          : await loginLocalGuildAccount(payload)
      if (result.error) {
        setError(result.error)
        return
      }
      router.replace(result.redirectTo ?? returnTo)
      router.refresh()
    })
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950/80 p-5 shadow-2xl">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{t('eyebrow')}</p>
        <h1 className="mt-1 text-xl font-bold text-white">{t('title')}</h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">{t('description')}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
        {(['login', 'register'] as const).map((next) => {
          const active = mode === next
          const Icon = next === 'login' ? LogIn : UserPlus
          return (
            <button
              key={next}
              type="button"
              onClick={() => {
                setMode(next)
                setError('')
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(next === 'login' ? 'loginTab' : 'registerTab')}
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-400">{t('languageLabel')}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-400">{t('serverLabel')}</span>
          <select
            value={server}
            onChange={(e) => setServer(e.target.value as AlbionServer)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          >
            {ALBION_SERVERS.map((s) => (
              <option key={s} value={s}>{t(`server.${s}`)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-400">{t('nicknameLabel')}</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="username"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            placeholder={t('nicknamePlaceholder')}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-400">{t('passwordLabel')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            placeholder={t('passwordPlaceholder')}
          />
        </label>

        {mode === 'register' && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-400">{t('guildCodeLabel')}</span>
            <input
              type="password"
              value={guildCode}
              onChange={(e) => setGuildCode(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
              placeholder={t('guildCodePlaceholder')}
            />
          </label>
        )}

        {mode === 'register' && (
          <p className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-100">
            {t('registerHint')}
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !nickname.trim() || !password || (mode === 'register' && !guildCode.trim())}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={15} />
          {pending ? t('submitting') : t(mode === 'login' ? 'loginSubmit' : 'registerSubmit')}
        </button>
      </div>
    </div>
  )
}
