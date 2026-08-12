'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { BellOff, BellRing, ClipboardList, Plus, Pencil, X, Check, LogIn, Loader2, Search, Sparkles, UserPlus } from 'lucide-react'
import {
  submitMyTentativeSignup,
  removeTentativeSignup,
  adminUpsertTentativeSignup,
  setTentativeSlotRecommendation,
  type TentativeSignupRow,
} from '@/app/actions/event-tentative'
import type { TentativeSlotRecommendationOption } from '@/lib/event-tentative-signups'
import { formatTentativeSlotRecommendationLabel } from '@/lib/event-tentative-recommendation'
import { SLOT_ROLES, type SlotRole, getRoleStyle } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useItemNameResolver, type ItemNameResolver } from '@/lib/item-names-client'
import { stripTierPrefix } from '@/lib/weapon-display'
import type { Locale } from '@/i18n/locales'
import { filterAssignableMembers, type AssignableMember } from '@/lib/member-assign-search'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from './ToastProvider'
import TentativeSlotRecommendationPicker from './TentativeSlotRecommendationPicker'

interface DirectoryMember {
  discord_id: string
  username: string
  albion_nickname?: string | null
  avatar?: string | null
}

interface Props {
  eventId: string
  rows: TentativeSignupRow[]
  slotOptions: TentativeSlotRecommendationOption[]
  avatars: Record<string, string | null>
  currentDiscordId: string | null
  isGuest?: boolean
  canSelfSignup?: boolean
  isAdmin: boolean
  // 이벤트 작성자(직접 만든 멤버) 도 어드민과 동일한 관리 권한 — 참가예정 행을
  // 누구든 제거하거나 본인 외 멤버를 대신 등록 가능.
  isEventOwner: boolean
  loginHref: string
  recruitmentClosed: boolean
  recommendationClosed: boolean
  // 관리자 전용 노출 시 다른 멤버를 대신 등록할 수 있도록 후보 디렉터리 제공.
  // 멤버 페이지에서는 비워서(빈 배열) 어드민 추가 폼이 안 뜨게 한다.
  memberDirectory?: DirectoryMember[]
  interactionMode?: 'live' | 'demo'
  // 본인 행에만 전달한다. 관리자 화면에는 전달하지 않아 다른 멤버의 개인
  // 알림 설정이 노출되지 않도록 한다.
  currentViewerDmEnabled?: boolean | null
  currentViewerDmLabels?: {
    title: string
    enabled: string
    enable: string
    settings: string
  } | null
}

