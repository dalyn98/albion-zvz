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
import {
  AODP_ALLOWED_CITIES,
  AODP_CITY_LABEL,
  AODP_INFO_TOOLTIP,
} from '@/lib/shop/aodp-constants'

type PriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type Quality = 1 | 2 | 3 | 4 | 5

interface Props {
  initialCities: string[]
  initialMode: PriceMode
  initialMinQuality: Quality
}

const MODE_OPTIONS: ReadonlyArray<{ value: PriceMode; label: string; hint: string }> = [
  { value: 'spot', label: '현재가 (spot)', hint: '/stats/prices — 최신 매도 최저가' },
  { value: 'avg_1d', label: '1일 평균', hint: '/stats/history · 최근 24시간 수량 가중 평균' },
  { value: 'avg_3d', label: '3일 평균', hint: '변동성 완화 · 최근 72시간 평균' },
  { value: 'avg_7d', label: '7일 평균', hint: '주간 평균 · 리기어 산정에 권장' },
  { value: 'avg_14d', label: '14일 평균', hint: '장기 평균 · 시세 격변기 완충' },
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
  // 기준 도시는 1개만. 기존에 여러 개 저장됐던 값도 첫 항목만 남긴다.
  const [city, setCity] = useState<string>(
    initialCities[0] ?? (AODP_ALLOWED_CITIES[0] as string),
  )
  const [mode, setMode] = useState<PriceMode>(initialMode)
  const [minQuality, setMinQuality] = useState<Quality>(initialMinQuality)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const initialCity = initialCities[0] ?? (AODP_ALLOWED_CITIES[0] as string)
  const dirty =
    city !== initialCity || mode !== initialMode || minQuality !== initialMinQuality

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
            <h2 className="font-bold text-white">AODP 시세 설정</h2>
            <span
              className="inline-flex cursor-help text-gray-500"
              aria-label="AODP 설명"
              title={AODP_INFO_TOOLTIP}
            >
              <Info size={12} />
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-1">
            상점 자동 가격 · 자동 리기어 산정에 공용으로 쓰이는 시세 조회 옵션입니다.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          기준 도시 (1개)
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
                <span className="text-sm text-white">{AODP_CITY_LABEL[c]}</span>
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-500">
          길드의 <span className="text-amber-300">홈 거래소</span> 로 쓸 도시 1곳만 고릅니다. 이 도시에 시세가 없으면 자동으로 다른 로열 시티 → 레드존 순으로 폴백해 추정합니다.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          가격 모드
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
                <span className="text-sm text-white font-semibold">{opt.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          최소 품질 (floor)
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
          드랍 아이템 품질이 이 값보다 낮으면 이 품질로 보정해 조회합니다. 기본 1(보정 없음).
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
