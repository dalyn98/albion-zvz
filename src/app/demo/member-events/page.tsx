import Link from 'next/link'
import { CalendarDays, ChevronRight, ShieldCheck, Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_EVENTS, type DemoEventListItem } from '@/data/demo-seed'
import { formatTimeLabel } from '../_lib/format'
import DemoCTACard from '../_components/DemoCTACard'

const MY_SLOT_BY_EVENT: Record<string, string> = {
  'evt-1': 'Tank · Heavy Mace',
  'evt-4': 'Tank · Heavy Mace',
  'evt-5': 'Tank · Heavy Mace',
}

export default async function DemoMemberEventsPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('demo.memberEvents'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])
  const upcoming = DEMO_EVENTS.filter((event) => event.status !== 'ended')
  const ended = DEMO_EVENTS.filter((event) => event.status === 'ended')
  const nextTimeLabel = formatTimeLabel(tDemo, { day: 'today', time: '22:00' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays size={20} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm mt-1">{t('subtitle')}</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={<ShieldCheck size={16} />} label={t('nextSlotLabel')} value="Tank" />
        <SummaryCard icon={<CalendarDays size={16} />} label={t('nextTimeLabel')} value={nextTimeLabel} />
        <SummaryCard icon={<Users size={16} />} label={t('openSlotsLabel')} value="2" />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-white">{t('upcomingTitle')}</h2>
        <div className="space-y-2">
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} t={t} tDemo={tDemo} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-white">{t('recentTitle')}</h2>
        <div className="space-y-2">
          {ended.map((event) => (
            <EventCard key={event.id} event={event} t={t} tDemo={tDemo} muted />
          ))}
        </div>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('events.title')}
        description={tCta('events.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function EventCard({
  event,
  t,
  tDemo,
  muted = false,
}: {
  event: DemoEventListItem
  t: Awaited<ReturnType<typeof getTranslations<'demo.memberEvents'>>>
  tDemo: Awaited<ReturnType<typeof getTranslations<'demo'>>>
  muted?: boolean
}) {
  const mySlot = MY_SLOT_BY_EVENT[event.id] ?? null
  const openSlots = Math.max(0, event.totalCount - event.filledCount)
  return (
    <Link
      href={`/demo/events/${event.id}`}
      className="block rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 hover:border-amber-500/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold truncate">{event.name}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {formatTimeLabel(tDemo, event.scheduledAt)} · {event.zone}
          </p>
        </div>
        <ChevronRight size={16} className="text-gray-600 flex-shrink-0 mt-0.5" />
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-gray-300">
          {event.filledCount}/{event.totalCount}
        </span>
        {mySlot ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
            {t('mySlot', { slot: mySlot })}
          </span>
        ) : muted ? (
          <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-gray-500">
            {t('ended')}
          </span>
        ) : (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
            {t('openSlots', { count: openSlots })}
          </span>
        )}
      </div>
    </Link>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <span className="text-amber-400">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}
