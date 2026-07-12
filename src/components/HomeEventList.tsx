'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Clock,
  MapPin,
  ChevronRight,
  Users,
  Swords,
  Flame,
} from 'lucide-react'
import { balancedHeadingClass, cx, interactiveSurfaceClass, prettyTextClass } from '@/components/ui-patterns'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, type EventCategory } from '@/types'
import type { HomeEventMyStatus } from '@/lib/home-event-status'

export type HomeEventKind = 'imminent' | 'upcoming'

export interface HomeEventCardData {
  id: string
  title: string
  gather_location: string
  displayGatherTime: string
  total: number
  assigned: number
  kind: HomeEventKind
  battleStarted: boolean
  category: EventCategory
  myStatus: HomeEventMyStatus | null
}

interface Props {
  events: HomeEventCardData[]
  hrefPrefix?: string
}

export default function HomeEventList({ events, hrefPrefix = '/events' }: Props) {
  const t = useTranslations('home')

  if (events.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
        <p className={cx('text-gray-400', prettyTextClass)}>{t('empty')}</p>
      </div>
    )
  }

  // 카테고리 단위로 큰 섹션을 만들고, 섹션 안에서 다시 임박/예정으로 나눈다.
  // 기존 단일 섹션 구조와 동일한 우선순위 (임박 먼저) 를 category 내부에서
  // 유지해야 "전투 임박" 이 여전히 맨 위에 보인다. EVENT_CATEGORIES 순서대로
  // 렌더 — 전투 → FF → 갱킹.
  return (
    <div className="space-y-8">
      {EVENT_CATEGORIES.map((c) => {
        const group = events.filter((e) => e.category === c)
        if (group.length === 0) return null
        return (
          <CategorySection
            key={c}
            title={t(`sections.${CATEGORY_I18N_SLUG[c]}`)}
            events={group}
            hrefPrefix={hrefPrefix}
          />
        )
      })}
    </div>
  )
}

function CategorySection({
  title,
  events,
  hrefPrefix,
}: {
  title: string
  events: HomeEventCardData[]
  hrefPrefix: string
}) {
  const t = useTranslations('home')
  const imminent = events.filter((e) => e.kind === 'imminent')
  const upcoming = events.filter((e) => e.kind === 'upcoming')

  return (
    <section className="space-y-4">
      <h2 className={cx('border-l-2 border-amber-500 pl-3 text-lg font-bold text-white', balancedHeadingClass)}>
        {title}
      </h2>
      <div className="space-y-6">
        {imminent.length > 0 && (
          <Section
            title={t('sections.imminent')}
            icon={<Flame size={16} className="text-amber-400" />}
            titleClass="text-amber-300"
          >
            {imminent.map((e) => (
              <EventCard key={e.id} event={e} hrefPrefix={hrefPrefix} />
            ))}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section title={t('sections.upcoming')} titleClass="text-gray-400">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} hrefPrefix={hrefPrefix} />
            ))}
          </Section>
        )}
      </div>
    </section>
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
        <h2 className={cx('text-sm font-bold', balancedHeadingClass, titleClass)}>{title}</h2>
      </div>
      <div className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0 2xl:grid-cols-3">
        {children}
      </div>
    </section>
  )
}

function EventCard({ event, hrefPrefix }: { event: HomeEventCardData; hrefPrefix: string }) {
  const t = useTranslations('home')
  const stateClass =
    event.kind === 'imminent' && event.battleStarted
      ? 'border-rose-500/40 hover:border-rose-500/60 hover:shadow-[0_12px_28px_-12px_rgba(244,63,94,0.35)]'
      : event.kind === 'imminent'
      ? 'border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_12px_28px_-12px_rgba(245,158,11,0.4)]'
      : 'border-white/5 hover:border-amber-500/40 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)]'

  return (
    <Link
      href={`${hrefPrefix}/${event.id}`}
      className={cx(
        'group block rounded-2xl border bg-gradient-to-br from-gray-900/80 to-gray-900/40 p-4 backdrop-blur-sm hover:-translate-y-0.5 sm:p-5',
        interactiveSurfaceClass,
        stateClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">{event.title}</h2>
            <KindBadge kind={event.kind} battleStarted={event.battleStarted} />
            {event.myStatus && <MyStatusBadge status={event.myStatus} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={13} className="text-amber-400" />
              {event.displayGatherTime}
            </div>
            {event.gather_location.trim() && (
              <div className="flex items-center gap-1.5 text-gray-300">
                <MapPin size={13} className="text-amber-400" />
                {event.gather_location}
              </div>
            )}
          </div>
          {event.total > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Users size={12} />
              {t('applicants', { assigned: event.assigned, total: event.total })}
            </div>
          )}
        </div>
        <ChevronRight
          size={20}
          className="mt-1 flex-shrink-0 text-gray-500 transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-gray-300"
        />
      </div>
    </Link>
  )
}

function MyStatusBadge({ status }: { status: HomeEventMyStatus }) {
  const t = useTranslations('home.myStatus')
  const style = {
    assigned: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    pending: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    tentative: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
    available: 'border-gray-600 bg-gray-800/80 text-gray-300',
  }[status]

  return (
    <span
      className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${style}`}
    >
      {t(status)}
    </span>
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
  return null
}
