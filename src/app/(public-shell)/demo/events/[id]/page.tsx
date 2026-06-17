import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, FileText, Info, MapPin, Swords } from 'lucide-react'
import EventMyStatusCard from '@/components/EventMyStatusCard'
import EventBuildSheetSummary from '@/components/EventBuildSheetSummary'
import EventPartyGrid from '@/components/EventPartyGrid'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import TentativeSignupSection from '@/components/TentativeSignupSection'
import {
  DEMO_EVENTS,
  DEMO_EVENT_DETAIL,
  DEMO_MEMBERS,
  getDemoEventReport,
  type DemoEventSlot,
} from '@/data/demo-seed'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import type { TentativeSignupRow } from '@/app/actions/event-tentative'
import type { PartyWithSlots, Slot, SlotRole } from '@/types'
import { formatTimeLabel } from '../../_lib/format'
import DemoGuidedTour from '../../_components/DemoGuidedTour'

const EVENT_DETAIL_TOUR_STEPS = [
  { id: 'event-detail-summary' },
  { id: 'event-detail-my-status' },
  { id: 'event-detail-build-sheet' },
  { id: 'event-detail-tentative' },
  { id: 'event-detail-slots' },
] as const

const DEMO_MEMBER_IGN = DEMO_MEMBERS[0]?.ign ?? 'Eternia'

