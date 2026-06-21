'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Globe, AlertTriangle, Loader2, Check } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { useConfirm } from '@/components/ConfirmDialog'
import { SectionCard } from '@/components/ui-patterns'

interface Props {
  enabled: boolean
  memberDashboardEnabled: boolean
}

export default function GuildProfileEnableToggle({ enabled, memberDashboardEnabled }: Props) {
  const t = useTranslations('adminGuildProfileToggle')
  const router = useRouter()
  const [error, setError] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const askConfirm = useConfirm()

  async function save(label: string, key: 'guild_profile_enabled' | 'member_dashboard_enabled', value: 'true' | 'false', confirmMsg?: string) {
    if (confirmMsg) {
      const ok = await askConfirm({ body: confirmMsg, destructive: false })
      if (!ok) return
    }
    setError('')
    setPendingKey(label)
    setSavedKey(null)
    startTransition(async () => {
      const result = await updateAppSetting(key, value)
      if (result.error) {
        setError(result.error)
        setPendingKey(null)
        return
      }
      setPendingKey(null)
      setSavedKey(label)
      router.refresh()
    })
  }

  if (!enabled) {
    const isPending = pendingKey === 'enable'
    return (
      <SectionCard tone="accent" className="space-y-4 border-accent/30 bg-accent-soft">
        <div className="flex items-start gap-3">
          <Globe size={20} className="text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <h2 className="text-amber-200 font-bold text-base">{t('enableTitle')}</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{t('enableBody')}</p>
          </div>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-black/40 p-3 space-y-2">
          <div className="flex items-start gap-2 text-amber-100/90 text-xs">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <span className="font-semibold">{t('enableWarningTitle')}</span>
          </div>
          <ul className="text-xs text-gray-400 leading-relaxed space-y-1 pl-6 list-disc">
            <li>{t('enableWarning1')}</li>
            <li>{t('enableWarning2')}</li>
            <li>{t('enableWarning3')}</li>
          </ul>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => save('enable', 'guild_profile_enabled', 'true', t('enableConfirm'))}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
          {isPending ? t('enableSaving') : t('enableButton')}
        </button>
        {error && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
            {error}
          </p>
        )}
      </SectionCard>
    )
  }

  const isDisablePending = pendingKey === 'disable'
  const isMemberPending = pendingKey === 'memberDashboard'

  return (
    <SectionCard className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <h2 className="text-white font-semibold text-sm">{t('advancedTitle')}</h2>
          <p className="text-xs text-gray-500">{t('advancedDescription')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/70 p-3 cursor-pointer hover:bg-surface-2 transition-colors">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-gray-900 text-amber-500 focus:ring-amber-500"
            checked={memberDashboardEnabled}
            disabled={isMemberPending}
            onChange={(e) =>
              save(
                'memberDashboard',
                'member_dashboard_enabled',
                e.target.checked ? 'true' : 'false',
              )
            }
          />
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{t('memberDashboardLabel')}</span>
              {isMemberPending && <Loader2 size={12} className="animate-spin text-amber-300" />}
              {savedKey === 'memberDashboard' && !isMemberPending && (
                <Check size={12} className="text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{t('memberDashboardHint')}</p>
          </div>
        </label>
      </div>

      <div className="border-t border-gray-800 pt-3">
        <button
          type="button"
          disabled={isDisablePending}
          onClick={() => save('disable', 'guild_profile_enabled', 'false', t('disableConfirm'))}
          className="text-xs text-gray-500 hover:text-rose-300 underline underline-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDisablePending ? t('disableSaving') : t('disableButton')}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
          {error}
        </p>
      )}
    </SectionCard>
  )
}
