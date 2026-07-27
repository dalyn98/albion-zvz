'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'
import { useReportDirty } from './UnsavedChangesProvider'
import {
  REGEAR_CLAIM_CEILING_BONUS_MAX,
  REGEAR_CLAIM_CEILING_BONUS_MIN,
} from '@/lib/regear-claim-ceiling'

interface Props {
  initialPercent: number
  initialVideoPercent: number
  initialVideoClaimCeilingBonusSilver: number
  embedded?: boolean
}

const PERCENT_MIN = 1
const PERCENT_MAX = 100

export default function RegearPayoutRateForm({
  initialPercent,
  initialVideoPercent,
  initialVideoClaimCeilingBonusSilver,
  embedded = false,
}: Props) {
  const t = useTranslations('adminRegearPayoutRate')
  const tActionErrors = useTranslations('errors')
  const router = useRouter()
  const percentId = useId()
  const videoPercentId = useId()
  const videoClaimCeilingBonusSilverId = useId()
  const [percent, setPercent] = useState(String(initialPercent))
  const [videoPercent, setVideoPercent] = useState(String(initialVideoPercent))
  const [videoClaimCeilingBonusSilver, setVideoClaimCeilingBonusSilver] = useState(
    String(initialVideoClaimCeilingBonusSilver),
  )
  const [savedPercent, setSavedPercent] = useState(String(initialPercent))
  const [savedVideoPercent, setSavedVideoPercent] = useState(String(initialVideoPercent))
  const [savedVideoClaimCeilingBonusSilver, setSavedVideoClaimCeilingBonusSilver] = useState(
    String(initialVideoClaimCeilingBonusSilver),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const percentNum = Number(percent)
  const videoPercentNum = Number(videoPercent)
  const videoClaimCeilingBonusSilverNum = Number(videoClaimCeilingBonusSilver)
  const invalidPercent =
    !Number.isFinite(percentNum) ||
    !Number.isInteger(percentNum) ||
    percentNum < PERCENT_MIN ||
    percentNum > PERCENT_MAX
  const invalidVideoPercent =
    !Number.isFinite(videoPercentNum) ||
    !Number.isInteger(videoPercentNum) ||
    videoPercentNum < PERCENT_MIN ||
    videoPercentNum > PERCENT_MAX
  const invalidVideoClaimCeilingBonusSilver =
    !Number.isFinite(videoClaimCeilingBonusSilverNum) ||
    !Number.isInteger(videoClaimCeilingBonusSilverNum) ||
    videoClaimCeilingBonusSilverNum < REGEAR_CLAIM_CEILING_BONUS_MIN ||
    videoClaimCeilingBonusSilverNum > REGEAR_CLAIM_CEILING_BONUS_MAX
  const invalid = invalidPercent || invalidVideoPercent || invalidVideoClaimCeilingBonusSilver
  const dirty =
    percent !== savedPercent ||
    videoPercent !== savedVideoPercent ||
    videoClaimCeilingBonusSilver !== savedVideoClaimCeilingBonusSilver
  useReportDirty('regear-payout-rate', dirty)

  const handleSave = async () => {
                                   try {
      if (invalid) {
        setError(t('invalidRange'))
        return
      }
      setLoading(true)
      setError('')
      setSaved(false)
      if (percent !== savedPercent) {
        const result = await updateAppSetting('regear_payout_rate_percent', percent)
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
      }
      if (videoPercent !== savedVideoPercent) {
        const result = await updateAppSetting('regear_video_payout_rate_percent', videoPercent)
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
      }
      if (videoClaimCeilingBonusSilver !== savedVideoClaimCeilingBonusSilver) {
        const result = await updateAppSetting(
          'regear_video_claim_ceiling_bonus_silver',
          videoClaimCeilingBonusSilver,
        )
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
      }
      setSavedPercent(percent)
      setSavedVideoPercent(videoPercent)
      setSavedVideoClaimCeilingBonusSilver(videoClaimCeilingBonusSilver)
      setSaved(true)
      router.refresh()
      setLoading(false)
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={percentId} className="text-gray-400 text-xs mb-1 block">
            {t('basePercentLabel')}
          </label>
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
          <p className={`text-[11px] mt-1 ${invalidPercent ? 'text-red-400' : 'text-gray-500'}`}>
            {t('percentHint', { min: PERCENT_MIN, max: PERCENT_MAX })}
          </p>
        </div>

        <div>
          <label htmlFor={videoPercentId} className="text-gray-400 text-xs mb-1 block">
            {t('videoPercentLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={videoPercentId}
              type="number"
              inputMode="numeric"
              min={PERCENT_MIN}
              max={PERCENT_MAX}
              value={videoPercent}
              onChange={(e) => {
                setVideoPercent(e.target.value)
                setSaved(false)
              }}
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-gray-500 text-sm">%</span>
          </div>
          <p className={`text-[11px] mt-1 ${invalidVideoPercent ? 'text-red-400' : 'text-gray-500'}`}>
            {t('videoPercentHint', { min: PERCENT_MIN, max: PERCENT_MAX })}
          </p>
        </div>

        <div>
          <label
            htmlFor={videoClaimCeilingBonusSilverId}
            className="text-gray-400 text-xs mb-1 block"
          >
            {t('videoClaimCeilingBonusSilverLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={videoClaimCeilingBonusSilverId}
              type="number"
              inputMode="numeric"
              min={REGEAR_CLAIM_CEILING_BONUS_MIN}
              max={REGEAR_CLAIM_CEILING_BONUS_MAX}
              value={videoClaimCeilingBonusSilver}
              onChange={(e) => {
                setVideoClaimCeilingBonusSilver(e.target.value)
                setSaved(false)
              }}
              className="w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
            />
            <span className="text-gray-500 text-sm">silver</span>
          </div>
          <p
            className={`text-[11px] mt-1 ${
              invalidVideoClaimCeilingBonusSilver ? 'text-red-400' : 'text-gray-500'
            }`}
          >
            {t('videoClaimCeilingBonusSilverHint', {
              min: REGEAR_CLAIM_CEILING_BONUS_MIN,
              max: REGEAR_CLAIM_CEILING_BONUS_MAX,
            })}
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
