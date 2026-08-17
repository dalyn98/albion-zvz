import Link from 'next/link'
import { Clock, MapPin, ShieldCheck, Swords, UserRoundCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { EventCategory, PartyWithSlots, SlotRole } from '@/types'
import type { EventGuestProfile } from '@/lib/event-guest-profile'
import EventGuestProfileGate from '@/components/EventGuestProfileGate'
import EventPartyGrid from '@/components/EventPartyGrid'
import EventGuestApplicationControls from '@/components/EventGuestApplicationControls'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import EventGuestRegearPanel, {
  type EventGuestRegearView,
} from '@/components/EventGuestRegearPanel'

export interface EventGuestApplicationView {
  status:
    | 'pending'
    | 'assigned'
    | 'withdrawn'
    | 'admin_removed'
    | 'reselection_required'
    | 'reselection_expired'
  slotId: string
  slotNumber: number
  partyNumber: number
  roleName: string | null
}

export interface EventGuestPartyMemberView {
  displayName: string
  characterName: string
  characterVerified: boolean
}

export default async function EventGuestExperience({
  event,
  inviteToken,
  discordLoginHref,
  currentGuestId,
  profile,
  application,
  samePartyGuests,
  recruitmentParties,
  displayGatherTime,
  timezone,
  cdBadgeRoles,
  guestRegear,
}: {
  event: {
    id: string
    title: string
    category: EventCategory
    gatherLocation: string
    specialNotes: string | null
    battleStarted: boolean
  }
  inviteToken: string | null
  discordLoginHref: string | null
  currentGuestId: string | null
  profile: EventGuestProfile | null
  application: EventGuestApplicationView | null
  samePartyGuests: readonly EventGuestPartyMemberView[]
  recruitmentParties: PartyWithSlots[]
  displayGatherTime: string
  timezone: string
  cdBadgeRoles: readonly SlotRole[]
  guestRegear: EventGuestRegearView | null
}) {
  const [t, tRole] = await Promise.all([
    getTranslations('eventGuestExperience'),
    getTranslations('slotRole'),
  ])
  const isActive =
    application?.status === 'pending' ||
    application?.status === 'assigned' ||
    application?.status === 'reselection_required'
  const canCancel = isActive && !event.battleStarted

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:py-8">
      {!profile && (
        <EventGuestProfileGate
          eventId={event.id}
          inviteToken={inviteToken}
          initialProfile={null}
          discordLoginHref={discordLoginHref}
        />
      )}

      <section className="rounded-2xl border border-gray-800 bg-gray-950/75 p-5 shadow-xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              {t('eyebrow')}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">{event.title}</h1>
          </div>
          <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-300">
            {t(`category.${event.category}`)}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-300">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} className="text-amber-400" />
            {displayGatherTime}
          </span>
          {application?.status === 'assigned' && event.gatherLocation.trim() && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} className="text-amber-400" />
              {event.gatherLocation}
            </span>
          )}
        </div>
        {!application && (
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            {t('recruitmentDescription')}
          </p>
        )}
      </section>

      {application ? (
        <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            {application.status === 'assigned' ? (
              <UserRoundCheck size={20} className="mt-0.5 shrink-0 text-emerald-300" />
            ) : (
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <div>
              <h2 className="font-bold text-white">
                {t(`status.${application.status}.title`)}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-400">
                {t(`status.${application.status}.description`)}
              </p>
            </div>
          </div>
          {isActive && (
            <div className="grid gap-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500">{t('party')}</p>
                <p className="mt-1 font-semibold text-white">
                  {t('partyNumber', { number: application.partyNumber })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('slot')}</p>
                <p className="mt-1 font-semibold text-white">{application.slotNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('role')}</p>
                <p className="mt-1 font-semibold text-white">
                  {application.roleName
                    ? translateSlotRole(application.roleName, tRole)
                    : t('roleUnspecified')}
                </p>
              </div>
            </div>
          )}

          {application.status === 'assigned' && event.specialNotes?.trim() && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
              <h3 className="text-sm font-bold text-amber-200">{t('instructions')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                {event.specialNotes}
              </p>
            </div>
          )}

          {application.status === 'assigned' && samePartyGuests.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-white">{t('samePartyGuests')}</h3>
              <ul className="mt-2 divide-y divide-gray-800 rounded-xl border border-gray-800">
                {samePartyGuests.map((guest) => (
                  <li
                    key={`${guest.characterName}:${guest.displayName}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-100">
                        {guest.displayName}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {guest.characterName}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[11px] font-semibold ${
                      guest.characterVerified ? 'text-emerald-300' : 'text-gray-500'
                    }`}>
                      {guest.characterVerified
                        ? t('characterChecked')
                        : t('characterUnchecked')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canCancel && <EventGuestApplicationControls slotId={application.slotId} />}
          {event.battleStarted && (
            <p className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 text-xs text-gray-500">
              {t('startedReadOnly')}
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Swords size={18} className="text-amber-300" />
            <div>
              <h2 className="font-bold text-white">{t('openSlotsTitle')}</h2>
              <p className="text-xs text-gray-500">{t('openSlotsDescription')}</p>
            </div>
          </div>
          {recruitmentParties.length > 0 ? (
            <EventPartyGrid
              parties={recruitmentParties}
              currentDiscordId={currentGuestId}
              loginHref={discordLoginHref ?? '#'}
              battleStarted={event.battleStarted}
              isAdmin={false}
              canManageSlots={false}
              eventId={event.id}
              avatars={{}}
              usernames={{}}
              cdBadgeRoles={cdBadgeRoles}
              autoRegearEnabled={false}
              eventCategory={event.category}
              timezone={timezone}
              canApplyToSlots={Boolean(profile && currentGuestId)}
              memberHrefPrefix="/guest/access-unavailable"
            />
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-10 text-center">
              <p className="text-sm text-gray-400">{t('noOpenSlots')}</p>
            </div>
          )}
          {!currentGuestId && discordLoginHref && (
            <p className="text-center text-xs text-gray-500">
              {t('discordOptionalPrefix')}{' '}
              <Link href={discordLoginHref} className="font-semibold text-amber-300 hover:text-amber-200">
                {t('discordOptionalAction')}
              </Link>
            </p>
          )}
        </section>
      )}

      {guestRegear && <EventGuestRegearPanel view={guestRegear} />}
    </main>
  )
}
