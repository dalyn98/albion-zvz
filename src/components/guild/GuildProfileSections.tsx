import type { ReactNode } from 'react'
import Image from 'next/image'
import {
  Crown,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Swords,
  Users,
} from 'lucide-react'
import type { ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import type { GalleryItem } from '@/lib/guild-profile-gallery-config'
import type {
  BattleOutcome,
  RecentBattleSummary,
  TopContributorSummary,
} from '@/lib/guild-profile-activity'
import type { RivalGuild, WeaponCategoryUsage } from '@/lib/guild-profile-stats'

type AccentClasses = (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]

interface SectionHeaderProps {
  icon: ReactNode
  label: string
  accent: AccentClasses
}

export function SectionHeader({ icon, label, accent }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center gap-2 ${accent.heading} text-xs font-bold uppercase tracking-[0.25em]`}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className={`flex-1 h-px ${accent.divider}`} />
      <span
        className={`inline-block w-1 h-1 rounded-full ${accent.dot} shrink-0 opacity-70`}
      />
    </div>
  )
}

interface GalleryGridProps {
  items: GalleryItem[]
  fallbackAlt: string
  accent: AccentClasses
}

// 항목 수 기반 분기. 1장 = 풀 카드, 2장 = 동일 그리드, 3장+ = editorial (첫
// 사진을 2x2 로 키우고 나머지는 1x1). 4장 이상부터는 sm:auto-rows 가 자연스럽게
// 확장한다.
export function GalleryGrid({ items, fallbackAlt, accent }: GalleryGridProps) {
  if (items.length === 1) {
    return (
      <div className="grid grid-cols-1">
        <GalleryFigure item={items[0]} fallbackAlt={fallbackAlt} accent={accent} />
      </div>
    )
  }
  if (items.length === 2) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <GalleryFigure
            key={item.id}
            item={item}
            fallbackAlt={fallbackAlt}
            accent={accent}
          />
        ))}
      </div>
    )
  }
  const [first, ...rest] = items
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 sm:auto-rows-[160px] gap-3">
      <div className="sm:col-span-2 sm:row-span-2 sm:h-auto h-64">
        <GalleryFigure
          item={first}
          fallbackAlt={fallbackAlt}
          accent={accent}
          fillParent
        />
      </div>
      {rest.map((item) => (
        <div key={item.id} className="sm:h-auto h-44">
          <GalleryFigure item={item} fallbackAlt={fallbackAlt} accent={accent} fillParent />
        </div>
      ))}
    </div>
  )
}

interface GalleryFigureProps {
  item: GalleryItem
  fallbackAlt: string
  accent: AccentClasses
  fillParent?: boolean
}

function GalleryFigure({ item, fallbackAlt, accent, fillParent }: GalleryFigureProps) {
  const sizing = fillParent ? 'h-full' : 'aspect-[16/9]'
  return (
    <figure
      className={`group relative rounded-xl overflow-hidden border ${accent.border} bg-gray-900/50 ${sizing} transition-all hover:-translate-y-0.5 hover:shadow-2xl`}
    >
      <Image
        src={item.imageUrl}
        alt={item.caption || fallbackAlt}
        fill
        sizes={fillParent ? '(min-width: 640px) 33vw, 100vw' : '100vw'}
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {item.caption && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 py-3 text-sm text-white font-medium">
          {item.caption}
        </figcaption>
      )}
    </figure>
  )
}

interface StatCardProps {
  icon: ReactNode
  label: string
  value: number | null
  unit: string
  accent: AccentClasses
}

export function StatCard({ icon, label, value, unit, accent }: StatCardProps) {
  return (
    <div
      className={`relative rounded-xl border ${accent.border} bg-gray-900/40 px-5 py-5 backdrop-blur-sm overflow-hidden transition-colors hover:bg-gray-900/60`}
    >
      <div
        className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${accent.heroGlow} blur-2xl pointer-events-none`}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span
          className={`flex items-center justify-center w-9 h-9 rounded-lg ${accent.badgeBg} ${accent.heading}`}
        >
          {icon}
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
        >
          {label}
        </span>
      </div>
      <div className="relative">
        {value !== null ? (
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-black ${accent.heading}`}>
              {value.toLocaleString()}
            </span>
            <span className="text-gray-500 text-xs">{unit}</span>
          </div>
        ) : (
          <div className="text-gray-300 text-sm">{unit}</div>
        )}
      </div>
    </div>
  )
}

// 결과(승/패/무) 색은 액센트와 무관하게 universal 매핑. 길드 액센트가 rose 인
// 경우 패배 카드까지 분홍이면 결과를 못 읽으니 분리.
const OUTCOME_BADGE: Record<BattleOutcome, string> = {
  win: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/50',
  loss: 'bg-rose-500/20 text-rose-200 ring-rose-500/50',
  tie: 'bg-slate-500/20 text-slate-200 ring-slate-500/50',
}

const OUTCOME_ICON: Record<BattleOutcome, ReactNode> = {
  win: <ShieldCheck size={12} />,
  loss: <Skull size={12} />,
  tie: <ShieldAlert size={12} />,
}

interface RecentBattleCardProps {
  battle: RecentBattleSummary
  accent: AccentClasses
  sizeLabel: string
  outcomeLabel: string
  relativeLabel: string
  titleLabel: string
  opponentLabel: string
}

export function RecentBattleCard({
  battle,
  accent,
  sizeLabel,
  outcomeLabel,
  relativeLabel,
  titleLabel,
  opponentLabel,
}: RecentBattleCardProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ring-1 uppercase tracking-[0.15em] ${OUTCOME_BADGE[battle.outcome]}`}
        >
          {OUTCOME_ICON[battle.outcome]}
          <span>{outcomeLabel}</span>
        </span>
        <span className="text-[11px] text-gray-500 font-mono shrink-0 tabular-nums">
          {relativeLabel}
        </span>
      </div>
      <div>
        <p
          className={`text-[10px] uppercase tracking-[0.22em] font-bold mb-2 ${accent.heading}`}
        >
          {titleLabel}
        </p>
        <p className="text-lg sm:text-xl font-bold text-white truncate leading-tight">
          {opponentLabel}
        </p>
      </div>
      <div className="flex items-center gap-6 pt-4 border-t border-gray-800">
        <div className="flex items-baseline gap-1.5">
          <Swords size={15} className={`${accent.heading} self-center`} />
          <span className={`text-3xl font-black ${accent.heading} tabular-nums`}>
            {battle.homeKills}
          </span>
          <span className="text-gray-600 text-[11px] font-mono uppercase tracking-wider">
            K
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <Skull size={15} className="text-gray-500 self-center" />
          <span className="text-3xl font-black text-gray-300 tabular-nums">
            {battle.homeDeaths}
          </span>
          <span className="text-gray-600 text-[11px] font-mono uppercase tracking-wider">
            D
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Users size={11} className="text-gray-600" />
          <span className="text-[11px] text-gray-500 font-mono">
            {battle.homeTeamSize} · {sizeLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

interface TopContributorsCardProps {
  contributors: TopContributorSummary[]
  accent: AccentClasses
  titleLabel: string
  killsUnit: string
}

export function TopContributorsCard({
  contributors,
  accent,
  titleLabel,
  killsUnit,
}: TopContributorsCardProps) {
  return (
    <div className="space-y-4 h-full flex flex-col">
      <p className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}>
        {titleLabel}
      </p>
      <ul className="space-y-2.5 flex-1">
        {contributors.map((c, idx) => (
          <li key={c.albionPlayerId} className="flex items-center gap-3">
            <div className="relative shrink-0">
              {c.avatarUrl ? (
                <Image
                  src={c.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  sizes="36px"
                  className="rounded-full bg-gray-800 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                  <Users size={14} className="text-gray-600" />
                </div>
              )}
              {idx === 0 && (
                <Crown
                  size={14}
                  className={`absolute -top-1 -right-1 ${accent.heading} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
                  fill="currentColor"
                />
              )}
            </div>
            <span className="flex-1 text-sm text-white font-medium truncate">{c.name}</span>
            <span className="flex items-baseline gap-1 shrink-0">
              <span className={`text-base font-black ${accent.heading}`}>{c.kills}</span>
              <span className="text-gray-500 text-[11px]">{killsUnit}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface HeroChipProps {
  icon: ReactNode
  label: string
  accent: AccentClasses
}

// hero 본체에 들어가는 작은 정보 칩. recruitment status 배지와 톤 통일하되
// glow 보다는 차분한 ring 처리 — 정보성이지 강조가 아님.
export function HeroChip({ icon, label, accent }: HeroChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
    >
      <span className="opacity-80">{icon}</span>
      <span className="truncate max-w-[200px]">{label}</span>
    </span>
  )
}

interface InfoCardProps {
  icon: ReactNode
  title: string
  body: string
  accent: AccentClasses
}

// 모집 정보 / 가입 절차 카드. 자유 텍스트 멀티라인을 안전하게 렌더 (whitespace-pre-line).
export function InfoCard({ icon, title, body, accent }: InfoCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm transition-colors hover:bg-gray-900/60`}
    >
      <div className={`flex items-center gap-2 ${accent.heading} text-[10px] uppercase tracking-[0.2em] font-bold mb-3`}>
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  )
}

interface WeaponDistributionCardProps {
  weapons: Array<WeaponCategoryUsage & { label: string }>
  totalCount: number
  accent: AccentClasses
  titleLabel: string
  windowLabel: string
}

export function WeaponDistributionCard({
  weapons,
  totalCount,
  accent,
  titleLabel,
  windowLabel,
}: WeaponDistributionCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm space-y-3`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold ${accent.heading}`}>
          {titleLabel}
        </p>
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
          {windowLabel}
        </span>
      </div>
      <ul className="space-y-2">
        {weapons.map((w) => {
          const pct = totalCount > 0 ? Math.round((w.count / totalCount) * 100) : 0
          return (
            <li key={w.category} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-gray-200 font-medium truncate">{w.label}</span>
                <span className={`shrink-0 font-mono tabular-nums ${accent.heading}`}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${accent.dot}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface RivalsCardProps {
  rivals: RivalGuild[]
  accent: AccentClasses
  titleLabel: string
  windowLabel: string
  battlesUnit: string
}

export function RivalsCard({
  rivals,
  accent,
  titleLabel,
  windowLabel,
  battlesUnit,
}: RivalsCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm space-y-3`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold ${accent.heading}`}>
          {titleLabel}
        </p>
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
          {windowLabel}
        </span>
      </div>
      <ul className="space-y-2.5">
        {rivals.map((r) => (
          <li key={r.guildName} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-white font-semibold truncate">{r.guildName}</span>
              <span className="text-[11px] text-gray-500 font-mono tabular-nums shrink-0">
                {r.battleCount} {battlesUnit}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-emerald-300 tabular-nums">{r.wins}W</span>
              <span className="text-gray-700">·</span>
              <span className="text-rose-300 tabular-nums">{r.losses}L</span>
              {r.ties > 0 && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-400 tabular-nums">{r.ties}T</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// K/D 비율 표시 — 한 자리 소수까지. 1.0 미만은 둘째 자리까지 (0.85 가 0.9 가 되면
// 0.9 와 1 의 차가 모호해짐).
export function formatRatio(ratio: number): string {
  if (ratio >= 10) return ratio.toFixed(0)
  if (ratio >= 1) return ratio.toFixed(2)
  return ratio.toFixed(2)
}
