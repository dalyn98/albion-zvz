'use client'

// 슬롯 편집 모달의 메인 컴포넌트.
// 한 슬롯 안 8개 부위 (weapon/armor/...) 의 GearSection 들을 컴포지션 하고,
// 부수적인 옵션 (자동 리기어 제외, 솔로밤, 6부위 일괄 플랫, 조건부 옵션) 을 묶는다.
//
// 컴포지션 구조:
//  - slot-input.ts        — 타입 (SlotInput, GearMode) + 순수 헬퍼 (emptySlotInput, deriveGearMode)
//  - GearSection.tsx      — 종류별 single/multi/free + Tier/Enchant + GearOptionPicker
//  - ConditionalOptionsSection.tsx — 무기 → 의존 종류 후보 좁히기 (Migration 139)

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, Trash2, X } from 'lucide-react'
import SaveSlotAsTemplateButton from './SaveSlotAsTemplateButton'
import LoadSlotTemplateButton from './LoadSlotTemplateButton'
import RecentBuildsDropdown from './RecentBuildsDropdown'
import BuildPreview, { buildDisplaySlot } from './BuildPreview'
import GearPreview from './GearPreview'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { saveRecentBuild } from '@/lib/recent-builds'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import type {
  EventCategory,
  GearSpec,
  SlotKey,
} from '@/types'
import {
  SLOT_KEYS,
  SLOT_ROLES,
  T8_ONLY_SLOT_KEYS,
  GEAR_FLAT_MIN,
  GEAR_FLAT_MAX,
  flatToSpec,
  specToFlat,
  getRoleStyle,
  isFreeItem,
} from '@/types'
// `SlotInput` 등 도메인 타입과 헬퍼는 별도 모듈에 분리. 외부에서는 종전대로
// `@/components/SlotEditor` 에서 import 할 수 있도록 여기서 re-export.
import {
  type GearMode,
  type SlotInput,
  deriveGearMode,
  emptySlotInput,
  freeSlotItem,
  MAX_GEAR_OPTIONS,
} from './SlotEditor/slot-input'
import { GearSection } from './SlotEditor/GearSection'
import { ConditionalOptionsSection } from './SlotEditor/ConditionalOptionsSection'
import { useBodyScrollLock } from './useBodyScrollLock'
import { countConfiguredSlotKinds, slotWorkspaceEditorMaxHeight } from '@/lib/slot-workspace'

// 도메인 모델 / 헬퍼 re-export (기존 import path 호환).
export { emptySlotInput, deriveGearMode, freeSlotItem }
export type { SlotInput, GearMode }

interface Props {
  slot: SlotInput
  partyNumber: number
  // 전역 auto_regear_enabled 가 ON 일 때만 true. 편집 모달에 "자동 리기어
  // 제외" 체크박스 노출 여부를 결정하며, OFF 일 땐 슬롯에 이미 저장된 값이
  // 있어도 UI 로 건드릴 수 없게 감춘다.
  autoRegearEnabled: boolean
  // 부모 파티가 밤스쿼드일 때만 솔로밤 토글을 노출. 비-밤스쿼드 파티에서는
  // is_solo_bomb 이 항상 false 여야 하며 (DB 트리거가 강제), UI 에서도 토글
  // 자체를 감춰 잘못된 입력을 차단.
  isBombSquadParty?: boolean
  // 편집 중인 이벤트의 카테고리. 전달되면 Save/Load 템플릿 다이얼로그에서
  // 카테고리 기본값/필터로 사용한다. 관리자 템플릿 페이지처럼 이벤트 컨텍스트가
  // 없는 곳에서는 생략 가능.
  eventCategory?: EventCategory
  timezone?: string
  onChange: (updated: SlotInput) => void
  onDelete: () => boolean | void | Promise<boolean | void>
  presentation?: 'modal' | 'workspace'
  workspaceInline?: boolean
  workspaceMobileOpen?: boolean
  onWorkspaceClose?: () => void
  onPrevious?: () => void
  onNext?: () => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  onDuplicate?: () => void
  onCheckpoint?: (label: string) => void
  // 단일 슬롯 편집 모드. 이 prop 이 주어지면:
  // - 접힌 요약 행은 렌더하지 않고 곧바로 편집 모달만 띄운다
  // - "완료" 버튼이 onSave 를 호출하는 저장 버튼으로 치환된다
  // - 삭제 버튼은 숨겨진다 (슬롯 번호/파티 구조는 부모 파티 에디터의 책임)
  // - 모달 dismiss (X/ESC/backdrop) 시 onClose 가 호출되어 부모가 unmount 한다
  standaloneMode?: {
    onSave: () => Promise<boolean>
    onClose: () => void | Promise<void>
    saveLabel: string
    savingLabel: string
  }
}

