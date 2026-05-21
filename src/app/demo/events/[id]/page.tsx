import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Crown } from 'lucide-react'
import { DEMO_EVENTS, DEMO_EVENT_DETAIL, DEMO_MEMBERS, type DemoEventSlot } from '@/data/demo-seed'
import EventMyStatusCard from '@/components/EventMyStatusCard'
import { formatTimeLabel } from '../../_lib/format'
import { EventStatusPill } from '../../_components/Pills'
import DemoGuidedTour from '../../_components/DemoGuidedTour'

const EVENT_DETAIL_TOUR_STEPS = [
  { id: 'event-detail-summary' },
  { id: 'event-detail-my-status' },
  { id: 'event-detail-slots' },
] as const

export default async function DemoEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listEvent = DEMO_EVENTS.find((e) => e.id === id)
  if (!listEvent) notFound()

  const [t, tEvent] = await Promise.all([
    getTranslations('demo'),
    getTranslations('event'),
  ])
  const isPrimary = listEvent.id === DEMO_EVENT_DETAIL.id
  const description = isPrimary ? DEMO_EVENT_DETAIL.description : null
  const organizer = isPrimary ? DEMO_EVENT_DETAIL.organizer : '—'
  const demoMemberIgn = DEMO_MEMBERS[0]?.ign ?? 'Eternia'
  const renderedParties = DEMO_EVENT_DETAIL.parties
  const mySlot = findDemoSlot(renderedParties, demoMemberIgn)

  return (
    <div className="space-y-4">
      <DemoGuidedTour steps={EVENT_DETAIL_TOUR_STEPS} namespace="eventDetail" />
      <Link
        href="/demo/events"
        className="inline-block text-xs text-gray-500 hover:text-amber-400 transition-colors"
      >
        {t('events.back')}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{listEvent.name}</h1>
          <EventStatusPill status={listEvent.status} t={t} />
        </div>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </header>

      <dl data-tour-id="event-detail-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
        <Field label={t('events.detailWhen')} value={formatTimeLabel(t, listEvent.scheduledAt)} />
        <Field label={t('events.detailTemplate')} value={listEvent.templateLabel} />
        <Field label={t('events.detailZone')} value={listEvent.zone} />
        <Field label={t('events.detailOrganizer')} value={organizer} />
      </dl>

      <div data-tour-id="event-detail-my-status">
        <EventMyStatusCard
          title={tEvent('myStatusTitle')}
          statusTitle={mySlot ? tEvent('myStatusAssignedTitle') : tEvent('myStatusNoneTitle')}
          description={
            mySlot
              ? listEvent.battleStarted
                ? tEvent('myStatusAssignedStartedBody')
                : tEvent('myStatusAssignedBody')
              : tEvent('myStatusNoneBody')
          }
          tone={mySlot ? 'success' : 'neutral'}
          details={
            mySlot
              ? [
                  tEvent('myStatusPartySlot', { party: mySlot.partyName, slot: mySlot.slotNumber }),
                  tEvent('myStatusRole', { role: t(`slotRoles.${mySlot.slot.role}`) }),
                ]
              : []
          }
          primaryAction={
            mySlot && listEvent.battleStarted
              ? { href: '/demo/regear', label: tEvent('myStatusRegear') }
              : undefined
          }
          secondaryAction={{ href: '#event-slots', label: tEvent('myStatusFindSlot') }}
        />
      </div>

      <div id="event-slots" data-tour-id="event-detail-slots" className="space-y-4 scroll-mt-20">
        {renderedParties.map((party) => (
          <section key={party.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-200">{t('events.partyMain')}</div>
              <div className="text-[11px] font-mono text-amber-400">
                {t('events.filledFraction', {
                  filled: party.slots.filter((s) => s.assigned).length,
                  total: party.slots.length,
                })}
              </div>
            </header>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {party.slots.map((slot, i) => (
                <SlotCard key={`${party.id}-${i}`} slot={slot} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function findDemoSlot(parties: typeof DEMO_EVENT_DETAIL.parties, ign: string) {
  for (const party of parties) {
    const slotIndex = party.slots.findIndex((slot) => slot.assigned === ign)
    if (slotIndex >= 0) {
      return {
        partyName: party.name,
        slotNumber: slotIndex + 1,
        slot: party.slots[slotIndex]!,
      }
    }
  }
  return null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-200 mt-0.5">{value}</dd>
    </div>
  )
}

function SlotCard({
  slot,
  t,
}: {
  slot: DemoEventSlot
  t: (key: string) => string
}) {
  const filled = !!slot.assigned
  return (
    <div
      className={`border rounded-md px-3 py-2.5 ${
        filled ? 'border-gray-700 bg-gray-950' : 'border-dashed border-gray-700/60 bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {t(`slotRoles.${slot.role}`)}
        </div>
        {slot.isCaller ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            <Crown size={10} />
            {t('events.callerBadge')}
          </span>
        ) : null}
      </div>
      <div className="text-xs text-gray-200 mt-1 truncate">{slot.buildLabel}</div>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="font-mono text-amber-400">{slot.flat}.0</span>
        {filled ? (
          <span className="text-white font-semibold truncate">{slot.assigned}</span>
        ) : (
          <span className="text-gray-600 italic">{t('events.slotEmpty')}</span>
        )}
      </div>
    </div>
  )
}
