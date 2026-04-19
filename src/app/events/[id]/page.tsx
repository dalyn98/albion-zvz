import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Event, PartyWithSlots } from '@/types'
import SlotCard from '@/components/SlotCard'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import AutoRefresh from '@/components/AutoRefresh'
import { Clock, MapPin, ArrowLeft, Swords, Info } from 'lucide-react'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { formatGatherTimeFor, isEnded } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'

function formatStartedAt(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const dynamic = 'force-dynamic'

async function getEvent(id: string) {
  const [{ data: event }, { data: parties }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('parties').select('*, slots(*)').eq('event_id', id).order('party_number'),
  ])

  const sorted = (parties ?? []).map((p) => ({
    ...p,
    slots: [...(p.slots ?? [])].sort((a, b) => a.slot_number - b.slot_number),
  })) as PartyWithSlots[]

  return { event: event as Event | null, parties: sorted }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ event, parties }, session, t, locale] = await Promise.all([
    getEvent(id),
    getSession(),
    getTranslations('event'),
    getLocale(),
  ])

  if (!event) notFound()

  const displayGatherTime = event.gather_at
    ? formatGatherTimeFor(locale, event.gather_at)
    : event.gather_time

  const totalSlots = parties.reduce((sum, p) => sum + p.slots.length, 0)
  const totalAssigned = parties.reduce(
    (sum, p) => sum + p.slots.filter((s) => s.assigned_discord_id).length,
    0,
  )

  const assignedDiscordIds = parties.flatMap((p) =>
    p.slots.map((s) => s.assigned_discord_id).filter((id): id is string => !!id),
  )
  const avatarMap = await getAvatarsByDiscordIds(assignedDiscordIds)
  const avatars = Object.fromEntries(avatarMap)

  const loginHref = `/api/auth/discord/start?returnTo=${encodeURIComponent(`/events/${id}`)}`

  // Pre-battle & in-progress battles get live polling. Once the battle is
  // finished (battle_started_at + 1h), slots are frozen — no reason to keep
  // hammering the DB or draining mobile batteries.
  const shouldPoll = !event.battle_started_at || !isEnded(event.battle_started_at)

  return (
    <div className="flex-1 w-full max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-start lg:gap-6 space-y-4 lg:space-y-0">
      {shouldPoll && <AutoRefresh intervalMs={15000} />}
      <main className="flex-1 min-w-0 space-y-6 sm:space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>

        <div className={`bg-gray-900 border rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-4 ${
          event.battle_started_at ? 'border-rose-500/40' : 'border-gray-700'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-1">
                {t('info')}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{event.title}</h1>
            </div>
            {event.battle_started_at && (
              <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                <Swords size={12} />
                {t('inProgress', { time: formatStartedAt(event.battle_started_at) })}
              </span>
            )}
          </div>
          {event.battle_started_at && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-rose-300 flex-shrink-0 mt-0.5" />
              <p className="text-rose-200 text-sm leading-relaxed">
                {t.rich('startedNotice', {
                  bold: (chunks) => <span className="font-bold">{chunks}</span>,
                })}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={14} className="text-amber-400" />
              {displayGatherTime}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={14} className="text-amber-400" />
              {event.gather_location}
            </div>
            {totalSlots > 0 && (
              <div className="text-gray-400">
                {t('applicants', { assigned: totalAssigned, total: totalSlots })}
              </div>
            )}
          </div>
          {event.special_notes && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm font-semibold whitespace-pre-wrap">
                📢 {event.special_notes}
              </p>
            </div>
          )}
        </div>

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
        </div>

        {parties.length === 0 && (
          <p className="text-center text-gray-500">{t('noParties')}</p>
        )}

        {parties.map((party) => {
          const assigned = party.slots.filter((s) => s.assigned_discord_id).length
          return (
            <section key={party.id} className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {t('partyNumber', { number: party.party_number })}
                </h2>
                <span className="text-sm sm:text-base text-gray-400">
                  {t('applicationsCount', { assigned, total: party.slots.length })}
                </span>
              </div>
              {party.slots.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-4">{t('noSlots')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
                  {party.slots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      partyNumber={party.party_number}
                      currentDiscordId={session?.discordId ?? null}
                      loginHref={loginHref}
                      battleStarted={!!event.battle_started_at}
                      assignedAvatar={slot.assigned_discord_id ? avatars[slot.assigned_discord_id] ?? null : null}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
      </aside>
    </div>
  )
}
