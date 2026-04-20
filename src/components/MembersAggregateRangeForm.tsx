'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, CalendarRange } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialStart: string
  initialEnd: string
}

export default function MembersAggregateRangeForm({ initialStart, initialEnd }: Props) {
  const t = useTranslations('adminSettings')
  const router = useRouter()
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = start !== initialStart || end !== initialEnd
  const rangeInvalid = start && end && start > end

  const save = () => {
    if (rangeInvalid) {
      setError(t('membersRangeInvalid'))
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const [startRes, endRes] = await Promise.all([
        updateAppSetting('members_aggregate_start_date', start),
        updateAppSetting('members_aggregate_end_date', end),
      ])
      const err = startRes.error || endRes.error
      if (err) {
        setError(err)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  const clear = () => {
    setStart('')
    setEnd('')
    setError('')
    setSaved(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <CalendarRange size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">{t('membersRangeTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('membersRangeDescription')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-gray-400 text-xs mb-1 block">{t('membersRangeStart')}</span>
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </label>
        <label className="block">
          <span className="text-gray-400 text-xs mb-1 block">{t('membersRangeEnd')}</span>
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty || !!rangeInvalid}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm"
        >
          <Save size={14} />
          {pending ? t('saving') : t('save')}
        </button>
        {(start || end) && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-gray-400 hover:text-white px-3 py-2"
          >
            {t('membersRangeClear')}
          </button>
        )}
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
      </div>
    </div>
  )
}
