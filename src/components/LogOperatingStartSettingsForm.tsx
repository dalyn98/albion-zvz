'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Clock3, RotateCcw, Save } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import {
  LOG_OPERATING_START_KEYS,
  formatLogOperatingStartInput,
  type LogOperatingStartDomain,
} from '@/lib/log-operating-start'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialShopChestStartAt: string
  initialSiphonStartAt: string
  timezone: string
  domains?: readonly LogOperatingStartDomain[]
  embedded?: boolean
}

type Values = Record<LogOperatingStartDomain, string>

const DOMAINS: readonly LogOperatingStartDomain[] = [
  'shopChest',
  'siphon',
] as const

export default function LogOperatingStartSettingsForm({
  initialShopChestStartAt,
  initialSiphonStartAt,
  timezone,
  domains,
  embedded = false,
}: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const tActionErrors = useTranslations('errors')
  const t = useTranslations('adminLogOperatingStart')
  const visibleDomains = domains ?? DOMAINS
  const initialValues = useMemo<Values>(
    () => ({
      shopChest: formatLogOperatingStartInput(initialShopChestStartAt, timezone),
      siphon: formatLogOperatingStartInput(initialSiphonStartAt, timezone),
    }),
    [initialShopChestStartAt, initialSiphonStartAt, timezone],
  )
  const [values, setValues] = useState<Values>(initialValues)
  const [savedValues, setSavedValues] = useState<Values>(initialValues)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = visibleDomains.some((domain) => values[domain] !== savedValues[domain])
  useReportDirty(`log-operating-start:${visibleDomains.join(',')}`, dirty)

  const handleChange = (domain: LogOperatingStartDomain, value: string) => {
    setValues((prev) => ({ ...prev, [domain]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
                                   try {
      setLoading(true)
      setError('')
      setSaved(false)

      for (const domain of visibleDomains) {
        if (values[domain] === savedValues[domain]) continue
        const result = await updateAppSetting(
          LOG_OPERATING_START_KEYS[domain],
          values[domain],
        )
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
      }

      setSavedValues(values)
      setSaved(true)
      setLoading(false)
      router.refresh()
                                   } catch (actionError) {
                                     setError(getServerActionClientErrorMessage(actionError, {
                                       expired: tActionErrors('actionExpired'),
                                       fallback: tActionErrors('actionFailed'),
                                     }))
                                   } finally {
                                     setLoading(false)
                                   }
                                 }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'
  const gridClass =
    visibleDomains.length === 1 ? 'grid gap-3' : 'grid gap-3 lg:grid-cols-3'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <Clock3 size={16} className="mt-0.5 text-amber-400" />}
        <div>
          {embedded ? (
            <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {t('description')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            {t('timezoneHint', { timezone })}
          </p>
        </div>
      </div>

      <div className={gridClass}>
        {visibleDomains.map((domain) => (
          <label
            key={domain}
            className="block rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-3"
          >
            <span className="block text-xs font-semibold text-white">
              {t(`${domain}Label`)}
            </span>
            <span className="mt-0.5 block min-h-8 text-[11px] leading-relaxed text-gray-500">
              {t(`${domain}Hint`)}
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="datetime-local"
                value={values[domain]}
                onChange={(e) => handleChange(domain, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleChange(domain, '')}
                className="rounded-md border border-gray-700 p-1.5 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                title={t('clear')}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </label>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
        >
          <Save size={14} />
          {loading ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">{tc('saved')}</span>
        )}
      </div>
    </div>
  )
}
