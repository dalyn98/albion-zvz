import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { BarChart3, Trophy } from 'lucide-react'
import { DEMO_MEMBERS, type DemoMember, type DemoWeaponKey } from '@/data/demo-seed'

// 길드 통계 페이지 — 어드민이 한눈에 보는 길드 활동 데이터.
// - K/D 랭킹: 전투 50건 이상 길드원만 (소규모 표본 노이즈 차단).
// - 주 무기 분포: 길드원 primaryWeapon 카운트.
// - 주간 출석률: weeklyAttendance 정렬.
// - 업적 누적: 각 업적을 보유한 길드원 수.
export default async function DemoStatsPage() {
  const t = await getTranslations('demo')

  const kdRanked = [...DEMO_MEMBERS]
    .filter((m) => m.battles >= 50)
    .sort((a, b) => kdRatio(b) - kdRatio(a))

  const weaponCounts = countByKey(DEMO_MEMBERS, 'primaryWeapon')

  const attendanceRanked = [...DEMO_MEMBERS].sort(
    (a, b) => b.weeklyAttendance.attended - a.weeklyAttendance.attended,
  )

  const achievementCounts = aggregateAchievements(DEMO_MEMBERS)
  const totalMembers = DEMO_MEMBERS.length

  return (
    <div className="space-y-6">
      <Link
        href="/demo"
        className="inline-block text-xs text-gray-500 hover:text-amber-400 transition-colors"
      >
        ← {t('dashboard.title')}
      </Link>

      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {t('stats.title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('stats.subtitle')}</p>
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <header className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 space-y-0.5">
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
            <Trophy size={13} className="text-amber-400" />
            {t('stats.kdRanking')}
          </h2>
          <p className="text-[11px] text-gray-500">{t('stats.kdRankingHint')}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 w-10">{t('stats.colRank')}</th>
                <th className="text-left px-3 py-2">{t('stats.colMember')}</th>
                <th className="text-right px-3 py-2">{t('stats.colKills')}</th>
                <th className="text-right px-3 py-2">{t('stats.colDeaths')}</th>
                <th className="text-right px-3 py-2">{t('stats.colKd')}</th>
                <th className="text-right px-3 py-2 pr-4">{t('stats.colSurvival')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {kdRanked.map((m, i) => (
                <tr key={m.ign} className="text-gray-200">
                  <td className="px-3 py-2 font-mono text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-white">{m.ign}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">{m.kills}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-400">{m.deaths}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-300 font-bold">
                    {kdRatio(m).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 pr-4 text-right font-mono text-gray-300">
                    {m.survivalPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <header className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 space-y-0.5">
            <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 size={13} className="text-amber-400" />
              {t('stats.weaponDistribution')}
            </h2>
            <p className="text-[11px] text-gray-500">{t('stats.weaponDistributionHint')}</p>
          </header>
          <div className="p-4 space-y-2.5">
            {weaponCounts.map(({ key, count }) => {
              const pct = totalMembers > 0 ? (count / totalMembers) * 100 : 0
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-300 font-medium">{t(`weapons.${key}`)}</span>
                    <span className="font-mono text-gray-400">
                      {count} <span className="text-gray-600">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <header className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 space-y-0.5">
            <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              {t('stats.attendance')}
            </h2>
            <p className="text-[11px] text-gray-500">{t('stats.attendanceHint')}</p>
          </header>
          <ul className="divide-y divide-gray-800">
            {attendanceRanked.map((m) => {
              const pct =
                m.weeklyAttendance.total > 0
                  ? (m.weeklyAttendance.attended / m.weeklyAttendance.total) * 100
                  : 0
              return (
                <li
                  key={m.ign}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-white font-medium truncate">{m.ign}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-gray-300 w-12 text-right">
                      {m.weeklyAttendance.attended}/{m.weeklyAttendance.total}
                    </span>
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {achievementCounts.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <header className="bg-gray-950 px-4 py-2.5 border-b border-gray-800">
            <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy size={13} className="text-amber-400" />
              {t('stats.achievementSummary')}
            </h2>
          </header>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {achievementCounts.map(({ key, count }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Trophy size={11} className="text-amber-400 flex-shrink-0" />
                  <span className="text-gray-200 truncate">{t(`achievements.${key}`)}</span>
                </div>
                <span className="text-amber-300 font-mono font-semibold flex-shrink-0">
                  {t('stats.achievementCount', { n: count })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-gray-600 italic px-1">{t('stats.demoOnlyDetail')}</p>
    </div>
  )
}

function kdRatio(m: DemoMember): number {
  return m.deaths > 0 ? m.kills / m.deaths : m.kills
}

function countByKey<K extends keyof DemoMember>(
  members: DemoMember[],
  key: K,
): { key: DemoWeaponKey; count: number }[] {
  const tally = new Map<DemoWeaponKey, number>()
  for (const m of members) {
    const v = m[key] as DemoWeaponKey
    tally.set(v, (tally.get(v) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count)
}

function aggregateAchievements(members: DemoMember[]): { key: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const m of members) {
    for (const a of m.achievements) {
      tally.set(a, (tally.get(a) ?? 0) + 1)
    }
  }
  return [...tally.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}
