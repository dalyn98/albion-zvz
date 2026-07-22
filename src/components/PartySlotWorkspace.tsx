'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  Beaker,
  CheckSquare2,
  Eye,
  EyeOff,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react'
import type { EventCategory } from '@/types'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import SlotWorkspaceRow from './SlotWorkspaceRow'
import BuildTemplatePalette from './BuildTemplatePalette'
import BatchApplyItemsModal from './BatchApplyItemsModal'
import BatchApplySpecsModal, { type BatchSpecsScope } from './BatchApplySpecsModal'
import { useConfirm } from './ConfirmDialog'
import {
  applyBatchItems,
  applyBatchSpecs,
  cloneSlotInput,
  deleteSlotAt,
  duplicateSlotAt,
  getSlotWorkspaceId,
  moveSlotAt,
  moveSlotTo,
  type BatchApplyScope,
  type BatchItemPicks,
} from '@/lib/slot-workspace'
import type { GearSpec, SlotKey } from '@/types'

interface Props {
  slots: SlotInput[]
  partyNumber: number
  autoRegearEnabled: boolean
  isBombSquadParty?: boolean
  eventCategory?: EventCategory
  timezone: string
  showVisibility?: boolean
  showTemplatePalette?: boolean
  onChange: (slots: SlotInput[]) => void
}

interface UndoReceipt {
  label: string
  slots: SlotInput[]
}

