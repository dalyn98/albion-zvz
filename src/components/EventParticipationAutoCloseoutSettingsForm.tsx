'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Save } from 'lucide-react'
import { updateEventParticipationAutoCloseoutSettings } from '@/app/actions/settings'
import {
  EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS,
  EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS,
} from '@/lib/event-participation-auto-closeout'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialEnabled: boolean
  initialHours: number
  embedded?: boolean
}

export default function EventParticipationAutoCloseoutSettingsForm({
  initialEnabled,
  initialHours,
  embedded = false,
}: Props) {
  const t = useTranslations('adminEventParticipationAutoCloseout')
  const router = useRouter()
  const inputId = useId()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [savedEnabled, setSavedEnabled] = useState(initialEnabled)
  const [hours, setHours] = useState(String(initialHours))
  const [savedHours, setSavedHours] = useState(String(initialHours))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const parsedHours = Number(hours)
  const hoursInvalid =
    !Number.isInteger(parsedHours) ||
    parsedHours < EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS ||
    parsedHours > EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS
  const invalid = enabled && hoursInvalid
  const dirty = hours !== savedHours || enabled !== savedEnabled
  const risk = !hoursInvalid
    ? parsedHours <= 2
      ? 'short'
      : parsedHours >= 24
        ? 'long'
        : null
    : null
  useReportDirty('event-participation-auto-closeout-hours', dirty)

  const handleSave = () => {
    if (invalid) {
      setError(
        t('invalidRange', {
          min: EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS,
          max: EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS,
        }),
      )
      return
    }
    setError('')
    setSaved(false)
    const submittedHours = hoursInvalid ? Number(savedHours) : parsedHours
    startTransition(async () => {
      const result = await updateEventParticipationAutoCloseoutSettings({
        enabled,
        hours: submittedHours,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setHours(String(submittedHours))
      setSavedHours(String(submittedHours))
      setSavedEnabled(enabled)
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
        <span className="text-gray-400 text-xs mb-1 block">{t('modeLabel')}</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-3 ${
            enabled
              ? 'border-[#5865F2]/70 bg-[#5865F2]/10'
              : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'
          }`}>
            <input
              type="radio"
              checked={enabled}
              onChange={() => {
                setEnabled(true)
                setSaved(false)
              }}
              className="mr-2 accent-[#5865F2]"
            />
            <span className="text-sm font-semibold text-white">{t('automaticLabel')}</span>
            <span className="mt-1 block text-[11px] text-gray-500">
              {t('automaticHint')}
            </span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-3 ${
            !enabled
              ? 'border-[#5865F2]/70 bg-[#5865F2]/10'
              : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'
          }`}>
            <input
              type="radio"
              checked={!enabled}
              onChange={() => {
                setEnabled(false)
                setSaved(false)
              }}
              className="mr-2 accent-[#5865F2]"
            />
            <span className="text-sm font-semibold text-white">{t('manualLabel')}</span>
            <span className="mt-1 block text-[11px] text-gray-500">
              {t('manualHint')}
            </span>
          </label>
        </div>
      </div>

      <div className={!enabled ? 'opacity-50' : undefined}>
        <label htmlFor={inputId} className="text-gray-400 text-xs mb-1 block">
          {t('label', {
            min: EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS,
            max: EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS,
          })}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS}
            max={EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS}
            value={hours}
            disabled={!enabled}
            onChange={(event) => {
              setHours(event.target.value)
              setSaved(false)
            }}
            className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <span className="text-xs text-gray-500">{t('unit')}</span>
        </div>
      </div>

      {enabled && <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <p>{t('operationalWarning')}</p>
      </div>}

      {enabled && risk && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {t(risk === 'short' ? 'shortRisk' : 'longRisk')}
        </div>
      )}

      <p className="text-[11px] text-gray-500">{t('futureEventsHint')}</p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty || invalid}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {isPending ? t('saving') : t('save')}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">{t('saved')}</span>
        )}
      </div>
    </div>
  )
}
