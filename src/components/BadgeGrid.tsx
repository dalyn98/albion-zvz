import { getTranslations } from 'next-intl/server'
import {
  CalendarCheck,
  Sword,
  Shield,
  Heart,
  Flame,
  Lock,
} from 'lucide-react'
import {
  computeBadges,
  countUnlocked,
  type BadgeCategory,
  type BadgeInput,
  type BadgeStatus,
  type BadgeTier,
} from '@/lib/badges'

interface Props {
  input: BadgeInput
  // 헤더를 간결하게 하고 싶을 때 false. 기본: true (섹션 제목 + 진행도 뱃지 표시)
  showHeader?: boolean
  // true 면 미획득 뱃지 숨김 (공개 뷰 등에 사용). 기본: false.
  unlockedOnly?: boolean
}

const TIER_UNLOCKED_CLASS: Record<BadgeTier, string> = {
  bronze: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
  silver: 'bg-slate-500/10 border-slate-400/40 text-slate-200',
  gold: 'bg-amber-500/10 border-amber-500/40 text-amber-200',
  diamond: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200',
}

const CATEGORY_ICON_SIZE = 18

function categoryIcon(category: BadgeCategory) {
  switch (category) {
    case 'participation':
      return <CalendarCheck size={CATEGORY_ICON_SIZE} />
    case 'kill':
      return <Sword size={CATEGORY_ICON_SIZE} />
    case 'deathless':
      return <Shield size={CATEGORY_ICON_SIZE} />
    case 'survival':
      return <Heart size={CATEGORY_ICON_SIZE} />
    case 'streak':
      return <Flame size={CATEGORY_ICON_SIZE} />
  }
}

export default async function BadgeGrid({
  input,
  showHeader = true,
  unlockedOnly = false,
}: Props) {
  const t = await getTranslations('badges')
  const all = computeBadges(input)
  const unlockedCount = countUnlocked(all)
  const visible = unlockedOnly ? all.filter((b) => b.unlocked) : all

  return (
    <section className="space-y-3">
      {showHeader && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-white font-bold text-sm">{t('sectionTitle')}</h2>
          <p className="text-xs text-gray-400 font-mono">
            {t('unlockedSummary', { unlocked: unlockedCount, total: all.length })}
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-6">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visible.map((status) => (
            <BadgeCard key={status.definition.id} status={status} t={t} />
          ))}
        </div>
      )}
    </section>
  )
}

type BadgeTranslator = Awaited<ReturnType<typeof getTranslations<'badges'>>>

function BadgeCard({ status, t }: { status: BadgeStatus; t: BadgeTranslator }) {
  const { definition, unlocked, progress, currentValue } = status
  const base =
    'rounded-lg px-3 py-2 flex items-center gap-2 border transition-colors'
  const toneClass = unlocked
    ? TIER_UNLOCKED_CLASS[definition.tier]
    : 'bg-gray-900 border-gray-800 text-gray-500'

  const pct = Math.round(progress * 100)
  const name = t(`names.${definition.id}`)
  const desc = t(`descriptions.${definition.id}`)

  return (
    <div className={`${base} ${toneClass}`}>
      <span className={unlocked ? '' : 'opacity-50'}>
        {unlocked ? categoryIcon(definition.category) : <Lock size={CATEGORY_ICON_SIZE} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate">{name}</p>
        <p className="text-[10px] opacity-80 truncate">{desc}</p>
        {!unlocked && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1 flex-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[9px] font-mono tabular-nums text-gray-500">
              {currentValue}/{definition.threshold}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
