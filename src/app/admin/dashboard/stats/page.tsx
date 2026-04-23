import Image from 'next/image'
import {
  BarChart3,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  CalendarCheck,
  UserCheck,
  UserMinus,
  UserX,
  ShoppingBag,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
  Trophy,
} from 'lucide-react'
import {
  getPointStats,
  getEventStats,
  getShopRegearStats,
  getAlbionVerificationStats,
  type TopHolder,
  type VerificationMember,
} from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import { ALBION_SERVER_LABEL } from '@/lib/albion-gameinfo'

export const dynamic = 'force-dynamic'

function itemImageUrl(uniqueName: string, enchant: number, quality: number): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: '48' })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

export default async function AdminStatsPage() {
  // 네 섹션을 병렬로 — 하나가 느려도 다른 섹션이 블로킹되지 않도록.
  const [pointRes, eventRes, shopRegearRes, verificationRes] = await Promise.all([
    getPointStats(),
    getEventStats(),
    getShopRegearStats(),
    getAlbionVerificationStats(),
  ])

  const { stats, error } = pointRes

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
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate"
                  />
                  {h.isAdmin && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
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

      <AlbionVerificationSection result={verificationRes} />
      <EventParticipationSection result={eventRes} />
      <ShopRegearSection result={shopRegearRes} />
      <WithdrawnMembersSection
        withdrawnHeld={stats.withdrawnHeld}
        withdrawnHolders={stats.withdrawnHolders}
      />
    </div>
  )
}

