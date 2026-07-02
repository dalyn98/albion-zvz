'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bomb, Eye, EyeOff, Filter, Grid2X2, Megaphone, Pencil, UsersRound, X } from 'lucide-react'
import { getRoleStyle, type EventCategory, type PartyWithSlots, type SlotRole } from '@/types'
import SlotCard from './SlotCard'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  filterEventGridParties,
  getEventGridMyRoleName,
  getMobileSlotGridClass,
  MOBILE_SLOT_COLUMN_OPTIONS,
  parseMobileSlotColumns,
  summarizeEventRoleAvailability,
  type MobileSlotColumns,
} from '@/lib/event-party-grid'
import { getRoleExperienceCount, type RoleExperienceCounts } from '@/lib/event-role-experience'

interface Props {
  parties: PartyWithSlots[]
  currentDiscordId: string | null
  loginHref: string
  battleStarted: boolean
  isAdmin: boolean
  canManageSlots?: boolean
  eventId: string
  avatars: Record<string, string | null>
  usernames: Record<string, string | null>
  roleExperienceCounts?: RoleExperienceCounts
  cdBadgeRoles: readonly SlotRole[]
  // 관리자 편집 버튼에서 SlotCard → SingleSlotEditModal → SlotEditor 까지
  // 내려가는 컨텍스트. 관리자가 아니면 사용되지 않으므로 SSR 비용은 없음.
  autoRegearEnabled: boolean
  eventCategory?: EventCategory
  timezone: string
  suggestedRoles?: readonly SlotRole[]
  canApplyToSlots?: boolean
  interactionMode?: 'live' | 'demo'
  memberHrefPrefix?: string
}

function hiddenStorageKey(eventId: string, discordId: string) {
  return `app.event.${eventId}.hidden.${discordId}`
}

const MOBILE_SLOT_COLUMNS_STORAGE_KEY = 'app.event.slotGrid.mobileColumns'

