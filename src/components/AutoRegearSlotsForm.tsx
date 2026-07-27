'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
// 자동 리기어가 합산할 슬롯을 관리자가 골라 끄는 폼. 저장값은 SlotKey 의 JSON
// 배열(제외할 슬롯들). 빈 배열 = 모두 포함(현재 동작 유지). 음식/포션/탈것 등
// 길드 정책상 리기어 비대상 슬롯을 빼면 estimated_silver 합산에서 제외된다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Coins } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { SLOT_KEYS, type SlotKey } from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialExcluded: SlotKey[]
  embedded?: boolean
}

export default function AutoRegearSlotsForm({ initialExcluded, embedded = false }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const tActionErrors = useTranslations('errors')
  const tGear = useTranslations('gear')
  const t = useTranslations('adminAutoRegearSlots')

  const initialIncluded = SLOT_KEYS.filter((k) => !initialExcluded.includes(k))
  const [included, setIncluded] = useState<Set<SlotKey>>(new Set(initialIncluded))
  // 저장 직후 saved 셋을 새 값으로 sync — router.refresh 동안의 false-alarm 방지.
  const [savedIncluded, setSavedIncluded] = useState<Set<SlotKey>>(new Set(initialIncluded))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const sortedSaved = [...savedIncluded].sort().join(',')
  const sortedCurrent = [...included].sort().join(',')
  const dirty = sortedSaved !== sortedCurrent
  useReportDirty('auto-regear-slots', dirty)

  const toggle = (slot: SlotKey) => {
    const next = new Set(included)
    if (next.has(slot)) next.delete(slot)
    else next.add(slot)
    setIncluded(next)
    setSaved(false)
  }

  const handleSave = async () => {
                                   try {
      setLoading(true)
      setError('')
      setSaved(false)
      const excluded = SLOT_KEYS.filter((k) => !included.has(k))
      const payload = JSON.stringify(excluded)
      const result = await updateAppSetting('auto_regear_excluded_slots', payload)
      if (result.error) setError(result.error)
      else {
        setSavedIncluded(new Set(included))
        setSaved(true)
        router.refresh()
      }
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
      <div className="flex items-start gap-2">
        {!embedded && <Coins size={16} className="text-amber-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1">
            {t('descriptionLine1')}
            <br />
            {t('descriptionLine2')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SLOT_KEYS.map((slot) => {
          const checked = included.has(slot)
          return (
            <label
              key={slot}
              className={`flex items-center gap-2 cursor-pointer select-none rounded-lg border px-2.5 py-2 transition-colors ${
                checked
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-gray-700 bg-gray-950/40 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(slot)}
                className="h-4 w-4 accent-amber-500"
              />
              <span className="text-sm text-white">{tGear(slot)}</span>
            </label>
          )
        })}
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
          disabled={loading || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{tc('saved')}</span>}
      </div>
    </div>
  )
}
