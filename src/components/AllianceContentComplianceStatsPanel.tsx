'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart3 } from 'lucide-react'
import type { AllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'

export default function AllianceContentComplianceStatsPanel({
  dashboard,
}: {
  dashboard: Pick<AllianceContentAdminDashboard, 'policy' | 'stats'>
}) {
  const t = useTranslations('allianceContent')
  const [windowDays, setWindowDays] = useState<7 | 30>(7)
  const stats = windowDays === 7 ? dashboard.stats.sevenDays : dashboard.stats.thirtyDays

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-accent" />
            <h2 className="font-semibold text-foreground">{t('statsTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted">{t('statsDescription')}</p>
        </div>
        <div className="inline-flex self-start rounded-lg border border-border bg-background p-1">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                windowDays === days
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {t(days === 7 ? 'statsWindow7' : 'statsWindow30')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label={t('statsTotalSessions')} value={stats.totalSessions} />
        <StatCard label={t('statsAverageRate')} value={`${stats.averageParticipationRate}%`} />
        <StatCard label={t('statsAchievedMembers')} value={stats.achievedMemberCount} tone="success" />
        <StatCard label={t('statsBelowMembers')} value={stats.belowMemberCount} tone="danger" />
      </div>

      {stats.members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {t('statsEmpty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-background text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">{t('statsMember')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsParticipation')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsRate')}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t('statsTarget')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsMissingVideos')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsSubmittedVideos')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.members.map((member) => (
                <tr key={member.discordId} className="text-foreground">
                  <td className="px-3 py-3 font-medium">{member.username}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {t('statsParticipationValue', {
                      count: member.participationCount,
                      total: stats.totalSessions,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {member.participationRate}%
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      member.hasMetTarget
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}>
                      {t(member.hasMetTarget ? 'statsTargetMet' : 'statsTargetBelow')}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${
                    member.missingVideoCount > 0 ? 'font-semibold text-rose-300' : 'text-muted'
                  }`}>
                    {member.missingVideoCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">
                    {member.submittedVideoCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {t('statsTargetHint', {
          sessions: stats.members[0]?.targetSessionCount ?? 0,
          rate: dashboard.policy.weeklyMinParticipationRate,
        })}
      </p>
    </section>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'success' | 'danger'
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}
