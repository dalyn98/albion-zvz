'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Boxes, LoaderCircle, Power, RotateCcw } from 'lucide-react'
import { changeGuildFeatureState } from '@/app/actions/guild-features'
import {
  CONFIGURABLE_GUILD_FEATURE_KEYS,
  type ConfigurableGuildFeatureKey,
  type GuildFeatureSnapshot,
  type GuildFeatureState,
} from '@/lib/guild-features'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'

export default function FeatureSettingsPanel({
  initialSnapshot,
}: {
  initialSnapshot: GuildFeatureSnapshot
}) {
  const t = useTranslations('adminSettings.featureState')
  const errors = useTranslations('errors')
  const router = useRouter()
  const [states, setStates] = useState<Record<ConfigurableGuildFeatureKey, GuildFeatureState>>(
    () => Object.fromEntries(
      CONFIGURABLE_GUILD_FEATURE_KEYS.map((key) => [key, initialSnapshot[key].state]),
    ) as Record<ConfigurableGuildFeatureKey, GuildFeatureState>,
  )
  const [pendingKey, setPendingKey] = useState<ConfigurableGuildFeatureKey | null>(null)
  const [error, setError] = useState('')

  async function change(
    featureKey: ConfigurableGuildFeatureKey,
    targetState: 'disabled' | 'enabled',
  ) {
    try {
      setPendingKey(featureKey)
      setError('')
      const result = await changeGuildFeatureState({ featureKey, targetState })
      if (result.error) {
        setError(result.error)
        return
      }
      setStates((current) => ({
        ...current,
        [featureKey]: result.state ?? targetState,
      }))
      router.refresh()
    } catch (actionError) {
      setError(getServerActionClientErrorMessage(actionError, {
        expired: errors('actionExpired'),
        fallback: errors('actionFailed'),
      }))
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{t('title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">{t('description')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {CONFIGURABLE_GUILD_FEATURE_KEYS.map((featureKey) => {
          const state = states[featureKey]
          const pending = pendingKey === featureKey
          const enabled = state === 'enabled' || state === 'draining'
          const isSupply = featureKey === 'supply'
          return (
            <section
              key={featureKey}
              className="flex min-h-44 flex-col rounded-xl border border-gray-800 bg-gray-950/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {t(`feature.${featureKey}.title`)}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {t(`feature.${featureKey}.description`)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  state === 'enabled'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : state === 'draining'
                      ? 'bg-amber-500/15 text-amber-300'
                      : state === 'setup_required'
                        ? 'bg-blue-500/15 text-blue-300'
                        : 'bg-gray-800 text-gray-400'
                }`}>
                  {t(`state.${state}`)}
                </span>
              </div>

              {state === 'draining' && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  {t('drainingHint')}
                </p>
              )}
              {(featureKey === 'guild_shop' || featureKey === 'member_market') && (
                <p className="mt-3 text-[11px] text-gray-500">{t('economyDependencyHint')}</p>
              )}

              <div className="mt-auto pt-4">
                {isSupply ? (
                  <button
                    type="button"
                    onClick={() => router.replace('/admin/dashboard/settings?tab=regear')}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-amber-500/60 hover:text-amber-200"
                  >
                    <Boxes size={14} />
                    {t('openRegearSettings')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void change(featureKey, enabled ? 'disabled' : 'enabled')}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${
                      enabled
                        ? 'border border-gray-700 text-gray-300 hover:border-red-500/50 hover:text-red-300'
                        : 'bg-amber-500 text-gray-950 hover:bg-amber-400'
                    }`}
                  >
                    {pending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : enabled ? (
                      state === 'draining' ? <RotateCcw size={14} /> : <Power size={14} />
                    ) : (
                      <Power size={14} />
                    )}
                    {pending
                      ? t('saving')
                      : state === 'draining'
                        ? t('reopen')
                        : enabled
                          ? t('disable')
                          : t('enable')}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
