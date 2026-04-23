'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { assignSlot, cancelSlot, adminCancelSlot, type SlotPicks } from '@/app/actions/member'
import { approveSlotRequest, rejectSlotRequest } from '@/app/actions/bomb-squad'
import type { Slot, SlotKey, SlotRole } from '@/types'
import {
  SLOT_KEYS,
  getDisplayGear,
  getGearOptions,
  getPrimaryGearKind,
  getRoleStyle,
  hasGearOptions,
  isFreeItem,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import GearPreview from './GearPreview'
import ItemImage from './ItemImage'
import SlotSpellPanel, { SlotCooldownBadge } from './SlotSpellPanel'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import MemberAssignModal from './MemberAssignModal'
import { UserPlus, UserX, MessageSquare, LogIn, Lock, X, Swords, Check, Hourglass, Bomb } from 'lucide-react'

interface Props {
  slot: Slot
  partyNumber: number
  eventId: string
  // Migration 041: party-level context needed to render bomb squad state and
  // decide who can approve/reject pending requests. partyName is shown only on
  // bomb squad parties (regular parties keep the "N파티" label).
  partyName?: string | null
  isBombSquadParty?: boolean
  bombSquadCallerId?: string | null
  currentDiscordId: string | null
  loginHref: string
  battleStarted: boolean
  isAdmin: boolean
  assignedAvatar?: string | null
  requestedAvatar?: string | null
  cdBadgeRoles: readonly SlotRole[]
}

function NoteTooltip({ notes }: { notes: string }) {
  const t = useTranslations('slot')
  return (
    <div className="group/note relative inline-block">
      <span
        tabIndex={0}
        role="button"
        aria-label={t('memoLabel', { notes })}
        className="inline-flex items-center gap-0.5 text-[12px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/90 border border-amber-500/30 hover:bg-amber-500/20 cursor-help focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      >
        <MessageSquare size={10} />
        {t('memo')}
      </span>
      <div
        role="tooltip"
        className="hidden group-hover/note:block group-focus-within/note:block absolute z-30 top-full left-0 mt-1 w-56 max-w-[80vw] bg-gray-950 border border-gray-700 rounded-lg p-2 shadow-xl pointer-events-none"
      >
        <p className="text-gray-100 text-[13px] whitespace-pre-wrap leading-snug text-left break-words">
          {notes}
        </p>
      </div>
    </div>
  )
}

export default function SlotCard({
  slot,
  partyNumber,
  eventId,
  partyName = null,
  isBombSquadParty = false,
  bombSquadCallerId = null,
  currentDiscordId,
  loginHref,
  battleStarted,
  isAdmin,
  assignedAvatar = null,
  requestedAvatar = null,
  cdBadgeRoles,
}: Props) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations('slot')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale

  const isTaken = slot.assigned_discord_id !== null
  const isMine = isTaken && slot.assigned_discord_id === currentDiscordId
  const isLoggedIn = currentDiscordId !== null
  const roleStyle = getRoleStyle(slot.role_name)
  // Bomb squad pending request state. Only relevant when the slot is empty
  // (requested_* is cleared once approve_slot_request moves data to assigned_*).
  const hasPendingRequest = !isTaken && slot.requested_discord_id !== null
  const isMyPending = hasPendingRequest && slot.requested_discord_id === currentDiscordId
  const isCallerOrAdmin =
    isLoggedIn &&
    (isAdmin || (!!bombSquadCallerId && bombSquadCallerId === currentDiscordId))
  const canReviewPending = hasPendingRequest && !battleStarted && isCallerOrAdmin
  // 빈 슬롯에 한해 콜러/관리자가 "멤버 지정" 모달을 열 수 있게 한다.
  // 신청(requested_*) 이 걸려 있으면 먼저 승인/거절을 처리해야 한다.
  const canCallerAssign =
    !isTaken && !hasPendingRequest && isBombSquadParty && !battleStarted && isCallerOrAdmin

  // Slot kinds that need a choice at signup time: the admin marked them multi
  // and the member hasn't been assigned yet.
  const multiOptionKinds = useMemo<SlotKey[]>(
    () => SLOT_KEYS.filter((k) => hasGearOptions(slot, k)),
    [slot],
  )
  const needsPicks = multiOptionKinds.length > 0
  // BM role's defining item is the battle mount, not the weapon — swap the
  // hero preview + name line accordingly so the card reads naturally.
  const primaryKind = getPrimaryGearKind(slot.role_name)
  const primaryDisplay = getDisplayGear(slot, primaryKind)

  const doAssign = (picks: SlotPicks) => {
    setError('')
    startTransition(async () => {
      const result = await assignSlot(slot.id, picks)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleAssign = () => {
    if (battleStarted) {
      const ok = confirm(t('confirmBattleStarted'))
      if (!ok) return
    }
    if (needsPicks) {
      setError('')
      setPickerOpen(true)
      return
    }
    doAssign({})
  }

  const handleCancel = () => {
    setError('')
    startTransition(async () => {
      const result = await cancelSlot(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleAdminKick = () => {
    if (!slot.assigned_username) return
    if (!confirm(t('confirmAdminKick', { name: slot.assigned_username }))) return
    setError('')
    startTransition(async () => {
      const result = await adminCancelSlot(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleApproveRequest = () => {
    setError('')
    startTransition(async () => {
      const result = await approveSlotRequest(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleRejectRequest = () => {
    if (!slot.requested_username) return
    if (!confirm(t('bombSquad.confirmReject', { name: slot.requested_username }))) return
    setError('')
    startTransition(async () => {
      const result = await rejectSlotRequest(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const otherKeys = SLOT_KEYS.filter((k) => k !== primaryKind)

  // Pending-request highlight uses rose (bomb squad color) so the state is
  // distinguishable from the amber "mine" border and neutral "taken" border.
  const cardStateClasses = isMine
    ? 'bg-amber-500/5 border-amber-500/40'
    : isMyPending
      ? 'bg-rose-500/5 border-rose-500/40'
      : hasPendingRequest
        ? 'bg-gray-900/60 border-rose-500/20'
        : isTaken
          ? 'bg-gray-900/60 border-gray-700'
          : 'bg-gray-900 border-gray-600 hover:border-gray-500'

  const slotLabel = isBombSquadParty && partyName
    ? t('partyLabelCustom', { name: partyName, slot: slot.slot_number })
    : t('partyLabel', { party: partyNumber, slot: slot.slot_number })

  return (
    <div className={`rounded-xl p-2.5 space-y-2 border transition-colors ${cardStateClasses}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-gray-500 text-[12px] inline-flex items-center gap-1">
            {isBombSquadParty && <Bomb size={10} className="text-rose-400" />}
            {slotLabel}
          </span>
          {slot.role_name && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}>
              {slot.role_name}
            </span>
          )}
        </div>
        {isTaken ? (
          <div className={`flex items-center gap-1 text-[12px] flex-shrink-0 ${
            isMine ? 'text-amber-300' : 'text-green-400'
          }`}>
            <MemberAvatar discordId={slot.assigned_discord_id} avatar={assignedAvatar} size={14} />
            <MemberLink
              discordId={slot.assigned_discord_id}
              username={slot.assigned_username ?? ''}
              className="font-semibold truncate max-w-[80px]"
            />
          </div>
        ) : hasPendingRequest && (
          <div className={`flex items-center gap-1 text-[12px] flex-shrink-0 ${
            isMyPending ? 'text-rose-300' : 'text-rose-200/80'
          }`}>
            <Hourglass size={11} />
            <MemberAvatar discordId={slot.requested_discord_id} avatar={requestedAvatar} size={14} />
            <MemberLink
              discordId={slot.requested_discord_id}
              username={slot.requested_username ?? ''}
              className="font-semibold truncate max-w-[80px]"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <div className="col-span-2 row-span-2 flex items-center justify-center">
          <GearPreview slot={slot} kind={primaryKind} size={55} isTaken={isTaken} />
        </div>
        {otherKeys.map((key) => (
          <div key={key} className="flex items-center justify-center">
            <GearPreview slot={slot} kind={key} size={31} isTaken={isTaken} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <SlotSpellPanel slot={slot} cdBadgeRoles={cdBadgeRoles} />
        <SlotCooldownBadge slot={slot} cdBadgeRoles={cdBadgeRoles} />
      </div>

      {!isTaken && needsPicks ? (
        <p className="text-amber-300 text-[12px] font-medium truncate leading-tight">
          {t('multiRequired', { labels: multiOptionKinds.map((k) => tGear(k)).join('/') })}
        </p>
      ) : (
        primaryDisplay.name && !isFreeItem(primaryDisplay.name, primaryDisplay.id) && (
          <p className="text-white text-[12px] font-medium truncate leading-tight">
            {stripTierPrefix(getLocalizedItemName(primaryDisplay.id, locale, primaryDisplay.name) ?? primaryDisplay.name)}
          </p>
        )
      )}

      {slot.notes && <NoteTooltip notes={slot.notes} />}

      {renderAction()}
      {canCallerAssign && (
        <button
          type="button"
          onClick={() => setAssignModalOpen(true)}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[12px] font-semibold bg-gray-800/80 hover:bg-rose-500/15 text-rose-200 border border-rose-500/40 transition-colors"
        >
          <UserPlus size={11} />
          {t('bombSquad.callerAssignButton')}
        </button>
      )}
      {error && <p className="text-red-400 text-[12px] leading-tight">{error}</p>}

      {pickerOpen && (
        <GearChoiceModal
          slot={slot}
          kinds={multiOptionKinds}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(picks) => {
            setPickerOpen(false)
            doAssign(picks)
          }}
        />
      )}

      {assignModalOpen && (
        <MemberAssignModal
          eventId={eventId}
          slotId={slot.id}
          slotLabel={slotLabel}
          onClose={() => setAssignModalOpen(false)}
        />
      )}
    </div>
  )

  function renderAction() {
    if (!isLoggedIn) {
      return (
        <a
          href={loginHref}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
        >
          <LogIn size={11} />
          {t('loginToApply')}
        </a>
      )
    }
    if (isMine) {
      if (battleStarted) {
        return (
          <button
            disabled
            title={t('battleStartedTooltip')}
            className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-medium bg-gray-800/60 text-gray-400 border border-gray-700 cursor-not-allowed"
          >
            <Lock size={11} />
            {t('battleStartedLocked')}
          </button>
        )
      }
      return (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
        >
          <UserX size={11} />
          {pending ? t('cancelling') : t('cancelApplication')}
        </button>
      )
    }
    if (isTaken) {
      if (isAdmin && !battleStarted) {
        return (
          <button
            onClick={handleAdminKick}
            disabled={pending}
            className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
          >
            <UserX size={11} />
            {pending ? t('kicking') : t('adminKick')}
          </button>
        )
      }
      return (
        <button
          disabled
          className="w-full py-1 rounded-md text-[13px] font-medium bg-gray-800/50 text-gray-500 border border-gray-800 cursor-not-allowed"
        >
          {t('cannotApply')}
        </button>
      )
    }
    if (isMyPending) {
      // The requestor withdraws their own pending signup. RPC routes to the
      // pending branch automatically, so we reuse cancelSlot.
      return (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 border border-rose-500/30 transition-colors disabled:opacity-50"
        >
          <UserX size={11} />
          {pending ? t('cancelling') : t('bombSquad.withdrawRequest')}
        </button>
      )
    }
    if (hasPendingRequest) {
      if (canReviewPending) {
        return (
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={handleApproveRequest}
              disabled={pending}
              className="flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 transition-colors disabled:opacity-50"
            >
              <Check size={11} />
              {pending ? t('bombSquad.reviewing') : t('bombSquad.approve')}
            </button>
            <button
              onClick={handleRejectRequest}
              disabled={pending}
              className="flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
            >
              <X size={11} />
              {t('bombSquad.reject')}
            </button>
          </div>
        )
      }
      return (
        <button
          disabled
          title={t('bombSquad.pendingTooltip')}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-medium bg-gray-800/50 text-gray-400 border border-gray-800 cursor-not-allowed"
        >
          <Hourglass size={11} />
          {t('bombSquad.pendingOther')}
        </button>
      )
    }
    return (
      <button
        onClick={handleAssign}
        disabled={pending}
        className={`w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-50 ${
          isBombSquadParty
            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/40'
            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
        }`}
      >
        {isBombSquadParty ? <Bomb size={11} /> : needsPicks ? <Swords size={11} /> : <UserPlus size={11} />}
        {pending
          ? t('applying')
          : isBombSquadParty
            ? t('bombSquad.requestApply')
            : needsPicks
              ? t('pickThenApply')
              : t('apply')}
      </button>
    )
  }
}

function GearChoiceModal({
  slot,
  kinds,
  onCancel,
  onConfirm,
}: {
  slot: Slot
  kinds: SlotKey[]
  onCancel: () => void
  onConfirm: (picks: SlotPicks) => void
}) {
  const [picks, setPicks] = useState<Record<string, string>>({})
  const t = useTranslations('slot.picker')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const allSelected = kinds.every((k) => picks[k])

  const buildPicksPayload = (): SlotPicks => {
    const payload: SlotPicks = {}
    for (const k of kinds) {
      const chosenId = picks[k]
      if (!chosenId) continue
      const opt = getGearOptions(slot, k)?.find((o) => o.id === chosenId)
      if (opt) payload[k] = { name: opt.name, id: opt.id }
    }
    return payload
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-white text-base">{t('title')}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-white"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {kinds.map((kind) => {
            const options = getGearOptions(slot, kind) ?? []
            const selectedId = picks[kind]
            return (
              <section key={kind} className="space-y-1.5">
                <h4 className="text-amber-400 text-sm font-semibold">
                  {tGear(kind)}
                </h4>
                <div className="space-y-1">
                  {options.map((opt) => {
                    const isSel = opt.id === selectedId
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPicks((prev) => ({ ...prev, [kind]: opt.id }))}
                        className={`w-full flex items-center gap-2 rounded-lg p-2 border transition-colors text-left ${
                          isSel
                            ? 'bg-amber-500/10 border-amber-500/50'
                            : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <ItemImage itemId={opt.id} itemName={stripTierPrefix(opt.name)} size={35} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {stripTierPrefix(getLocalizedItemName(opt.id, locale, opt.name) ?? opt.name)}
                          </p>
                          <p className="text-gray-500 text-[12px] font-mono truncate">{opt.id}</p>
                        </div>
                        {isSel && (
                          <span className="text-amber-400 text-[12px] font-bold flex-shrink-0">{t('selected')}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-2"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!allSelected) return
              onConfirm(buildPicksPayload())
            }}
            disabled={!allSelected}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
          >
            {t('submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
