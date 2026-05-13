'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialPercent: number
  embedded?: boolean
}

const PERCENT_MIN = 1
const PERCENT_MAX = 100

export default function RegearPayoutRateForm({ initialPercent, embedded = false }: Props) {
  const t = useTranslations('adminRegearPayoutRate')
  const router = useRouter()
  const percentId = useId()
  const [percent, setPercent] = useState(String(initialPercent))
  const [savedPercent, setSavedPercent] = useState(String(initialPercent))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const percentNum = Number(percent)
  const invalid =
    !Number.isFinite(percentNum) ||
    !Number.isInteger(percentNum) ||
    percentNum < PERCENT_MIN ||
    percentNum > PERCENT_MAX
  const dirty = percent !== savedPercent
  useReportDirty('regear-payout-rate', dirty)

  const handleSave = async () => {
    if (invalid) {
      setError(t('invalidRange'))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('regear_payout_rate_percent', percent)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setSavedPercent(percent)
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
        ) : (
          <h2 className="font-bold text-white">{t('title')}</h2>
        )}
        <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
      </div>

      <div>
        <label htmlFor={percentId} className="text-gray-400 text-xs mb-1 block">{t('percentLabel')}</label>
        <div className="flex items-center gap-2">
          <input
            id={percentId}
            type="number"
            inputMode="numeric"
            min={PERCENT_MIN}
            max={PERCENT_MAX}
            value={percent}
            onChange={(e) => {
              setPercent(e.target.value)
              setSaved(false)
            }}
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <span className="text-gray-500 text-sm">%</span>
        </div>
        <p className={`text-[11px] mt-1 ${invalid ? 'text-red-400' : 'text-gray-500'}`}>
          {t('percentHint', { min: PERCENT_MIN, max: PERCENT_MAX })}
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || invalid}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? t('saving') : t('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
      </div>
    </div>
  )
}
