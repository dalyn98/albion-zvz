'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignSlot, cancelSlot } from '@/app/actions/member'
import type { Slot, WeaponOption } from '@/types'
import { SLOT_KEYS, getRoleStyle, isFreeItem, getDisplayWeapon, hasWeaponOptions } from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
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
  return (
    <div
      className="flex items-center justify-center rounded-md bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold"
      style={{ width: size, height: size, fontSize: size >= 44 ? 12 : 9 }}
    >
      자유
    </div>
  )
}

function SlotItem({ name, id, size }: { name: string | null; id: string | null; size: number }) {
  if (isFreeItem(name, id)) return <FreeBadge size={size} />
  return <ItemImage itemId={id} itemName={name} size={size} />
}

function NoteTooltip({ notes }: { notes: string }) {
  return (
    <div className="group/note relative inline-block">
      <span
        tabIndex={0}
        role="button"
        aria-label={`메모: ${notes}`}
        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/90 border border-amber-500/30 hover:bg-amber-500/20 cursor-help focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      >
        <MessageSquare size={10} />
        메모
      </span>
      <div
        role="tooltip"
        className="hidden group-hover/note:block group-focus-within/note:block absolute z-30 top-full left-0 mt-1 w-56 max-w-[80vw] bg-gray-950 border border-gray-700 rounded-lg p-2 shadow-xl pointer-events-none"
      >
        <p className="text-gray-100 text-[11px] whitespace-pre-wrap leading-snug text-left break-words">
          {notes}
        </p>
      </div>
    </div>
  )
}

export default function SlotCard({ slot, partyNumber, currentDiscordId, loginHref, battleStarted, assignedAvatar = null }: Props) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const router = useRouter()

  const isTaken = slot.assigned_discord_id !== null
  const isMine = isTaken && slot.assigned_discord_id === currentDiscordId
  const isLoggedIn = currentDiscordId !== null
  const roleStyle = getRoleStyle(slot.role_name)
  const hasOptions = hasWeaponOptions(slot)
  const displayWeapon = getDisplayWeapon(slot)

  const doAssign = (chosen: WeaponOption | null) => {
    setError('')
    startTransition(async () => {
      const result = await assignSlot(slot.id, chosen)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const handleAssign = () => {
    if (battleStarted) {
      const ok = confirm(
        '전투가 이미 시작된 이벤트입니다.\n신청 후에는 취소가 불가능합니다. 계속 진행할까요?',
      )
      if (!ok) return
    }
    if (hasOptions) {
      setError('')
      setPickerOpen(true)
      return
    }
    doAssign(null)
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
          <span className="text-gray-500 text-[10px]">{partyNumber}파티·{slot.slot_number}번</span>
          {slot.role_name && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}>
              {slot.role_name}
            </span>
          )}
        </div>
        {isTaken && (
          <div className={`flex items-center gap-1 text-[10px] flex-shrink-0 ${
            isMine ? 'text-amber-300' : 'text-green-400'
          }`}>
            <MemberAvatar discordId={slot.assigned_discord_id} avatar={assignedAvatar} size={14} />
            <span className="font-semibold truncate max-w-[80px]">{slot.assigned_username}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div className="row-span-2 flex items-center justify-center">
          {hasOptions && !isTaken ? (
            <WeaponOptionsPreview options={slot.weapon_options!} />
          ) : (
            <SlotItem name={displayWeapon.name} id={displayWeapon.id} size={52} />
          )}
        </div>
        {otherKeys.map((key) => {
          const itemName = slot[`${key}_name`]
          const itemId = slot[`${key}_id`]
          return (
            <div key={key} className="flex items-center justify-center">
              <SlotItem name={itemName} id={itemId} size={28} />
            </div>
          )
        })}
      </div>

      <SlotSpellPanel slot={slot} />

      {hasOptions && !isTaken ? (
        <p className="text-amber-300 text-[10px] font-medium truncate leading-tight">
          선택 가능 무기 {slot.weapon_options!.length}종
        </p>
      ) : (
        displayWeapon.name && !isFreeItem(displayWeapon.name, displayWeapon.id) && (
          <p className="text-white text-[10px] font-medium truncate leading-tight">
            {stripTierPrefix(displayWeapon.name)}
          </p>
        )
      )}

      {slot.notes && <NoteTooltip notes={slot.notes} />}

      {renderAction()}
      {error && <p className="text-red-400 text-[10px] leading-tight">{error}</p>}

      {pickerOpen && (
        <WeaponChoiceModal
          options={slot.weapon_options!}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(chosen) => {
            setPickerOpen(false)
            doAssign(chosen)
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
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
        >
          <LogIn size={11} />
          로그인 후 신청
        </a>
      )
    }
    if (isMine) {
      if (battleStarted) {
        return (
          <button
            disabled
            title="전투가 시작되어 취소할 수 없습니다."
            className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium bg-gray-800/60 text-gray-400 border border-gray-700 cursor-not-allowed"
          >
            <Lock size={11} />
            전투 시작 · 취소 불가
          </button>
        )
      }
      return (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
        >
          <UserX size={11} />
          {pending ? '취소 중...' : '신청 취소'}
        </button>
      )
    }
    if (isTaken) {
      return (
        <button
          disabled
          className="w-full py-1 rounded-md text-[11px] font-medium bg-gray-800/50 text-gray-500 border border-gray-800 cursor-not-allowed"
        >
          신청 불가
        </button>
      )
    }
    return (
      <button
        onClick={handleAssign}
        disabled={pending}
        className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-colors disabled:opacity-50"
      >
        {hasOptions ? <Swords size={11} /> : <UserPlus size={11} />}
        {pending ? '신청 중...' : hasOptions ? '무기 선택 후 신청' : '신청'}
      </button>
    )
  }
}

function WeaponOptionsPreview({ options }: { options: WeaponOption[] }) {
  const shown = options.slice(0, 4)
  const extra = options.length - shown.length
  return (
    <div className="grid grid-cols-2 gap-0.5 w-[52px] h-[52px]">
      {shown.map((opt) => (
        <div key={opt.id} className="relative w-full h-full">
          <ItemImage itemId={opt.id} itemName={stripTierPrefix(opt.name)} size={24} />
        </div>
      ))}
      {extra > 0 && (
        <div className="flex items-center justify-center text-amber-300 text-[9px] font-bold bg-amber-500/10 border border-amber-500/30 rounded">
          +{extra}
        </div>
      )}
    </div>
  )
}

function WeaponChoiceModal({
  options,
  onCancel,
  onConfirm,
}: {
  options: WeaponOption[]
  onCancel: () => void
  onConfirm: (chosen: WeaponOption) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const selected = options.find((o) => o.id === selectedId) ?? null

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
          <h3 className="font-bold text-white text-base">무기 선택</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-white"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          {options.map((opt) => {
            const isSel = opt.id === selectedId
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedId(opt.id)}
                className={`w-full flex items-center gap-2 rounded-lg p-2 border transition-colors text-left ${
                  isSel
                    ? 'bg-amber-500/10 border-amber-500/50'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <ItemImage itemId={opt.id} itemName={stripTierPrefix(opt.name)} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{stripTierPrefix(opt.name)}</p>
                  <p className="text-gray-500 text-[10px] font-mono truncate">{opt.id}</p>
                </div>
                {isSel && (
                  <span className="text-amber-400 text-[10px] font-bold flex-shrink-0">선택</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-2"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
          >
            신청하기
          </button>
        </div>
      </div>
    </div>
  )
}