export default function PartySlotWorkspace({
  slots,
  partyNumber,
  autoRegearEnabled,
  isBombSquadParty = false,
  eventCategory,
  timezone,
  showVisibility = true,
  showTemplatePalette = true,
  onChange,
}: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const confirm = useConfirm()
  const [activeSlotId, setActiveSlotId] = useState<string | null>(
    slots[0] ? getSlotWorkspaceId(slots[0]) : null,
  )
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [batchItemsOpen, setBatchItemsOpen] = useState(false)
  const [batchSpecsOpen, setBatchSpecsOpen] = useState(false)
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null)
  const [undoReceipt, setUndoReceipt] = useState<UndoReceipt | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)

  const activeIndex = Math.max(
    0,
    slots.findIndex((slot) => getSlotWorkspaceId(slot) === activeSlotId),
  )
  const activeSlot = slots[activeIndex] ?? null
  const validSelectedSlotIds = useMemo(() => {
    const available = new Set(slots.map(getSlotWorkspaceId))
    return selectedSlotIds.filter((id) => available.has(id))
  }, [selectedSlotIds, slots])
  const allSelected = slots.length > 0 && validSelectedSlotIds.length === slots.length
  const anyVisible = slots.some((slot) => !slot.is_hidden)

  useEffect(() => {
    if (slots.length === 0) {
      // Keep selection valid when the last slot is removed externally.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSlotId(null)
      setMobileEditorOpen(false)
      return
    }
    if (slots.some((slot) => getSlotWorkspaceId(slot) === activeSlotId)) return
    // Parent replacements (template/batch/undo) may remove the active id.
    setActiveSlotId(getSlotWorkspaceId(slots[0]))
  }, [activeSlotId, slots])

  const createCheckpoint = (label: string) => {
    setUndoReceipt({ label, slots: slots.map(cloneSlotInput) })
  }

  const commit = (next: SlotInput[], label: string) => {
    createCheckpoint(label)
    onChange(next)
  }

  const showMobileEditor = () => {
    setMobileEditorOpen(
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
    )
  }

  const activate = (slot: SlotInput) => {
    setActiveSlotId(getSlotWorkspaceId(slot))
    showMobileEditor()
  }

  const updateActiveSlot = (updated: SlotInput) => {
    onChange(slots.map((slot, index) => index === activeIndex ? updated : slot))
  }

  const addSlot = () => {
    if (slots.length >= 20) return
    const slot = { ...emptySlotInput(slots.length + 1), id: crypto.randomUUID() }
    commit([...slots, slot], t('undoAddedSlot'))
    setActiveSlotId(getSlotWorkspaceId(slot))
    showMobileEditor()
  }

  const duplicateSlot = (index: number) => {
    if (slots.length >= 20) return
    const nextId = crypto.randomUUID()
    commit(duplicateSlotAt(slots, index, nextId), t('undoDuplicatedSlot'))
    setActiveSlotId(nextId)
    showMobileEditor()
  }

  const deleteSlot = async (index: number): Promise<boolean> => {
    const slot = slots[index]
    if (!slot) return false
    if (slot.assigned_username) {
      const accepted = await confirm({
        title: t('deleteAssignedTitle'),
        body: t('deleteAssignedBody', { name: slot.assigned_username }),
        confirmLabel: t('deleteSlot'),
        cancelLabel: tCommon('cancel'),
        destructive: true,
      })
      if (!accepted) return false
    }
    const next = deleteSlotAt(slots, index)
    commit(next, t('undoDeletedSlot'))
    const fallback = next[Math.min(index, next.length - 1)] ?? null
    setActiveSlotId(fallback ? getSlotWorkspaceId(fallback) : null)
    if (!fallback) setMobileEditorOpen(false)
    return true
  }

  const moveSlot = (index: number, direction: -1 | 1) => {
    commit(moveSlotAt(slots, index, direction), t('undoMovedSlot'))
  }

  const dropSlot = (targetIndex: number) => {
    if (!draggingSlotId) return
    const sourceIndex = slots.findIndex((slot) => getSlotWorkspaceId(slot) === draggingSlotId)
    setDraggingSlotId(null)
    if (sourceIndex < 0 || sourceIndex === targetIndex) return
    commit(moveSlotTo(slots, sourceIndex, targetIndex), t('undoMovedSlot'))
  }

  const toggleSlotHidden = (index: number) => {
    const next = slots.map((slot, currentIndex) => currentIndex === index
      ? { ...slot, is_hidden: !slot.is_hidden }
      : slot)
    commit(next, slots[index]?.is_hidden ? t('undoShownSlot') : t('undoHiddenSlot'))
  }

  const toggleAllHidden = () => {
    if (slots.length === 0) return
    commit(
      slots.map((slot) => ({ ...slot, is_hidden: anyVisible })),
      anyVisible ? t('undoHiddenParty') : t('undoShownParty'),
    )
  }

  const toggleSelected = (id: string) => {
    setSelectedSlotIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id])
  }

  const toggleSelectAll = () => {
    setSelectedSlotIds(allSelected ? [] : slots.map(getSlotWorkspaceId))
  }

  const undo = () => {
    if (!undoReceipt) return
    const next = undoReceipt.slots.map(cloneSlotInput)
    onChange(next)
    if (activeSlotId && !next.some((slot) => getSlotWorkspaceId(slot) === activeSlotId)) {
      setActiveSlotId(next[0] ? getSlotWorkspaceId(next[0]) : null)
    }
    setEditorRevision((revision) => revision + 1)
    setUndoReceipt(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const nextIndex = event.key === 'ArrowUp'
      ? Math.max(0, activeIndex - 1)
      : Math.min(slots.length - 1, activeIndex + 1)
    const next = slots[nextIndex]
    if (next) activate(next)
  }

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-900/65 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={slots.length === 0}
            className="inline-flex min-h-10 min-w-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-gray-300 transition-[background-color,scale] duration-150 hover:bg-gray-800 active:scale-[0.96] disabled:opacity-40"
          >
            {allSelected ? <CheckSquare2 size={15} className="text-sky-300" /> : <Square size={15} />}
            {allSelected ? t('clearSelection') : t('selectAll')}
          </button>
          {validSelectedSlotIds.length > 0 && (
            <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-200 tabular-nums">
              {t('selectedCount', { count: validSelectedSlotIds.length })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {showTemplatePalette && (
            <ToolbarButton onClick={() => setPaletteOpen((open) => !open)} active={paletteOpen}>
              <Sparkles size={14} /> {t('templatePaletteTitle')}
            </ToolbarButton>
          )}
          {showVisibility && slots.length > 0 && (
            <ToolbarButton onClick={toggleAllHidden}>
              {anyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              {anyVisible ? t('hideAllButton') : t('showAllButton')}
            </ToolbarButton>
          )}
          {slots.length > 0 && (
            <>
              <ToolbarButton onClick={() => setBatchItemsOpen(true)}>
                <Beaker size={14} /> {t('batchItemsButton')}
              </ToolbarButton>
              <ToolbarButton onClick={() => setBatchSpecsOpen(true)}>
                <Package size={14} /> {t('batchSpecButton')}
              </ToolbarButton>
            </>
          )}
        </div>
      </div>

      {undoReceipt && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sky-500/10 px-3 py-2 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]" role="status">
          <p className="text-xs text-sky-100 text-pretty">
            {t('undoAvailable', { action: undoReceipt.label })}
          </p>
          <button
            type="button"
            onClick={undo}
            className="inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-sky-200 transition-[background-color,scale] duration-150 hover:bg-sky-500/10 active:scale-[0.96]"
          >
            <RotateCcw size={14} /> {t('undo')}
          </button>
        </div>
      )}

      {paletteOpen && showTemplatePalette && (
        <BuildTemplatePalette
          selectedSlot={activeSlot}
          selectedLabel={activeSlot ? t('slotBreadcrumb', { party: partyNumber, slot: activeSlot.slot_number }) : null}
          defaultCategoryFilter={eventCategory}
          onApply={(next) => {
            if (!activeSlot) return
            createCheckpoint(t('undoTemplateApplied'))
            updateActiveSlot(next)
            setPaletteOpen(false)
          }}
        />
      )}

      {slots.length === 0 ? (
        <div className="rounded-2xl bg-gray-900/50 px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <p className="text-sm text-gray-500 text-pretty">{t('noSlotsHint')}</p>
          <button
            type="button"
            onClick={addSlot}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold text-amber-300 transition-[background-color,scale] duration-150 hover:bg-amber-500/10 active:scale-[0.96]"
          >
            <Plus size={15} /> {t('addSlot', { count: 0 })}
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.6fr)]">
          <div className="space-y-2">
            {slots.map((slot, index) => {
              const id = getSlotWorkspaceId(slot)
              return (
                <SlotWorkspaceRow
                  key={id}
                  slot={slot}
                  isActive={id === activeSlotId}
                  isSelected={validSelectedSlotIds.includes(id)}
                  canMoveUp={index > 0}
                  canMoveDown={index < slots.length - 1}
                  showVisibility={showVisibility}
                  onActivate={() => activate(slot)}
                  onToggleSelected={() => toggleSelected(id)}
                  onMove={(direction) => moveSlot(index, direction)}
                  onDuplicate={() => duplicateSlot(index)}
                  onDelete={() => { void deleteSlot(index) }}
                  onToggleHidden={() => toggleSlotHidden(index)}
                  onDragStart={() => setDraggingSlotId(id)}
                  onDrop={() => dropSlot(index)}
                />
              )
            })}
            <button
              type="button"
              onClick={addSlot}
              disabled={slots.length >= 20}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-amber-300 transition-[background-color,scale] duration-150 hover:bg-amber-500/10 active:scale-[0.96] disabled:text-gray-600"
            >
              <Plus size={15} /> {t('addSlot', { count: slots.length })}
            </button>
          </div>

          {activeSlot && (
            <SlotEditor
              key={`${getSlotWorkspaceId(activeSlot)}-${editorRevision}`}
              slot={activeSlot}
              partyNumber={partyNumber}
              autoRegearEnabled={autoRegearEnabled}
              isBombSquadParty={isBombSquadParty}
              eventCategory={eventCategory}
              timezone={timezone}
              presentation="workspace"
              workspaceMobileOpen={mobileEditorOpen}
              onWorkspaceClose={() => setMobileEditorOpen(false)}
              onPrevious={() => {
                const previous = slots[activeIndex - 1]
                if (previous) activate(previous)
              }}
              onNext={() => {
                const next = slots[activeIndex + 1]
                if (next) activate(next)
              }}
              canGoPrevious={activeIndex > 0}
              canGoNext={activeIndex < slots.length - 1}
              onDuplicate={() => duplicateSlot(activeIndex)}
              onCheckpoint={createCheckpoint}
              onChange={updateActiveSlot}
              onDelete={() => deleteSlot(activeIndex)}
            />
          )}
        </div>
      )}

      {batchItemsOpen && (
        <BatchApplyItemsModal
          slots={slots}
          selectedSlotIds={validSelectedSlotIds}
          onApply={(picks: BatchItemPicks, scope: BatchApplyScope) => {
            commit(applyBatchItems(slots, picks, scope, validSelectedSlotIds), t('undoBatchItemsApplied'))
          }}
          onClose={() => setBatchItemsOpen(false)}
        />
      )}
      {batchSpecsOpen && (
        <BatchApplySpecsModal
          slots={slots}
          selectedSlotIds={validSelectedSlotIds}
          onApply={(scope: BatchSpecsScope, specs: Partial<Record<SlotKey, GearSpec>>) => {
            commit(applyBatchSpecs(slots, specs, scope, validSelectedSlotIds), t('undoBatchSpecsApplied'))
          }}
          onClose={() => setBatchSpecsOpen(false)}
        />
      )}
    </div>
  )
}

function ToolbarButton({
  onClick,
  active = false,
  children,
}: {
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
        active ? 'bg-sky-500/15 text-sky-200' : 'text-gray-300 hover:bg-gray-800 hover:text-amber-300'
      }`}
    >
      {children}
    </button>
  )
}
