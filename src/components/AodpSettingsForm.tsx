'use client'

// AODP 시세 설정 — 기준 도시 1개 / 가격 모드 / 최소 품질.
// 상점 자동 가격 갱신과 (Phase 3) 자동 리기어가 공용으로 사용.
// 기준 도시는 단일 선택: 거래소를 한 군데로 가정한 시세 추정이 이해하기 쉽고,
// 시세 없는 아이템은 aodp.ts 폴백 체인이 자동으로 블루존 → 레드존으로 넓힌다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, LineChart, Info } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { useReportDirty } from './UnsavedChangesProvider'

type PriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type Quality = 1 | 2 | 3 | 4 | 5

interface Props {
  initialCities: string[]
  initialMode: PriceMode
  initialMinQuality: Quality
}

const MODE_OPTIONS: ReadonlyArray<{
  value: PriceMode
  labelKey: 'modeSpotLabel' | 'modeAvg1dLabel' | 'modeAvg3dLabel' | 'modeAvg7dLabel' | 'modeAvg14dLabel'
  hintKey: 'modeSpotHint' | 'modeAvg1dHint' | 'modeAvg3dHint' | 'modeAvg7dHint' | 'modeAvg14dHint'
}> = [
  { value: 'spot', labelKey: 'modeSpotLabel', hintKey: 'modeSpotHint' },
  { value: 'avg_1d', labelKey: 'modeAvg1dLabel', hintKey: 'modeAvg1dHint' },
  { value: 'avg_3d', labelKey: 'modeAvg3dLabel', hintKey: 'modeAvg3dHint' },
  { value: 'avg_7d', labelKey: 'modeAvg7dLabel', hintKey: 'modeAvg7dHint' },
  { value: 'avg_14d', labelKey: 'modeAvg14dLabel', hintKey: 'modeAvg14dHint' },
]

const QUALITY_OPTIONS: ReadonlyArray<{ value: Quality; label: string }> = [
  { value: 1, label: '1 Normal' },
  { value: 2, label: '2 Good' },
  { value: 3, label: '3 Outstanding' },
  { value: 4, label: '4 Excellent' },
  { value: 5, label: '5 Masterpiece' },
]

export default function AodpSettingsForm({ initialCities, initialMode, initialMinQuality }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminAodp')
  const tShop = useTranslations('shop')
  // 기준 도시는 1개만. 기존에 여러 개 저장됐던 값도 첫 항목만 남긴다.
  const initialCity = initialCities[0] ?? (AODP_ALLOWED_CITIES[0] as string)
  const [city, setCity] = useState<string>(initialCity)
  const [mode, setMode] = useState<PriceMode>(initialMode)
  const [minQuality, setMinQuality] = useState<Quality>(initialMinQuality)
  // 저장 직후 saved* sync 로 router.refresh 동안의 false-alarm 차단.
  const [savedCity, setSavedCity] = useState<string>(initialCity)
  const [savedMode, setSavedMode] = useState<PriceMode>(initialMode)
  const [savedMinQuality, setSavedMinQuality] = useState<Quality>(initialMinQuality)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty =
    city !== savedCity || mode !== savedMode || minQuality !== savedMinQuality
  useReportDirty('aodp-settings', dirty)

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const results = await Promise.all([
      updateAppSetting('aodp_cities', JSON.stringify([city])),
      updateAppSetting('aodp_price_mode', mode),
      updateAppSetting('aodp_min_quality', String(minQuality)),
    ])
    const firstError = results.find((r) => r.error)
    if (firstError?.error) {
      setError(firstError.error)
    } else {
      setSavedCity(city)
      setSavedMode(mode)
      setSavedMinQuality(minQuality)
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <LineChart size={16} className="text-amber-400 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-bold text-white">{t('title')}</h2>
            <span
              className="inline-flex cursor-help text-gray-500"
              aria-label={t('tooltipAria')}
              title={tShop('aodpTooltip')}
            >
              <Info size={12} />
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-1">
            {t('description')}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {t('cityHeading')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AODP_ALLOWED_CITIES.map((c) => {
            const active = c === city
            return (
              <label
                key={c}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                }`}
              >
                <input
                  type="radio"
                  name="aodp-base-city"
                  checked={active}
                  onChange={() => {
                    setCity(c)
                    setSaved(false)
                  }}
                  className="accent-amber-500"
                />
                <span className="text-sm text-white">{c}</span>
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-500">
          {t('cityHint')}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {t('modeHeading')}
        </h3>
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
                mode === opt.value
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
              }`}
            >
              <input
                type="radio"
                name="aodp-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => {
                  setMode(opt.value)
                  setSaved(false)
                }}
                className="mt-1 accent-amber-500"
              />
              <span className="flex-1">
                <span className="text-sm text-white font-semibold">{t(opt.labelKey)}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{t(opt.hintKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {t('qualityHeading')}
        </h3>
        <select
          value={minQuality}
          onChange={(e) => {
            setMinQuality(Number(e.target.value) as Quality)
            setSaved(false)
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {QUALITY_OPTIONS.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500">
          {t('qualityHint')}
        </p>
      </section>

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
