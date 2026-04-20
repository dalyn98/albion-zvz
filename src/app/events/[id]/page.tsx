import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Event, EventBattle, PartyWithSlots } from '@/types'
import EventPartyGrid from '@/components/EventPartyGrid'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import EventBattlesSection from '@/components/EventBattlesSection'
import AutoRefresh from '@/components/AutoRefresh'
import { Clock, MapPin, ArrowLeft, Swords, Info, Lock } from 'lucide-react'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { formatGatherTimeFor, isEnded } from '@/lib/gather-time'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'

function formatStartedAt(iso: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (KST, via formatDateTimeShort).
  return formatDateTimeShort(iso).replace('-', '/')
}

export const dynamic = 'force-dynamic'

async function getEvent(id: string) {
  const [{ data: event }, { data: parties }, { data: battles }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('parties').select('*, slots(*)').eq('event_id', id).order('party_number'),
    supabase
      .from('event_battles')
      .select('*')
      .eq('event_id', id)
      .order('battle_number', { ascending: true }),
  ])

  const sorted = (parties ?? []).map((p) => ({
    ...p,
    slots: [...(p.slots ?? [])]
      .filter((s) => !s.is_hidden)
      .sort((a, b) => a.slot_number - b.slot_number),
  })) as PartyWithSlots[]

  return {
    event: event as Event | null,
    parties: sorted,
    battles: (battles ?? []) as EventBattle[],
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ event, parties, battles }, session, t, locale] = await Promise.all([
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

  // MVP Discord ID → display username map. Names come from the same slot
  // assignments we already fetched, so a member renamed on Discord after
  // the battle still appears under the name they signed up with.
  const mvpNameMap = new Map<string, string>()
  for (const p of parties) {
    for (const s of p.slots) {
      if (s.assigned_discord_id && s.assigned_username && !mvpNameMap.has(s.assigned_discord_id)) {
        mvpNameMap.set(s.assigned_discord_id, s.assigned_username)
      }
    }
  }
  const mvpNames = Object.fromEntries(mvpNameMap)

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
          event.finalized_at
            ? 'border-gray-600/60'
            : event.battle_started_at
              ? 'border-rose-500/40'
              : 'border-gray-700'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-1">
                {t('info')}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{event.title}</h1>
            </div>
            {event.finalized_at ? (
              <span className="inline-flex items-center gap-1.5 bg-gray-700/60 border border-gray-600 text-gray-200 text-sm font-bold px-2.5 py-1 rounded-full">
                <Lock size={12} />
                {t('ended')}
              </span>
            ) : event.battle_started_at && (
              <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                <Swords size={12} />
                {t('inProgress', { time: formatStartedAt(event.battle_started_at) })}
              </span>
            )}
          </div>
          {event.finalized_at ? (
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-gray-300 flex-shrink-0 mt-0.5" />
              <p className="text-gray-200 text-sm leading-relaxed">{t('endedNotice')}</p>
            </div>
          ) : event.battle_started_at && (
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

        {battles.length > 0 && (
          <EventBattlesSection
            battles={battles}
            mvpNames={mvpNames}
            avatars={avatars}
          />
        )}

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
        </div>

        <EventPartyGrid
          parties={parties}
          currentDiscordId={session?.discordId ?? null}
          loginHref={loginHref}
          battleStarted={!!event.battle_started_at}
          eventFinalized={!!event.finalized_at}
          isAdmin={session?.isAdmin ?? false}
          avatars={avatars}
        />
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
      </aside>
    </div>
  )
}
