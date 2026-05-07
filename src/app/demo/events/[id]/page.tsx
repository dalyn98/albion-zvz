import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Crown } from 'lucide-react'
import { DEMO_EVENTS, DEMO_EVENT_DETAIL, type DemoEventSlot } from '@/data/demo-seed'
import { formatTimeLabel } from '../../_lib/format'
import { EventStatusPill } from '../../_components/Pills'

export default async function DemoEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listEvent = DEMO_EVENTS.find((e) => e.id === id)
  if (!listEvent) notFound()

  const t = await getTranslations('demo')
  const isPrimary = listEvent.id === DEMO_EVENT_DETAIL.id
  const description = isPrimary ? DEMO_EVENT_DETAIL.description : null
  const organizer = isPrimary ? DEMO_EVENT_DETAIL.organizer : '—'

  return (
    <div className="space-y-4">
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

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
        <Field label={t('events.detailWhen')} value={formatTimeLabel(t, listEvent.scheduledAt)} />
        <Field label={t('events.detailTemplate')} value={listEvent.templateLabel} />
        <Field label={t('events.detailZone')} value={listEvent.zone} />
        <Field label={t('events.detailOrganizer')} value={organizer} />
      </dl>

      {DEMO_EVENT_DETAIL.parties.map((party) => (
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
  )
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
