'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'

// 길드 기본 DM 리드타임. 개인이 /me/settings 에서 override 할 수 있고, NULL 이면
// 이 값을 따른다. 아래 옵션 외 임의 값(분 단위)도 입력 허용.
const LEAD_OPTIONS = [5, 15, 35, 60, 120, 240, 720, 1440] as const
const LEAD_MIN = 5
const LEAD_MAX = 1440

interface Props {
  initialMinutes: number
  embedded?: boolean
}

export default function EventDmLeadMinutesForm({ initialMinutes, embedded = false }: Props) {
  const t = useTranslations('adminEventDmLead')
  const router = useRouter()
  const inputId = useId()
  const [minutes, setMinutes] = useState(String(initialMinutes))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const num = Number(minutes)
  const invalid =
    !Number.isFinite(num) || !Number.isInteger(num) || num < LEAD_MIN || num > LEAD_MAX
  const dirty = minutes !== String(initialMinutes)

  const handleSave = () => {
    if (invalid) {
      setError(t('invalidRange', { min: LEAD_MIN, max: LEAD_MAX }))
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateAppSetting('event_dm_lead_minutes', String(num))
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
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
        <label htmlFor={inputId} className="text-gray-400 text-xs mb-1 block">
          {t('label')}
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id={inputId}
            type="number"
            min={LEAD_MIN}
            max={LEAD_MAX}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value)
              setSaved(false)
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-28 focus:outline-none focus:border-amber-500"
          />
          <span className="text-xs text-gray-500">{t('unit')}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-2">
          {LEAD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinutes(String(m))
                setSaved(false)
              }}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                num === m
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {t('preset', { minutes: m })}
            </button>
          ))}
        </div>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400 mt-1 inline-block">{t('saved')}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !dirty || invalid}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
      >
        <Save size={14} />
        {isPending ? t('saving') : t('save')}
      </button>
    </div>
  )
}
