'use client'

// AODP 시세 설정 — 도시 체크박스 / 가격 모드 / 최소 품질.
// 상점 자동 가격 갱신과 (Phase 3) 자동 리기어가 공용으로 사용.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, LineChart } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'

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

const CITY_LABELS: Record<(typeof AODP_ALLOWED_CITIES)[number], string> = {
  Caerleon: '카에르레온',
  Bridgewatch: '브리지워치',
  Lymhurst: '림허스트',
  Martlock: '말록',
  Thetford: '테트포드',
  'Fort Sterling': '포트 스털링',
  Brecilien: '브레실리엔',
}

export default function AodpSettingsForm({ initialCities, initialMode, initialMinQuality }: Props) {
  const router = useRouter()
  const [cities, setCities] = useState<Set<string>>(new Set(initialCities))
  const [mode, setMode] = useState<PriceMode>(initialMode)
  const [minQuality, setMinQuality] = useState<Quality>(initialMinQuality)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const initialCitySet = new Set(initialCities)
  const citiesDirty =
    cities.size !== initialCitySet.size ||
    Array.from(cities).some((c) => !initialCitySet.has(c))
  const dirty = citiesDirty || mode !== initialMode || minQuality !== initialMinQuality

  const toggleCity = (city: string) => {
    setSaved(false)
    setCities((prev) => {
      const next = new Set(prev)
      if (next.has(city)) next.delete(city)
      else next.add(city)
      return next
    })
  }

  const handleSave = async () => {
    if (cities.size === 0) {
      setError('최소 한 도시 이상 선택해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const orderedCities = (AODP_ALLOWED_CITIES as readonly string[]).filter((c) => cities.has(c))
    const results = await Promise.all([
      updateAppSetting('aodp_cities', JSON.stringify(orderedCities)),
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
        <div>
          <h2 className="font-bold text-white">AODP 시세 설정</h2>
          <p className="text-gray-500 text-xs mt-1">
            상점 자동 가격 · 자동 리기어 산정에 공용으로 쓰이는 시세 조회 옵션입니다.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          조회 도시 (복수 선택)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AODP_ALLOWED_CITIES.map((city) => {
            const active = cities.has(city)
            return (
              <label
                key={city}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCity(city)}
                  className="accent-amber-500"
                />
                <span className="text-sm text-white">{CITY_LABELS[city]}</span>
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-500">
          여러 도시를 선택하면 그중 <span className="text-amber-300">최저가</span> 도시가 자동 채택됩니다. Black Market 은
          제외됐습니다.
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
          {loading ? '저장 중…' : '저장'}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">저장됨</span>}
      </div>
    </div>
  )
}
