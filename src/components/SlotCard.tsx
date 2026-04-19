'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { assignSlot, cancelSlot, type SlotPicks } from '@/app/actions/member'
import type { GearOption, Slot, SlotKey } from '@/types'
import {
  SLOT_KEYS,
  getDisplayGear,
  getGearOptions,
  getRoleStyle,
  hasGearOptions,
  isFreeItem,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'
import SlotSpellPanel from './SlotSpellPanel'
import MemberAvatar from './MemberAvatar'
import { UserPlus, UserX, MessageSquare, LogIn, Lock, X, Swords } from 'lucide-react'

interface Props {
  slot: Slot
  partyNumber: number
  currentDiscordId: string | null
  loginHref: string
  battleStarted: boolean
  assignedAvatar?: string | null
}

function FreeBadge({ size }: { size: number }) {
  const t = useTranslations('slot')
  return (
    <div
      className="flex items-center justify-center rounded-md bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold"
      style={{ width: size, height: size, fontSize: size >= 44 ? 14 : 11 }}
    >
      {t('free')}
    </div>
  )
}

function SlotItem({ name, id, size }: { name: string | null; id: string | null; size: number }) {
  if (isFreeItem(name, id)) return <FreeBadge size={size} />
  return <ItemImage itemId={id} itemName={name} size={size} />
}

// Multi-option preview: first item in the options list as the main image,
// with a "+N" badge overlay when there are more to pick from. Signals to the
// member that they'll be asked to pick at signup time without crowding the
// card with every option.
function MultiOptionPreview({
  options,
  size,
}: {
  options: GearOption[]
  size: number
}) {
  const first = options[0]
  const extra = options.length - 1
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ItemImage itemId={first.id} itemName={stripTierPrefix(first.name)} size={size} />
      {extra > 0 && (
        <span
          className="absolute -top-1 -right-1 bg-amber-500 text-black font-bold rounded-full px-1 leading-tight"
          style={{ fontSize: Math.max(11, Math.floor(size * 0.28)) }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

function GearPreview({
  slot,
  kind,
  size,
  isTaken,
}: {
  slot: Slot
  kind: SlotKey
  size: number
  isTaken: boolean
}) {
  const options = getGearOptions(slot, kind)
  // Only show the multi-option preview when nothing has been assigned yet;
  // once a member picks, their choice lives in assigned_{kind}_* and the
  // normal display takes over.
  const display = getDisplayGear(slot, kind)
  const showOptionsPreview = !isTaken && !display.id && Array.isArray(options) && options.length > 0
  if (showOptionsPreview) {
    return <MultiOptionPreview options={options!} size={size} />
  }
  return <SlotItem name={display.name} id={display.id} size={size} />
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
  currentDiscordId,
  loginHref,
  battleStarted,
  assignedAvatar = null,
}: Props) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations('slot')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale

  const isTaken = slot.assigned_discord_id !== null
  const isMine = isTaken && slot.assigned_discord_id === currentDiscordId
  const isLoggedIn = currentDiscordId !== null
  const roleStyle = getRoleStyle(slot.role_name)

  // Slot kinds that need a choice at signup time: the admin marked them multi
  // and the member hasn't been assigned yet.
  const multiOptionKinds = useMemo<SlotKey[]>(
    () => SLOT_KEYS.filter((k) => hasGearOptions(slot, k)),
    [slot],
  )
  const needsPicks = multiOptionKinds.length > 0
  const weaponDisplay = getDisplayGear(slot, 'weapon')

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

  const otherKeys = SLOT_KEYS.filter((k) => k !== 'weapon')

  return (
    <div className={`rounded-xl p-2.5 space-y-2 border transition-colors ${
      isMine
        ? 'bg-amber-500/5 border-amber-500/40'
        : isTaken
          ? 'bg-gray-900/60 border-gray-700'
          : 'bg-gray-900 border-gray-600 hover:border-gray-500'
    }`}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-gray-500 text-[12px]">{t('partyLabel', { party: partyNumber, slot: slot.slot_number })}</span>
          {slot.role_name && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}>
              {slot.role_name}
            </span>
          )}
        </div>
        {isTaken && (
          <div className={`flex items-center gap-1 text-[12px] flex-shrink-0 ${
            isMine ? 'text-amber-300' : 'text-green-400'
          }`}>
            <MemberAvatar discordId={slot.assigned_discord_id} avatar={assignedAvatar} size={14} />
            <span className="font-semibold truncate max-w-[80px]">{slot.assigned_username}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div className="row-span-2 flex items-center justify-center">
          <GearPreview slot={slot} kind="weapon" size={52} isTaken={isTaken} />
        </div>
        {otherKeys.map((key) => (
          <div key={key} className="flex items-center justify-center">
            <GearPreview slot={slot} kind={key} size={28} isTaken={isTaken} />
          </div>
        ))}
      </div>

      <SlotSpellPanel slot={slot} />

      {!isTaken && needsPicks ? (
        <p className="text-amber-300 text-[12px] font-medium truncate leading-tight">
          {t('multiRequired', { labels: multiOptionKinds.map((k) => tGear(k)).join('/') })}
        </p>
      ) : (
        weaponDisplay.name && !isFreeItem(weaponDisplay.name, weaponDisplay.id) && (
          <p className="text-white text-[12px] font-medium truncate leading-tight">
            {stripTierPrefix(getLocalizedItemName(weaponDisplay.id, locale, weaponDisplay.name) ?? weaponDisplay.name)}
          </p>
        )
      )}

      {slot.notes && <NoteTooltip notes={slot.notes} />}

      {renderAction()}
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
        disabled={pending}
        className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[13px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-colors disabled:opacity-50"
      >
        {needsPicks ? <Swords size={11} /> : <UserPlus size={11} />}
        {pending ? t('applying') : needsPicks ? t('pickThenApply') : t('apply')}
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
                        <ItemImage itemId={opt.id} itemName={stripTierPrefix(opt.name)} size={32} />
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
