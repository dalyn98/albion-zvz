import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Event, EventBattle, PartyWithSlots } from '@/types'
import EventInfoForm from '@/components/EventInfoForm'
import PartyEditorPanel from '@/components/PartyEditorPanel'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import SaveAsTemplateButton from '@/components/SaveAsTemplateButton'
import LoadTemplateButton from '@/components/LoadTemplateButton'
import BattleOutcomeEditor from '@/components/BattleOutcomeEditor'
import AttendanceEditor from '@/components/AttendanceEditor'
import DeleteEventButton from '@/components/DeleteEventButton'
import { listTemplates } from '@/app/actions/templates'
import { listOpponentGuilds } from '@/app/actions/opponent-guilds'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'

const MAX_PARTIES = 4

async function getData(id: string) {
  const [{ data: event }, { data: parties }, { data: battles }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).single(),
    supabase.from('parties').select('*, slots(*)').eq('event_id', id).order('party_number'),
    supabase
      .from('event_battles')
      .select('*')
      .eq('event_id', id)
      .order('battle_number', { ascending: true }),
  ])

  const sorted = (parties ?? []).map((p) => ({
    ...p,
    slots: [...(p.slots ?? [])].sort((a, b) => a.slot_number - b.slot_number),
  })) as PartyWithSlots[]

  return {
    event: event as Event | null,
    parties: sorted,
    battles: (battles ?? []) as EventBattle[],
  }
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ event, parties, battles }, { templates }, { guilds: opponentGuilds }, t] = await Promise.all([
    getData(id),
    listTemplates(),
    listOpponentGuilds(),
    getTranslations('adminEditEvent'),
  ])

  if (!event) notFound()

  const partiesByNumber = new Map(parties.map((p) => [p.party_number, p]))
  const hasParties = parties.length > 0
  const hasSlots = parties.some((p) => p.slots.length > 0)

  const assignedDiscordIds = parties.flatMap((p) =>
    p.slots.map((s) => s.assigned_discord_id).filter((id): id is string => !!id),
  )
  const avatarMap = await getAvatarsByDiscordIds(assignedDiscordIds)
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6 space-y-4 lg:space-y-0">
      <div className="flex-1 min-w-0 space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
          <DeleteEventButton eventId={event.id} redirectTo="/admin/dashboard" variant="labeled" />
        </div>
        <EventInfoForm initialEvent={event} />

        {event.battle_started_at && (
          <BattleOutcomeEditor
            eventId={event.id}
            initialBattles={battles}
            currentOutcome={event.outcome}
            opponentGuilds={opponentGuilds}
          />
        )}

        {event.battle_started_at && (
          <AttendanceEditor eventId={event.id} parties={parties} avatars={avatars} />
        )}

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
        </div>

        <hr className="border-gray-700" />
        <section className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">{t('partyConfigTitle')}</h2>
              <p className="text-gray-400 text-xs sm:text-sm mt-1">
                {t('partyConfigDescription', { max: MAX_PARTIES })}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!hasParties && (
                <LoadTemplateButton eventId={id} templates={templates} />
              )}
              {hasSlots && (
                <SaveAsTemplateButton eventId={id} defaultName={event.title} />
              )}
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: MAX_PARTIES }, (_, i) => i + 1).map((partyNumber) => {
              const party = partiesByNumber.get(partyNumber) ?? null
              return (
                <PartyEditorPanel
                  key={`${partyNumber}-${party?.id ?? 'empty'}`}
                  eventId={id}
                  partyNumber={partyNumber}
                  initialData={party}
                />
              )
            })}
          </div>
        </section>
      </div>

      <aside className="hidden lg:block w-72 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
      </aside>
    </div>
  )
}