export default function TentativeSignupSection({
  eventId,
  rows,
  slotOptions,
  avatars,
  currentDiscordId,
  isGuest = false,
  canSelfSignup = true,
  isAdmin,
  isEventOwner,
  loginHref,
  recruitmentClosed,
  recommendationClosed,
  memberDirectory = [],
  interactionMode = 'live',
  currentViewerDmEnabled = null,
  currentViewerDmLabels = null,
}: Props) {
  const t = useTranslations('eventTentative')
  const tRole = useTranslations('slotRole')
  const tAction = useTranslations('eventTentativeAction')
  const tCommon = useTranslations('common')
  const tDemoFeedback = useTranslations('demo.feedback')
  const toast = useToast()
  const router = useRouter()
  const isDemo = interactionMode === 'demo'

  const myRow = useMemo(
    () => rows.find((r) => r.discord_id === currentDiscordId) ?? null,
    [rows, currentDiscordId],
  )
  const others = useMemo(
    () => rows.filter((r) => r.discord_id !== currentDiscordId),
    [rows, currentDiscordId],
  )

  const canManage = isAdmin || isEventOwner

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-amber-400" />
          <h2 className="text-base sm:text-lg font-bold text-white">{t('title')}</h2>
          <span className="text-xs text-gray-400 font-mono">
            {t('countSummary', { n: rows.length })}
          </span>
        </div>
      </div>
      <p className="text-gray-400 text-xs sm:text-sm">{t('description')}</p>

      <SelfRow
        eventId={eventId}
        myRow={myRow}
        currentDiscordId={currentDiscordId}
        isGuest={isGuest}
        canSelfSignup={canSelfSignup}
        loginHref={loginHref}
        recruitmentClosed={recruitmentClosed}
        avatar={currentDiscordId ? avatars[currentDiscordId] ?? null : null}
        slotOptions={slotOptions}
        t={t}
        tRole={tRole}
        tAction={tAction}
        tCommon={tCommon}
        demoActionLabel={tDemoFeedback('actionAcknowledged')}
        toast={toast}
        router={router}
        isDemo={isDemo}
        currentViewerDmEnabled={currentViewerDmEnabled}
        currentViewerDmLabels={currentViewerDmLabels}
      />

      {others.length > 0 && (
        <ul className="space-y-1.5 border-t border-gray-800 pt-3">
          {others.map((row) => (
            <RowItem
              key={row.id}
              row={row}
              avatar={avatars[row.discord_id] ?? null}
              canManage={canManage && !recruitmentClosed}
              canRecommend={canManage && !recommendationClosed}
              eventId={eventId}
              slotOptions={slotOptions}
              t={t}
              tRole={tRole}
              tAction={tAction}
              tCommon={tCommon}
              demoActionLabel={tDemoFeedback('actionAcknowledged')}
              toast={toast}
              router={router}
              isDemo={isDemo}
            />
          ))}
        </ul>
      )}

      {canManage && !recruitmentClosed && memberDirectory.length > 0 && (
        <AdminAddPanel
          eventId={eventId}
          memberDirectory={memberDirectory}
          existingDiscordIds={rows.map((r) => r.discord_id)}
          t={t}
          tRole={tRole}
          tAction={tAction}
          tCommon={tCommon}
          demoActionLabel={tDemoFeedback('actionAcknowledged')}
          toast={toast}
          router={router}
          isDemo={isDemo}
        />
      )}
    </section>
  )
}

interface SelfRowProps {
  eventId: string
  myRow: TentativeSignupRow | null
  currentDiscordId: string | null
  isGuest: boolean
  canSelfSignup: boolean
  loginHref: string
  recruitmentClosed: boolean
  avatar: string | null
  slotOptions: TentativeSlotRecommendationOption[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  tAction: ReturnType<typeof useTranslations<'eventTentativeAction'>>
  tCommon: ReturnType<typeof useTranslations<'common'>>
  demoActionLabel: string
  toast: ReturnType<typeof useToast>
  router: ReturnType<typeof useRouter>
  isDemo: boolean
  currentViewerDmEnabled: boolean | null
  currentViewerDmLabels: NonNullable<Props['currentViewerDmLabels']> | null
}

function SelfRow({
  eventId,
  myRow,
  currentDiscordId,
  isGuest,
  canSelfSignup,
  loginHref,
  recruitmentClosed,
  avatar,
  slotOptions,
  t,
  tRole,
  tAction,
  tCommon,
  demoActionLabel,
  toast,
  router,
  isDemo,
  currentViewerDmEnabled,
  currentViewerDmLabels,
}: SelfRowProps) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<SlotRole[]>(myRow?.possible_roles ?? [])
  const [notes, setNotes] = useState(myRow?.notes ?? '')

  if (!currentDiscordId) {
    return (
      <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">{t('loginToSignup')}</p>
        <a
          href={loginHref}
          className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold px-3 py-1 rounded-full"
        >
          <LogIn size={12} />
          {t('loginButton')}
        </a>
      </div>
    )
  }

  if (isGuest) {
    return (
      <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5">
        <p className="text-xs text-gray-400">{t('guestNotAllowed')}</p>
      </div>
    )
  }

  if (!canSelfSignup) {
    return (
      <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5">
        <p className="text-xs text-gray-400">{t('callerReadOnly')}</p>
      </div>
    )
  }

