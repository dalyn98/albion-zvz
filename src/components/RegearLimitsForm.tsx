'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'

interface Props {
  initialWindowMinutes: number
  initialMaxDeaths: number
}

const WINDOW_MIN = 1
const WINDOW_MAX = 240
const DEATHS_MIN = 1
const DEATHS_MAX = 10

export default function RegearLimitsForm({ initialWindowMinutes, initialMaxDeaths }: Props) {
  const t = useTranslations('adminRegearLimits')
  const router = useRouter()
  const [windowMinutes, setWindowMinutes] = useState(String(initialWindowMinutes))
  const [maxDeaths, setMaxDeaths] = useState(String(initialMaxDeaths))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const windowNum = Number(windowMinutes)
  const deathsNum = Number(maxDeaths)
  const windowInvalid =
    !Number.isFinite(windowNum) ||
    !Number.isInteger(windowNum) ||
    windowNum < WINDOW_MIN ||
    windowNum > WINDOW_MAX
  const deathsInvalid =
    !Number.isFinite(deathsNum) ||
    !Number.isInteger(deathsNum) ||
    deathsNum < DEATHS_MIN ||
    deathsNum > DEATHS_MAX
  const dirty =
    windowMinutes !== String(initialWindowMinutes) || maxDeaths !== String(initialMaxDeaths)

  const handleSave = async () => {
    if (windowInvalid || deathsInvalid) {
      setError(t('invalidRange'))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const windowResult = await updateAppSetting('regear_window_minutes', windowMinutes)
    if (windowResult.error) {
      setError(windowResult.error)
      setLoading(false)
      return
    }
    const deathsResult = await updateAppSetting('regear_max_deaths_per_event', maxDeaths)
    if (deathsResult.error) {
      setError(deathsResult.error)
      setLoading(false)
      return
    }
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('title')}</h2>
        <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">{t('windowMinutesLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={WINDOW_MIN}
            max={WINDOW_MAX}
            value={windowMinutes}
            onChange={(e) => {
              setWindowMinutes(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${windowInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {t('windowMinutesHint', { min: WINDOW_MIN, max: WINDOW_MAX })}
          </p>
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">{t('maxDeathsLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={DEATHS_MIN}
            max={DEATHS_MAX}
            value={maxDeaths}
            onChange={(e) => {
              setMaxDeaths(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${deathsInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {t('maxDeathsHint', { min: DEATHS_MIN, max: DEATHS_MAX })}
          </p>
        </div>
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
          disabled={loading || !dirty || windowInvalid || deathsInvalid}
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
