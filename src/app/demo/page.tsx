import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { ExternalLink, ShieldCheck, ChevronRight, Swords, Skull } from 'lucide-react'
import {
  DEMO_EVENTS,
  DEMO_REGEAR_LIST,
  DEMO_MEMBERS,
  DEMO_WEEKLY_STATS,
  DEMO_MEMBER_RECENT_EVENTS,
} from '@/data/demo-seed'
import { formatSilver, formatTimeLabel } from './_lib/format'
import DemoHomeEventList from './_components/DemoHomeEventList'

// 어드민 대시보드 — `/admin/dashboard` 의 데모 클론.
// - 상단: 이번 주 길드 통계 6 카드 (이벤트/킬/데스/K/D/활성/승인 리기어).
// - 대기 중 리기어 callout (pending 건수 + 승인 큐 진입).
// - 다가오는 이벤트 — 어드민이 관리하는 슬롯 채우기 진행 상황 노출.
// - 최근 활동 — 길드원 킬/데스 타임라인 (Eternia 데이터 기반 샘플).
export default async function DemoHomePage() {
  const t = await getTranslations('demo')

  const activeEvents = DEMO_EVENTS.filter((e) => e.status !== 'ended')
  const pendingRegears = DEMO_REGEAR_LIST.filter((r) => r.status === 'pending')
  const recentActivity = DEMO_MEMBER_RECENT_EVENTS['Eternia'] ?? []

  const stats = DEMO_WEEKLY_STATS
  const kd =
    stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : '∞'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {t('dashboard.title')}
          </h1>
          <p className="text-gray-400 text-sm">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            <ExternalLink size={14} />
            <span className="truncate">{t('cta.inviteBot')}</span>
          </a>
        </div>
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
          {t('dashboard.weeklyTitle')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard label={t('dashboard.weeklyEvents')} value={String(stats.events)} accent="text-white" />
          <StatCard label={t('dashboard.weeklyKills')} value={String(stats.kills)} accent="text-emerald-400" />
          <StatCard label={t('dashboard.weeklyDeaths')} value={String(stats.deaths)} accent="text-rose-400" />
          <StatCard label={t('dashboard.weeklyKd')} value={kd} accent="text-amber-300" />
          <StatCard
            label={t('dashboard.weeklyActiveMembers')}
            value={`${stats.activeMembers}/${DEMO_MEMBERS.length}`}
            accent="text-white"
          />
          <StatCard
            label={t('dashboard.weeklyRegearsApproved')}
            value={String(stats.regearsApproved)}
            sub={`${formatSilver(stats.silverPaid)} ${t('common.silver')}`}
            accent="text-amber-300"
          />
        </div>
      </section>

      {pendingRegears.length > 0 && (
        <Link
          href="/demo/regear"
          className="group block bg-gradient-to-br from-rose-500/15 to-rose-500/5 border border-rose-500/40 hover:border-rose-400/60 rounded-2xl p-4 sm:p-5 transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="bg-rose-500/20 border border-rose-500/40 rounded-lg p-2 flex-shrink-0">
                <ShieldCheck size={18} className="text-rose-300" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {t('dashboard.pendingTitle')}
                  </h2>
                  <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold">
                    {pendingRegears.length}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {pendingRegears.map((r) => r.victim).join(' · ')}
                </p>
                <p className="text-xs text-rose-300 group-hover:text-rose-200 transition-colors">
                  {t('dashboard.pendingViewAll')} →
                </p>
              </div>
            </div>
            <ChevronRight
              size={18}
              className="text-rose-300 flex-shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform"
            />
          </div>
        </Link>
      )}

      {activeEvents.length === 0 ? (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-sm">{t('dashboard.upcomingEmpty')}</p>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-white">
            {t('dashboard.upcomingTitle')}
          </h2>
          <DemoHomeEventList events={activeEvents} />
        </section>
      )}

      {recentActivity.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <header className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 text-xs font-bold text-gray-200 uppercase tracking-wider">
            {t('dashboard.recentActivityTitle')}
          </header>
          <ul className="divide-y divide-gray-800">
            {recentActivity.slice(0, 5).map((ev) => (
              <li
                key={ev.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {ev.type === 'kill' ? (
                    <Swords size={13} className="flex-shrink-0 text-emerald-400" />
                  ) : (
                    <Skull size={13} className="flex-shrink-0 text-rose-400" />
                  )}
                  <span className="text-gray-200 truncate">
                    {ev.type === 'kill'
                      ? t('dashboard.recentActivityKill', {
                          member: 'Eternia',
                          opponent: ev.opponentName,
                        })
                      : t('dashboard.recentActivityDeath', {
                          member: 'Eternia',
                          opponent: ev.opponentName,
                        })}
                    <span className="text-gray-500"> · {ev.zone}</span>
                  </span>
                </div>
                <span className="shrink-0 text-gray-500 font-mono text-[11px]">
                  {formatTimeLabel(t, ev.time)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-gray-600 italic px-1">{t('events.demoOnlyDetail')}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2">
      <div className={`text-base sm:text-lg font-bold font-mono ${accent}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 truncate">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{sub}</div>}
    </div>
  )
}
