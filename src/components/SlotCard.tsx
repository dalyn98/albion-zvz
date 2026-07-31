'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useLocale, useTranslations } from 'next-intl'
import { assignSlot, cancelSlot, adminCancelSlot, type SlotPicks } from '@/app/actions/member'
import { approveSlotRequest, rejectSlotRequest } from '@/app/actions/bomb-squad'
import type { EventCategory, Slot, SlotKey, SlotRole } from '@/types'
import {
  SLOT_KEYS,
  getDisplayGear,
  getPrimaryGearKind,
  getRoleStyle,
  hasGearOptions,
  isFreeItem,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useItemNameResolver } from '@/lib/item-names-client'
import { isRoleExperienceHighlighted } from '@/lib/event-role-experience'
import type { Locale } from '@/i18n/locales'
import GearPreview from './GearPreview'
import SlotSpellPanel, { SlotCooldownBadge } from './SlotSpellPanel'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { useConfirm } from '@/components/ConfirmDialog'
import { UserPlus, UserX, MessageSquare, LogIn, Lock, Swords, Check, X, Hourglass, Bomb, Pencil } from 'lucide-react'

const GearChoiceModal = dynamic(() =>
  import('./SlotCardPickerModals').then((module) => module.GearChoiceModal),
)
const SlotApplyConfirmModal = dynamic(() =>
  import('./SlotCardPickerModals').then((module) => module.SlotApplyConfirmModal),
)
const SoloBombGearModal = dynamic(() =>
  import('./SlotCardPickerModals').then((module) => module.SoloBombGearModal),
)
const MemberAssignModal = dynamic(() => import('./MemberAssignModal'))
const SingleSlotEditModal = dynamic(() => import('./SingleSlotEditModal'))

function preloadSlotPickerModals(): void {
  void import('./SlotCardPickerModals')
}

function preloadMemberAssignModal(): void {
  void import('./MemberAssignModal')
}

function preloadSingleSlotEditModal(): void {
  void import('./SingleSlotEditModal')
}

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
  rosterLocked?: boolean
  isAdmin: boolean
  canManageSlots?: boolean
  canApplyToSlots?: boolean
  assignedAvatar?: string | null
  requestedAvatar?: string | null
  assignedRoleExperienceCount?: number | null
  requestedRoleExperienceCount?: number | null
  cdBadgeRoles: readonly SlotRole[]
  // 관리자 전용 단일 슬롯 편집 버튼용 — SlotEditor 가 "자동 리기어 제외" 체크박스
  // 노출 여부 / 템플릿 저장 다이얼로그의 카테고리 기본값을 판단한다.
  autoRegearEnabled: boolean
  eventCategory?: EventCategory
  eventNotice?: string | null
  timezone: string
  interactionMode?: 'live' | 'demo'
  memberHrefPrefix?: string
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

