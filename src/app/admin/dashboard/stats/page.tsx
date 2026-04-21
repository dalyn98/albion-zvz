import { BarChart3, Wallet, TrendingUp, TrendingDown, Users } from 'lucide-react'
import { getPointStats } from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'

export const dynamic = 'force-dynamic'

export default async function AdminStatsPage() {
  const { stats, error } = await getPointStats()

  if (error || !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">통계</h1>
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 rounded-lg p-4 text-sm">
          통계를 불러오지 못했습니다: {error ?? '알 수 없는 오류'}
        </div>
      </div>
    )
  }

  // 부채(총 보유 포인트) 대비 누적 상황을 한눈에 보이게 지표 4개로 구성.
  // 추후 상점/이벤트 지표도 여기에 쌓아 나간다.
  const cards = [
    {
      label: '길드원 보유 포인트 총액',
      value: stats.totalHeld,
      hint: `${stats.memberCount.toLocaleString()}명의 원장 계정`,
      icon: Wallet,
      accent: 'text-amber-400',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: '누적 지급 포인트',
      value: stats.lifetimeEarned,
      hint: `${stats.entriesCount.toLocaleString()}건의 원장 기록`,
      icon: TrendingUp,
      accent: 'text-emerald-400',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: '누적 소비 포인트',
      value: stats.lifetimeSpent,
      hint: '환전/상점/관리자 조정 차감 합',
      icon: TrendingDown,
      accent: 'text-rose-400',
      ring: 'border-rose-500/30',
      bg: 'bg-rose-500/5',
    },
    {
      label: '포인트 보유 길드원',
      value: stats.topHolders.length,
      hint: `총 ${stats.memberCount.toLocaleString()}명 중 잔액 > 0`,
      icon: Users,
      accent: 'text-sky-400',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">통계</h1>
      </div>
      <p className="text-sm text-gray-400">
        길드 포인트 원장(point_ledger) 집계. 리기어 승인/기부/환전/상점 구매/관리자 조정이 모두
        반영됩니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`${card.bg} ${card.ring} border rounded-lg p-4 space-y-2`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.accent} />
                <span className="text-xs text-gray-300">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${card.accent}`}>
                {card.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
            </div>
          )
        })}
      </div>

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">포인트 보유 상위 길드원</h2>
          <span className="text-xs text-gray-500">Top {stats.topHolders.length}</span>
        </header>
        {stats.topHolders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            아직 포인트를 보유한 길드원이 없습니다.
          </div>
        ) : (
          <ol className="divide-y divide-gray-800">
            {stats.topHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate">
                  {h.username}
                  {h.isAdmin && (
                    <span className="ml-2 text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 align-middle">
                      ADMIN
                    </span>
                  )}
                </span>
                <span className="text-sm font-mono text-amber-300 tabular-nums">
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
