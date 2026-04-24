'use client'

// 전투기록 자동 수집 설정. 토글 + 규모(small/middle/large/zerg) 멀티 체크박스.
// 저장 시 saveBattleTrackingConfig 가 app_settings 두 키를 upsert 하고, enabled
// 이면 battle_records 를 소급 스캔해 tenant_battle_records 를 채운다.

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Swords } from 'lucide-react'
import { saveBattleTrackingConfig } from '@/app/actions/battle-tracking'
import {
  SIZE_CATEGORIES,
  SIZE_RANGES,
  type SizeCategory,
} from '@/lib/albion-battles'

interface Props {
  initialEnabled: boolean
  initialSizes: SizeCategory[]
}

export default function BattleTrackingSettingsForm({
  initialEnabled,
  initialSizes,
}: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('battleTracking')
  const toggleId = useId()

  const [enabled, setEnabled] = useState(initialEnabled)
  const [sizes, setSizes] = useState<Set<SizeCategory>>(new Set(initialSizes))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty =
    enabled !== initialEnabled ||
    sizes.size !== initialSizes.length ||
    initialSizes.some((s) => !sizes.has(s))

  const toggleSize = (size: SizeCategory) => {
    const next = new Set(sizes)
    if (next.has(size)) next.delete(size)
    else next.add(size)
    setSizes(next)
    setSaved(false)
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await saveBattleTrackingConfig({
      enabled,
      sizes: Array.from(sizes),
    })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  const formatRange = (cat: SizeCategory): string => {
    const range = SIZE_RANGES[cat]
    return range.max === null ? `${range.min}+` : `${range.min}-${range.max}`
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Swords size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">{t('settingsTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('settingsDescription')}</p>
        </div>
      </div>

      <label
        htmlFor={toggleId}
        className="flex items-start gap-3 cursor-pointer select-none"
      >
        <input
          id={toggleId}
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked)
            setSaved(false)
          }}
          className="mt-1 h-4 w-4 accent-amber-500"
        />
        <span>
          <span className="text-sm text-white font-semibold">{t('enabledLabel')}</span>
          <span className="block text-[11px] text-gray-500 mt-0.5">
            {t('enabledDescription')}
          </span>
        </span>
      </label>

      <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
        <p className="text-gray-400 text-xs mb-2">{t('sizeLabel')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SIZE_CATEGORIES.map((cat) => {
            const checked = sizes.has(cat)
            return (
              <label
                key={cat}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  checked
                    ? 'bg-amber-500/10 border-amber-500 text-amber-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSize(cat)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span className="text-sm">
                  <span className="font-semibold">{t(`size_${cat}`)}</span>
                  <span className="block text-[10px] text-gray-500">{formatRange(cat)}</span>
                </span>
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">{t('sizeDescription')}</p>
      </div>

      <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-1.5">
        <p className="text-[11px] text-gray-400">
          <span className="font-semibold text-amber-300">{t('tipTitle')}</span>
        </p>
        <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-1">
          <li>{t('tipMatch')}</li>
          <li>{t('tipOutcome')}</li>
          <li>{t('tipBackfill')}</li>
          <li>{t('tipLimitation')}</li>
        </ul>
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
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">{tc('saved')}</span>
        )}
      </div>
    </div>
  )
}