function RoleExperienceHint({ count }: { count: number | null | undefined }) {
  const t = useTranslations('slot')
  if (count == null) return null

  const highlighted = isRoleExperienceHighlighted(count)
  return (
    <div
      title={t('roleExperienceTitle', { count })}
      aria-label={t('roleExperienceTitle', { count })}
      className={`flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium leading-tight ${
        highlighted
          ? 'text-emerald-300'
          : 'text-gray-500'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
          highlighted ? 'bg-emerald-300' : 'bg-gray-600'
        }`}
      />
      <span className="min-w-0 truncate tabular-nums">
        {count > 0 ? t('roleExperienceLine', { count }) : t('roleExperienceFirstLine')}
      </span>
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
  rosterLocked = false,
  isAdmin,
  canManageSlots = false,
  canApplyToSlots = true,
  assignedAvatar = null,
  requestedAvatar = null,
  assignedRoleExperienceCount = null,
  requestedRoleExperienceCount = null,
  cdBadgeRoles,
  autoRegearEnabled,
  eventCategory,
  eventNotice = null,
  timezone,
  interactionMode = 'live',
  memberHrefPrefix = '/members',
}: Props) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmPicks, setConfirmPicks] = useState<SlotPicks | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations('slot')
  const tDemoFeedback = useTranslations('demo.feedback')
  const tGear = useTranslations('gear')
  const tRole = useTranslations('slotRole')
  const locale = useLocale() as Locale
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const askConfirm = useConfirm()
  const isDemo = interactionMode === 'demo'

  const acknowledgeDemoAction = () => {
    setError(tDemoFeedback('actionAcknowledged'))
  }

  const isTaken = slot.assigned_discord_id !== null
  const isMine = isTaken && slot.assigned_discord_id === currentDiscordId
  const isLoggedIn = currentDiscordId !== null
  const roleStyle = getRoleStyle(slot.role_name)
  const isSoloBomb = !!slot.is_solo_bomb
  // Bomb squad pending request state. Only relevant when the slot is empty
  // (requested_* is cleared once approve_slot_request moves data to assigned_*).
  const hasPendingRequest = !isTaken && slot.requested_discord_id !== null
  const isMyPending = hasPendingRequest && slot.requested_discord_id === currentDiscordId
  const isCallerOrAdmin =
    isLoggedIn &&
    (isAdmin || (!!bombSquadCallerId && bombSquadCallerId === currentDiscordId))
  const canManageThisSlot =
    !battleStarted &&
    (canManageSlots || (isBombSquadParty && isCallerOrAdmin && !isSoloBomb))
  const canReviewPending =
    !battleStarted &&
    hasPendingRequest &&
    (canManageSlots || (isCallerOrAdmin && !isSoloBomb))
  // 빈 슬롯에 한해 관리자/이벤트 생성자/밤스쿼드 콜러가 "멤버 지정" 모달을
  // 열 수 있게 한다.
  // 신청(requested_*) 이 걸려 있으면 먼저 승인/거절을 처리해야 한다.
  const canDirectAssign =
    !isTaken &&
    !hasPendingRequest &&
    !isSoloBomb &&
    canManageThisSlot

  // Slot kinds that need a choice at signup time: the admin marked them multi
  // and the member hasn't been assigned yet.
  const multiOptionKinds = useMemo<SlotKey[]>(
    () => SLOT_KEYS.filter((k) => hasGearOptions(slot, k)),
    [slot],
  )
  // 솔로밤 슬롯은 항상 멤버가 자기 빌드를 직접 입력 → 옵션이 비어 있어도
  // free-form 모달을 열어야 한다.
  const needsPicks = multiOptionKinds.length > 0 || isSoloBomb
  // BM role's defining item is the battle mount, not the weapon — swap the
  // hero preview + name line accordingly so the card reads naturally.
  const primaryKind = getPrimaryGearKind(slot.role_name)
  const primaryDisplay = getDisplayGear(slot, primaryKind)

  const doAssign = (picks: SlotPicks) => {
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    setError('')
    startTransition(async () => {
      const result = await assignSlot(slot.id, picks)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const openSignupConfirm = (picks: SlotPicks = {}) => {
    setError('')
    setConfirmPicks(picks)
  }

  const confirmSignup = () => {
    const picks = confirmPicks ?? {}
    setConfirmPicks(null)
    doAssign(picks)
  }

  const handleAssign = async () => {
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    preloadSlotPickerModals()
    if (battleStarted) {
      setError(t('battleStartedLocked'))
      return
    }
    if (needsPicks) {
      setError('')
      setPickerOpen(true)
      return
    }
    openSignupConfirm({})
  }

  const handleCancel = () => {
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    setError('')
    startTransition(async () => {
      const result = await cancelSlot(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleAdminKick = async () => {
    if (!slot.assigned_username) return
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    // 전투 시작 후 킥은 참여 기록(통계/리기어 자격) 에 영향을 줄 수 있어 별도 경고.
    const confirmKey = battleStarted ? 'confirmAdminKickAfterStart' : 'confirmAdminKick'
    const ok = await askConfirm({
      body: t(confirmKey, { name: slot.assigned_username }),
      destructive: true,
    })
    if (!ok) return
    setError('')
    startTransition(async () => {
      const result = await adminCancelSlot(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleApproveRequest = async () => {
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    if (battleStarted && slot.requested_username) {
      const ok = await askConfirm({
        body: t('bombSquad.confirmApproveAfterStart', { name: slot.requested_username }),
        destructive: false,
      })
      if (!ok) return
    }
    setError('')
    startTransition(async () => {
      const result = await approveSlotRequest(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleRejectRequest = async () => {
    if (!slot.requested_username) return
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    const confirmKey = battleStarted
      ? 'bombSquad.confirmRejectAfterStart'
      : 'bombSquad.confirmReject'
    const ok = await askConfirm({
      body: t(confirmKey, { name: slot.requested_username }),
      destructive: true,
    })
    if (!ok) return
    setError('')
    startTransition(async () => {
      const result = await rejectSlotRequest(slot.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleOpenAssignModal = async () => {
    if (isDemo) {
      acknowledgeDemoAction()
      return
    }
    preloadMemberAssignModal()
    if (battleStarted) {
      const ok = await askConfirm({ body: t('confirmDirectAssignAfterStart'), destructive: false })
      if (!ok) return
    }
    setAssignModalOpen(true)
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
  const roleExperienceCount = isTaken
    ? assignedRoleExperienceCount
    : hasPendingRequest
      ? requestedRoleExperienceCount
      : null

  return (
    <div className={`min-w-0 rounded-xl p-2.5 space-y-2 border transition-colors ${cardStateClasses}`}>
      <div className="space-y-1">
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
                {translateSlotRole(slot.role_name, tRole)}
              </span>
            )}
            {isSoloBomb && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/40">
                {t('soloBomb.badge')}
              </span>
            )}
            {canManageSlots && !battleStarted && (
              <button
                type="button"
                onClick={() => {
                  preloadSingleSlotEditModal()
                  setEditOpen(true)
                }}
                onMouseEnter={preloadSingleSlotEditModal}
                onFocus={preloadSingleSlotEditModal}
                aria-label={t('editBuild')}
                title={t('editBuild')}
                className="p-0.5 text-gray-500 hover:text-amber-400 transition-colors"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          {isTaken ? (
            <div className={`flex items-center gap-1 text-[12px] flex-shrink-0 min-w-0 max-w-[116px] ${
              isMine ? 'text-amber-300' : 'text-green-400'
            }`}>
              <MemberAvatar discordId={slot.assigned_discord_id} avatar={assignedAvatar} size={14} />
              <MemberLink
                discordId={slot.assigned_discord_id}
                username={slot.assigned_username ?? ''}
                hrefPrefix={memberHrefPrefix}
                className="font-semibold truncate max-w-[96px]"
              />
            </div>
          ) : hasPendingRequest && (
            <div className={`flex items-center gap-1 text-[12px] flex-shrink-0 min-w-0 max-w-[116px] ${
              isMyPending ? 'text-rose-300' : 'text-rose-200/80'
            }`}>
              <Hourglass size={11} />
              <MemberAvatar discordId={slot.requested_discord_id} avatar={requestedAvatar} size={14} />
              <MemberLink
                discordId={slot.requested_discord_id}
                username={slot.requested_username ?? ''}
                hrefPrefix={memberHrefPrefix}
                className="font-semibold truncate max-w-[78px]"
              />
            </div>
          )}
        </div>
        <RoleExperienceHint count={roleExperienceCount} />
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
      {canDirectAssign && (
        <button
          type="button"
          onClick={handleOpenAssignModal}
          onMouseEnter={preloadMemberAssignModal}
          onFocus={preloadMemberAssignModal}
          title={battleStarted ? t('directAssignAfterStartTooltip') : undefined}
          className={`w-full flex items-center justify-center gap-1 py-1 rounded-md text-[12px] font-semibold bg-gray-800/80 transition-colors ${
            isBombSquadParty
              ? 'hover:bg-rose-500/15 text-rose-200 border border-rose-500/40'
              : 'hover:bg-amber-500/15 text-amber-300 border border-amber-500/40'
          }`}
        >
          <UserPlus size={11} />
          {t('directAssignButton')}
        </button>
      )}
      {error && <p className="text-red-400 text-[12px] leading-tight">{error}</p>}

      {pickerOpen && (
        isSoloBomb ? (
          <SoloBombGearModal
            onCancel={() => setPickerOpen(false)}
            onConfirm={(picks) => {
              setPickerOpen(false)
              openSignupConfirm(picks)
            }}
          />
        ) : (
          <GearChoiceModal
            slot={slot}
            kinds={multiOptionKinds}
            onCancel={() => setPickerOpen(false)}
            onConfirm={(picks) => {
              setPickerOpen(false)
              openSignupConfirm(picks)
            }}
          />
        )
      )}

      {confirmPicks && (
        <SlotApplyConfirmModal
          slot={slot}
          slotLabel={slotLabel}
          picks={confirmPicks}
          tone={isBombSquadParty ? 'rose' : 'amber'}
          eventNotice={eventNotice}
          pending={pending}
          onCancel={() => {
            if (!pending) setConfirmPicks(null)
          }}
          onConfirm={confirmSignup}
        />
      )}

      {assignModalOpen && (
        <MemberAssignModal
          eventId={eventId}
          slotId={slot.id}
          slotLabel={slotLabel}
          tone={isBombSquadParty ? 'rose' : 'amber'}
          onClose={() => setAssignModalOpen(false)}
        />
      )}

      {editOpen && canManageSlots && !battleStarted && (
        <SingleSlotEditModal
          slot={slot}
          partyNumber={partyNumber}
          autoRegearEnabled={autoRegearEnabled}
          eventCategory={eventCategory}
          timezone={timezone}
          onClose={() => setEditOpen(false)}
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
    if (rosterLocked) {
      return (
        <button
          disabled
          title={t('rosterLockedTooltip')}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-medium bg-gray-800/60 text-gray-400 border border-gray-700 cursor-not-allowed"
        >
          <Lock size={11} />
          {t('rosterLocked')}
        </button>
      )
    }
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
    if (isMine) {
      return (
        <button
          onClick={handleCancel}
          disabled={pending}
          title={battleStarted ? t('cancelAfterStartTooltip') : undefined}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
        >
          <UserX size={11} />
          {pending ? t('cancelling') : t('cancelApplication')}
        </button>
      )
    }
    if (isTaken) {
      if (canManageThisSlot) {
        return (
          <button
            onClick={handleAdminKick}
            disabled={pending}
            className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
            title={battleStarted ? t('adminKickAfterStartTooltip') : undefined}
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
          title={battleStarted ? t('cancelAfterStartTooltip') : undefined}
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
    if (!canApplyToSlots) {
      return (
        <button
          disabled
          className="w-full py-1 rounded-md text-[13px] font-medium bg-gray-800/50 text-gray-500 border border-gray-800 cursor-not-allowed"
        >
          {t('cannotApply')}
        </button>
      )
    }
    return (
      <button
        onClick={handleAssign}
        onMouseEnter={preloadSlotPickerModals}
        onFocus={preloadSlotPickerModals}
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
