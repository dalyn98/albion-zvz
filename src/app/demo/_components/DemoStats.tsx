'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { DEMO_STATS_ROWS, type DemoStatsRow } from '@/data/demo-seed'

type SortKey = 'kills' | 'deaths' | 'kd' | 'survival' | 'battles'
type WeaponFilter = 'all' | DemoStatsRow['primaryWeapon']

const WEAPON_KEY: Record<DemoStatsRow['primaryWeapon'], string> = {
  mace: 'weaponMace',
  fire: 'weaponFire',
  lifestaff: 'weaponLifestaff',
  dagger: 'weaponDagger',
  crossbow: 'weaponCrossbow',
}

const SORT_OPTIONS: Array<{ key: SortKey; labelKey: string }> = [
  { key: 'kills', labelKey: 'sortKills' },
  { key: 'deaths', labelKey: 'sortDeaths' },
  { key: 'kd', labelKey: 'sortKd' },
  { key: 'survival', labelKey: 'sortSurvival' },
  { key: 'battles', labelKey: 'sortBattles' },
]

const WEAPON_OPTIONS: Array<{ key: WeaponFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'mace', labelKey: 'weaponMace' },
  { key: 'fire', labelKey: 'weaponFire' },
  { key: 'lifestaff', labelKey: 'weaponLifestaff' },
  { key: 'dagger', labelKey: 'weaponDagger' },
  { key: 'crossbow', labelKey: 'weaponCrossbow' },
]

function kdRatio(row: DemoStatsRow): number {
  if (row.deaths === 0) return row.kills
  return row.kills / row.deaths
}

export function DemoStats() {
  const t = useTranslations('demo.stats')
  const [sortKey, setSortKey] = useState<SortKey>('kills')
  const [weaponFilter, setWeaponFilter] = useState<WeaponFilter>('all')

  const visible = useMemo(() => {
    let rows = [...DEMO_STATS_ROWS]
    if (weaponFilter !== 'all') {
      rows = rows.filter((r) => r.primaryWeapon === weaponFilter)
    }
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'kills':
          return b.kills - a.kills
        case 'deaths':
          return b.deaths - a.deaths
        case 'kd':
          return kdRatio(b) - kdRatio(a)
        case 'survival':
          return b.survivalPct - a.survivalPct
        case 'battles':
          return b.battles - a.battles
      }
    })
    return rows
  }, [sortKey, weaponFilter])

  const weaponDistribution = useMemo(() => {
    const counts: Record<DemoStatsRow['primaryWeapon'], number> = {
      mace: 0,
      fire: 0,
      lifestaff: 0,
      dagger: 0,
      crossbow: 0,
    }
    for (const row of DEMO_STATS_ROWS) counts[row.primaryWeapon] += 1
    const total = DEMO_STATS_ROWS.length
    return Object.entries(counts).map(([k, v]) => ({
      weapon: k as DemoStatsRow['primaryWeapon'],
      pct: Math.round((v / total) * 100),
      count: v,
    }))
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <div className="space-y-2">
          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
            {t('sortLabel')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  sortKey === opt.key
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
            {t('weaponFilterLabel')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEAPON_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setWeaponFilter(opt.key)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  weaponFilter === opt.key
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-xs text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('colName')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('colKills')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('colDeaths')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('colKd')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('colSurvival')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.ign} className="border-t border-gray-800 hover:bg-gray-800/30">
                  <td className="px-3 py-2.5">
                    <div className="text-white text-sm font-semibold truncate">{row.ign}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{row.role}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-400 text-sm">
                    {row.kills}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-400 text-sm">
                    {row.deaths}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-white text-sm">
                    {kdRatio(row).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-300 text-sm">
                    {row.survivalPct}%
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500 text-sm">
                    {t('emptyFilter')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">{t('weaponDistribution')}</h3>
        <div className="space-y-3">
          {weaponDistribution.map((row) => (
            <div key={row.weapon}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-300 font-medium">{t(WEAPON_KEY[row.weapon])}</span>
                <span className="text-gray-500 font-mono">
                  {row.count} · {row.pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-gray-500 italic pt-2 border-t border-gray-800">
          {t('hint')}
        </div>
      </div>
    </div>
  )
}
