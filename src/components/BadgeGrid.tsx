import { getLocale, getTranslations } from 'next-intl/server'
import {
  CalendarCheck,
  Sword,
  Shield,
  Trophy,
  Users,
} from 'lucide-react'
import {
  summarizeAchievements,
  type AchievementDefinition,
  type AchievementCategory,
  type AchievementSummary,
  type AchievementTier,
  type MemberAchievement,
} from '@/lib/member-achievements'

interface Props {
  achievements: ReadonlyArray<MemberAchievement>
  // 헤더를 간결하게 하고 싶을 때 false. 기본: true (섹션 제목 + 진행도 뱃지 표시)
  showHeader?: boolean
}

interface PublicBadgeGridProps {
  achievements: ReadonlyArray<{
    definition: AchievementDefinition
    count: number
  }>
  showHeader?: boolean
}

const TIER_CLASS: Record<AchievementTier, string> = {
  bronze: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
  silver: 'bg-slate-500/10 border-slate-400/40 text-slate-200',
  gold: 'bg-amber-500/10 border-amber-500/40 text-amber-200',
  diamond: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200',
}

const CATEGORY_ICON_SIZE = 18

function categoryIcon(category: AchievementCategory) {
  switch (category) {
    case 'participation':
      return <CalendarCheck size={CATEGORY_ICON_SIZE} />
    case 'kill':
      return <Sword size={CATEGORY_ICON_SIZE} />
    case 'survival':
      return <Shield size={CATEGORY_ICON_SIZE} />
    case 'victory':
      return <Trophy size={CATEGORY_ICON_SIZE} />
    case 'scale':
      return <Users size={CATEGORY_ICON_SIZE} />
  }
}

export default async function BadgeGrid({
  achievements,
  showHeader = true,
}: Props) {
  return renderBadgeGrid(summarizeAchievements(achievements), showHeader, true)
}

export async function PublicBadgeGrid({
  achievements,
  showHeader = true,
}: PublicBadgeGridProps) {
  return renderBadgeGrid(achievements, showHeader, false)
}

async function renderBadgeGrid(
  visible: ReadonlyArray<{
    definition: AchievementDefinition
    count: number
    firstEarnedAt?: string
  }>,
  showHeader: boolean,
  showEarnedAt: boolean,
) {
  const [t, locale] = await Promise.all([
    getTranslations('badges'),
    getLocale(),
  ])
  const teamCount = visible.filter((summary) => summary.definition.track === 'team').length
  const individualCount = visible.length - teamCount

  return (
    <section className="space-y-3">
      {showHeader && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-white font-bold text-sm">{t('sectionTitle')}</h2>
          <p className="text-xs text-gray-400 font-mono">
            {t('earnedSummary', { team: teamCount, individual: individualCount })}
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-6">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {visible.map((status) => (
              <BadgeCard
                key={`${status.definition.key}:${status.definition.definitionVersion}`}
                summary={status}
                locale={locale}
                t={t}
                showEarnedAt={showEarnedAt}
              />
            ))}
          </div>
          <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 text-[11px] leading-relaxed text-gray-400">
            {teamCount > 0 && <p>{t('teamEvidenceLimit')}</p>}
            {individualCount > 0 && <p>{t('individualEvidenceLimit')}</p>}
          </div>
        </div>
      )}
    </section>
  )
}

type BadgeTranslator = Awaited<ReturnType<typeof getTranslations<'badges'>>>

function BadgeCard({
  summary,
  locale,
  t,
  showEarnedAt,
}: {
  summary: Pick<AchievementSummary, 'definition' | 'count'> & {
    firstEarnedAt?: string
  }
  locale: string
  t: BadgeTranslator
  showEarnedAt: boolean
}) {
  const { definition } = summary
  const base =
    'rounded-lg px-3 py-2 flex items-center gap-2 border transition-colors'
  const name = t(`names.${definition.key}`)
  const desc = t(`descriptions.${definition.key}`)
  const limitation =
    definition.track === 'team'
      ? t('teamEvidenceLimit')
      : t('individualEvidenceLimit')
  const earnedDate =
    showEarnedAt && summary.firstEarnedAt
      ? new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(new Date(summary.firstEarnedAt))
      : null

  return (
    <div className={`${base} ${TIER_CLASS[definition.tier]}`} title={limitation}>
      <span>{categoryIcon(definition.category)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold truncate">{name}</p>
          {definition.repeatable && summary.count > 1 && (
            <span className="text-[10px] font-mono font-bold">×{summary.count}</span>
          )}
        </div>
        <p className="text-[10px] opacity-80 truncate">{desc}</p>
        {earnedDate && (
          <p className="mt-1 text-[9px] opacity-70">
            {t('earnedAt', {
              date: earnedDate,
              version: definition.definitionVersion,
            })}
          </p>
        )}
      </div>
    </div>
  )
}
