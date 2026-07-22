'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  Beaker,
  CheckSquare2,
  Copy,
  Eye,
  EyeOff,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
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
  batchScopeTelemetryValue,
  cloneSlotInput,
  deleteSelectedSlots,
  deleteSlotAt,
  dragAutoScrollDelta,
  duplicateSelectedSlots,
  duplicateSlotAt,
  getSlotWorkspaceId,
  moveSlotAt,
  moveSlotByDrop,
  resolveUndoAfterSlotEdit,
  setSelectedSlotsHidden,
  type BatchApplyScope,
  type BatchItemPicks,
  type SlotDropEdge,
} from '@/lib/slot-workspace'
import type { GearSpec, SlotKey } from '@/types'
import { applyTemplateToSlotInput, slotInputToTemplateData } from '@/lib/slot-template-shape'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'

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

interface DragTarget {
  slotId: string
  edge: SlotDropEdge
}

type TemplateApplyScope = 'active' | 'selected'

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
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const [undoReceipt, setUndoReceipt] = useState<UndoReceipt | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [templateApplyScope, setTemplateApplyScope] = useState<TemplateApplyScope>('active')
  const [editorRevision, setEditorRevision] = useState(0)
  const checkpointPendingRef = useRef(false)
  const dragCompletedRef = useRef(false)

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
  const selectedSlots = useMemo(() => {
    const selected = new Set(validSelectedSlotIds)
    return slots.filter((slot) => selected.has(getSlotWorkspaceId(slot)))
  }, [slots, validSelectedSlotIds])
  const selectedAnyVisible = selectedSlots.some((slot) => !slot.is_hidden)

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
    checkpointPendingRef.current = true
    setUndoReceipt({ label, slots: slots.map(cloneSlotInput) })
  }

  const commit = (next: SlotInput[], label: string) => {
    checkpointPendingRef.current = false
    createCheckpoint(label)
    checkpointPendingRef.current = false
    onChange(next)
  }

  const showMobileEditor = (): boolean => {
    const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
    setMobileEditorOpen(mobile)
    return mobile
  }

  const activate = (slot: SlotInput) => {
    setActiveSlotId(getSlotWorkspaceId(slot))
    const mobile = showMobileEditor()
    emitUxWorkflowEvent({
      eventType: 'detail_toggle',
      metadata: {
        workflow: 'slot_workspace',
        detail: 'slot_editor',
        action: 'open',
        layout: mobile ? 'overlay' : 'split',
      },
    })
  }

  const updateActiveSlot = (updated: SlotInput) => {
    const undoResolution = resolveUndoAfterSlotEdit(
      undoReceipt,
      checkpointPendingRef.current,
    )
    checkpointPendingRef.current = undoResolution.checkpointPending
    if (undoResolution.invalidated) {
      setUndoReceipt(null)
      setAnnouncement(t('undoExpiredAfterEdit'))
    }
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
    const destination = index + direction
    if (destination < 0 || destination >= slots.length) return
    commit(moveSlotAt(slots, index, direction), t('undoMovedSlot'))
    setAnnouncement(t('slotMovedAnnouncement', { from: index + 1, to: destination + 1 }))
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: {
        workflow: 'slot_workspace',
        action: 'reorder',
        source: 'move_button',
        result: 'success',
      },
    })
  }

  const startDragging = (slotId: string) => {
    dragCompletedRef.current = false
    setDraggingSlotId(slotId)
    setDragTarget(null)
    emitUxWorkflowEvent({
      eventType: 'task_started',
      metadata: {
        workflow: 'slot_workspace',
        action: 'drag_reorder',
        source: 'drag_handle',
      },
    })
  }

  const updateDragTarget = (slotId: string, edge: SlotDropEdge, clientY: number) => {
    if (!draggingSlotId || draggingSlotId === slotId) {
      setDragTarget(null)
      return
    }
    setDragTarget((current) => current?.slotId === slotId && current.edge === edge
      ? current
      : { slotId, edge })
    if (typeof window === 'undefined') return
    const scrollDelta = dragAutoScrollDelta(clientY, window.innerHeight)
    if (scrollDelta !== 0) window.scrollBy({ top: scrollDelta, behavior: 'auto' })
  }

  const dropSlot = (targetId: string, edge: SlotDropEdge) => {
    if (!draggingSlotId) return
    const sourceId = draggingSlotId
    const sourceIndex = slots.findIndex((slot) => getSlotWorkspaceId(slot) === sourceId)
    const next = moveSlotByDrop(slots, sourceId, targetId, edge)
    const destination = next.findIndex((slot) => getSlotWorkspaceId(slot) === sourceId)
    dragCompletedRef.current = sourceIndex >= 0 && destination >= 0 && sourceIndex !== destination
    setDraggingSlotId(null)
    setDragTarget(null)
    if (!dragCompletedRef.current) return
    commit(next, t('undoMovedSlot'))
    setAnnouncement(t('slotMovedAnnouncement', { from: sourceIndex + 1, to: destination + 1 }))
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: {
        workflow: 'slot_workspace',
        action: 'drag_reorder',
        source: 'drag_handle',
        result: 'success',
      },
    })
  }

  const endDragging = () => {
    if (draggingSlotId && !dragCompletedRef.current) {
      emitUxWorkflowEvent({
        eventType: 'abandoned',
        metadata: {
          workflow: 'slot_workspace',
          action: 'drag_reorder',
          reason: 'cancelled',
        },
      })
    }
    dragCompletedRef.current = false
    setDraggingSlotId(null)
    setDragTarget(null)
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

  const toggleSelectedHidden = () => {
    if (validSelectedSlotIds.length === 0) return
    const hidden = selectedAnyVisible
    commit(
      setSelectedSlotsHidden(slots, validSelectedSlotIds, hidden),
      hidden ? t('undoHiddenSelectedSlots') : t('undoShownSelectedSlots'),
    )
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: {
        workflow: 'slot_workspace',
        action: hidden ? 'hide_selected' : 'show_selected',
        scope: 'selected',
        result: 'success',
      },
    })
  }

  const duplicateSelected = () => {
    if (validSelectedSlotIds.length === 0 || slots.length >= 20) return
    const createdIds: string[] = []
    const next = duplicateSelectedSlots(slots, validSelectedSlotIds, () => {
      const id = crypto.randomUUID()
      createdIds.push(id)
      return id
    })
    if (createdIds.length === 0) return
    commit(next, t('undoDuplicatedSelectedSlots'))
    setSelectedSlotIds(createdIds)
    setActiveSlotId(createdIds[0])
    setAnnouncement(t('selectedDuplicatedAnnouncement', { count: createdIds.length }))
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: {
        workflow: 'slot_workspace',
        action: 'duplicate_selected',
        scope: 'selected',
        result: 'success',
      },
    })
  }

  const deleteSelected = async () => {
    if (validSelectedSlotIds.length === 0) return
    const assignedCount = selectedSlots.filter((slot) => slot.assigned_username).length
    const accepted = await confirm({
      title: t('deleteSelectedTitle'),
      body: t('deleteSelectedBody', {
        count: validSelectedSlotIds.length,
        assigned: assignedCount,
      }),
      confirmLabel: t('deleteSelected'),
      cancelLabel: tCommon('cancel'),
      destructive: true,
    })
    if (!accepted) return
    const deletedIds = new Set(validSelectedSlotIds)
    const next = deleteSelectedSlots(slots, validSelectedSlotIds)
    commit(next, t('undoDeletedSelectedSlots'))
    setSelectedSlotIds([])
    if (activeSlotId && deletedIds.has(activeSlotId)) {
      const fallback = next[0] ?? null
      setActiveSlotId(fallback ? getSlotWorkspaceId(fallback) : null)
      if (!fallback) setMobileEditorOpen(false)
    }
    setAnnouncement(t('selectedDeletedAnnouncement', { count: validSelectedSlotIds.length }))
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: {
        workflow: 'slot_workspace',
        action: 'delete_selected',
        scope: 'selected',
        result: 'success',
      },
    })
  }

  const undo = () => {
    if (!undoReceipt) return
    const next = undoReceipt.slots.map(cloneSlotInput)
    onChange(next)
    if (activeSlotId && !next.some((slot) => getSlotWorkspaceId(slot) === activeSlotId)) {
      setActiveSlotId(next[0] ? getSlotWorkspaceId(next[0]) : null)
    }
    setEditorRevision((revision) => revision + 1)
    checkpointPendingRef.current = false
    setUndoReceipt(null)
    setAnnouncement(t('undoCompletedAnnouncement'))
    emitUxWorkflowEvent({
      eventType: 'undone',
      metadata: {
        workflow: 'slot_workspace',
        action: 'undo',
        result: 'success',
      },
    })
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
    <div
      className="space-y-3"
      onKeyDown={handleKeyDown}
      data-slot-workspace
      data-party-number={partyNumber}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-slot-workspace-announcement>
        {announcement}
      </p>
      <p id={`slot-drag-hint-${partyNumber}`} className="sr-only">
        {t('dragSlotHint')}
      </p>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-900/65 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        aria-label={t('workspaceToolbarAria')}
      >
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
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {showTemplatePalette && validSelectedSlotIds.length === 0 && (
            <ToolbarButton
              onClick={() => {
                setTemplateApplyScope('active')
                setPaletteOpen((open) => !open)
              }}
              active={paletteOpen && templateApplyScope === 'active'}
            >
              <Sparkles size={14} /> {t('templatePaletteTitle')}
            </ToolbarButton>
          )}
          {showVisibility && slots.length > 0 && (
            <ToolbarButton onClick={toggleAllHidden}>
              {anyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              {anyVisible ? t('hideAllButton') : t('showAllButton')}
            </ToolbarButton>
          )}
          {slots.length > 0 && validSelectedSlotIds.length === 0 && (
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

      {validSelectedSlotIds.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl bg-sky-500/[0.08] p-2 shadow-[0_0_0_1px_rgba(56,189,248,0.28)] sm:flex-row sm:items-center sm:justify-between"
          aria-label={t('selectedActionsAria', { count: validSelectedSlotIds.length })}
          data-slot-selection-toolbar
        >
          <div className="flex min-h-10 items-center gap-2 px-1">
            <CheckSquare2 size={16} className="text-sky-300" aria-hidden="true" />
            <span className="text-xs font-bold text-sky-100 tabular-nums">
              {t('selectedCount', { count: validSelectedSlotIds.length })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedSlotIds([])}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96]"
            >
              <X size={14} /> {t('clearSelection')}
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 sm:justify-end sm:pb-0">
            {showTemplatePalette && (
              <ContextActionButton
                onClick={() => {
                  setTemplateApplyScope('selected')
                  setPaletteOpen(true)
                }}
                active={paletteOpen && templateApplyScope === 'selected'}
              >
                <Sparkles size={14} /> {t('applyTemplateToSelected')}
              </ContextActionButton>
            )}
            <ContextActionButton onClick={() => setBatchItemsOpen(true)}>
              <Beaker size={14} /> {t('batchItemsButton')}
            </ContextActionButton>
            <ContextActionButton onClick={() => setBatchSpecsOpen(true)}>
              <Package size={14} /> {t('batchSpecButton')}
            </ContextActionButton>
            {showVisibility && (
              <ContextActionButton onClick={toggleSelectedHidden}>
                {selectedAnyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                {selectedAnyVisible ? t('hideSelected') : t('showSelected')}
              </ContextActionButton>
            )}
            <ContextActionButton onClick={duplicateSelected} disabled={slots.length >= 20}>
              <Copy size={14} /> {t('duplicateSelected')}
            </ContextActionButton>
            <ContextActionButton onClick={() => { void deleteSelected() }} danger>
              <Trash2 size={14} /> {t('deleteSelected')}
            </ContextActionButton>
          </div>
        </div>
      )}

      {undoReceipt && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sky-500/10 px-3 py-2 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]" role="status" data-slot-workspace-undo>
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
          selectedLabel={templateApplyScope === 'selected'
            ? t('templatePaletteSelectedCount', { count: validSelectedSlotIds.length })
            : activeSlot
              ? t('slotBreadcrumb', { party: partyNumber, slot: activeSlot.slot_number })
              : null}
          defaultCategoryFilter={eventCategory}
          onApply={(next) => {
            if (!activeSlot) return
            if (templateApplyScope === 'selected' && validSelectedSlotIds.length > 0) {
              const selected = new Set(validSelectedSlotIds)
              const templateData = slotInputToTemplateData(next)
              commit(
                slots.map((slot) => selected.has(getSlotWorkspaceId(slot))
                  ? applyTemplateToSlotInput(slot, templateData)
                  : slot),
                t('undoTemplateAppliedSelected'),
              )
              emitUxWorkflowEvent({
                eventType: 'completed',
                metadata: {
                  workflow: 'slot_workspace',
                  action: 'apply_template',
                  scope: 'selected',
                  result: 'success',
                },
              })
            } else {
              commit(
                slots.map((slot, index) => index === activeIndex ? next : slot),
                t('undoTemplateApplied'),
              )
              emitUxWorkflowEvent({
                eventType: 'completed',
                metadata: {
                  workflow: 'slot_workspace',
                  action: 'apply_template',
                  scope: 'active',
                  result: 'success',
                },
              })
            }
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
            data-slot-add
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold text-amber-300 transition-[background-color,scale] duration-150 hover:bg-amber-500/10 active:scale-[0.96]"
          >
            <Plus size={15} /> {t('addSlot', { count: 0 })}
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.6fr)]">
          <div className="space-y-2" role="list" aria-label={t('slotListAria')}>
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
                  isDragging={id === draggingSlotId}
                  dropPosition={dragTarget?.slotId === id ? dragTarget.edge : null}
                  dragHintId={`slot-drag-hint-${partyNumber}`}
                  onActivate={() => activate(slot)}
                  onToggleSelected={() => toggleSelected(id)}
                  onMove={(direction) => moveSlot(index, direction)}
                  onDuplicate={() => duplicateSlot(index)}
                  onDelete={() => { void deleteSlot(index) }}
                  onToggleHidden={() => toggleSlotHidden(index)}
                  onDragStart={() => startDragging(id)}
                  onDragOver={(edge, clientY) => updateDragTarget(id, edge, clientY)}
                  onDragEnd={endDragging}
                  onDrop={(edge) => dropSlot(id, edge)}
                />
              )
            })}
            <button
              type="button"
              onClick={addSlot}
              disabled={slots.length >= 20}
              data-slot-add
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
              onWorkspaceClose={() => {
                setMobileEditorOpen(false)
                emitUxWorkflowEvent({
                  eventType: 'detail_toggle',
                  metadata: {
                    workflow: 'slot_workspace',
                    detail: 'slot_editor',
                    action: 'close',
                    layout: 'overlay',
                  },
                })
              }}
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
            emitUxWorkflowEvent({
              eventType: 'completed',
              metadata: {
                workflow: 'slot_workspace',
                action: 'batch_items',
                scope: batchScopeTelemetryValue(scope),
                result: 'success',
              },
            })
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
            emitUxWorkflowEvent({
              eventType: 'completed',
              metadata: {
                workflow: 'slot_workspace',
                action: 'batch_specs',
                scope: batchScopeTelemetryValue(scope),
                result: 'success',
              },
            })
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

function ContextActionButton({
  onClick,
  active = false,
  disabled = false,
  danger = false,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  const tone = danger
    ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
    : active
      ? 'bg-sky-500/15 text-sky-100'
      : 'text-gray-200 hover:bg-gray-800 hover:text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 ${tone}`}
    >
      {children}
    </button>
  )
}