  if (recruitmentClosed) {
    // Draft/unpublished events do not accept tentative availability yet.
    if (!myRow) {
      return (
        <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-400">{t('battleStartedReadOnly')}</p>
        </div>
      )
    }
    return (
      <ReadOnlySelfRow
        myRow={myRow}
        avatar={avatar}
        slotOptions={slotOptions}
        t={t}
        tRole={tRole}
        currentViewerDmEnabled={currentViewerDmEnabled}
        currentViewerDmLabels={currentViewerDmLabels}
      />
    )
  }

  const toggleRole = (role: SlotRole) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const submit = () => {
    setError('')
    if (selected.length === 0) {
      setError(tAction('rolesRequired'))
      return
    }
    startTransition(async () => {
      if (isDemo) {
        toast.info(demoActionLabel)
        setEditing(false)
        return
      }
      const result = await submitMyTentativeSignup(eventId, selected, notes)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(myRow ? t('toastUpdated') : t('toastAdded'))
      setEditing(false)
      router.refresh()
    })
  }

  const cancelMine = () => {
    if (!myRow) return
    setError('')
    startTransition(async () => {
      if (isDemo) {
        toast.info(demoActionLabel)
        setEditing(false)
        return
      }
      const result = await removeTentativeSignup(eventId, myRow.discord_id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(t('toastRemoved'))
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing && !myRow) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-amber-200/90 leading-snug">{t('selfSignupHint')}</p>
        <button
          type="button"
          onClick={() => {
            setSelected([])
            setNotes('')
            setEditing(true)
          }}
          className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-full"
        >
          <Plus size={12} />
          {t('signupButton')}
        </button>
      </div>
    )
  }

  if (!editing && myRow) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <SelfDisplay
          myRow={myRow}
          avatar={avatar}
          slotOptions={slotOptions}
          t={t}
          tRole={tRole}
          currentViewerDmEnabled={currentViewerDmEnabled}
          currentViewerDmLabels={currentViewerDmLabels}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSelected(myRow.possible_roles)
              setNotes(myRow.notes ?? '')
              setEditing(true)
            }}
            className="inline-flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-full"
          >
            <Pencil size={11} />
            {t('editButton')}
          </button>
          <button
            type="button"
            onClick={cancelMine}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 px-2.5 py-1 rounded-full disabled:opacity-50"
          >
            <X size={11} />
            {t('cancelButton')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/40 rounded-lg p-3 space-y-2.5">
      <p className="text-xs font-semibold text-amber-200">{t('formPickRoles')}</p>
      <div className="flex flex-wrap gap-1.5">
        {SLOT_ROLES.map((role) => {
          const checked = selected.includes(role)
          const style = getRoleStyle(role)
          return (
            <label
              key={role}
              className={`inline-flex items-center gap-1 cursor-pointer text-xs px-2 py-1 rounded-full border transition-colors ${
                checked
                  ? style?.badge ?? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleRole(role)}
                className="sr-only"
              />
              {checked && <Check size={10} />}
              {translateSlotRole(role, tRole)}
            </label>
          )
        })}
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('notesLabel')}</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>
      {error && (
        <p className="text-rose-300 text-xs">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold px-3 py-1.5 rounded-full"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {myRow ? t('saveEditButton') : t('saveAddButton')}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setError('')
          }}
          disabled={pending}
          className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  )
}

function SelfDisplay({
  myRow,
  avatar,
  slotOptions,
  t,
  tRole,
  currentViewerDmEnabled,
  currentViewerDmLabels,
}: {
  myRow: TentativeSignupRow
  avatar: string | null
  slotOptions: TentativeSlotRecommendationOption[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  currentViewerDmEnabled: boolean | null
  currentViewerDmLabels: NonNullable<Props['currentViewerDmLabels']> | null
}) {
  return (
    <div className="min-w-0 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
        {t('selfBadge')}
      </span>
      <span className="flex items-center gap-1.5 text-sm text-white">
        <MemberAvatar discordId={myRow.discord_id} avatar={avatar} size={18} />
        <span className="font-semibold truncate">{myRow.username}</span>
      </span>
      <RoleChips roles={myRow.possible_roles} tRole={tRole} />
      <RecommendationBadge
        slotId={myRow.recommended_slot_id}
        slotOptions={slotOptions}
        t={t}
        tRole={tRole}
      />
      {myRow.recommended_slot_id && currentViewerDmEnabled !== null && currentViewerDmLabels && (
        <RecommendationNotificationShortcut
          enabled={currentViewerDmEnabled}
          labels={currentViewerDmLabels}
        />
      )}
      {myRow.notes && (
        <span className="text-[11px] text-gray-400 italic">&quot;{myRow.notes}&quot;</span>
      )}
    </div>
  )
}

function RecommendationNotificationShortcut({
  enabled,
  labels,
}: {
  enabled: boolean
  labels: NonNullable<Props['currentViewerDmLabels']>
}) {
  return (
    <Link
      href="/me/settings#discord-dm"
      className={`inline-flex min-h-10 basis-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-[background-color,border-color,color,transform] active:scale-[0.96] sm:basis-auto ${
        enabled
          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
      }`}
      aria-label={`${labels.title}: ${enabled ? labels.enabled : labels.enable}`}
    >
      {enabled ? <BellRing size={14} /> : <BellOff size={14} />}
      <span>{enabled ? labels.enabled : labels.enable}</span>
      <span className={enabled ? 'text-emerald-300/70' : 'text-amber-200/70'}>
        · {labels.settings}
      </span>
    </Link>
  )
}

function ReadOnlySelfRow({
  myRow,
  avatar,
  slotOptions,
  t,
  tRole,
  currentViewerDmEnabled,
  currentViewerDmLabels,
}: {
  myRow: TentativeSignupRow
  avatar: string | null
  slotOptions: TentativeSlotRecommendationOption[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  currentViewerDmEnabled: boolean | null
  currentViewerDmLabels: NonNullable<Props['currentViewerDmLabels']> | null
}) {
  return (
    <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2.5">
      <SelfDisplay
        myRow={myRow}
        avatar={avatar}
        slotOptions={slotOptions}
        t={t}
        tRole={tRole}
        currentViewerDmEnabled={currentViewerDmEnabled}
        currentViewerDmLabels={currentViewerDmLabels}
      />
    </div>
  )
}

function RowItem({
  row,
  avatar,
  canManage,
  canRecommend,
  eventId,
  slotOptions,
  t,
  tRole,
  tAction,
  tCommon,
  demoActionLabel,
  toast,
  router,
  isDemo,
}: {
  row: TentativeSignupRow
  avatar: string | null
  canManage: boolean
  canRecommend: boolean
  eventId: string
  slotOptions: TentativeSlotRecommendationOption[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  tAction: ReturnType<typeof useTranslations<'eventTentativeAction'>>
  tCommon: ReturnType<typeof useTranslations<'common'>>
  demoActionLabel: string
  toast: ReturnType<typeof useToast>
  router: ReturnType<typeof useRouter>
  isDemo: boolean
}) {
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()
  const matchingSlots = slotOptions.filter((slot) =>
    row.possible_roles.includes(slot.roleName),
  )

  const remove = async () => {
    const ok = await askConfirm({
      body: tAction('confirmRemove', { name: row.username }),
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      if (isDemo) {
        toast.info(demoActionLabel)
        return
      }
      const result = await removeTentativeSignup(eventId, row.discord_id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('toastRemoved'))
      router.refresh()
    })
  }

  const recommend = (slotId: string) => {
    startTransition(async () => {
      if (isDemo) {
        toast.info(demoActionLabel)
        return
      }
      const nextSlotId = slotId || null
      const result = await setTentativeSlotRecommendation(
        eventId,
        row.discord_id,
        nextSlotId,
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        nextSlotId ? t('recommendationSaved') : t('recommendationCleared'),
      )
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col items-stretch justify-between gap-2 rounded px-2 py-1.5 hover:bg-gray-800/40 sm:flex-row sm:items-center">
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <MemberAvatar discordId={row.discord_id} avatar={avatar} size={18} />
        <MemberLink
          discordId={row.discord_id}
          username={row.username}
          className="text-sm text-white font-medium truncate"
        />
        <RoleChips roles={row.possible_roles} tRole={tRole} />
        <RecommendationBadge
          slotId={row.recommended_slot_id}
          slotOptions={slotOptions}
          t={t}
          tRole={tRole}
        />
        {row.notes && (
          <span className="text-[11px] text-gray-400 italic">&quot;{row.notes}&quot;</span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center justify-end gap-1.5">
        {canRecommend && (
          <TentativeSlotRecommendationPicker
            value={row.recommended_slot_id}
            options={matchingSlots}
            memberName={row.username}
            disabled={pending}
            onChange={recommend}
          />
        )}
        {canManage && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-rose-300/80 transition-transform hover:bg-rose-500/10 hover:text-rose-300 active:scale-[0.96] disabled:opacity-50"
            aria-label={tCommon('delete')}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </li>
  )
}

function recommendationOptionLabel(
  slot: TentativeSlotRecommendationOption,
  tRole: ReturnType<typeof useTranslations<'slotRole'>>,
  locale: Locale,
  getLocalizedItemName: ItemNameResolver,
): string {
  const weaponName = stripTierPrefix(
    getLocalizedItemName(slot.weaponId, locale, slot.weaponName),
  ) || translateSlotRole(slot.roleName, tRole)
  return formatTentativeSlotRecommendationLabel(slot, weaponName)
}

function RecommendationBadge({
  slotId,
  slotOptions,
  t,
  tRole,
}: {
  slotId: string | null
  slotOptions: TentativeSlotRecommendationOption[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
}) {
  const locale = useLocale() as Locale
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const slot = slotOptions.find((option) => option.id === slotId)
  if (!slot) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-950/90 px-2 py-1 text-[10px] font-semibold tabular-nums text-violet-100">
      <Sparkles size={10} aria-hidden="true" />
      {t('recommendationBadge', {
        slot: recommendationOptionLabel(
          slot,
          tRole,
          locale,
          getLocalizedItemName,
        ),
      })}
    </span>
  )
}

function RoleChips({
  roles,
  tRole,
}: {
  roles: SlotRole[]
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {roles.map((role) => {
        const style = getRoleStyle(role)
        return (
          <span
            key={role}
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              style?.badge ?? 'bg-gray-700 text-gray-200'
            }`}
          >
            {translateSlotRole(role, tRole)}
          </span>
        )
      })}
    </span>
  )
}

