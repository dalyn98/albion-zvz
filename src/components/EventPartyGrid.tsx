'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bomb, Filter, Megaphone, Pencil, X } from 'lucide-react'
import type { PartyWithSlots, SlotRole } from '@/types'
import SlotCard from './SlotCard'

interface Props {
  parties: PartyWithSlots[]
  currentDiscordId: string | null
  loginHref: string
  battleStarted: boolean
  isAdmin: boolean
  eventId: string
  eventCreatedBy: string | null
  avatars: Record<string, string | null>
  cdBadgeRoles: readonly SlotRole[]
}

export default function EventPartyGrid({
  parties,
  currentDiscordId,
  loginHref,
  battleStarted,
  isAdmin,
  eventId,
  eventCreatedBy,
  avatars,
  cdBadgeRoles,
}: Props) {
  const t = useTranslations('event')
  const [onlyMyRole, setOnlyMyRole] = useState(false)

  const myRoleName = useMemo(() => {
    if (!currentDiscordId) return null
    for (const party of parties) {
      for (const slot of party.slots) {
        if (slot.assigned_discord_id === currentDiscordId && slot.role_name) {
          return slot.role_name
        }
      }
    }
    return null
  }, [parties, currentDiscordId])

  const filteredParties = useMemo(() => {
    if (!onlyMyRole || !myRoleName) return parties
    return parties
      .map((party) => ({
        ...party,
        slots: party.slots.filter((s) => s.role_name === myRoleName),
      }))
      .filter((party) => party.slots.length > 0)
  }, [parties, onlyMyRole, myRoleName])

  const hasAnyRoleFilter = !!myRoleName
  const isEventOwner =
    !!currentDiscordId && !!eventCreatedBy && eventCreatedBy === currentDiscordId

  return (
    <div className="space-y-6 sm:space-y-8">
      {hasAnyRoleFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setOnlyMyRole((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              onlyMyRole
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 hover:bg-amber-500/30'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-500/50 hover:text-amber-300'
            }`}
          >
            {onlyMyRole ? <X size={12} /> : <Filter size={12} />}
            {onlyMyRole
              ? t('filterMyRoleActive', { role: myRoleName! })
              : t('filterMyRole', { role: myRoleName! })}
          </button>
        </div>
      )}

      {parties.length === 0 && (
        <p className="text-center text-gray-500">{t('noParties')}</p>
      )}

      {onlyMyRole && filteredParties.length === 0 && parties.length > 0 && (
        <p className="text-center text-gray-500 text-sm py-6">{t('filterNoMatches')}</p>
      )}

      {filteredParties.map((party) => {
        const assigned = party.slots.filter((s) => s.assigned_discord_id).length
        const isBomb = party.is_bomb_squad
        const customName = party.name?.trim()
        const displayName = isBomb && customName
          ? customName
          : t('partyNumber', { number: party.party_number })
        const callerName = isBomb && party.caller_discord_id
          ? party.slots.find((s) => s.assigned_discord_id === party.caller_discord_id)?.assigned_username
            ?? null
          : null
        const isPartyCaller =
          isBomb &&
          !!currentDiscordId &&
          !!party.caller_discord_id &&
          party.caller_discord_id === currentDiscordId
        const canEditThisParty = isBomb && (isAdmin || isEventOwner || isPartyCaller)
        return (
          <section key={party.id} className="space-y-3 sm:space-y-4">
            <div className={`flex items-center justify-between gap-2 border-b pb-2 ${
              isBomb ? 'border-rose-500/40' : 'border-gray-800'
            }`}>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h2 className={`text-base sm:text-lg font-bold flex items-center gap-1.5 ${
                  isBomb ? 'text-rose-200' : 'text-white'
                }`}>
                  {isBomb && <Bomb size={16} className="text-rose-400" />}
                  {displayName}
                </h2>
                {isBomb && party.bomb_squad_kind && (
                  <span className="bg-rose-500/10 text-rose-300 text-xs font-semibold px-2 py-0.5 rounded border border-rose-500/30">
                    {t(`bombSquad.kind.${party.bomb_squad_kind}`)}
                  </span>
                )}
                {isBomb && callerName && (
                  <span className="inline-flex items-center gap-1 text-xs text-rose-200/90">
                    <Megaphone size={11} />
                    {t('bombSquad.callerLabel', { name: callerName })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEditThisParty && (
                  <Link
                    href={`/events/${eventId}/party/${party.party_number}`}
                    className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-200 text-xs font-semibold px-2 py-1 rounded transition-colors"
                    aria-label={t('bombSquad.editPartyAria')}
                  >
                    <Pencil size={11} />
                    {t('bombSquad.editParty')}
                  </Link>
                )}
                <span className="text-sm sm:text-base text-gray-400">
                  {t('applicationsCount', { assigned, total: party.slots.length })}
                </span>
              </div>
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
                    eventId={party.event_id}
                    partyName={customName || null}
                    isBombSquadParty={isBomb}
                    bombSquadCallerId={party.caller_discord_id}
                    currentDiscordId={currentDiscordId}
                    loginHref={loginHref}
                    battleStarted={battleStarted}
                    isAdmin={isAdmin}
                    assignedAvatar={
                      slot.assigned_discord_id ? avatars[slot.assigned_discord_id] ?? null : null
                    }
                    requestedAvatar={
                      slot.requested_discord_id ? avatars[slot.requested_discord_id] ?? null : null
                    }
                    cdBadgeRoles={cdBadgeRoles}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
