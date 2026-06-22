import type { ComponentType, ReactNode } from 'react'
import {
  CalendarCheck,
  Flame,
  Heart,
  Shield,
  ShieldCheck,
  Skull,
  Sword,
  Swords,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import ItemImage from './ItemImage'
import CollapsibleList from './CollapsibleList'
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { getLocalizedItemName } from '@/lib/item-names'
import { canonicalT8WeaponId } from '@/lib/weapon-display'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import type { AlbionMemberDetail, MemberKillEvent } from '@/app/actions/members-admin'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { EmptyState, SectionCard, ValueDisplay, type DesignTone } from '@/components/ui-patterns'

interface Props {
  detail: AlbionMemberDetail
  timezone?: string
}

const WEAPON_COLLAPSED_COUNT = 6
const KILL_HISTORY_COLLAPSED_COUNT = 8

// Albion 미연동 멤버 전용 슬림 상세 뷰. MemberDetailView (Discord 가입자) 와는
// 보여줄 데이터셋이 다르므로 독립 컴포넌트로 둔다 — 잔액/리기어/환전/포인트/
// 랭킹/슬롯 이벤트 섹션이 모두 빠진다. 헤더와 통계 카드 디자인은 의도적으로
// 동일한 톤을 유지해 두 페이지가 시각적으로 형제처럼 보이도록.
export default async function AlbionMemberDetailView({
  detail,
  timezone = DEFAULT_TENANT_TIMEZONE,
}: Props) {
  const t = await getTranslations('albionMemberDetail')
  const tShared = await getTranslations('memberDetail')
  const tCommon = await getTranslations('common')
  const rawLocale = await getLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  return (
    <>
      <header className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-surface-2">
          <Swords size={26} className="text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">
              {detail.albion_player_name}
            </h1>
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
              {t('unlinkedBadge')}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {tCommon(ALBION_SERVER_LABEL_KEY[detail.albion_server])} · {detail.albion_guild_name}
          </p>
          <p className="text-xs text-muted">
            {t('joinedAt', { date: formatDate(detail.first_seen_at, timezone) })}
            <span className="ml-2 text-subtle">
              · {t('lastSeenAt', { date: formatDate(detail.last_seen_at, timezone) })}
            </span>
          </p>
        </div>
      </header>

      <section className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
        <p className="text-amber-200 text-xs leading-relaxed">{t('unlinkedNotice')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <TrendingUp size={14} className="text-amber-400" />
          {tShared('statsSectionTitle')}
        </h2>

        <StatSubGroup label={t('statsGroupGuildActivity')}>
          <StatCard
            icon={ShieldCheck}
            label={tShared('statTotalParticipation')}
            value={tShared('participationTimes', { count: detail.participation_count })}
            tone="amber"
          />
          <StatCard
            icon={Sword}
            label={tShared('statKills')}
            value={detail.killboard.kills.toLocaleString()}
            tone="rose"
          />
          <StatCard
            icon={Skull}
            label={tShared('statDeaths')}
            value={detail.killboard.deaths.toLocaleString()}
          />
          <StatCard
            icon={Target}
            label={tShared('statKd')}
            value={formatKd(detail.killboard.kills, detail.killboard.deaths)}
            tone="amber"
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupCombat')} cols={5}>
          <StatCard
            icon={Trophy}
            label={tShared('statWinRate')}
            value={formatSurvival(detail.advanced_stats.win_rate)}
            sub={
              detail.advanced_stats.evaluated_outcome_events > 0
                ? tShared('statWinLossSub', {
                    wins: detail.advanced_stats.wins,
                    losses: detail.advanced_stats.losses,
                  })
                : undefined
            }
            tone={winRateTone(detail.advanced_stats.win_rate)}
          />
          <StatCard
            icon={Heart}
            label={tShared('statSurvival')}
            value={formatSurvival(detail.advanced_stats.survival_rate)}
            sub={
              detail.advanced_stats.evaluated_events > 0
                ? tShared('statSurvivalSub', { count: detail.advanced_stats.evaluated_events })
                : undefined
            }
            tone={survivalTone(detail.advanced_stats.survival_rate)}
          />
          <StatCard
            icon={Shield}
            label={tShared('statDeathless')}
            value={tShared('statStreakUnit', {
              count: detail.advanced_stats.deathless_current_streak,
            })}
            sub={tShared('statStreakLongest', {
              count: detail.advanced_stats.deathless_longest_streak,
            })}
            tone="info"
          />
          <StatCard
            icon={CalendarCheck}
            label={tShared('statParticipationStreak')}
            value={tShared('statStreakDays', {
              count: detail.advanced_stats.participation_current_streak,
            })}
            sub={tShared('statStreakLongestDays', {
              count: detail.advanced_stats.participation_longest_streak,
            })}
            tone="amber"
          />
          <StatCard
            icon={Target}
            label={t('statAverageIp')}
            value={Math.round(detail.average_item_power).toLocaleString()}
            tone="info"
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupLifetime')}>
          <StatCard
            icon={Flame}
            label={t('statLifetimeKillFame')}
            value={detail.lifetime_kill_fame.toLocaleString()}
            tone="warning"
          />
          <StatCard
            icon={Flame}
            label={t('statLifetimeDeathFame')}
            value={detail.lifetime_death_fame.toLocaleString()}
          />
          <StatCard
            icon={Flame}
            label={tShared('statKillFame')}
            value={detail.killboard.kill_fame.toLocaleString()}
            sub={t('guildActivitySub')}
            tone="amber"
          />
          <StatCard
            icon={Flame}
            label={tShared('statDeathFame')}
            value={detail.killboard.death_fame.toLocaleString()}
            sub={t('guildActivitySub')}
          />
        </StatSubGroup>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Sword size={14} className="text-amber-400" />
          {tShared('weaponUsage')}
        </h2>
        {detail.weapon_breakdown.length === 0 ? (
          <EmptyState icon={Sword} title={tShared('noWeaponUsage')} />
        ) : (
          <CollapsibleList
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            initialCount={WEAPON_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.weapon_breakdown.map((w, idx) => {
              const canonicalId = canonicalT8WeaponId(w.weapon_id)
              const localized = canonicalId
                ? getLocalizedItemName(canonicalId, locale, null)
                : null
              const displayId = localized ? canonicalId : w.weapon_id
              const displayName = localized ?? w.weapon_name
              return (
                <li
                  key={`${displayId ?? 'free'}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <ItemImage itemId={displayId} itemName={displayName} size={36} hoverPreview />
                  <span className="flex-1 truncate text-sm text-foreground">{displayName}</span>
                  <span className="flex-shrink-0 font-mono text-xs font-bold text-amber-300">
                    {tShared('weaponUsageCount', { count: w.count })}
                  </span>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Sword size={14} className="text-red-400" />
          {tShared('killHistoryTitle', { count: detail.kill_history.length })}
        </h2>
        {detail.kill_history.length === 0 ? (
          <EmptyState icon={Skull} title={tShared('killHistoryEmpty')} />
        ) : (
          <CollapsibleList
            className="space-y-1.5"
            initialCount={KILL_HISTORY_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.kill_history.map((k) => (
              <KillHistoryRow
                key={`${k.event_id}-${k.role}`}
                entry={k}
                roleLabel={
                  k.role === 'killer' ? tShared('killRoleKiller') : tShared('killRoleVictim')
                }
                opponentLabel={(name) => tShared('killOpponent', { name })}
                opponentUnknownLabel={tShared('killOpponentUnknown')}
                itemPowerLabel={(value) => tShared('killItemPower', { value })}
                fameLabel={(fame) => tShared('killFameLabel', { fame })}
                timezone={timezone}
              />
            ))}
          </CollapsibleList>
        )}
      </section>
    </>
  )
}

interface KillHistoryRowProps {
  entry: MemberKillEvent
  roleLabel: string
  opponentLabel: (name: string) => string
  opponentUnknownLabel: string
  itemPowerLabel: (value: number) => string
  fameLabel: (fame: string) => string
  timezone: string
}

function KillHistoryRow({
  entry,
  roleLabel,
  opponentLabel,
  opponentUnknownLabel,
  itemPowerLabel,
  fameLabel,
  timezone,
}: KillHistoryRowProps) {
  const isKiller = entry.role === 'killer'
  const roleBadgeClass = isKiller
    ? 'bg-emerald-500/20 text-emerald-300'
    : 'bg-red-500/20 text-red-300'
  const opponent = entry.opponent_name
    ? opponentLabel(
        entry.opponent_guild
          ? `${entry.opponent_name} [${entry.opponent_guild}]`
          : entry.opponent_name,
      )
    : opponentUnknownLabel
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${roleBadgeClass}`}
      >
        {roleLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{opponent}</p>
        <p className="font-mono text-[10px] text-muted">
          {formatDateTime(entry.occurred_at, timezone)}
          {entry.item_power != null && (
            <span className="ml-2 text-subtle">{itemPowerLabel(entry.item_power)}</span>
          )}
          <span className="ml-2 text-subtle">{fameLabel(entry.fame.toLocaleString())}</span>
        </p>
      </div>
    </li>
  )
}

type StatTone = 'default' | 'emerald' | 'amber' | 'rose' | 'info' | 'warning'

type StatIcon = ComponentType<{ size?: number; className?: string }>

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: StatIcon
  label: string
  value: string
  sub?: string
  tone?: StatTone
}) {
  return (
    <SectionCard className="px-3 py-3 sm:p-3">
      <ValueDisplay
        icon={icon}
        label={label}
        value={value}
        detail={sub}
        tone={toDesignTone(tone)}
        size="sm"
        detailClassName="truncate text-[10px]"
      />
    </SectionCard>
  )
}

function StatSubGroup({
  label,
  cols = 4,
  children,
}: {
  label: string
  cols?: 3 | 4 | 5
  children: ReactNode
}) {
  const grid =
    cols === 3
      ? 'grid-cols-2 sm:grid-cols-3'
      : cols === 5
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-4'
  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</h3>
      <div className={`grid ${grid} gap-2.5`}>{children}</div>
    </div>
  )
}

function toDesignTone(tone: StatTone): DesignTone {
  if (tone === 'emerald') return 'success'
  if (tone === 'amber') return 'accent'
  if (tone === 'rose') return 'danger'
  if (tone === 'info') return 'info'
  if (tone === 'warning') return 'warning'
  return 'neutral'
}

function formatKd(kills: number, deaths: number): string {
  if (deaths === 0) {
    if (kills === 0) return '-'
    return `${kills}.00`
  }
  return (kills / deaths).toFixed(2)
}

function formatSurvival(rate: number | null): string {
  if (rate == null) return '-'
  return `${Math.round(rate * 100)}%`
}

function survivalTone(rate: number | null): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.8) return 'emerald'
  if (rate >= 0.5) return 'amber'
  return 'rose'
}

function winRateTone(rate: number | null): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.6) return 'emerald'
  if (rate >= 0.4) return 'amber'
  return 'rose'
}
