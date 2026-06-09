import Link from 'next/link'
import { Archive, BookOpen, CalendarDays, Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_EVENTS } from '@/data/demo-seed'
import { formatTimeLabel } from '../_lib/format'
import HomeEventList, { type HomeEventCardData } from '@/components/HomeEventList'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

const MEMBER_EVENTS_TOUR_STEPS = [
  { id: 'member-events-summary' },
  { id: 'member-events-upcoming' },
] as const

export default async function DemoMemberEventsPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('demo.memberEvents'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])
  const cards: HomeEventCardData[] = DEMO_EVENTS
    .filter((event) => event.status !== 'ended')
    .map((event) => ({
      id: event.id,
      title: event.name,
      gather_location: event.zone,
      displayGatherTime: formatTimeLabel(tDemo, event.scheduledAt),
      total: event.totalCount,
      assigned: event.filledCount,
      kind: event.kind,
      battleStarted: !!event.battleStarted,
      category: event.category,
    }))

  return (
    <main className="space-y-6 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full">
      <DemoGuidedTour steps={MEMBER_EVENTS_TOUR_STEPS} namespace="memberEvents" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <CalendarDays size={24} className="text-amber-400" />
            {t('title')}
          </h1>
          <p className="text-gray-400 text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          <Link
            href="/demo/guide"
            className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
          >
            <BookOpen size={14} />
            {t('viewDocs')}
          </Link>
          <Link
            href="/demo/battles"
            className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
          >
            <Archive size={14} />
            {t('viewArchive')}
          </Link>
          <Link
            href="/demo/events"
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
          >
            <Plus size={16} />
            {t('newEvent')}
          </Link>
        </div>
      </div>

      <section
        data-tour-id="member-events-summary"
        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
      >
        <div className="flex items-start gap-3">
          <CalendarDays size={18} className="mt-0.5 text-amber-300 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-100">{t('noticeTitle')}</p>
            <p className="text-xs sm:text-sm text-amber-100/80 leading-relaxed">
              {t('noticeBody')}
            </p>
          </div>
        </div>
      </section>

      <section data-tour-id="member-events-upcoming">
        <HomeEventList events={cards} hrefPrefix="/demo/events" />
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('events.title')}
        description={tCta('events.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </main>
  )
}
