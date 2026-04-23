'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bomb, Eye, EyeOff, Filter, Megaphone, Pencil, X } from 'lucide-react'
import type { PartyWithSlots, SlotRole } from '@/types'
import SlotCard from './SlotCard'

interface Props {
  parties: PartyWithSlots[]
  currentDiscordId: string | null
  loginHref: string
  battleStarted: boolean
  isAdmin: boolean
  eventId: string
  avatars: Record<string, string | null>
  usernames: Record<string, string | null>
  cdBadgeRoles: readonly SlotRole[]
}

function hiddenStorageKey(eventId: string, discordId: string) {
  return `app.event.${eventId}.hidden.${discordId}`
}

export default function EventPartyGrid({
  parties,
  currentDiscordId,
  loginHref,
  battleStarted,
  isAdmin,
  eventId,
  avatars,
  usernames,
  cdBadgeRoles,
}: Props) {
  const t = useTranslations('event')
  const [onlyMyRole, setOnlyMyRole] = useState(false)
  // Load after mount so SSR output matches first client render — avoids hydration
  // mismatch when localStorage has hidden ids saved from a prior visit.
  const [hiddenPartyIds, setHiddenPartyIds] = useState<string[]>([])
  const [hiddenHydrated, setHiddenHydrated] = useState(false)

  useEffect(() => {
    if (!currentDiscordId) {
      setHiddenPartyIds([])
      setHiddenHydrated(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(hiddenStorageKey(eventId, currentDiscordId))
      if (!raw) {
        setHiddenPartyIds([])
      } else {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setHiddenPartyIds(parsed.filter((v): v is string => typeof v === 'string'))
        }
      }
    } catch {
      setHiddenPartyIds([])
    }
    setHiddenHydrated(true)
  }, [eventId, currentDiscordId])

  const persistHidden = useCallback(
    (next: string[]) => {
      if (!currentDiscordId) return
      try {
        if (next.length === 0) {
          window.localStorage.removeItem(hiddenStorageKey(eventId, currentDiscordId))
        } else {
          window.localStorage.setItem(
            hiddenStorageKey(eventId, currentDiscordId),
            JSON.stringify(next),
          )
        }
      } catch {
        // localStorage may be unavailable (private mode etc.) — hiding is best-effort.
      }
    },
    [eventId, currentDiscordId],
  )

  const hidePartyId = useCallback(
    (id: string) => {
      setHiddenPartyIds((prev) => {
        if (prev.includes(id)) return prev
        const next = [...prev, id]
        persistHidden(next)
        return next
      })
    },
    [persistHidden],
  )

  const showPartyId = useCallback(
    (id: string) => {
      setHiddenPartyIds((prev) => {
        if (!prev.includes(id)) return prev
        const next = prev.filter((x) => x !== id)
        persistHidden(next)
        return next
      })
    },
    [persistHidden],
  )

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

  const hiddenSet = useMemo(() => new Set(hiddenPartyIds), [hiddenPartyIds])
  // Only show pills for parties that still exist — if a party was deleted we
  // silently drop its id from the hidden list on next mount.
  const hiddenParties = useMemo(
    () => parties.filter((p) => hiddenSet.has(p.id)),
    [parties, hiddenSet],
  )

  const visibleParties = useMemo(
    () => (hiddenHydrated ? parties.filter((p) => !hiddenSet.has(p.id)) : parties),
    [parties, hiddenSet, hiddenHydrated],
  )

  const filteredParties = useMemo(() => {
    if (!onlyMyRole || !myRoleName) return visibleParties
    return visibleParties
      .map((party) => ({
        ...party,
        slots: party.slots.filter((s) => s.role_name === myRoleName),
      }))
      .filter((party) => party.slots.length > 0)
  }, [visibleParties, onlyMyRole, myRoleName])

  const hasAnyRoleFilter = !!myRoleName
  const canHide = !!currentDiscordId

  return (
    <div className="space-y-6 sm:space-y-8">
      {(hasAnyRoleFilter || (canHide && hiddenParties.length > 0)) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasAnyRoleFilter && (
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
          )}
        </div>
      )}

      {canHide && hiddenParties.length > 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <EyeOff size={12} className="text-gray-500" />
            <span className="font-semibold uppercase tracking-wider">
              {t('hiddenPartiesLabel')}
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">{t('hiddenPartiesHint')}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {hiddenParties.map((party) => {
              const customName = party.name?.trim()
              const displayName = party.is_bomb_squad && customName
                ? customName
                : t('partyNumber', { number: party.party_number })
              return (
                <button
                  key={party.id}
                  type="button"
                  onClick={() => showPartyId(party.id)}
                  aria-label={t('showPartyAria')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-gray-900 border-gray-700 text-gray-300 hover:text-white hover:border-amber-500/50 transition-colors"
                >
                  <Eye size={11} />
                  <span>{displayName}</span>
                  <span className="text-gray-500">· {t('showParty')}</span>
                </button>
              )
            })}
          </div>
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
        // 콜러가 자기 파티 슬롯에 배정돼 있으면 그 슬롯의 username 을 우선 사용
        // (가장 최신 표기). 아니면 guild_avatars/guests 캐시에서 lookup — 이름
        // 없는 콜러도 표시되게 하기 위함.
        const callerName = isBomb && party.caller_discord_id
          ? party.slots.find((s) => s.assigned_discord_id === party.caller_discord_id)?.assigned_username
            ?? usernames[party.caller_discord_id]
            ?? null
          : null
        const isPartyCaller =
          isBomb &&
          !!currentDiscordId &&
          !!party.caller_discord_id &&
          party.caller_discord_id === currentDiscordId
        // 편집 버튼은 "밤스쿼드 콜러 본인"에게만 노출. 관리자/이벤트 주인은
        // 어드민 대시보드로 편집하므로 공개 페이지의 밤스쿼드 헤더에는 표시
        // 하지 않음 (콜러 고유 UX 강조).
        const canEditThisParty = isBomb && isPartyCaller
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
                {isBomb && callerName && party.caller_discord_id && (
                  <span className="inline-flex items-center gap-1 text-xs text-rose-200/90">
                    <Megaphone size={11} />
                    <span>{t('bombSquad.callerPrefix')}</span>
                    <Link
                      href={`/members/${party.caller_discord_id}`}
                      aria-label={t('bombSquad.callerNameAria', { name: callerName })}
                      className="font-semibold underline underline-offset-2 decoration-dotted decoration-rose-400/50 hover:text-rose-100 hover:decoration-rose-300"
                    >
                      {callerName}
                    </Link>
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
                {canHide && (
                  <button
                    type="button"
                    onClick={() => hidePartyId(party.id)}
                    aria-label={t('hidePartyAria')}
                    title={t('hidePartyAria')}
                    className="inline-flex items-center gap-1 bg-gray-800/70 border border-gray-700 hover:bg-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-xs font-semibold px-2 py-1 rounded transition-colors"
                  >
                    <EyeOff size={11} />
                    <span className="hidden sm:inline">{t('hideParty')}</span>
                  </button>
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