function AdminAddPanel({
  eventId,
  memberDirectory,
  existingDiscordIds,
  t,
  tRole,
  tAction,
  tCommon,
  demoActionLabel,
  toast,
  router,
  isDemo,
}: {
  eventId: string
  memberDirectory: DirectoryMember[]
  existingDiscordIds: string[]
  t: ReturnType<typeof useTranslations<'eventTentative'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  tAction: ReturnType<typeof useTranslations<'eventTentativeAction'>>
  tCommon: ReturnType<typeof useTranslations<'common'>>
  demoActionLabel: string
  toast: ReturnType<typeof useToast>
  router: ReturnType<typeof useRouter>
  isDemo: boolean
}) {
  const [open, setOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [selected, setSelected] = useState<SlotRole[]>([])
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const eligible = useMemo(
    () =>
      memberDirectory.filter((m) => !existingDiscordIds.includes(m.discord_id)),
    [memberDirectory, existingDiscordIds],
  )
  const searchableMembers = useMemo<AssignableMember[]>(
    () =>
      eligible.map((m) => ({
        discordId: m.discord_id,
        username: m.username,
        albionNickname: m.albion_nickname ?? null,
        avatar: m.avatar ?? null,
        alreadyInEvent: false,
      })),
    [eligible],
  )
  const filteredMembers = useMemo(
    () => filterAssignableMembers(searchableMembers, memberQuery, 'available').slice(0, 8),
    [searchableMembers, memberQuery],
  )
  const selectedMemberInfo = eligible.find((m) => m.discord_id === selectedMember) ?? null

  const toggleRole = (role: SlotRole) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const submit = () => {
    setError('')
    const member = eligible.find((m) => m.discord_id === selectedMember)
    if (!member) {
      setError(tAction('memberRequired'))
      return
    }
    if (selected.length === 0) {
      setError(tAction('rolesRequired'))
      return
    }
    startTransition(async () => {
      if (isDemo) {
        toast.info(demoActionLabel)
        setSelectedMember('')
        setMemberQuery('')
        setSelected([])
        setNotes('')
        setOpen(false)
        return
      }
      const result = await adminUpsertTentativeSignup(
        eventId,
        member.discord_id,
        member.username,
        selected,
        notes,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(t('toastAdded'))
      setSelectedMember('')
      setMemberQuery('')
      setSelected([])
      setNotes('')
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-full"
      >
        <UserPlus size={12} />
        {t('adminAddButton')}
      </button>
    )
  }

  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 space-y-2.5">
      <p className="text-xs font-semibold text-gray-200">{t('adminAddTitle')}</p>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('adminMemberLabel')}</label>
        <div className="space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={t('adminMemberSearchPlaceholder')}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            {memberQuery && (
              <button
                type="button"
                onClick={() => setMemberQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
                aria-label={t('adminMemberClearSearch')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {selectedMemberInfo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
              <MemberCandidateSummary
                member={selectedMemberInfo}
                albionLabel={t('adminMemberAlbionLabel')}
                selectedLabel={t('adminMemberSelected')}
              />
              <button
                type="button"
                onClick={() => setSelectedMember('')}
                className="rounded p-1 text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-100"
                aria-label={t('adminMemberClearSelection')}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <p className="rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-2 text-xs text-gray-500">
              {t('adminMemberPlaceholder')}
            </p>
          )}

          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/40 p-1">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {t('adminMemberAvailableSummary', { count: eligible.length })}
            </p>
            {filteredMembers.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-gray-500">
                {t('adminMemberNoMatches')}
              </p>
            ) : (
              <ul className="space-y-1">
                {filteredMembers.map((m) => (
                  <li key={m.discordId}>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(m.discordId)}
                      className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                        selectedMember === m.discordId
                          ? 'bg-amber-500/15 text-amber-100'
                          : 'text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      <MemberCandidateSummary
                        member={{
                          discord_id: m.discordId,
                          username: m.username,
                          albion_nickname: m.albionNickname,
                          avatar: m.avatar,
                        }}
                        albionLabel={t('adminMemberAlbionLabel')}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div>
        <p className="text-[11px] text-gray-400 mb-1">{t('formPickRoles')}</p>
        <div className="flex flex-wrap gap-1.5">
          {SLOT_ROLES.map((role) => {
            const checked = selected.includes(role)
            const style = getRoleStyle(role)
            return (
              <label
                key={role}
                className={`inline-flex items-center gap-1 cursor-pointer text-xs px-2 py-1 rounded-full border transition-colors ${
                  checked
                    ? style?.badge ?? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                  className="sr-only"
                />
                {checked && <Check size={10} />}
                {translateSlotRole(role, tRole)}
              </label>
            )
          })}
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('notesLabel')}</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>
      {error && <p className="text-rose-300 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold px-3 py-1.5 rounded-full"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('saveAddButton')}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError('')
            setMemberQuery('')
          }}
          disabled={pending}
          className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  )
}

function MemberCandidateSummary({
  member,
  albionLabel,
  selectedLabel,
}: {
  member: DirectoryMember
  albionLabel: string
  selectedLabel?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar discordId={member.discord_id} avatar={member.avatar ?? null} size={22} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-white">{member.username}</span>
          {selectedLabel && (
            <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
              {selectedLabel}
            </span>
          )}
        </span>
        <span className="block truncate text-[10px] text-gray-500">
          {member.albion_nickname
            ? `${albionLabel}: ${member.albion_nickname} · ${member.discord_id}`
            : member.discord_id}
        </span>
      </span>
    </span>
  )
}
