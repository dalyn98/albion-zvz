'use client'

import { useMemo, useState } from 'react'
import { Sword, UserCircle2, ArrowUpDown } from 'lucide-react'
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
      <div className="lg:col-span-2 rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpDown size={14} />
            {t('rosterTitle')}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white/80 focus:border-amber-400/50 outline-none"
            >
              <option value="kills">{t('sortKills')}</option>
              <option value="deaths">{t('sortDeaths')}</option>
              <option value="kd">{t('sortKd')}</option>
              <option value="survival">{t('sortSurvival')}</option>
              <option value="battles">{t('sortBattles')}</option>
            </select>
            <select
              value={weaponFilter}
              onChange={(e) => setWeaponFilter(e.target.value as WeaponFilter)}
              className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white/80 focus:border-amber-400/50 outline-none"
            >
              <option value="all">{t('filterAll')}</option>
              <option value="mace">{t('weaponMace')}</option>
              <option value="fire">{t('weaponFire')}</option>
              <option value="lifestaff">{t('weaponLifestaff')}</option>
              <option value="dagger">{t('weaponDagger')}</option>
              <option value="crossbow">{t('weaponCrossbow')}</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1.4fr,60px,60px,60px,60px] text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.03] px-3 py-2 border-b border-white/10 gap-2">
            <div>{t('colName')}</div>
            <div className="text-right">{t('colKills')}</div>
            <div className="text-right">{t('colDeaths')}</div>
            <div className="text-right">{t('colKd')}</div>
            <div className="text-right">{t('colSurvival')}</div>
          </div>
          {visible.map((row) => (
            <div
              key={row.ign}
              className="grid grid-cols-[1.4fr,60px,60px,60px,60px] text-xs px-3 py-2.5 border-b border-white/5 last:border-b-0 items-center gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 size={14} className="text-white/40 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{row.ign}</div>
                  <div className="text-[10px] text-white/40">{row.role}</div>
                </div>
              </div>
              <div className="text-right font-medium text-emerald-300">{row.kills}</div>
              <div className="text-right text-rose-300/80">{row.deaths}</div>
              <div className="text-right font-medium">{kdRatio(row).toFixed(2)}</div>
              <div className="text-right text-white/70">{row.survivalPct}%</div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-white/40">{t('emptyFilter')}</div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Sword size={14} className="text-amber-400" />
          {t('weaponDistribution')}
        </div>
        <div className="space-y-3">
          {weaponDistribution.map((row) => (
            <div key={row.weapon}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-white/80">{t(WEAPON_KEY[row.weapon])}</span>
                <span className="text-white/50">
                  {row.count}명 · {row.pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500"
                  style={{ width: `${row.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-white/40 italic mt-4">{t('hint')}</div>
      </div>
    </div>
  )
}
