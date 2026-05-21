import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, Info, MapPin, Swords, UserPlus, Users } from 'lucide-react'
import { DEMO_EVENTS, DEMO_EVENT_DETAIL, DEMO_MEMBERS, type DemoEventSlot } from '@/data/demo-seed'
import type { PartyWithSlots, Slot, SlotRole } from '@/types'
import { getRoleStyle } from '@/types'
import EventMyStatusCard from '@/components/EventMyStatusCard'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import { translateSlotRole } from '@/lib/slot-role-i18n'
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

  const [t, tEvent, tSlot, tTentative, tRole, tDemoDetail] = await Promise.all([
    getTranslations('demo'),
    getTranslations('event'),
    getTranslations('slot'),
    getTranslations('eventTentative'),
    getTranslations('slotRole'),
    getTranslations('demo.eventDetail'),
  ])
  const isPrimary = listEvent.id === DEMO_EVENT_DETAIL.id
  const description = isPrimary ? DEMO_EVENT_DETAIL.description : null
  const organizer = isPrimary ? DEMO_EVENT_DETAIL.organizer : '—'
  const demoMemberIgn = DEMO_MEMBERS[0]?.ign ?? 'Eternia'
  const renderedParties = toDemoParties(DEMO_EVENT_DETAIL.parties)
  const mySlot = findDemoSlot(renderedParties, demoMemberIgn)
  const totalSlots = renderedParties.reduce((sum, party) => sum + party.slots.length, 0)
  const totalAssigned = renderedParties.reduce(
    (sum, party) => sum + party.slots.filter((slot) => slot.assigned_discord_id).length,
    0,
  )

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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-white">{listEvent.name}</h1>
                <EventStatusPill status={listEvent.status} t={t} />
              </div>
            </div>
            {listEvent.battleStarted && (
              <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                <Swords size={12} />
                {t('status.eventLive')}
              </span>
            )}
          </div>
          {listEvent.battleStarted && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-rose-300 flex-shrink-0 mt-0.5" />
              <p className="text-rose-200 text-sm leading-relaxed">
                {tEvent.rich('startedNotice', {
                  bold: (chunks) => <span className="font-bold">{chunks}</span>,
                })}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={14} className="text-amber-400" />
              {formatTimeLabel(t, listEvent.scheduledAt)}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={14} className="text-amber-400" />
              {listEvent.zone}
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <Users size={14} />
              {tEvent('applicants', { assigned: totalAssigned, total: totalSlots })}
            </div>
          </div>
          {description && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm font-semibold whitespace-pre-wrap">
                {description}
              </p>
            </div>
          )}
          <div className="text-xs text-gray-500">
            {t('events.detailTemplate')}: {listEvent.templateLabel} · {t('events.detailOrganizer')}: {organizer}
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
              secondaryAction={{ href: '#event-slots', label: tEvent('myStatusFindSlot') }}
            />
          </div>
        </div>

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={renderedParties} avatars={{}} />
        </div>

        <DemoTentativeSection t={tTentative} tDemo={tDemoDetail} />

        <div id="event-slots" data-tour-id="event-detail-slots" className="space-y-6 scroll-mt-20">
          <DemoFilterBar tEvent={tEvent} tDemo={tDemoDetail} tRole={tRole} />
          {renderedParties.map((party) => (
            <section key={party.id} className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {tEvent('partyNumber', { number: party.party_number })}
                </h2>
                <span className="text-sm sm:text-base text-gray-400">
                  {tEvent('applicationsCount', {
                    assigned: party.slots.filter((slot) => slot.assigned_discord_id).length,
                    total: party.slots.length,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
                {party.slots.map((slot) => (
                  <DemoSlotCard
                    key={slot.id}
                    slot={slot}
                    partyNumber={party.party_number}
                    isMine={slot.assigned_username === demoMemberIgn}
                    tSlot={tSlot}
                    tRole={tRole}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={renderedParties} avatars={{}} />
      </aside>
    </div>
  )
}

function findDemoSlot(parties: PartyWithSlots[], ign: string) {
  for (const party of parties) {
    const slot = party.slots.find((s) => s.assigned_username === ign)
    if (slot) {
      return {
        partyName: party.name?.trim() || `${party.party_number}`,
        slot,
      }
    }
  }
  return null
}

function DemoFilterBar({
  tEvent,
  tDemo,
  tRole,
}: {
  tEvent: Awaited<ReturnType<typeof getTranslations<'event'>>>
  tDemo: Awaited<ReturnType<typeof getTranslations<'demo.eventDetail'>>>
  tRole: Awaited<ReturnType<typeof getTranslations<'slotRole'>>>
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300">
        {tEvent('filterOpen')}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300">
        {tEvent('filterMyRole', { role: translateSlotRole('DefTanker', tRole) })}
      </span>
      <span className="text-xs text-gray-500">{tDemo('filterHint')}</span>
    </div>
  )
}

function DemoTentativeSection({
  t,
  tDemo,
}: {
  t: Awaited<ReturnType<typeof getTranslations<'eventTentative'>>>
  tDemo: Awaited<ReturnType<typeof getTranslations<'demo.eventDetail'>>>
}) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-amber-400" />
          <h2 className="text-base sm:text-lg font-bold text-white">{t('title')}</h2>
          <span className="text-xs text-gray-400 font-mono">{t('countSummary', { n: 3 })}</span>
        </div>
      </div>
      <p className="text-gray-400 text-xs sm:text-sm">{t('description')}</p>
      <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Eternia</p>
          <p className="text-[11px] text-gray-500">{tDemo('tentativeSample')}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold px-3 py-1 rounded-full"
        >
          <UserPlus size={12} />
          {t('editButton')}
        </button>
      </div>
    </section>
  )
}

function DemoSlotCard({
  slot,
  partyNumber,
  isMine,
  tSlot,
  tRole,
}: {
  slot: Slot
  partyNumber: number
  isMine: boolean
  tSlot: Awaited<ReturnType<typeof getTranslations<'slot'>>>
  tRole: Awaited<ReturnType<typeof getTranslations<'slotRole'>>>
}) {
  const roleStyle = getRoleStyle(slot.role_name)
  const isTaken = !!slot.assigned_discord_id
  return (
    <div
      className={`rounded-xl p-2.5 space-y-2 border transition-colors ${
        isMine
          ? 'bg-amber-500/5 border-amber-500/40'
          : isTaken
            ? 'bg-gray-900/60 border-gray-700'
            : 'bg-gray-900 border-gray-600 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-gray-500 text-[12px]">
            {tSlot('partyLabel', { party: partyNumber, slot: slot.slot_number })}
          </span>
          {slot.role_name && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}>
              {translateSlotRole(slot.role_name, tRole)}
            </span>
          )}
        </div>
        {isTaken && (
          <span className={`text-[12px] font-semibold truncate max-w-[86px] ${
            isMine ? 'text-amber-300' : 'text-green-400'
          }`}>
            {slot.assigned_username}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <div className="col-span-2 row-span-2 rounded-lg border border-gray-800 bg-gray-950 min-h-24 flex items-center justify-center px-2 text-center">
          <span className="text-[11px] font-semibold text-gray-200 leading-tight">
            {slot.weapon_name}
          </span>
        </div>
        {[
          slot.head_name,
          slot.armor_name,
          slot.shoes_name,
          slot.cape_name,
        ].map((name) => (
          <div
            key={name}
            className="rounded-md border border-gray-800 bg-gray-950 min-h-11 flex items-center justify-center px-1 text-center"
          >
            <span className="text-[9px] text-gray-400 leading-tight truncate">{name}</span>
          </div>
        ))}
      </div>

      <p className="text-white text-[12px] font-medium truncate leading-tight">
        {slot.weapon_name}
      </p>
      {isTaken ? (
        <button
          type="button"
          className="w-full py-1 rounded-md text-[13px] font-medium bg-gray-800/50 text-gray-500 border border-gray-800 cursor-not-allowed"
        >
          {tSlot('cannotApply')}
        </button>
      ) : (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-colors"
        >
          <UserPlus size={11} />
          {tSlot('apply')}
        </button>
      )}
    </div>
  )
}

function toDemoParties(parties: typeof DEMO_EVENT_DETAIL.parties): PartyWithSlots[] {
  return parties.map((party, partyIndex) => ({
    id: party.id,
    event_id: DEMO_EVENT_DETAIL.id,
    party_number: partyIndex + 1,
    name: null,
    is_bomb_squad: false,
    bomb_squad_kind: null,
    caller_discord_id: null,
    slots: party.slots.map((slot, slotIndex) => toDemoSlot(party.id, slot, slotIndex)),
  }))
}

function toDemoSlot(partyId: string, slot: DemoEventSlot, slotIndex: number): Slot {
  const role = toSlotRole(slot.role)
  const gear = gearForSlot(slot)
  return {
    id: `${partyId}-slot-${slotIndex + 1}`,
    party_id: partyId,
    slot_number: slotIndex + 1,
    is_hidden: false,
    role_name: role,
    notes: slot.isCaller ? '메인 콜러 슬롯' : null,
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
    assigned_discord_id: slot.assigned ? `demo-${slot.assigned}` : null,
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
  return 'Dps'
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
  if (slot.role === 'dps') {
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
