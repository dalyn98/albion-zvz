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
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { getLocalizedItemName } from '@/lib/item-names'
import { canonicalT8WeaponId } from '@/lib/weapon-display'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import type { AlbionMemberDetail, MemberKillEvent } from '@/app/actions/members-admin'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

interface Props {
  detail: AlbionMemberDetail
  timezone?: string
}

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
      <header className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
          <Swords size={26} className="text-gray-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white text-lg sm:text-xl font-bold truncate">
              {detail.albion_player_name}
            </h1>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300 flex-shrink-0">
              {t('unlinkedBadge')}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5 truncate">
            {tCommon(ALBION_SERVER_LABEL_KEY[detail.albion_server])} · {detail.albion_guild_name}
          </p>
          <p className="text-gray-500 text-xs">
            {t('joinedAt', { date: formatDate(detail.first_seen_at, timezone) })}
            <span className="ml-2 text-gray-600">
              · {t('lastSeenAt', { date: formatDate(detail.last_seen_at, timezone) })}
            </span>
          </p>
        </div>
      </header>

      <section className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
        <p className="text-amber-200 text-xs leading-relaxed">{t('unlinkedNotice')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <TrendingUp size={14} className="text-amber-400" />
          {tShared('statsSectionTitle')}
        </h2>

        <StatSubGroup label={t('statsGroupGuildActivity')}>
          <StatCard
            icon={<ShieldCheck size={14} className="text-amber-400" />}
            label={tShared('statTotalParticipation')}
            value={tShared('participationTimes', { count: detail.participation_count })}
          />
          <StatCard
            icon={<Sword size={14} className="text-red-400" />}
            label={tShared('statKills')}
            value={detail.killboard.kills.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Skull size={14} className="text-gray-400" />}
            label={tShared('statDeaths')}
            value={detail.killboard.deaths.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Target size={14} className="text-amber-400" />}
            label={tShared('statKd')}
            value={formatKd(detail.killboard.kills, detail.killboard.deaths)}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupCombat')} cols={5}>
          <StatCard
            icon={<Trophy size={14} className="text-amber-400" />}
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
            mono
          />
          <StatCard
            icon={<Heart size={14} className="text-emerald-400" />}
            label={tShared('statSurvival')}
            value={formatSurvival(detail.advanced_stats.survival_rate)}
            sub={
              detail.advanced_stats.evaluated_events > 0
                ? tShared('statSurvivalSub', { count: detail.advanced_stats.evaluated_events })
                : undefined
            }
            tone={survivalTone(detail.advanced_stats.survival_rate)}
            mono
          />
          <StatCard
            icon={<Shield size={14} className="text-cyan-400" />}
            label={tShared('statDeathless')}
            value={tShared('statStreakUnit', {
              count: detail.advanced_stats.deathless_current_streak,
            })}
            sub={tShared('statStreakLongest', {
              count: detail.advanced_stats.deathless_longest_streak,
            })}
            mono
          />
          <StatCard
            icon={<CalendarCheck size={14} className="text-amber-400" />}
            label={tShared('statParticipationStreak')}
            value={tShared('statStreakDays', {
              count: detail.advanced_stats.participation_current_streak,
            })}
            sub={tShared('statStreakLongestDays', {
              count: detail.advanced_stats.participation_longest_streak,
            })}
            mono
          />
          <StatCard
            icon={<Target size={14} className="text-cyan-400" />}
            label={t('statAverageIp')}
            value={Math.round(detail.average_item_power).toLocaleString()}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupLifetime')}>
          <StatCard
            icon={<Flame size={14} className="text-orange-400" />}
            label={t('statLifetimeKillFame')}
            value={detail.lifetime_kill_fame.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-gray-500" />}
            label={t('statLifetimeDeathFame')}
            value={detail.lifetime_death_fame.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-amber-400" />}
            label={tShared('statKillFame')}
            value={detail.killboard.kill_fame.toLocaleString()}
            sub={t('guildActivitySub')}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-gray-500" />}
            label={tShared('statDeathFame')}
            value={detail.killboard.death_fame.toLocaleString()}
            sub={t('guildActivitySub')}
            mono
          />
        </StatSubGroup>
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sword size={14} className="text-amber-400" />
          {tShared('weaponUsage')}
        </h2>
        {detail.weapon_breakdown.length === 0 ? (
          <p className="text-gray-500 text-xs">{tShared('noWeaponUsage')}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
                >
                  <ItemImage itemId={displayId} itemName={displayName} size={36} hoverPreview />
                  <span className="text-white text-sm truncate flex-1">{displayName}</span>
                  <span className="text-amber-300 text-xs font-mono font-bold flex-shrink-0">
                    {tShared('weaponUsageCount', { count: w.count })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sword size={14} className="text-red-400" />
          {tShared('killHistoryTitle', { count: detail.kill_history.length })}
        </h2>
        {detail.kill_history.length === 0 ? (
          <p className="text-gray-500 text-xs">{tShared('killHistoryEmpty')}</p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto pr-1">
            <ul className="space-y-1.5">
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
            </ul>
          </div>
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
    <li className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${roleBadgeClass}`}
      >
        {roleLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm truncate">{opponent}</p>
        <p className="text-gray-500 text-[10px] font-mono">
          {formatDateTime(entry.occurred_at, timezone)}
          {entry.item_power != null && (
            <span className="ml-2 text-gray-400">{itemPowerLabel(entry.item_power)}</span>
          )}
          <span className="ml-2 text-gray-400">{fameLabel(entry.fame.toLocaleString())}</span>
        </p>
      </div>
    </li>
  )
}

type StatTone = 'default' | 'emerald' | 'amber' | 'rose'

function StatCard({
  icon,
  label,
  value,
  sub,
  mono = false,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  tone?: StatTone
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'rose'
          ? 'text-rose-300'
          : 'text-white'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <p className={`${toneClass} text-base sm:text-lg font-bold mt-1 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

function StatSubGroup({
  label,
  cols = 4,
  children,
}: {
  label: string
  cols?: 3 | 4 | 5
  children: React.ReactNode
}) {
  const grid =
    cols === 3
      ? 'grid-cols-2 sm:grid-cols-3'
      : cols === 5
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-4'
  return (
    <div className="space-y-1.5">
      <h3 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">{label}</h3>
      <div className={`grid ${grid} gap-2.5`}>{children}</div>
    </div>
  )
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
