'use client'

import { useMemo, useState } from 'react'
import { Box, Hammer, MapPin } from 'lucide-react'
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
    const acc: Record<string, { resource: DemoCraftMaterial['resource']; tier: number; quantity: number }> = {}
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
      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Hammer size={14} className="text-amber-400" />
              {t('weeklyBom')}
            </div>
            <div className="text-[11px] text-white/50 mt-0.5">{t('weeklyHint')}</div>
          </div>
          <div className="text-xs">
            <span className="text-white/50">{t('totalDeaths')}: </span>
            <span className="font-semibold text-amber-300">
              {DEMO_CRAFT_PIECES.reduce((acc, p) => acc + p.count, 0)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {DEMO_CRAFT_PIECES.map((piece) => (
            <div
              key={piece.itemLabel}
              className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Hammer size={11} className="text-white/30 shrink-0" />
                <div className="text-xs truncate">{piece.itemLabel}</div>
              </div>
              <div className="text-xs text-white/60 shrink-0">×{piece.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <MapPin size={14} className="text-amber-400" />
            {t('cityLabel')}
          </div>
          <div className="text-[11px] text-white/50">
            {t('returnRate')}:{' '}
            <span className="font-semibold text-amber-300">{returnRate.toFixed(1)}%</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {(Object.keys(DEMO_CITY_LABELS) as DemoCity[]).map((c) => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                city === c
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-100'
                  : 'bg-white/5 border-white/10 hover:border-white/20 text-white/70'
              }`}
            >
              {DEMO_CITY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden mb-4">
          <div className="grid grid-cols-[1fr,80px,80px,90px] text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.03] px-3 py-2 border-b border-white/10 gap-2">
            <div>{t('rowResource')}</div>
            <div className="text-right">{t('rowGross')}</div>
            <div className="text-right">{t('rowNet')}</div>
            <div className="text-right">{t('rowCost')}</div>
          </div>
          {aggregated.map((row) => {
            const adjustedQty = Math.ceil(row.quantity * (1 - returnRate / 100))
            const cost = adjustedQty * resourcePrices[row.resource]
            return (
              <div
                key={`${row.resource}-${row.tier}`}
                className="grid grid-cols-[1fr,80px,80px,90px] text-xs px-3 py-2.5 border-b border-white/5 last:border-b-0 items-center gap-2"
              >
                <div className="flex items-center gap-2">
                  <Box size={11} className="text-white/30" />
                  T{row.tier} {t(RESOURCE_KEY[row.resource])}
                </div>
                <div className="text-right text-white/60">{row.quantity}</div>
                <div className="text-right font-medium">{adjustedQty}</div>
                <div className="text-right font-medium text-amber-300">{formatSilver(cost)}</div>
              </div>
            )
          })}
          <div className="grid grid-cols-[1fr,80px,80px,90px] text-xs px-3 py-2 bg-white/[0.03] border-t border-white/10 gap-2">
            <div className="font-semibold col-span-2">{t('totalLabel')}</div>
            <div className="text-right font-semibold">{stats.totalResources}</div>
            <div className="text-right font-bold text-amber-400">{formatSilver(stats.totalCost)}</div>
          </div>
        </div>

        <div className="text-[11px] text-white/40 italic">{t('hint')}</div>
      </div>
    </div>
  )
}
