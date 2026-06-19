import Link from 'next/link'
import { Clock, Gauge, Users, Video } from 'lucide-react'
import { getRegearVideoProofStats } from '@/app/actions/stats-admin'
import {
  DEFAULT_REGEAR_VIDEO_PROOF_WINDOW,
  REGEAR_VIDEO_PROOF_WINDOW_OPTIONS,
  type RegearVideoProofWindow,
} from '@/lib/regear-video-proof-stats'
import { formatDateTimeShort } from '@/lib/format-datetime'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import CollapsibleList from '@/components/CollapsibleList'
import { STATS_COLLAPSED_ROWS, type StatsTranslator } from './shared'

function ratePercent(rate: number): number {
  return Math.round(rate * 1000) / 10
}

function rateLabel(rate: number): string {
  return `${ratePercent(rate).toLocaleString()}%`
}

function averageLabel(value: number): string {
  return Math.round(value * 10) / 10 === Math.round(value)
    ? Math.round(value).toLocaleString()
    : (Math.round(value * 10) / 10).toLocaleString()
}

function windowHref(window: RegearVideoProofWindow): string {
  return window === DEFAULT_REGEAR_VIDEO_PROOF_WINDOW
    ? '/admin/dashboard/stats'
    : `/admin/dashboard/stats?videoProofWindow=${window}`
}

function windowLabelKey(window: RegearVideoProofWindow): Parameters<StatsTranslator>[0] {
  switch (window) {
    case '7':
      return 'regearVideoProofWindow7'
    case '30':
      return 'regearVideoProofWindow30'
    case '90':
      return 'regearVideoProofWindow90'
    case 'all':
      return 'regearVideoProofWindowAll'
  }
}

export default async function RegearVideoProofSection({
  tStats,
  selectedWindow,
}: {
  tStats: StatsTranslator
  selectedWindow: RegearVideoProofWindow
}) {
  const { stats, error } = await getRegearVideoProofStats(selectedWindow)
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('regearVideoProofLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const cards = [
    {
      label: tStats('regearVideoProofMembersLabel'),
      value: stats.videoProofMemberCount.toLocaleString(),
      hint: tStats('regearVideoProofMembersHint', {
        requests: stats.totalRequests.toLocaleString(),
      }),
      icon: Users,
      accent: 'text-sky-300',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
    {
      label: tStats('regearVideoProofAttachedLabel'),
      value: stats.withVideoProof.toLocaleString(),
      hint: tStats('regearVideoProofAttachedHint', {
        rate: rateLabel(stats.attachmentRate),
      }),
      icon: Video,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('regearVideoProofAverageLabel'),
      value: averageLabel(stats.averageVideoProofsPerMember),
      hint: tStats('regearVideoProofAverageHint'),
      icon: Gauge,
      accent: 'text-amber-300',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: tStats('regearVideoProofLatestLabel'),
      value: stats.latestVideoProofAt
        ? formatDateTimeShort(stats.latestVideoProofAt)
        : tStats('regearVideoProofNoLatest'),
      hint: tStats('regearVideoProofLatestHint'),
      icon: Clock,
      accent: 'text-indigo-300',
      ring: 'border-indigo-500/30',
      bg: 'bg-indigo-500/5',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Video size={18} className="text-sky-300" />
          <h2 className="text-lg font-semibold text-white">
            {tStats('regearVideoProofTitle', {
              window: tStats(windowLabelKey(stats.window)),
            })}
          </h2>
        </div>
        <p className="text-sm text-gray-400">{tStats('regearVideoProofDescription')}</p>
        <div className="flex flex-wrap gap-2" aria-label={tStats('regearVideoProofWindowFilter')}>
          {REGEAR_VIDEO_PROOF_WINDOW_OPTIONS.map((window) => {
            const active = stats.window === window
            return (
              <Link
                key={window}
                href={windowHref(window)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-sky-400/60 bg-sky-500/15 text-sky-100'
                    : 'border-gray-700 bg-gray-900/60 text-gray-400 hover:border-gray-500 hover:text-gray-100'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                {tStats(windowLabelKey(window))}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`${card.bg} ${card.ring} border rounded-lg p-4 space-y-2`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.accent} />
                <span className="text-xs text-gray-300">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${card.accent}`}>
                {card.value}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            {tStats('regearVideoProofMembersTitle')}
          </h3>
          <span className="text-xs text-gray-500">
            {tStats('regearVideoProofMembersSubtitle', {
              count: stats.members.length.toLocaleString(),
            })}
          </span>
        </header>
        {stats.members.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('regearVideoProofMembersEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {stats.members.map((member, idx) => {
              const percent = ratePercent(member.attachmentRate)
              const lastVideoAt = member.lastVideoProofAt ?? member.lastRequestAt
              return (
                <li key={member.discordId} className="px-4 py-3 hover:bg-gray-800/40">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs text-gray-500 font-mono w-6 text-right">
                        {idx + 1}
                      </span>
                      <MemberAvatar discordId={member.discordId} avatar={member.avatar} size={24} />
                      <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                        <MemberLink
                          discordId={member.discordId}
                          username={member.username}
                          className="truncate"
                        />
                        {member.isAdmin && (
                          <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                            ADMIN
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="sm:w-72 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-mono text-sky-200">
                          {tStats('regearVideoProofMemberRate', {
                            rate: percent.toLocaleString(),
                          })}
                        </span>
                        <span className="text-gray-500">
                          {tStats('regearVideoProofRequestUnit', {
                            count: member.requestCount.toLocaleString(),
                          })}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-400 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Video size={12} className="text-emerald-300" />
                          {tStats('regearVideoProofVideoUnit', {
                            count: member.videoProofCount.toLocaleString(),
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-indigo-300" />
                          {tStats('regearVideoProofLastVideoAt', {
                            date: formatDateTimeShort(lastVideoAt),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}
