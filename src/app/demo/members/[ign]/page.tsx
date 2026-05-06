import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trophy } from 'lucide-react'
import {
  DEMO_MEMBERS,
  DEMO_EVENTS,
  DEMO_MEMBER_RECENT_EVENTS,
  type DemoMember,
} from '@/data/demo-seed'
import { formatTimeLabel } from '../../_lib/format'

const ALLOWED_DETAIL = new Set(['Eternia'])

export default async function DemoMemberDetailPage({
  params,
}: {
  params: Promise<{ ign: string }>
}) {
  const { ign } = await params
  if (!ALLOWED_DETAIL.has(ign)) notFound()

  const member = DEMO_MEMBERS.find((m) => m.ign === ign)
  if (!member) notFound()

  const t = await getTranslations('demo')
  const lastEvent = DEMO_EVENTS.find((e) => e.id === member.lastEventId)
  const recent = DEMO_MEMBER_RECENT_EVENTS[member.ign] ?? []
  const kd = member.deaths > 0 ? (member.kills / member.deaths).toFixed(2) : '∞'

  return (
    <div className="space-y-4">
      <Link
        href="/demo/members"
        className="inline-block text-xs text-gray-500 hover:text-amber-400 transition-colors"
      >
        {t('members.back')}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{member.ign}</h1>
          <RoleBadge role={member.role} t={t} />
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
            {t(`weapons.${member.primaryWeapon}`)}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {t('members.joined', { n: member.joinedDaysAgo })}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard label={t('members.statKills')} value={String(member.kills)} accent="text-amber-400" />
        <StatCard label={t('members.statDeaths')} value={String(member.deaths)} accent="text-red-300" />
        <StatCard label={t('members.statKd')} value={kd} accent="text-amber-400" />
        <StatCard label={t('members.statBattles')} value={String(member.battles)} accent="text-gray-200" />
        <StatCard
          label={t('members.statSurvival')}
          value={`${member.survivalPct}%`}
          accent="text-emerald-400"
        />
        <StatCard
          label={t('members.colAttend')}
          value={t('members.fractionAttend', {
            a: member.weeklyAttendance.attended,
            b: member.weeklyAttendance.total,
          })}
          accent="text-gray-200"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-200">
            {t('members.lastEvent')}
          </header>
          <div className="p-3 text-xs text-gray-300">
            {lastEvent ? (
              <div>
                <div className="font-semibold text-white">{lastEvent.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {formatTimeLabel(t, lastEvent.scheduledAt)} · {lastEvent.zone}
                </div>
              </div>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-200 flex items-center gap-1.5">
            <Trophy size={12} />
            {t('members.achievements')}
          </header>
          <div className="p-3">
            {member.achievements.length === 0 ? (
              <span className="text-xs text-gray-600">{t('members.noAchievements')}</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {member.achievements.map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30"
                  >
                    <Trophy size={10} />
                    {t(`achievements.${key}`)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-200">
          {t('members.recentEventsTitle')}
        </header>
        {recent.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-600">—</div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {recent.map((ev) => (
              <li
                key={ev.id}
                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      ev.type === 'kill'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-300 border-red-500/40'
                    }`}
                  >
                    {ev.type === 'kill' ? t('members.eventKill') : t('members.eventDeath')}
                  </span>
                  <span className="truncate text-gray-200">
                    {ev.opponentName}{' '}
                    <span className="text-gray-500">
                      [{ev.opponentGuild}] · {ev.weapon} · {ev.zone}
                    </span>
                  </span>
                </div>
                <span className="shrink-0 text-gray-500 font-mono text-[11px]">
                  {formatTimeLabel(t, ev.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RoleBadge({ role, t }: { role: DemoMember['role']; t: (k: string) => string }) {
  const styles: Record<DemoMember['role'], string> = {
    admin: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    caller: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    member: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    intern: 'bg-gray-700/40 text-gray-400 border-gray-700',
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[role]}`}
    >
      {t(`roles.${role}`)}
    </span>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <div className={`text-base sm:text-lg font-bold font-mono ${accent}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 truncate">{label}</div>
    </div>
  )
}