export default async function DemoEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listEvent = DEMO_EVENTS.find((e) => e.id === id)
  if (!listEvent) notFound()

  const [tDemo, tEvent, tRole] = await Promise.all([
    getTranslations('demo'),
    getTranslations('event'),
    getTranslations('slotRole'),
  ])
  const description = DEMO_EVENT_DETAIL.description
  const organizer = DEMO_EVENT_DETAIL.organizer
  const parties = toDemoParties(id, DEMO_EVENT_DETAIL.parties)
  const tentativeRows = toDemoTentativeRows(id)
  const mySlot = findDemoSlot(parties, DEMO_MEMBER_IGN)
  const hasReport = getDemoEventReport(id) !== null
  const totalSlots = parties.reduce((sum, party) => sum + party.slots.length, 0)
  const totalAssigned = parties.reduce(
    (sum, party) => sum + party.slots.filter((slot) => slot.assigned_discord_id).length,
    0,
  )
  const myStatusSecondaryAction = !mySlot
    ? { href: '#event-slots', label: tEvent('myStatusFindSlot') }
    : undefined

  return (
    <div className="flex-1 w-full max-w-7xl 2xl:max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:gap-6 space-y-4 lg:space-y-0">
      <DemoGuidedTour steps={EVENT_DETAIL_TOUR_STEPS} namespace="eventDetail" />
      <main className="flex-1 min-w-0 space-y-6 sm:space-y-8">
        <Link
          href="/demo/member-events"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          {tEvent('backToList')}
        </Link>

        <div
          data-tour-id="event-detail-summary"
          className={`bg-gray-900 border rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-4 ${
            listEvent.battleStarted ? 'border-rose-500/40' : 'border-gray-700'
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-1">
                {tEvent('info')}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{listEvent.name}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {listEvent.battleStarted && (
                <>
                  {hasReport && (
                    <Link
                      href={`/demo/events/${id}/report`}
                      className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 text-amber-300 text-sm font-bold px-2.5 py-1 rounded-full transition-colors"
                    >
                      <FileText size={12} />
                      {tEvent('viewReport')}
                    </Link>
                  )}
                  <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                    <Swords size={12} />
                    {tDemo('status.eventLive')}
                  </span>
                </>
              )}
            </div>
          </div>
          {listEvent.battleStarted && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-rose-300 flex-shrink-0 mt-0.5" />
              <p className="text-rose-200 text-sm leading-relaxed">
                {tEvent.rich(listEvent.category === '전투' ? 'startedNotice' : 'startedNoticeFlexible', {
                  bold: (chunks) => <span className="font-bold">{chunks}</span>,
                })}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={14} className="text-amber-400" />
              {formatTimeLabel(tDemo, listEvent.scheduledAt)}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={14} className="text-amber-400" />
              {listEvent.zone}
            </div>
            {totalSlots > 0 && (
              <div className="text-gray-400">
                {tEvent('applicants', { assigned: totalAssigned, total: totalSlots })}
              </div>
            )}
          </div>
          {description && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm font-semibold whitespace-pre-wrap">
                {description}
              </p>
            </div>
          )}
          <div className="text-xs text-gray-500">
            {tDemo('events.detailTemplate')}: {listEvent.templateLabel} · {tDemo('events.detailOrganizer')}: {organizer}
          </div>
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
                      tEvent('myStatusPartySlot', {
                        party: mySlot.partyName,
                        slot: mySlot.slot.slot_number,
                      }),
                      mySlot.slot.role_name
                        ? tEvent('myStatusRole', {
                            role: translateSlotRole(mySlot.slot.role_name, tRole),
                          })
                        : null,
                    ].filter((v): v is string => !!v)
                  : []
              }
              primaryAction={
                mySlot && listEvent.battleStarted
                  ? { href: '/demo/regear', label: tEvent('myStatusRegear') }
                  : undefined
              }
              secondaryAction={myStatusSecondaryAction}
            />
          </div>
        </div>

        <div className="lg:hidden">
          <EventSlotSidebar
            placement="mobile"
            parties={parties}
            avatars={{}}
            memberHrefPrefix="/demo/members"
          />
        </div>

        <div data-tour-id="event-detail-build-sheet">
          <EventBuildSheetSummary parties={parties} mode="hybrid" />
        </div>

        <div data-tour-id="event-detail-tentative">
          <TentativeSignupSection
            eventId={id}
            rows={tentativeRows}
            avatars={{}}
            currentDiscordId={DEMO_MEMBER_IGN}
            isAdmin={false}
            isEventOwner={false}
            loginHref="/api/auth/discord/start?returnTo=/demo"
            battleStarted={!!listEvent.battleStarted}
            interactionMode="demo"
          />
        </div>

        <div id="event-slots" data-tour-id="event-detail-slots" className="scroll-mt-20">
          <EventPartyGrid
            parties={parties}
            currentDiscordId={DEMO_MEMBER_IGN}
            loginHref="/api/auth/discord/start?returnTo=/demo"
            battleStarted={!!listEvent.battleStarted}
            isAdmin={false}
            eventId={id}
            avatars={{}}
            usernames={{}}
            cdBadgeRoles={['EngageDps', 'BrawlerDps']}
            autoRegearEnabled
            eventCategory={listEvent.category}
            timezone={DEFAULT_TENANT_TIMEZONE}
            suggestedRoles={['DefTanker', 'BrawlerDps']}
            interactionMode="demo"
            memberHrefPrefix="/demo/members"
          />
        </div>
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar
          placement="desktop"
          parties={parties}
          avatars={{}}
          memberHrefPrefix="/demo/members"
        />
      </aside>
    </div>
  )
}

function findDemoSlot(parties: PartyWithSlots[], ign: string) {
  for (const party of parties) {
    const slot = party.slots.find((s) => s.assigned_discord_id === ign)
    if (slot) {
      return {
        partyName: party.name?.trim() || `${party.party_number}`,
        slot,
      }
    }
  }
  return null
}

function toDemoTentativeRows(eventId: string): TentativeSignupRow[] {
  return [
    {
      id: `${eventId}-tentative-mochi`,
      event_id: eventId,
      discord_id: 'Mochi',
      username: 'Mochi',
      possible_roles: ['Sup', 'Healer'],
      notes: 'Locus / Holy both ready',
      created_at: '2026-05-22T09:20:00.000Z',
      updated_at: '2026-05-22T09:20:00.000Z',
    },
    {
      id: `${eventId}-tentative-rin`,
      event_id: eventId,
      discord_id: 'RinBlade',
      username: 'RinBlade',
      possible_roles: ['BrawlerDps', 'OffTanker'],
      notes: null,
      created_at: '2026-05-22T09:25:00.000Z',
      updated_at: '2026-05-22T09:25:00.000Z',
    },
  ]
}

function toDemoParties(eventId: string, parties: typeof DEMO_EVENT_DETAIL.parties): PartyWithSlots[] {
  return parties.map((party, partyIndex) => ({
    id: party.id,
    event_id: eventId,
    party_number: partyIndex + 1,
    name: party.name,
    is_bomb_squad: !!party.isBomb,
    bomb_squad_kind: party.isBomb ? 'melee' : null,
    caller_discord_id: null,
    slots: party.slots.map((slot, slotIndex) => toDemoSlot(eventId, party.id, slot, slotIndex)),
  }))
}

function toDemoSlot(
  eventId: string,
  partyId: string,
  slot: DemoEventSlot,
  slotIndex: number,
): Slot {
  const role = toSlotRole(slot.role)
  const gear = gearForSlot(slot)
  return {
    id: `${eventId}-${partyId}-slot-${slotIndex + 1}`,
    party_id: partyId,
    slot_number: slotIndex + 1,
    is_hidden: false,
    role_name: role,
    notes: slot.isCaller ? 'Main caller slot' : null,
    weapon_name: gear.weapon,
    weapon_id: gear.weaponId,
    head_name: gear.head,
    head_id: gear.headId,
    armor_name: gear.armor,
    armor_id: gear.armorId,
    shoes_name: gear.shoes,
    shoes_id: gear.shoesId,
    offhand_name: null,
    offhand_id: null,
    potion_name: 'Resistance Potion',
    potion_id: 'T7_POTION_STONESKIN',
    food_name: 'Beef Stew',
    food_id: 'T8_MEAL_STEW',
    cape_name: 'Martlock Cape',
    cape_id: 'T8_CAPEITEM_FW_MARTLOCK',
    mount_name: 'Armored Horse',
    mount_id: 'T8_MOUNT_ARMORED_HORSE',
    weapon_options: null,
    head_options: null,
    armor_options: null,
    shoes_options: null,
    offhand_options: null,
    potion_options: null,
    food_options: null,
    cape_options: null,
    mount_options: null,
    spells: null,
    gear_specs: { weapon: { tier: slot.flat, enchant: 0 } },
    auto_regear_excluded: false,
    manual_regear_excluded: false,
    assigned_discord_id: slot.assigned ?? null,
    assigned_username: slot.assigned ?? null,
    assigned_weapon_name: null,
    assigned_weapon_id: null,
    assigned_head_name: null,
    assigned_head_id: null,
    assigned_armor_name: null,
    assigned_armor_id: null,
    assigned_shoes_name: null,
    assigned_shoes_id: null,
    assigned_offhand_name: null,
    assigned_offhand_id: null,
    assigned_potion_name: null,
    assigned_potion_id: null,
    assigned_food_name: null,
    assigned_food_id: null,
    assigned_cape_name: null,
    assigned_cape_id: null,
    assigned_mount_name: null,
    assigned_mount_id: null,
    requested_discord_id: null,
    requested_username: null,
    requested_picks: null,
    requested_at: null,
    is_solo_bomb: false,
    conditional_options: null,
  }
}

function toSlotRole(role: DemoEventSlot['role']): SlotRole {
  if (role === 'caller') return 'Caller'
  if (role === 'tank') return 'DefTanker'
  if (role === 'healer') return 'Healer'
  if (role === 'support') return 'Sup'
  if (role === 'engageDps') return 'EngageDps'
  return 'BrawlerDps'
}

function gearForSlot(slot: DemoEventSlot) {
  if (slot.role === 'healer') {
    return {
      weapon: 'Holy Staff',
      weaponId: 'T8_MAIN_HOLYSTAFF',
      head: 'Cleric Cowl',
      headId: 'T8_HEAD_CLOTH_SET2',
      armor: 'Cleric Robe',
      armorId: 'T8_ARMOR_CLOTH_SET2',
      shoes: 'Cleric Sandals',
      shoesId: 'T8_SHOES_CLOTH_SET2',
    }
  }
  if (slot.role === 'support') {
    return {
      weapon: 'Locus',
      weaponId: 'T8_2H_ARCANE_RINGPAIR_AVALON',
      head: 'Knight Helmet',
      headId: 'T8_HEAD_PLATE_SET2',
      armor: 'Judicator Armor',
      armorId: 'T8_ARMOR_PLATE_KEEPER',
      shoes: 'Hunter Shoes',
      shoesId: 'T8_SHOES_LEATHER_SET1',
    }
  }
  if (slot.role === 'engageDps' || slot.role === 'brawlerDps') {
    return {
      weapon: slot.weapon,
      weaponId: slot.weapon.includes('Fire') ? 'T8_2H_FIRESTAFF' : 'T8_MAIN_DAGGER',
      head: 'Royal Hood',
      headId: 'T8_HEAD_CLOTH_ROYAL',
      armor: 'Cleric Robe',
      armorId: 'T8_ARMOR_CLOTH_SET2',
      shoes: 'Scholar Sandals',
      shoesId: 'T8_SHOES_CLOTH_SET1',
    }
  }
  return {
    weapon: 'Heavy Mace',
    weaponId: 'T8_2H_MACE',
    head: 'Judicator Helmet',
    headId: 'T8_HEAD_PLATE_KEEPER',
    armor: 'Judicator Armor',
    armorId: 'T8_ARMOR_PLATE_KEEPER',
    shoes: 'Hunter Shoes',
    shoesId: 'T8_SHOES_LEATHER_SET1',
  }
}
