'use client'

import { useMemo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from 'lucide-react'
import type { SlotInput } from './SlotEditor/slot-input'
import { buildDisplaySlot } from './BuildPreview'
import GearPreview from './GearPreview'
import { countConfiguredSlotKinds } from '@/lib/slot-workspace'
import { getRoleStyle, SLOT_KEYS } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Props {
  slot: SlotInput
  isActive: boolean
  isSelected: boolean
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
  onDrop: () => void
}

const compactPreviewKeys = SLOT_KEYS.filter((key) => key !== 'weapon').slice(0, 4)

export default function SlotWorkspaceRow({
  slot,
  isActive,
  isSelected,
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
  onDrop,
}: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const displaySlot = useMemo(() => buildDisplaySlot(slot), [slot])
  const configured = countConfiguredSlotKinds(slot)
  const roleStyle = getRoleStyle(slot.role_name)
  const status = configured === 0
    ? 'empty'
    : configured === SLOT_KEYS.length && slot.role_name
      ? 'complete'
      : 'review'

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      className={`rounded-xl bg-gray-900/75 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,opacity,background-color] duration-150 ${
        isActive ? 'bg-sky-500/[0.07] shadow-[0_0_0_2px_rgba(56,189,248,0.5)]' : 'hover:bg-gray-800/80 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]'
      } ${slot.is_hidden ? 'opacity-60' : ''}`}
    >
      <div className="flex items-stretch gap-1 p-1.5">
        <label className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-800 hover:text-sky-300">
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
        <div className="flex items-center">
          <GripVertical size={16} className="text-gray-600" aria-hidden="true" />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-800/80 px-1.5 py-1">
        <div className="flex items-center">
          <ActionButton label={t('moveUp')} disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUp size={15} />
          </ActionButton>
          <ActionButton label={t('moveDown')} disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ArrowDown size={15} />
          </ActionButton>
          <ActionButton label={t('duplicateSlot')} onClick={onDuplicate}>
            <Copy size={15} />
          </ActionButton>
        </div>
        <div className="flex items-center">
          {showVisibility && (
            <ActionButton
              label={slot.is_hidden ? t('show') : t('hide')}
              onClick={onToggleHidden}
            >
              {slot.is_hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </ActionButton>
          )}
          <ActionButton label={tCommon('delete')} onClick={onDelete} danger>
            <Trash2 size={15} />
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  label,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25 ${
        danger ? 'text-gray-600 hover:bg-red-500/10 hover:text-red-400' : 'text-gray-500 hover:bg-gray-800 hover:text-amber-300'
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
