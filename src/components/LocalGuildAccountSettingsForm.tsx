'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { KeyRound, Loader2 } from 'lucide-react'
import { updateLocalGuildAccountSettings } from '@/app/actions/local-guild-account'
import { useToast } from './ToastProvider'

interface Props {
  embedded?: boolean
  initialEnabled: boolean
  hasInviteCode: boolean
}

export default function LocalGuildAccountSettingsForm({
  initialEnabled,
  hasInviteCode,
}: Props) {
  const t = useTranslations('adminSettings')
  const toast = useToast()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [guildCode, setGuildCode] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const save = () => {
    setError('')
    startTransition(async () => {
      const result = await updateLocalGuildAccountSettings({ enabled, guildCode })
      if (result.error) {
        setError(result.error)
        return
      }
      setGuildCode('')
      toast.success(t('saved'))
    })
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/45 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <KeyRound size={14} className="text-amber-300" />
            {t('localAccountTitle')}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('localAccountDescription')}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          {enabled ? t('enabled') : t('disabled')}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-400">
          {hasInviteCode ? t('localAccountRotateCode') : t('localAccountGuildCode')}
        </span>
        <input
          type="password"
          value={guildCode}
          onChange={(e) => setGuildCode(e.target.value)}
          placeholder={hasInviteCode ? t('localAccountRotatePlaceholder') : t('localAccountGuildCodePlaceholder')}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{t('localAccountGuildCodeHint')}</p>
      </label>

      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {pending && <Loader2 size={12} className="animate-spin" />}
        {t('save')}
      </button>
    </div>
  )
}
