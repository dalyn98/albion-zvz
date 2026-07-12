import {
  CalendarCheck,
  Flame,
  Heart,
  Shield,
  ShieldCheck,
  Skull,
  Sword,
  Target,
  Trophy,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import BadgeGrid from './BadgeGrid'
import ItemImage from './ItemImage'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { getLocalizedItemName } from '@/lib/item-names'
import { canonicalT8WeaponId } from '@/lib/weapon-display'
import { getRoleStyle } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import type { PublicMemberActivityDetail } from '@/lib/public-member-activity'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { EmptyState, SectionCard, ValueDisplay } from '@/components/ui-patterns'

interface Props {
  detail: PublicMemberActivityDetail
  timezone?: string
}

export default async function PublicMemberActivityView({
  detail,
  timezone = DEFAULT_TENANT_TIMEZONE,
}: Props) {
  const t = await getTranslations('publicActivity')
  const tMember = await getTranslations('memberDetail')
  const tRole = await getTranslations('slotRole')
  const rawLocale = await getLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const recentEvents = detail.events.slice(0, 8)
  const recentKills = detail.kill_history.slice(0, 12)

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <PublicStatCard
          icon={<ShieldCheck size={14} className="text-amber-400" />}
          label={tMember('statTotalParticipation')}
          value={tMember('participationTimes', { count: detail.participation_count })}
        />
        <PublicStatCard
          icon={<Sword size={14} className="text-red-400" />}
          label={tMember('statKills')}
          value={detail.killboard.kills.toLocaleString()}
        />
        <PublicStatCard
          icon={<Skull size={14} className="text-gray-400" />}
          label={tMember('statDeaths')}
          value={detail.killboard.deaths.toLocaleString()}
        />
        <PublicStatCard
          icon={<Target size={14} className="text-amber-400" />}
          label={tMember('statKd')}
          value={formatKd(detail.killboard.kills, detail.killboard.deaths)}
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <PublicStatCard
          icon={<Trophy size={14} className="text-amber-400" />}
          label={tMember('statWinRate')}
          value={formatRate(detail.advanced_stats.win_rate)}
          sub={
            detail.advanced_stats.evaluated_outcome_events > 0
              ? tMember('statWinLossSub', {
                  wins: detail.advanced_stats.wins,
                  losses: detail.advanced_stats.losses,
                })
              : undefined
          }
        />
        <PublicStatCard
          icon={<Heart size={14} className="text-emerald-400" />}
          label={tMember('statSurvival')}
          value={formatRate(detail.advanced_stats.survival_rate)}
          sub={
            detail.advanced_stats.evaluated_events > 0
              ? tMember('statSurvivalSub', { count: detail.advanced_stats.evaluated_events })
              : undefined
          }
        />
        <PublicStatCard
          icon={<Shield size={14} className="text-cyan-400" />}
          label={tMember('statDeathless')}
          value={tMember('statStreakUnit', {
            count: detail.advanced_stats.deathless_current_streak,
          })}
          sub={tMember('statStreakLongest', {
            count: detail.advanced_stats.deathless_longest_streak,
          })}
        />
      </section>

      <BadgeGrid
        input={{
          participationCount: detail.participation_count,
          kills: detail.killboard.kills,
          deathlessLongestStreak: detail.advanced_stats.deathless_longest_streak,
          survivalRate: detail.advanced_stats.survival_rate,
          evaluatedEvents: detail.advanced_stats.evaluated_events,
          participationLongestStreak: detail.advanced_stats.participation_longest_streak,
          wins: detail.advanced_stats.wins,
        }}
      />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard className="space-y-3">
          <h2 className="text-white font-bold text-sm">{tMember('roleBreakdown')}</h2>
          {detail.role_breakdown.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={tMember('noSlotHistory')} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {detail.role_breakdown.map((r) => {
                const style = getRoleStyle(r.role)
                return (
                  <span
                    key={r.role}
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      style?.badge ?? 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {translateSlotRole(r.role, tRole)} · {r.count}
                  </span>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard className="space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Sword size={14} className="text-amber-400" />
            {tMember('weaponUsage')}
          </h2>
          {detail.weapon_breakdown.length === 0 ? (
            <EmptyState icon={Sword} title={tMember('noWeaponUsage')} />
          ) : (
            <ul className="space-y-2">
              {detail.weapon_breakdown.slice(0, 6).map((w, idx) => {
                const canonicalId = canonicalT8WeaponId(w.weapon_id)
                const localized = canonicalId
                  ? getLocalizedItemName(canonicalId, locale, null)
                  : null
                const displayId = localized ? canonicalId : w.weapon_id
                const displayName = localized ?? w.weapon_name
                return (
                  <li
                    key={`${displayId ?? 'free'}-${idx}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 px-3 py-2"
                  >
                    <ItemImage itemId={displayId} itemName={displayName} size={32} hoverPreview />
                    <span className="text-white text-sm truncate flex-1">{displayName}</span>
                    <span className="text-amber-300 text-xs font-mono font-bold">
                      {tMember('weaponUsageCount', { count: w.count })}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard className="space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <CalendarCheck size={14} className="text-amber-400" />
            {t('recentEventsTitle', { count: recentEvents.length })}
          </h2>
          {recentEvents.length === 0 ? (
            <EmptyState icon={CalendarCheck} title={tMember('noEvents')} />
          ) : (
            <ul className="space-y-2">
              {recentEvents.map((event) => {
                const style = getRoleStyle(event.role)
                const whenIso = event.battle_started_at ?? event.gather_at ?? event.created_at
                return (
                  <li
                    key={event.event_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/70 px-3 py-2"
                  >
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        style?.badge ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {translateSlotRole(event.role, tRole)}
                    </span>
                    <span className="text-gray-400 text-xs font-mono">{formatDate(whenIso, timezone)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard className="space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Flame size={14} className="text-red-400" />
            {tMember('killHistoryTitle', { count: recentKills.length })}
          </h2>
          {recentKills.length === 0 ? (
            <EmptyState icon={Skull} title={tMember('killHistoryEmpty')} />
          ) : (
            <ul className="space-y-2">
              {recentKills.map((entry) => (
                <li
                  key={`${entry.event_id}-${entry.role}-${entry.occurred_at}`}
                  className="rounded-lg border border-border bg-surface-2/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={entry.role === 'killer' ? 'text-red-300 text-xs font-bold' : 'text-gray-300 text-xs font-bold'}>
                      {entry.role === 'killer' ? tMember('killRoleKiller') : tMember('killRoleVictim')}
                    </span>
                    <span className="text-gray-500 text-[11px] font-mono">
                      {formatDateTime(entry.occurred_at, timezone)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 truncate">
                    {entry.opponent_name
                      ? tMember('killOpponent', { name: formatOpponent(entry.opponent_name, entry.opponent_guild, entry.opponent_alliance) })
                      : tMember('killOpponentUnknown')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </div>
  )
}

function PublicStatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <SectionCard className="px-4 py-3 sm:p-4">
      <ValueDisplay iconNode={icon} label={label} value={value} detail={sub} size="sm" />
    </SectionCard>
  )
}

function formatKd(kills: number, deaths: number): string {
  if (deaths <= 0) return kills > 0 ? `${kills.toFixed(1)}` : '0.0'
  return (kills / deaths).toFixed(2)
}

function formatRate(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value * 100)}%`
}

function formatOpponent(name: string, guild: string | null, alliance: string | null): string {
  let label = name
  if (guild) label += ` [${guild}]`
  if (alliance) label += ` [${alliance}]`
  return label
}
