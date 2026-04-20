'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Clock,
  MapPin,
  ChevronRight,
  Users,
  Swords,
  Flame,
  Archive,
  Trophy,
  ShieldAlert,
} from 'lucide-react'

export type HomeEventKind = 'imminent' | 'ended' | 'upcoming' | 'win' | 'loss'

export interface HomeEventCardData {
  id: string
  title: string
  gather_location: string
  displayGatherTime: string
  total: number
  assigned: number
  kind: HomeEventKind
  battleStarted: boolean
  opponentGuilds: string | null
  battleCount: number
}

interface TabDef {
  key: 'scheduled' | 'wins' | 'losses'
  label: string
}

interface Props {
  scheduled: HomeEventCardData[]
  wins: HomeEventCardData[]
  losses: HomeEventCardData[]
}

export default function HomeEventTabs({ scheduled, wins, losses }: Props) {
  const t = useTranslations('home')
  const [active, setActive] = useState<TabDef['key']>('scheduled')

  const tabs: TabDef[] = [
    { key: 'scheduled', label: t('tabs.scheduled') },
    { key: 'wins', label: t('tabs.wins') },
    { key: 'losses', label: t('tabs.losses') },
  ]

  const counts: Record<TabDef['key'], number> = {
    scheduled: scheduled.length,
    wins: wins.length,
    losses: losses.length,
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-800">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-gray-200'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-500">
                {t('tabs.count', { count: counts[tab.key] })}
              </span>
            </button>
          )
        })}
      </div>

      {active === 'scheduled' && <ScheduledView events={scheduled} />}
      {active === 'wins' && <FlatView events={wins} />}
      {active === 'losses' && <FlatView events={losses} />}
    </div>
  )
}

function ScheduledView({ events }: { events: HomeEventCardData[] }) {
  const t = useTranslations('home')
  const imminent = events.filter((e) => e.kind === 'imminent')
  const ended = events.filter((e) => e.kind === 'ended')
  const upcoming = events.filter((e) => e.kind === 'upcoming')

  if (events.length === 0) return <EmptyState label={t('empty')} />

  return (
    <div className="space-y-6">
      {imminent.length > 0 && (
        <Section title={t('sections.imminent')} icon={<Flame size={16} className="text-amber-400" />} titleClass="text-amber-300">
          {imminent.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}
      {ended.length > 0 && (
        <Section title={t('sections.ended')} icon={<Archive size={16} className="text-gray-500" />} titleClass="text-gray-400">
          {ended.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title={t('sections.upcoming')} titleClass="text-gray-400">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}
    </div>
  )
}

function FlatView({ events }: { events: HomeEventCardData[] }) {
  const t = useTranslations('home')
  if (events.length === 0) return <EmptyState label={t('empty')} />
  return (
    <div className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0 2xl:grid-cols-3">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  )
}

function Section({
  title,
  icon,
  titleClass,
  children,
}: {
  title: string
  icon?: React.ReactNode
  titleClass: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className={`text-sm font-bold ${titleClass}`}>{title}</h2>
      </div>
      <div className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0 2xl:grid-cols-3">
        {children}
      </div>
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
      <p className="text-gray-400">{label}</p>
    </div>
  )
}

function EventCard({ event }: { event: HomeEventCardData }) {
  const t = useTranslations('home')
  const stateClass =
    event.kind === 'win'
      ? 'border-emerald-500/30 hover:border-emerald-500/60 hover:shadow-[0_12px_28px_-12px_rgba(16,185,129,0.35)]'
      : event.kind === 'loss'
      ? 'border-rose-500/30 hover:border-rose-500/60 hover:shadow-[0_12px_28px_-12px_rgba(244,63,94,0.35)]'
      : event.kind === 'imminent' && event.battleStarted
      ? 'border-rose-500/40 hover:border-rose-500/60 hover:shadow-[0_12px_28px_-12px_rgba(244,63,94,0.35)]'
      : event.kind === 'imminent'
      ? 'border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_12px_28px_-12px_rgba(245,158,11,0.4)]'
      : event.kind === 'ended'
      ? 'border-gray-800/80 hover:border-gray-700 opacity-70 hover:opacity-85'
      : 'border-white/5 hover:border-amber-500/40 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)]'

  return (
    <Link
      href={`/events/${event.id}`}
      className={`group block bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-sm border rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 ${stateClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">{event.title}</h2>
            <KindBadge kind={event.kind} battleStarted={event.battleStarted} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={13} className="text-amber-400" />
              {event.displayGatherTime}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={13} className="text-amber-400" />
              {event.gather_location}
            </div>
          </div>
          {event.total > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Users size={12} />
              {t('applicants', { assigned: event.assigned, total: event.total })}
            </div>
          )}
          {(event.kind === 'win' || event.kind === 'loss') && event.opponentGuilds && (
            <div className="text-xs text-gray-400">
              <span className="text-gray-500">{t('opponentsPrefix')}</span>{' '}
              <span className="text-gray-300">{event.opponentGuilds}</span>
              <span className="text-gray-500"> · {t('battlesSuffix', { count: event.battleCount })}</span>
            </div>
          )}
        </div>
        <ChevronRight
          size={20}
          className="text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1"
        />
      </div>
    </Link>
  )
}

function KindBadge({
  kind,
  battleStarted,
}: {
  kind: HomeEventKind
  battleStarted: boolean
}) {
  const t = useTranslations('home.badge')
  if (kind === 'win') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
        <Trophy size={10} />
        {t('win')}
      </span>
    )
  }
  if (kind === 'loss') {
    return (
      <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
        <ShieldAlert size={10} />
        {t('loss')}
      </span>
    )
  }
  if (kind === 'imminent' && battleStarted) {
    return (
      <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
        <Swords size={10} />
        {t('inProgress')}
      </span>
    )
  }
  if (kind === 'imminent') {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
        <Flame size={10} />
        {t('imminent')}
      </span>
    )
  }
  if (kind === 'ended') {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-700 text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
        <Archive size={10} />
        {t('ended')}
      </span>
    )
  }
  return null
}
