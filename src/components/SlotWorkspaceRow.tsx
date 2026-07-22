'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EllipsisVertical,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from 'lucide-react'
import type { SlotInput } from './SlotEditor/slot-input'
import { buildDisplaySlot } from './BuildPreview'
import GearPreview from './GearPreview'
import { countConfiguredSlotKinds, getSlotWorkspaceId, type SlotDropEdge } from '@/lib/slot-workspace'
import { getRoleStyle, SLOT_KEYS } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Props {
  slot: SlotInput
  isActive: boolean
  isSelected: boolean
  isDragging: boolean
  dropPosition: SlotDropEdge | null
  dragHintId: string
  canMoveUp: boolean
  canMoveDown: boolean
  showVisibility: boolean
  onActivate: () => void
  onToggleSelected: () => void
  onMove: (direction: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleHidden: () => void
  onDragStart: () => void
  onDragOver: (edge: SlotDropEdge, clientY: number) => void
  onDragEnd: () => void
  onDrop: (edge: SlotDropEdge) => void
}

const compactPreviewKeys = SLOT_KEYS.filter((key) => key !== 'weapon').slice(0, 4)

export default function SlotWorkspaceRow({
  slot,
  isActive,
  isSelected,
  isDragging,
  dropPosition,
  dragHintId,
  canMoveUp,
  canMoveDown,
  showVisibility,
  onActivate,
  onToggleSelected,
  onMove,
  onDuplicate,
  onDelete,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRootRef = useRef<HTMLDivElement>(null)
  const displaySlot = useMemo(() => buildDisplaySlot(slot), [slot])
  const configured = countConfiguredSlotKinds(slot)
  const roleStyle = getRoleStyle(slot.role_name)
  const status = configured === 0
    ? 'empty'
    : configured === SLOT_KEYS.length && slot.role_name
      ? 'complete'
      : 'review'

  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRootRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const dropEdgeFor = (event: DragEvent<HTMLDivElement>): SlotDropEdge => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
  }

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <div
      role="listitem"
      data-slot-workspace-row
      data-slot-id={getSlotWorkspaceId(slot)}
      data-slot-number={slot.slot_number}
      data-drop-position={dropPosition ?? undefined}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver(dropEdgeFor(event), event.clientY)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(dropEdgeFor(event))
      }}
      className={`group relative rounded-xl bg-gray-900/75 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,opacity,background-color,scale] duration-150 ${
        isActive
          ? 'bg-sky-500/[0.07] shadow-[0_0_0_2px_rgba(56,189,248,0.5)]'
          : 'hover:bg-gray-800/80 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]'
      } ${slot.is_hidden ? 'opacity-60' : ''} ${isDragging ? 'scale-[0.985] opacity-45' : ''}`}
    >
      {dropPosition && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-2 right-2 z-20 h-0.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)] ${
            dropPosition === 'before' ? '-top-1' : '-bottom-1'
          }`}
        />
      )}

      <div className="flex items-stretch gap-1 p-1.5">
        <label className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition-[background-color,color] duration-150 hover:bg-gray-800 hover:text-sky-300">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelected}
            className="h-4 w-4 accent-sky-500"
            aria-label={t('selectSlotAria', { slot: slot.slot_number })}
          />
        </label>
        <button
          type="button"
          onClick={onActivate}
          data-slot-activate
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-gray-800/70 active:scale-[0.96]"
          aria-current={isActive ? 'true' : undefined}
        >
          <GearPreview
            slot={displaySlot}
            kind="weapon"
            size={38}
            isTaken={false}
            interactive={false}
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="flex-shrink-0 text-xs font-semibold text-gray-300 tabular-nums">
                {t('slotShortLabel', { slot: slot.slot_number })}
              </span>
              {slot.role_name ? (
                <span className={`truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {translateSlotRole(slot.role_name, tRole)}
                </span>
              ) : (
                <span className="truncate text-[10px] italic text-gray-600">{t('roleNone')}</span>
              )}
            </span>
            <span className="mt-1 flex items-center gap-1.5">
              <span className={`text-[10px] font-semibold ${
                status === 'complete'
                  ? 'text-emerald-300'
                  : status === 'review'
                    ? 'text-amber-300'
                    : 'text-gray-500'
              }`}>
                {t(`slotStatus_${status}`)}
              </span>
              <span className="text-[10px] text-gray-500 tabular-nums">
                {configured}/{SLOT_KEYS.length}
              </span>
              {slot.assigned_username && (
                <span className="truncate text-[10px] text-green-400">✓ {slot.assigned_username}</span>
              )}
            </span>
          </span>
          <span className="hidden items-center gap-1 2xl:flex">
            {compactPreviewKeys.map((key) => (
              <GearPreview
                key={key}
                slot={displaySlot}
                kind={key}
                size={24}
                isTaken={false}
                interactive={false}
              />
            ))}
          </span>
        </button>

        <div
          className="flex items-center transition-opacity duration-150 lg:pointer-events-none lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100 lg:group-focus-within:pointer-events-auto lg:group-focus-within:opacity-100"
          data-slot-move-controls
        >
          <ActionButton label={t('moveUp')} disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUp size={15} />
          </ActionButton>
          <ActionButton label={t('moveDown')} disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ArrowDown size={15} />
          </ActionButton>
        </div>

        <button
          type="button"
          draggable
          onClick={(event) => event.preventDefault()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', getSlotWorkspaceId(slot))
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          className="hidden min-h-10 min-w-10 cursor-grab items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-sky-300 active:cursor-grabbing active:scale-[0.96] lg:inline-flex"
          aria-label={t('dragSlotAria', { slot: slot.slot_number })}
          aria-describedby={dragHintId}
          title={t('dragSlotAria', { slot: slot.slot_number })}
          data-slot-drag-handle
        >
          <GripVertical size={17} aria-hidden="true" />
        </button>

        <div ref={menuRootRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96]"
            aria-label={t('moreSlotActions')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-slot-more-actions
          >
            <EllipsisVertical size={17} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className={`absolute right-0 z-30 w-48 rounded-xl bg-gray-900 p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_12px_28px_rgba(0,0,0,0.42)] ${
                canMoveDown ? 'top-full mt-1' : 'bottom-full mb-1'
              }`}
              data-slot-actions-menu
            >
              <MenuAction onClick={() => runMenuAction(onDuplicate)}>
                <Copy size={15} /> {t('duplicateSlot')}
              </MenuAction>
              {showVisibility && (
                <MenuAction onClick={() => runMenuAction(onToggleHidden)}>
                  {slot.is_hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  {slot.is_hidden ? t('show') : t('hide')}
                </MenuAction>
              )}
              <MenuAction onClick={() => runMenuAction(onDelete)} danger>
                <Trash2 size={15} /> {tCommon('delete')}
              </MenuAction>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,scale] duration-150 ease-out hover:bg-gray-800 hover:text-amber-300 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function MenuAction({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold transition-[background-color,color,scale] duration-150 active:scale-[0.96] ${
        danger
          ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
          : 'text-gray-200 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