interface FloatingWorkspaceEditorFrame {
  height: number
  left: number
  width: number
}

export default function SlotEditor({
  slot,
  partyNumber,
  autoRegearEnabled,
  isBombSquadParty = false,
  eventCategory,
  timezone = DEFAULT_TENANT_TIMEZONE,
  onChange,
  onDelete,
  presentation = 'modal',
  workspaceInline = false,
  workspaceMobileOpen = false,
  onWorkspaceClose,
  onPrevious,
  onNext,
  canGoPrevious = false,
  canGoNext = false,
  onDuplicate,
  onCheckpoint,
  standaloneMode,
}: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const isWorkspace = presentation === 'workspace'
  const hasWorkspaceOverlay = isWorkspace && Boolean(onWorkspaceClose)
  const [open, setOpen] = useState(standaloneMode ? true : false)
  const [saving, setSaving] = useState(false)
  const [activeGearKey, setActiveGearKey] = useState<SlotKey>('weapon')
  const [floatingWorkspaceEditor, setFloatingWorkspaceEditor] =
    useState<FloatingWorkspaceEditorFrame | null>(null)
  const workspaceEditorAnchorRef = useRef<HTMLDivElement>(null)
  const workspaceEditorRef = useRef<HTMLDivElement>(null)
  const mobileOverlayOpen = hasWorkspaceOverlay
    ? !workspaceInline && workspaceMobileOpen
    : open
  const activeFloatingWorkspaceEditor = hasWorkspaceOverlay && workspaceInline
    ? floatingWorkspaceEditor
    : null
  useBodyScrollLock(mobileOverlayOpen)

  useEffect(() => {
    if (!mobileOverlayOpen) return
    const appFrame = document.getElementById('app-main-content')
    if (!appFrame) return
    const previousZIndex = appFrame.style.zIndex
    appFrame.style.zIndex = '60'
    return () => {
      appFrame.style.zIndex = previousZIndex
    }
  }, [mobileOverlayOpen])

  const closeModal = useCallback(() => {
    if (isWorkspace) {
      onWorkspaceClose?.()
      return
    }
    if (standaloneMode) {
      void standaloneMode.onClose()
    } else {
      setOpen(false)
    }
  }, [isWorkspace, onWorkspaceClose, standaloneMode])

  // Per-slot mode stored locally: 'multi' with an empty options list is a
  // legitimate in-progress state, so we can't derive mode from slot data on
  // every render — that would snap the user back to 'single' before they can
  // add options. We only force-sync when the slot prop unambiguously signals
  // a mode (options present, free marker set, or a specific item picked).
  const [modes, setModes] = useState<Record<SlotKey, GearMode>>(() =>
    SLOT_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: deriveGearMode(slot, k) }),
      {} as Record<SlotKey, GearMode>,
    ),
  )
  const selectGear = (key: SlotKey) => {
    setActiveGearKey(key)
    requestAnimationFrame(() => {
      workspaceEditorRef.current
        ?.querySelector(`[data-gear-section="${key}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  useEffect(() => {
    // slot 변화 → 각 부위 gear mode (single/options/spec) 재파생. 도메인 invariant 자동화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModes((prev) => {
      const next = { ...prev }
      let changed = false
      for (const k of SLOT_KEYS) {
        const derived = deriveGearMode(slot, k)
        if (derived !== 'single') {
          if (next[k] !== derived) {
            next[k] = derived
            changed = true
          }
          continue
        }
        if (slot.items[k].id && next[k] !== 'single') {
          next[k] = 'single'
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [slot])

  useEffect(() => {
    if (!mobileOverlayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOverlayOpen, closeModal])

  useEffect(() => {
    if (!isWorkspace) return
    const editor = workspaceEditorRef.current
    if (!editor) return
    const saveBar = document.querySelector<HTMLElement>('[data-event-edit-save-bar]')
    let animationFrame = 0

    const updateMaxHeight = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        const editorBox = editor.getBoundingClientRect()
        if (editorBox.width === 0) return
        const saveBarTop = saveBar?.getBoundingClientRect().top
        const maxHeight = slotWorkspaceEditorMaxHeight({
          viewportHeight: window.innerHeight,
          editorTop: editorBox.top,
          saveBarTop,
        })
        editor.style.setProperty('--slot-workspace-max-height', `${maxHeight}px`)
      })
    }

    updateMaxHeight()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateMaxHeight)
    observer?.observe(editor)
    if (saveBar) observer?.observe(saveBar)
    window.addEventListener('resize', updateMaxHeight)
    window.addEventListener('scroll', updateMaxHeight, { passive: true })
    return () => {
      cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', updateMaxHeight)
      window.removeEventListener('scroll', updateMaxHeight)
    }
  }, [activeFloatingWorkspaceEditor, isWorkspace])

  // A sticky child is constrained by the bottom of its grid area, so the tall
  // editor gets pushed above the viewport near slot 20. Once its anchor reaches
  // the desktop inset, float the editor using the anchor column's exact frame;
  // the reserved anchor height keeps the surrounding party layout stable.
  useEffect(() => {
    if (!hasWorkspaceOverlay || !workspaceInline) return
    const anchor = workspaceEditorAnchorRef.current
    const editor = workspaceEditorRef.current
    const workspace = anchor?.closest<HTMLElement>('[data-slot-workspace]')
    if (!anchor || !editor || !workspace) return
    let animationFrame = 0

    const updateFloatingFrame = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        const anchorBox = anchor.getBoundingClientRect()
        const editorBox = editor.getBoundingClientRect()
        const workspaceBox = workspace.getBoundingClientRect()
        const shouldFloat = anchorBox.top < 80 && workspaceBox.bottom > 80
        const next = shouldFloat
          ? {
              height: Math.round(editorBox.height),
              left: Math.round(anchorBox.left),
              width: Math.round(anchorBox.width),
            }
          : null
        setFloatingWorkspaceEditor((current) => (
          current?.height === next?.height &&
          current?.left === next?.left &&
          current?.width === next?.width
            ? current
            : next
        ))
      })
    }

    updateFloatingFrame()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateFloatingFrame)
    observer?.observe(anchor)
    observer?.observe(editor)
    observer?.observe(workspace)
    window.addEventListener('resize', updateFloatingFrame)
    window.addEventListener('scroll', updateFloatingFrame, { passive: true })
    return () => {
      cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', updateFloatingFrame)
      window.removeEventListener('scroll', updateFloatingFrame)
    }
  }, [hasWorkspaceOverlay, workspaceInline])

  const updateItem = (key: SlotKey, name: string, id: string) => {
    const idChanged = slot.items[key]?.id !== id
    onChange({
      ...slot,
      items: { ...slot.items, [key]: { name, id } },
      spells: idChanged ? { ...slot.spells, [key]: [] } : slot.spells,
    })
  }

  const clearItem = (key: SlotKey) => {
    onChange({ ...slot, items: { ...slot.items, [key]: { name: '', id: '' } } })
  }

  const setSpec = (key: SlotKey, patch: Partial<GearSpec>) => {
    const current = slot.specs[key] ?? {}
    const next: GearSpec = { ...current, ...patch }
    // Drop keys set back to undefined/null so the stored shape stays minimal.
    if (next.tier == null) delete next.tier
    if (next.enchant == null) delete next.enchant
    onChange({ ...slot, specs: { ...slot.specs, [key]: next } })
  }

  // 한 슬롯 안 spec-있는 장비(`T8_ONLY_SLOT_KEYS`: weapon/offhand/head/armor/shoes/cape) 6개에
  // 같은 플랫을 한 번에 적용. 음식/포션은 인챈트 단독, 탈것은 spec 자체 없음 — 모두 제외.
  // flat=null 이면 전체 클리어. 호출 한 번으로 specs 객체를 통째 갱신해 React 리렌더 1회만 발생.
  const setAllGearFlat = (flat: number | null) => {
    onCheckpoint?.(t('undoFlatApplied'))
    const nextSpecs: Record<SlotKey, GearSpec> = { ...slot.specs }
    for (const key of T8_ONLY_SLOT_KEYS) {
      nextSpecs[key] = flat == null ? {} : flatToSpec(flat)
    }
    onChange({ ...slot, specs: nextSpecs })
  }

  // 6개 장비가 같은 플랫을 공유하는지 검사 — 공통값이면 그 값을, 섞여 있으면 null.
  // dropdown 의 "현재값" 표시에 쓰인다 (mixed 면 빈 옵션 = "Any").
  const commonGearFlat = (() => {
    let shared: number | null = null
    for (const key of T8_ONLY_SLOT_KEYS) {
      const f = specToFlat(slot.specs[key] ?? {})
      if (f == null) return null
      if (shared == null) shared = f
      else if (shared !== f) return null
    }
    return shared
  })()

  const addSpell = (key: SlotKey, spellId: string) => {
    const current = slot.spells[key] ?? []
    if (current.includes(spellId)) return
    onChange({ ...slot, spells: { ...slot.spells, [key]: [...current, spellId] } })
  }

  const removeSpell = (key: SlotKey, spellId: string) => {
    const current = slot.spells[key] ?? []
    onChange({ ...slot, spells: { ...slot.spells, [key]: current.filter((s) => s !== spellId) } })
  }

  const setGearMode = (key: SlotKey, mode: GearMode) => {
    if (modes[key] === mode) return
    onCheckpoint?.(t('undoModeChanged'))
    setModes((prev) => ({ ...prev, [key]: mode }))
    const emptyItem = { name: '', id: '' }
    if (mode === 'free') {
      onChange({
        ...slot,
        items: { ...slot.items, [key]: freeSlotItem() },
        options: { ...slot.options, [key]: [] },
      })
    } else {
      onChange({
        ...slot,
        items: { ...slot.items, [key]: emptyItem },
        options: { ...slot.options, [key]: [] },
      })
    }
  }

  const addOption = (key: SlotKey, name: string, id: string) => {
    if (!id) return
    const current = slot.options[key]
    if (current.some((o) => o.id === id)) return
    if (current.length >= MAX_GEAR_OPTIONS) return
    onChange({
      ...slot,
      options: { ...slot.options, [key]: [...current, { name, id }] },
    })
  }

  const removeOption = (key: SlotKey, id: string) => {
    onChange({
      ...slot,
      options: { ...slot.options, [key]: slot.options[key].filter((o) => o.id !== id) },
    })
  }

  const addOptionSpell = (key: SlotKey, optId: string, spellId: string) => {
    onChange({
      ...slot,
      options: {
        ...slot.options,
        [key]: slot.options[key].map((o) => {
          if (o.id !== optId) return o
          const existing = o.spells ?? []
          if (existing.includes(spellId)) return o
          return { ...o, spells: [...existing, spellId] }
        }),
      },
    })
  }

  const removeOptionSpell = (key: SlotKey, optId: string, spellId: string) => {
    onChange({
      ...slot,
      options: {
        ...slot.options,
        [key]: slot.options[key].map((o) => {
          if (o.id !== optId) return o
          const filtered = (o.spells ?? []).filter((s) => s !== spellId)
          return { ...o, spells: filtered }
        }),
      },
    })
  }

  // Both picked items (have id), "free" markers (name=자유, no id), and
  // a non-empty options list all count as configured.
  const filledCount = countConfiguredSlotKinds(slot)
  const roleStyle = getRoleStyle(slot.role_name)
  const collapsedDisplaySlot = useMemo(() => buildDisplaySlot(slot), [slot])
  const weaponOptions = slot.options.weapon
  const weaponName = weaponOptions.length > 0
    ? `${weaponOptions[0].name}${weaponOptions.length > 1 ? ` +${weaponOptions.length - 1}` : ''}`
    : isFreeItem(slot.items.weapon.name, slot.items.weapon.id)
      ? t('itemFree')
      : slot.items.weapon.name
  const compactKeys = SLOT_KEYS.filter((key) => key !== 'weapon').slice(0, 5)

  return (
    <>
      {!standaloneMode && !isWorkspace && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
            <GearPreview slot={collapsedDisplaySlot} kind="weapon" size={36} isTaken={false} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 text-xs flex-shrink-0">
                  {t('slotBreadcrumb', { party: partyNumber, slot: slot.slot_number })}
                </span>
                {slot.role_name ? (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded truncate ${
                      roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {translateSlotRole(slot.role_name, tRole)}
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs italic">{t('roleNone')}</span>
                )}
              </span>
              <span className={weaponName ? 'block text-white text-sm font-semibold truncate mt-0.5' : 'block text-gray-600 text-xs italic mt-0.5'}>
                {weaponName || t('slotBuildEmpty')}
              </span>
            </span>
            <span className="hidden md:flex items-center gap-1 flex-shrink-0">
              {compactKeys.map((key) => (
                <GearPreview key={key} slot={collapsedDisplaySlot} kind={key} size={26} isTaken={false} />
              ))}
            </span>
            <span className="text-gray-600 text-xs flex-shrink-0">{filledCount}/8</span>
            {slot.assigned_username && (
              <span className="text-green-400 text-xs flex-shrink-0">✓ {slot.assigned_username}</span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="p-1 text-gray-400 hover:text-amber-400 transition-colors"
              aria-label={tCommon('edit')}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-gray-600 hover:text-red-400 transition-colors"
              aria-label={tCommon('delete')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {(open || isWorkspace) && (
        <div
          ref={workspaceEditorAnchorRef}
          data-slot-workspace-editor-anchor={isWorkspace ? '' : undefined}
          style={activeFloatingWorkspaceEditor
            ? { minHeight: activeFloatingWorkspaceEditor.height }
            : undefined}
          className={hasWorkspaceOverlay
            ? workspaceInline
              ? 'block min-w-0'
              : `${workspaceMobileOpen ? 'fixed flex' : 'hidden'} inset-0 z-50 items-end justify-center bg-black/70`
            : isWorkspace
              ? 'block'
              : 'fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6'}
          onClick={isWorkspace ? undefined : closeModal}
        >
          <div
            ref={workspaceEditorRef}
            role="dialog"
            aria-modal={isWorkspace ? !workspaceInline && workspaceMobileOpen : true}
            aria-labelledby="slot-editor-modal-title"
            data-slot-workspace-editor={isWorkspace ? '' : undefined}
            data-desktop-min-width={hasWorkspaceOverlay ? 720 : undefined}
            style={isWorkspace
              ? {
                '--slot-workspace-max-height': 'calc(100dvh - 7rem - var(--event-save-bar-height, 0px))',
                ...(activeFloatingWorkspaceEditor
                  ? {
                      left: activeFloatingWorkspaceEditor.left,
                      width: activeFloatingWorkspaceEditor.width,
                    }
                  : {}),
              } as CSSProperties
              : undefined}
            className={hasWorkspaceOverlay
              ? workspaceInline
                ? `${activeFloatingWorkspaceEditor ? 'fixed top-20 z-10' : 'relative'} flex w-full flex-col overflow-hidden rounded-2xl bg-gray-900 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_18px_50px_rgba(0,0,0,0.26)] max-h-[var(--slot-workspace-max-height)]`
                : 'flex h-full max-h-[100dvh] w-full flex-col bg-gray-900 shadow-2xl shadow-black/40'
              : isWorkspace
                ? 'flex h-full max-h-[100dvh] w-full flex-col bg-gray-900 shadow-2xl shadow-black/40 lg:sticky lg:top-20 lg:h-auto lg:max-h-[var(--slot-workspace-max-height)] lg:rounded-2xl lg:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
                : 'bg-gray-900 border border-gray-700 w-full sm:max-w-2xl lg:max-w-5xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div className="flex min-w-0 items-center gap-2">
                {isWorkspace && (
                  <button
                    type="button"
                    onClick={onPrevious}
                    disabled={!canGoPrevious}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96] disabled:opacity-25"
                    aria-label={t('previousSlot')}
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <h3 id="slot-editor-modal-title" className="font-bold text-white text-base">
                  {t('slotTitle', { party: partyNumber, slot: slot.slot_number })}
                </h3>
                {slot.role_name && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {translateSlotRole(slot.role_name, tRole)}
                  </span>
                )}
                {isWorkspace && (
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!canGoNext}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96] disabled:opacity-25"
                    aria-label={t('nextSlot')}
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isWorkspace && onDuplicate && (
                  <button
                    type="button"
                    onClick={onDuplicate}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-amber-300 active:scale-[0.96]"
                    aria-label={t('duplicateSlot')}
                  >
                    <Copy size={17} />
                  </button>
                )}
                {(!isWorkspace || (onWorkspaceClose && !workspaceInline)) && (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96]"
                    aria-label={tCommon('close')}
                    data-slot-workspace-close={isWorkspace ? '' : undefined}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <div className="flex items-center flex-wrap gap-2">
                <SaveSlotAsTemplateButton
                  slot={slot}
                  defaultName={slot.role_name ? t('buildName', { role: translateSlotRole(slot.role_name, tRole) }) : ''}
                  timezone={timezone}
                  defaultCategory={eventCategory}
                />
                <LoadSlotTemplateButton
                  slot={slot}
                  onLoad={(next) => {
                    onCheckpoint?.(t('undoTemplateApplied'))
                    onChange(next)
                  }}
                  timezone={timezone}
                  defaultCategoryFilter={eventCategory}
                />
                <RecentBuildsDropdown
                  slot={slot}
                  onLoad={(next) => {
                    onCheckpoint?.(t('undoTemplateApplied'))
                    onChange(next)
                  }}
                />
              </div>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">{t('roleLabel')}</label>
                <select
                  value={slot.role_name}
                  onChange={(e) => onChange({ ...slot, role_name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">{t('noRoleOption')}</option>
                  {SLOT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {translateSlotRole(r, tRole)}
                    </option>
                  ))}
                </select>
              </div>

              <BuildPreview
                slot={slot}
                activeGearKey={activeGearKey}
                onEditGear={selectGear}
              />

              <div className="flex items-center gap-2 flex-wrap rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
                <span className="text-amber-400 text-[11px] font-semibold">
                  {t('slotAllGearFlatLabel')}
                </span>
                <select
                  value={commonGearFlat ?? ''}
                  onChange={(e) =>
                    setAllGearFlat(e.target.value ? Number(e.target.value) : null)
                  }
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                  aria-label={t('slotAllGearFlatLabel')}
                >
                  <option value="">{t('slotAllGearFlatAny')}</option>
                  {Array.from(
                    { length: GEAR_FLAT_MAX - GEAR_FLAT_MIN + 1 },
                    (_, i) => GEAR_FLAT_MIN + i,
                  ).map((flat) => (
                    <option key={flat} value={flat}>
                      {flat}F
                    </option>
                  ))}
                </select>
                <span className="text-gray-500 text-[10px]">
                  {t('slotAllGearFlatHint')}
                </span>
              </div>

              <GearSection
                key={activeGearKey}
                slotKey={activeGearKey}
                mode={modes[activeGearKey]}
                onModeChange={(mode) => setGearMode(activeGearKey, mode)}
                singleName={slot.items[activeGearKey].name || null}
                singleId={slot.items[activeGearKey].id || null}
                onSingleChange={(name, id) => updateItem(activeGearKey, name, id)}
                onSingleClear={() => clearItem(activeGearKey)}
                options={slot.options[activeGearKey]}
                onAddOption={(name, id) => addOption(activeGearKey, name, id)}
                onRemoveOption={(id) => removeOption(activeGearKey, id)}
                spells={slot.spells[activeGearKey] ?? []}
                onAddSpell={(id) => addSpell(activeGearKey, id)}
                onRemoveSpell={(id) => removeSpell(activeGearKey, id)}
                onAddOptionSpell={(optionId, spellId) =>
                  addOptionSpell(activeGearKey, optionId, spellId)}
                onRemoveOptionSpell={(optionId, spellId) =>
                  removeOptionSpell(activeGearKey, optionId, spellId)}
                spec={slot.specs[activeGearKey] ?? {}}
                onSpecChange={(patch) => setSpec(activeGearKey, patch)}
              />

              <details className="group rounded-2xl border border-gray-800 bg-gray-950/35">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-gray-900/70 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">
                      {t('slotSettingsTitle')}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {t('slotSettingsHint')}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    className="flex-shrink-0 text-gray-500 transition-transform duration-150 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-3 border-t border-gray-800 p-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-gray-400">
                      {t('notesLabel')}
                    </label>
                    <textarea
                      value={slot.notes}
                      onChange={(event) => onChange({ ...slot, notes: event.target.value })}
                      placeholder={t('notesPlaceholder')}
                      rows={3}
                      data-slot-workspace-notes={isWorkspace ? '' : undefined}
                      className="w-full resize-y rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-base text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {autoRegearEnabled && (
                    <label className="flex min-h-14 cursor-pointer select-none items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={slot.auto_regear_excluded}
                        onChange={(event) =>
                          onChange({ ...slot, auto_regear_excluded: event.target.checked })
                        }
                        className="mt-0.5 h-5 w-5 flex-shrink-0 accent-amber-500"
                      />
                      <span>
                        <span className="text-xs font-semibold text-white">
                          {t('autoRegearExcludeLabel')}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
                          {t('autoRegearExcludeHint')}
                        </span>
                      </span>
                    </label>
                  )}

                  <label className="flex min-h-14 cursor-pointer select-none items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={slot.manual_regear_excluded}
                      onChange={(event) =>
                        onChange({ ...slot, manual_regear_excluded: event.target.checked })
                      }
                      className="mt-0.5 h-5 w-5 flex-shrink-0 accent-amber-500"
                    />
                    <span>
                      <span className="text-xs font-semibold text-white">
                        {t('manualRegearExcludeLabel')}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
                        {t('manualRegearExcludeHint')}
                      </span>
                    </span>
                  </label>

                  {isBombSquadParty && (
                    <label className="flex min-h-14 cursor-pointer select-none items-start gap-3 rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={slot.is_solo_bomb}
                        onChange={(event) =>
                          onChange({ ...slot, is_solo_bomb: event.target.checked })
                        }
                        className="mt-0.5 h-5 w-5 flex-shrink-0 accent-rose-500"
                      />
                      <span>
                        <span className="text-xs font-semibold text-rose-300">
                          {t('soloBomb.label')}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
                          {t('soloBomb.hint')}
                        </span>
                      </span>
                    </label>
                  )}

                  <ConditionalOptionsSection
                    weaponOptions={slot.options.weapon}
                    dependentOptions={slot.options}
                    conditional={slot.conditional_options ?? {}}
                    onChange={(next) => onChange({ ...slot, conditional_options: next })}
                  />
                </div>
              </details>
            </div>

            <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
              {!standaloneMode && (
                <button
                  type="button"
                  onClick={async () => {
                    const deleted = await onDelete()
                    if (deleted === false) return
                    if (isWorkspace) onWorkspaceClose?.()
                    else setOpen(false)
                  }}
                  className="flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition-[background-color,color,scale] duration-150 hover:bg-red-500/10 hover:text-red-300 active:scale-[0.96]"
                >
                  <Trash2 size={13} /> {t('deleteSlot')}
                </button>
              )}
              {isWorkspace && (
                <p className={`ml-auto text-xs text-gray-500 text-pretty ${workspaceInline ? 'block' : 'hidden'}`}>
                  {t('workspaceDraftHint')}
                </p>
              )}
              {(!isWorkspace || (onWorkspaceClose && !workspaceInline)) && <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  try {
                    if (standaloneMode) {
                      setSaving(true)
                      const ok = await standaloneMode.onSave()
                      if (ok) void standaloneMode.onClose()
                      return
                    }
                    // Auto-stash the current build in browser-local recents so
                    // the admin can re-apply it without retyping. saveRecentBuild
                    // no-ops when the weapon slot is empty.
                    saveRecentBuild(slotInputToTemplateData(slot))
                    if (isWorkspace) onWorkspaceClose?.()
                    else setOpen(false)
                  } finally {
                    setSaving(false)
                  }
                }}
                className="ml-auto min-h-11 rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-black transition-[background-color,scale] duration-150 hover:bg-amber-400 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
                data-slot-workspace-close={isWorkspace ? '' : undefined}
              >
                {standaloneMode
                  ? (saving ? standaloneMode.savingLabel : standaloneMode.saveLabel)
                  : isWorkspace
                    ? tCommon('close')
                    : t('done')}
              </button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