export default function EventPartyGrid({
  parties,
  currentDiscordId,
  loginHref,
  battleStarted,
  isAdmin,
  canManageSlots = false,
  eventId,
  avatars,
  usernames,
  roleExperienceCounts = {},
  cdBadgeRoles,
  autoRegearEnabled,
  eventCategory,
  timezone,
  suggestedRoles = [],
  canApplyToSlots = true,
  interactionMode = 'live',
  memberHrefPrefix = '/members',
}: Props) {
  const t = useTranslations('event')
  const tRole = useTranslations('slotRole')
  const [onlyMyRole, setOnlyMyRole] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [suggestedOnly, setSuggestedOnly] = useState(false)
  const [roleFilter, setRoleFilter] = useState<SlotRole | ''>('')
  const [mobileSlotColumns, setMobileSlotColumns] = useState<MobileSlotColumns>(1)
  // Load after mount so SSR output matches first client render — avoids hydration
  // mismatch when localStorage has hidden ids saved from a prior visit.
  const [hiddenPartyIds, setHiddenPartyIds] = useState<string[]>([])
  const [hiddenHydrated, setHiddenHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = parseMobileSlotColumns(
        window.localStorage.getItem(MOBILE_SLOT_COLUMNS_STORAGE_KEY),
      )
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMobileSlotColumns(stored)
      }
    } catch {
      // localStorage may be unavailable — default to the current 1-column layout.
    }
  }, [])

  useEffect(() => {
    if (!currentDiscordId) {
      // 비로그인 → 숨김 ids 비움. mount-only localStorage hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const selectMobileSlotColumns = useCallback((columns: MobileSlotColumns) => {
    setMobileSlotColumns(columns)
    try {
      window.localStorage.setItem(MOBILE_SLOT_COLUMNS_STORAGE_KEY, String(columns))
    } catch {
      // Best-effort display preference only.
    }
  }, [])

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
    return getEventGridMyRoleName(parties, currentDiscordId)
  }, [parties, currentDiscordId])

  const hiddenSet = useMemo(() => new Set(hiddenPartyIds), [hiddenPartyIds])
  // Only show pills for parties that still exist — if a party was deleted we
  // silently drop its id from the hidden list on next mount.
  const hiddenParties = useMemo(
    () => parties.filter((p) => hiddenSet.has(p.id)),
    [parties, hiddenSet],
  )

  const availableRoles = useMemo(() => {
    const seen = new Set<SlotRole>()
    for (const party of parties) {
      for (const slot of party.slots) {
        if (slot.role_name) seen.add(slot.role_name as SlotRole)
      }
    }
    return Array.from(seen)
  }, [parties])
  const roleAvailabilityRows = useMemo(() => summarizeEventRoleAvailability(parties), [parties])
  const roleAvailabilityTotals = useMemo(
    () => roleAvailabilityRows.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        applied: acc.applied + row.applied,
        remaining: acc.remaining + row.remaining,
      }),
      { total: 0, applied: 0, remaining: 0 },
    ),
    [roleAvailabilityRows],
  )
  const overallAppliedRate = roleAvailabilityTotals.total > 0
    ? Math.round((roleAvailabilityTotals.applied / roleAvailabilityTotals.total) * 100)
    : 0

  const visibleParties = useMemo(
    () => (hiddenHydrated ? parties.filter((p) => !hiddenSet.has(p.id)) : parties),
    [parties, hiddenSet, hiddenHydrated],
  )

  const filteredParties = useMemo(() => {
    return filterEventGridParties(visibleParties, {
      currentDiscordId,
      onlyMyRole,
      myRoleName,
      openOnly,
      roleFilter,
      suggestedOnly,
      suggestedRoles,
    })
  }, [
    visibleParties,
    currentDiscordId,
    onlyMyRole,
    myRoleName,
    openOnly,
    roleFilter,
    suggestedOnly,
    suggestedRoles,
  ])

  const hasAnyRoleFilter = !!myRoleName
  const canHide = !!currentDiscordId
  const hasSuggestedRoles = suggestedRoles.length > 0
  const filtersActive = onlyMyRole || openOnly || !!roleFilter || suggestedOnly
  const mobileSlotGridClass = getMobileSlotGridClass(mobileSlotColumns)

  return (
    <div className="space-y-6 sm:space-y-8">
      {(parties.length > 0 || hasAnyRoleFilter || (canHide && hiddenParties.length > 0)) && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2">
          <div className="flex w-full items-center justify-between gap-2 sm:hidden">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Grid2X2 size={12} className="text-gray-500" />
              <span className="truncate">{t('mobileCardColumnsLabel')}</span>
            </span>
            <div
              role="group"
              aria-label={t('mobileCardColumnsLabel')}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-gray-950/70 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
            >
              {MOBILE_SLOT_COLUMN_OPTIONS.map((columns) => {
                const active = mobileSlotColumns === columns
                return (
                  <button
                    key={columns}
                    type="button"
                    aria-pressed={active}
                    aria-label={t('mobileCardColumnsAria', { count: columns })}
                    onClick={() => selectMobileSlotColumns(columns)}
                    className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums transition-[background-color,color,transform] active:scale-[0.96] ${
                      active
                        ? 'bg-amber-500 text-black'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {t('mobileCardColumnsOption', { count: columns })}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenOnly((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              openOnly
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/25'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-emerald-500/50 hover:text-emerald-200'
            }`}
          >
            {openOnly ? <X size={12} /> : <Filter size={12} />}
            {openOnly
              ? t('filterOpenActive')
              : t('filterOpen', { count: roleAvailabilityTotals.remaining })}
          </button>
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
                ? t('filterMyRoleActive', { role: translateSlotRole(myRoleName!, tRole) })
                : t('filterMyRole', { role: translateSlotRole(myRoleName!, tRole) })}
            </button>
          )}
          {hasSuggestedRoles && (
            <button
              type="button"
              onClick={() => setSuggestedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                suggestedOnly
                  ? 'bg-sky-500/15 border-sky-500/50 text-sky-200 hover:bg-sky-500/25'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-sky-500/50 hover:text-sky-200'
              }`}
            >
              {suggestedOnly ? <X size={12} /> : <Filter size={12} />}
              {suggestedOnly ? t('filterSuggestedActive') : t('filterSuggested')}
            </button>
          )}
          {availableRoles.length > 0 && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as SlotRole | '')}
              aria-label={t('filterRoleLabel')}
              className="min-h-8 rounded-full border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">{t('filterRoleAll')}</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {translateSlotRole(role, tRole)}
                </option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setOnlyMyRole(false)
                setOpenOnly(false)
                setSuggestedOnly(false)
                setRoleFilter('')
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white px-2 py-1"
            >
              <X size={12} />
              {t('filterClearAll')}
            </button>
          )}
        </div>
      )}

      {roleAvailabilityRows.length > 0 && (
        <section
          aria-labelledby="event-role-availability-title"
          className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)] sm:p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
                  <UsersRound size={16} />
                </span>
                <div>
                  <h2 id="event-role-availability-title" className="text-sm font-bold text-white">
                    {t('roleAvailabilityTitle')}
                  </h2>
                  <p className="text-xs leading-relaxed text-gray-400">
                    {t('roleAvailabilitySubtitle', {
                      applied: roleAvailabilityTotals.applied,
                      total: roleAvailabilityTotals.total,
                      remaining: roleAvailabilityTotals.remaining,
                      rate: overallAppliedRate,
                    })}
                  </p>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-gray-950/70 px-2.5 py-1 text-xs font-semibold text-gray-300 tabular-nums">
              {t('roleAvailabilityRate', { rate: overallAppliedRate })}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {roleAvailabilityRows.map((row) => {
              const roleStyle = getRoleStyle(row.roleName)
              const roleLabel = row.roleName
                ? translateSlotRole(row.roleName, tRole)
                : t('roleAvailabilityNoRole')
              const isRoleFiltered = !!row.roleName && roleFilter === row.roleName
              const roleCardClassName = `rounded-lg px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition-[background-color,box-shadow,transform] active:scale-[0.99] ${
                isRoleFiltered
                  ? 'bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.45)]'
                  : 'bg-gray-950/45'
              }`
              const content = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
                        roleStyle ? roleStyle.badge : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          roleStyle ? roleStyle.dot : 'bg-gray-500'
                        }`}
                      />
                      <span className="truncate">{roleLabel}</span>
                    </span>
                    <span className="flex-shrink-0 text-xs font-semibold text-gray-300 tabular-nums">
                      {t('roleAvailabilityRemaining', {
                        remaining: row.remaining,
                        total: row.total,
                      })}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-[width] duration-200 ease-out"
                      style={{ width: `${row.appliedRate}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-gray-500 tabular-nums">
                    <span>
                      {t('roleAvailabilityApplied', {
                        applied: row.applied,
                        total: row.total,
                      })}
                    </span>
                    <span>{t('roleAvailabilityRate', { rate: row.appliedRate })}</span>
                  </div>
                </>
              )
              if (!row.roleName) {
                return (
                  <article key="unassigned-role" className={roleCardClassName}>
                    {content}
                  </article>
                )
              }
              return (
                <button
                  key={row.roleName}
                  type="button"
                  aria-pressed={isRoleFiltered}
                  onClick={() => {
                    setRoleFilter((prev) => prev === row.roleName ? '' : row.roleName as SlotRole)
                  }}
                  className={`${roleCardClassName} hover:bg-gray-950/70 hover:shadow-[inset_0_0_0_1px_rgba(245,158,11,0.28)]`}
                >
                  {content}
                </button>
              )
            })}
          </div>
        </section>
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

      {filtersActive && filteredParties.length === 0 && parties.length > 0 && (
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
                      href={`${memberHrefPrefix}/${party.caller_discord_id}`}
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
              <div className={`grid ${mobileSlotGridClass} sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3`}>
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
                    canManageSlots={canManageSlots}
                    canApplyToSlots={canApplyToSlots}
                    assignedAvatar={
                      slot.assigned_discord_id ? avatars[slot.assigned_discord_id] ?? null : null
                    }
                    requestedAvatar={
                      slot.requested_discord_id ? avatars[slot.requested_discord_id] ?? null : null
                    }
                    assignedRoleExperienceCount={getRoleExperienceCount(
                      roleExperienceCounts,
                      slot.assigned_discord_id,
                      slot.role_name,
                    )}
                    requestedRoleExperienceCount={getRoleExperienceCount(
                      roleExperienceCounts,
                      slot.requested_discord_id,
                      slot.role_name,
                    )}
                    cdBadgeRoles={cdBadgeRoles}
                    autoRegearEnabled={autoRegearEnabled}
                    eventCategory={eventCategory}
                    timezone={timezone}
                    interactionMode={interactionMode}
                    memberHrefPrefix={memberHrefPrefix}
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
