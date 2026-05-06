import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Calendar, ShieldAlert, Activity } from 'lucide-react'
import {
  DEMO_WEEKLY_STATS,
  DEMO_EVENTS,
  DEMO_REGEAR_LIST,
  DEMO_MEMBER_RECENT_EVENTS,
} from '@/data/demo-seed'
import { formatTimeLabel, formatSilver } from './_lib/format'
import { EventStatusPill, RegearStatusPill } from './_components/Pills'

// 데모 대시보드. layout.tsx 가 force-dynamic 으로 잡고 있어 children 도 동적.
export default async function DemoDashboardPage() {
  const t = await getTranslations('demo')

  const upcoming = DEMO_EVENTS.filter((e) => e.status === 'scheduled').slice(0, 3)
  const pending = DEMO_REGEAR_LIST.filter((r) => r.status === 'pending').slice(0, 3)
  const recent = (DEMO_MEMBER_RECENT_EVENTS.Eternia ?? []).slice(0, 5)
  const kd = DEMO_WEEKLY_STATS.deaths > 0
    ? (DEMO_WEEKLY_STATS.kills / DEMO_WEEKLY_STATS.deaths).toFixed(2)
    : '∞'

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('dashboard.title')}</h1>
        <p className="text-xs sm:text-sm text-gray-500">{t('dashboard.subtitle')}</p>
      </header>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {t('dashboard.weeklyTitle')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard label={t('dashboard.weeklyEvents')} value={String(DEMO_WEEKLY_STATS.events)} />
          <StatCard label={t('dashboard.weeklyKills')} value={String(DEMO_WEEKLY_STATS.kills)} />
          <StatCard label={t('dashboard.weeklyDeaths')} value={String(DEMO_WEEKLY_STATS.deaths)} />
          <StatCard label={t('dashboard.weeklyKd')} value={kd} />
          <StatCard
            label={t('dashboard.weeklyActiveMembers')}
            value={String(DEMO_WEEKLY_STATS.activeMembers)}
          />
          <StatCard
            label={t('dashboard.weeklyRegearsApproved')}
            value={String(DEMO_WEEKLY_STATS.regearsApproved)}
          />
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatCard
            label={t('dashboard.weeklySilverPaid')}
            value={`${formatSilver(DEMO_WEEKLY_STATS.silverPaid)} ${t('common.silver')}`}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          icon={<Calendar size={14} />}
          title={t('dashboard.upcomingTitle')}
          viewAllLabel={t('dashboard.upcomingViewAll')}
          viewAllHref="/demo/events"
        >
          {upcoming.length === 0 ? (
            <EmptyRow text={t('dashboard.upcomingEmpty')} />
          ) : (
            <ul className="divide-y divide-gray-800">
              {upcoming.map((evt) => (
                <li key={evt.id}>
                  <DashEventRow
                    name={evt.name}
                    when={formatTimeLabel(t, evt.scheduledAt)}
                    zone={evt.zone}
                    filled={t('events.filledFraction', {
                      filled: evt.filledCount,
                      total: evt.totalCount,
                    })}
                    statusPill={<EventStatusPill status={evt.status} t={t} />}
                    href={evt.id === 'evt-1' ? `/demo/events/${evt.id}` : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={<ShieldAlert size={14} />}
          title={t('dashboard.pendingTitle')}
          viewAllLabel={t('dashboard.pendingViewAll')}
          viewAllHref="/demo/regear"
        >
          {pending.length === 0 ? (
            <EmptyRow text={t('dashboard.pendingEmpty')} />
          ) : (
            <ul className="divide-y divide-gray-800">
              {pending.map((rg) => (
                <li key={rg.id}>
                  <DashRegearRow
                    victim={rg.victim}
                    battle={rg.battleLabel}
                    when={formatTimeLabel(t, rg.diedAt)}
                    total={`${formatSilver(rg.totalSilver)} ${t('common.silver')}`}
                    statusPill={<RegearStatusPill status={rg.status} t={t} />}
                    href={rg.id === 'rg-1' ? `/demo/regear/${rg.id}` : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel icon={<Activity size={14} />} title={t('dashboard.recentActivityTitle')}>
        {recent.length === 0 ? (
          <EmptyRow text={t('dashboard.recentActivityEmpty')} />
        ) : (
          <ul className="divide-y divide-gray-800">
            {recent.map((ev) => (
              <li key={ev.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ev.type === 'kill'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-300 border border-red-500/40'
                    }`}
                  >
                    {ev.type === 'kill' ? t('members.eventKill') : t('members.eventDeath')}
                  </span>
                  <span className="truncate text-gray-200">
                    {ev.type === 'kill'
                      ? t('dashboard.recentActivityKill', {
                          member: 'Eternia',
                          opponent: ev.opponentName,
                        })
                      : t('dashboard.recentActivityDeath', {
                          member: 'Eternia',
                          opponent: ev.opponentName,
                        })}
                  </span>
                </div>
                <span className="shrink-0 text-gray-500 font-mono text-[11px]">
                  {formatTimeLabel(t, ev.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <div className="text-base sm:text-lg font-bold text-amber-400 font-mono">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 truncate">{label}</div>
    </div>
  )
}

function Panel({
  icon,
  title,
  viewAllLabel,
  viewAllHref,
  children,
}: {
  icon: React.ReactNode
  title: string
  viewAllLabel?: string
  viewAllHref?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
          {icon}
          <span>{title}</span>
        </div>
        {viewAllLabel && viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            {viewAllLabel} →
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-gray-600">{text}</div>
}

function DashEventRow({
  name,
  when,
  zone,
  filled,
  statusPill,
  href,
}: {
  name: string
  when: string
  zone: string
  filled: string
  statusPill: React.ReactNode
  href?: string
}) {
  const inner = (
    <div className="px-3 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white truncate">{name}</div>
        <div className="text-[11px] text-gray-500 truncate">
          {when} · {zone}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[11px] text-gray-400">{filled}</span>
        {statusPill}
      </div>
    </div>
  )
  if (!href) return inner
  return (
    <Link href={href} className="block hover:bg-gray-800/40 transition-colors">
      {inner}
    </Link>
  )
}

function DashRegearRow({
  victim,
  battle,
  when,
  total,
  statusPill,
  href,
}: {
  victim: string
  battle: string
  when: string
  total: string
  statusPill: React.ReactNode
  href?: string
}) {
  const inner = (
    <div className="px-3 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white truncate">{victim}</div>
        <div className="text-[11px] text-gray-500 truncate">
          {battle} · {when}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[11px] text-amber-400">{total}</span>
        {statusPill}
      </div>
    </div>
  )
  if (!href) return inner
  return (
    <Link href={href} className="block hover:bg-gray-800/40 transition-colors">
      {inner}
    </Link>
  )
}