function WithdrawnMembersSection({
  withdrawnHeld,
  withdrawnHolders,
}: {
  withdrawnHeld: number
  withdrawnHolders: TopHolder[]
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-white">탈퇴한 사용자</h2>
      </div>
      <p className="text-xs text-gray-500">
        Discord 서버에서 나갔거나 활동 역할을 잃은 구성원입니다. 포인트 원장에 남은 잔액은 회수/정리 시 참고하세요.
        동기화는 하루 1회(KST 04:00) 자동으로 수행됩니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">탈퇴자 보유 포인트 합계</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHeld.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">잔액 &gt; 0 인 탈퇴자 포함</div>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <UserMinus size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">잔액 보유 탈퇴자 수</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHolders.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">현재 잔액이 0보다 큰 사람</div>
        </div>
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">탈퇴자 잔액 목록</h3>
          <span className="text-xs text-gray-500">{withdrawnHolders.length}명</span>
        </header>
        {withdrawnHolders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            잔액이 남은 탈퇴자가 없습니다.
          </div>
        ) : (
          <ol className="divide-y divide-gray-800">
            {withdrawnHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-400 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate line-through"
                  />
                  <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5 flex-shrink-0">
                    WITHDRAWN
                  </span>
                </span>
                <span className="text-sm font-mono text-gray-400 tabular-nums">
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function EventParticipationSection({
  result,
}: {
  result: Awaited<ReturnType<typeof getEventStats>>
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        이벤트 참여 통계를 불러오지 못했습니다: {error ?? '알 수 없는 오류'}
      </section>
    )
  }

  const ratePercent = Math.round(stats.participationRate * 1000) / 10 // 소수 1자리.
  const cards = [
    {
      label: `최근 ${stats.windowDays}일 이벤트 수`,
      value: stats.totalEvents,
      hint: '창 내 생성된 이벤트',
      icon: CalendarCheck,
      accent: 'text-indigo-300',
      ring: 'border-indigo-500/30',
      bg: 'bg-indigo-500/5',
    },
    {
      label: '참여한 길드원',
      value: stats.activeMembers,
      hint: `전체 ${stats.totalMembers.toLocaleString()}명 중`,
      icon: UserCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: '참여율',
      value: `${ratePercent.toLocaleString()}%`,
      hint: 'activeMembers / totalMembers',
      icon: Users,
      accent: 'text-sky-300',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck size={18} className="text-indigo-300" />
        <h2 className="text-lg font-semibold text-white">
          이벤트 참여 · 최근 {stats.windowDays}일
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">최다 참석 길드원</h3>
          <span className="text-xs text-gray-500">Top {stats.topAttendees.length}</span>
        </header>
        {stats.topAttendees.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            창 내 이벤트 참여 기록이 없습니다.
          </div>
        ) : (
          <ol className="divide-y divide-gray-800">
            {stats.topAttendees.map((a, idx) => (
              <li
                key={a.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MemberAvatar discordId={a.discordId} avatar={a.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={a.discordId}
                    username={a.username}
                    className="truncate"
                  />
                  {a.isAdmin && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                      ADMIN
                    </span>
                  )}
                </span>
                <span className="text-sm font-mono text-indigo-300 tabular-nums">
                  {a.eventCount.toLocaleString()}회
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function ShopRegearSection({
  result,
}: {
  result: Awaited<ReturnType<typeof getShopRegearStats>>
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        상점/리기어 트렌드를 불러오지 못했습니다: {error ?? '알 수 없는 오류'}
      </section>
    )
  }

  const cards = [
    {
      label: `최근 ${stats.windowDays}일 상점 주문`,
      value: stats.ordersCreated,
      hint: `승인 ${stats.ordersApproved.toLocaleString()}건 · ${stats.pointsSpent.toLocaleString()}p`,
      icon: ShoppingBag,
      accent: 'text-amber-300',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: `최근 ${stats.windowDays}일 리기어`,
      value: stats.regearCreated,
      hint: `승인 ${stats.regearApproved.toLocaleString()}건 · ${stats.silverPaid.toLocaleString()}s`,
      icon: ShieldCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: '대기중 주문',
      value: stats.ordersPending,
      hint: '현재 pending 상점 주문',
      icon: Clock,
      accent: stats.ordersPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.ordersPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.ordersPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
    {
      label: '대기중 리기어',
      value: stats.regearPending,
      hint: '현재 pending 리기어 신청',
      icon: Clock,
      accent: stats.regearPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.regearPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.regearPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold text-white">
          상점 · 리기어 트렌드 · 최근 {stats.windowDays}일
        </h2>
      </div>

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

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">최다 판매 아이템</h3>
          <span className="text-xs text-gray-500">
            승인 기준 Top {stats.topSoldItems.length}
          </span>
        </header>
        {stats.topSoldItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            창 내 승인된 주문이 없습니다.
          </div>
        ) : (
          <ol className="divide-y divide-gray-800">
            {stats.topSoldItems.map((item, idx) => (
              <li
                key={`${item.uniqueName}@${item.enchant}#${item.quality}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <div className="relative w-8 h-8 rounded bg-gray-950 flex-shrink-0">
                  <Image
                    src={itemImageUrl(item.uniqueName, item.enchant, item.quality)}
                    alt={item.nameKo}
                    fill
                    className="object-contain pixel-img"
                    unoptimized
                  />
                </div>
                <span className="flex-1 text-sm text-gray-200 truncate">
                  {item.nameKo}
                  {item.enchant > 0 && (
                    <span className="text-amber-300 ml-1 font-mono">.{item.enchant}</span>
                  )}
                </span>
                <span className="text-xs font-mono text-gray-400 tabular-nums">
                  × {item.quantity.toLocaleString()}
                </span>
                <span className="text-sm font-mono text-amber-300 tabular-nums w-24 text-right">
                  {item.points.toLocaleString()}p
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function AlbionVerificationSection({
  result,
}: {
  result: Awaited<ReturnType<typeof getAlbionVerificationStats>>
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        알비온 인증 현황을 불러오지 못했습니다: {error ?? '알 수 없는 오류'}
      </section>
    )
  }

  const cards = [
    {
      label: '활동 멤버',
      value: stats.totalActive,
      hint: 'withdrawn_at IS NULL',
      icon: Users,
      accent: 'text-gray-300',
      ring: 'border-gray-700',
      bg: 'bg-gray-800/40',
    },
    {
      label: '인증 완료',
      value: stats.verified,
      hint: 'verified_at NOT NULL · 홈 길드 일치',
      icon: ShieldCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: '미인증',
      value: stats.unverified,
      hint: '수동 입력 또는 홈 길드 불일치',
      icon: ShieldAlert,
      accent: stats.unverified > 0 ? 'text-yellow-300' : 'text-gray-400',
      ring: stats.unverified > 0 ? 'border-yellow-500/30' : 'border-gray-700',
      bg: stats.unverified > 0 ? 'bg-yellow-500/5' : 'bg-gray-800/40',
    },
    {
      label: '온보딩 미완료',
      value: stats.onboardingPending,
      hint: 'albion_server IS NULL',
      icon: ShieldQuestion,
      accent: stats.onboardingPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.onboardingPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.onboardingPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">알비온 인증 현황</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        멤버가 로그인 후 알비온 캐릭터 정보를 등록하고 홈 길드 소속임을 인증한 상태를 집계합니다.
        미인증 멤버는 리기어/환전/기부 등 인증 필요 기능을 쓸 수 없습니다.
        {!stats.homeGuildConfigured && (
          <span className="text-amber-300 ml-1">
            홈 길드 ID 가 설정되어 있지 않아 모든 멤버가 미인증 상태로 저장됩니다.
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <VerificationMemberList
        title="온보딩 미완료 멤버"
        icon={UserX}
        accent="text-rose-300"
        emptyLabel="모든 활동 멤버가 온보딩을 마쳤습니다."
        members={stats.pendingMembers}
        mode="pending"
      />
      <VerificationMemberList
        title="미인증 멤버"
        icon={ShieldAlert}
        accent="text-yellow-300"
        emptyLabel="미인증 멤버가 없습니다."
        members={stats.unverifiedMembers}
        mode="unverified"
      />
    </section>
  )
}

function VerificationMemberList({
  title,
  icon: Icon,
  accent,
  emptyLabel,
  members,
  mode,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent: string
  emptyLabel: string
  members: VerificationMember[]
  mode: 'pending' | 'unverified'
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
      <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Icon size={14} className={accent} />
          {title}
        </h3>
        <span className="text-xs text-gray-500">{members.length}명</span>
      </header>
      {members.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-gray-800">
          {members.map((m) => (
            <li key={m.discordId} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40">
              <MemberAvatar discordId={m.discordId} avatar={m.avatar} size={24} />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <MemberLink
                  discordId={m.discordId}
                  username={m.username}
                  className="text-sm text-gray-200 truncate"
                />
                {m.isAdmin && (
                  <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {mode === 'unverified' && (
                <div className="hidden sm:flex flex-col items-end text-[11px] text-gray-500 min-w-0">
                  <span className="text-gray-300 truncate max-w-[140px]">
                    {m.nickname ?? '—'}
                  </span>
                  <span className="font-mono">
                    {m.server ? ALBION_SERVER_LABEL[m.server] : '—'}
                    {m.guildId ? (
                      m.guildMatchesHome ? (
                        <span className="ml-1 text-emerald-400">· 길드 일치</span>
                      ) : (
                        <span className="ml-1 text-rose-400">· 타 길드</span>
                      )
                    ) : (
                      <span className="ml-1 text-gray-600">· 수동입력</span>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
