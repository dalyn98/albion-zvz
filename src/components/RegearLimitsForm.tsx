'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialWindowMinutes: number
  initialMaxDeaths: number
  initialEligibilityDays: number
  embedded?: boolean
}

const WINDOW_MIN = 1
const WINDOW_MAX = 240
const DEATHS_MIN = 1
const DEATHS_MAX = 10
const ELIGIBILITY_MIN = 1
const ELIGIBILITY_MAX = 90

export default function RegearLimitsForm({
  initialWindowMinutes,
  initialMaxDeaths,
  initialEligibilityDays,
  embedded = false,
}: Props) {
  const t = useTranslations('adminRegearLimits')
  const router = useRouter()
  const windowId = useId()
  const deathsId = useId()
  const eligibilityId = useId()
  const [windowMinutes, setWindowMinutes] = useState(String(initialWindowMinutes))
  const [maxDeaths, setMaxDeaths] = useState(String(initialMaxDeaths))
  const [eligibilityDays, setEligibilityDays] = useState(String(initialEligibilityDays))
  // 저장 직후 saved* sync — router.refresh 동안의 false-alarm 방지.
  const [savedWindowMinutes, setSavedWindowMinutes] = useState(String(initialWindowMinutes))
  const [savedMaxDeaths, setSavedMaxDeaths] = useState(String(initialMaxDeaths))
  const [savedEligibilityDays, setSavedEligibilityDays] = useState(String(initialEligibilityDays))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const windowNum = Number(windowMinutes)
  const deathsNum = Number(maxDeaths)
  const eligibilityNum = Number(eligibilityDays)
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
  const eligibilityInvalid =
    !Number.isFinite(eligibilityNum) ||
    !Number.isInteger(eligibilityNum) ||
    eligibilityNum < ELIGIBILITY_MIN ||
    eligibilityNum > ELIGIBILITY_MAX
  const dirty =
    windowMinutes !== savedWindowMinutes ||
    maxDeaths !== savedMaxDeaths ||
    eligibilityDays !== savedEligibilityDays
  useReportDirty('regear-limits', dirty)

  const handleSave = async () => {
    if (windowInvalid || deathsInvalid || eligibilityInvalid) {
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
    const eligibilityResult = await updateAppSetting('regear_eligibility_days', eligibilityDays)
    if (eligibilityResult.error) {
      setError(eligibilityResult.error)
      setLoading(false)
      return
    }
    setSavedWindowMinutes(windowMinutes)
    setSavedMaxDeaths(maxDeaths)
    setSavedEligibilityDays(eligibilityDays)
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

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor={windowId} className="text-gray-400 text-xs mb-1 block">{t('windowMinutesLabel')}</label>
          <input
            id={windowId}
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
          <label htmlFor={deathsId} className="text-gray-400 text-xs mb-1 block">{t('maxDeathsLabel')}</label>
          <input
            id={deathsId}
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

        <div>
          <label htmlFor={eligibilityId} className="text-gray-400 text-xs mb-1 block">{t('eligibilityDaysLabel')}</label>
          <input
            id={eligibilityId}
            type="number"
            inputMode="numeric"
            min={ELIGIBILITY_MIN}
            max={ELIGIBILITY_MAX}
            value={eligibilityDays}
            onChange={(e) => {
              setEligibilityDays(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${eligibilityInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {t('eligibilityDaysHint', { min: ELIGIBILITY_MIN, max: ELIGIBILITY_MAX })}
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
          disabled={loading || !dirty || windowInvalid || deathsInvalid || eligibilityInvalid}
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
