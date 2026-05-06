'use client'

import { useMemo, useState } from 'react'
import { Hammer, MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DEMO_CITY_LABELS,
  DEMO_CITY_RETURN_RATES,
  DEMO_CRAFT_PIECES,
  DEMO_RESOURCE_PRICES,
  type DemoCity,
  type DemoCraftMaterial,
} from '@/data/demo-seed'

const RESOURCE_KEY: Record<DemoCraftMaterial['resource'], string> = {
  metalbar: 'resourceMetalbar',
  planks: 'resourcePlanks',
  cloth: 'resourceCloth',
  leather: 'resourceLeather',
}

function formatSilver(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toString()
}

export function DemoCraftRegear() {
  const t = useTranslations('demo.craftRegear')
  const [city, setCity] = useState<DemoCity>('bridgewatch')

  const aggregated = useMemo(() => {
    const acc: Record<
      string,
      { resource: DemoCraftMaterial['resource']; tier: number; quantity: number }
    > = {}
    for (const piece of DEMO_CRAFT_PIECES) {
      for (const m of piece.materials) {
        const key = `${m.resource}-${m.tier}`
        if (!acc[key]) acc[key] = { resource: m.resource, tier: m.tier, quantity: 0 }
        acc[key].quantity += m.quantity * piece.count
      }
    }
    return Object.values(acc)
  }, [])

  const returnRate = DEMO_CITY_RETURN_RATES[city]
  const resourcePrices = DEMO_RESOURCE_PRICES[city]

  const stats = useMemo(() => {
    let totalResources = 0
    let totalCost = 0
    for (const row of aggregated) {
      const adjustedQty = Math.ceil(row.quantity * (1 - returnRate / 100))
      totalResources += adjustedQty
      totalCost += adjustedQty * resourcePrices[row.resource]
    }
    return { totalResources, totalCost }
  }, [aggregated, returnRate, resourcePrices])

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <Hammer size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">{t('weeklyBom')}</h3>
          </div>
          <div className="text-xs text-gray-400">
            {t('totalDeaths')}:{' '}
            <span className="font-mono font-semibold text-amber-400">
              {DEMO_CRAFT_PIECES.reduce((acc, p) => acc + p.count, 0)}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-gray-500">{t('weeklyHint')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEMO_CRAFT_PIECES.map((piece) => (
            <div
              key={piece.itemLabel}
              className="bg-gray-950 border border-gray-800 rounded px-3 py-2 flex items-center justify-between gap-3"
            >
              <span className="text-xs text-white truncate">{piece.itemLabel}</span>
              <span className="text-xs font-mono text-amber-400 shrink-0">×{piece.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <MapPin size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">{t('cityLabel')}</h3>
          </div>
          <div className="text-xs text-gray-400">
            {t('returnRate')}:{' '}
            <span className="font-mono font-semibold text-amber-400">
              {returnRate.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DEMO_CITY_LABELS) as DemoCity[]).map((c) => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                city === c
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              {DEMO_CITY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-950 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">{t('rowResource')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('rowGross')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('rowNet')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('rowCost')}</th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((row) => {
              const adjustedQty = Math.ceil(row.quantity * (1 - returnRate / 100))
              const cost = adjustedQty * resourcePrices[row.resource]
              return (
                <tr key={`${row.resource}-${row.tier}`} className="border-t border-gray-800">
                  <td className="px-3 py-2 text-white text-xs">
                    T{row.tier} {t(RESOURCE_KEY[row.resource])}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">
                    {row.quantity}
                  </td>
                  <td className="px-3 py-2 text-right text-white font-mono text-xs">
                    {adjustedQty}
                  </td>
                  <td className="px-3 py-2 text-right text-amber-300 font-mono text-xs">
                    {formatSilver(cost)}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-gray-700 bg-gray-950">
              <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-gray-400 font-semibold" colSpan={2}>
                {t('totalLabel')}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-white text-xs">
                {stats.totalResources}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-400">
                {formatSilver(stats.totalCost)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 italic">{t('hint')}</div>
    </div>
  )
}
