'use client'

// 슬롯 편집 모달의 메인 컴포넌트.
// 한 슬롯 안 8개 부위 (weapon/armor/...) 의 GearSection 들을 컴포지션 하고,
// 부수적인 옵션 (자동 리기어 제외, 솔로밤, 6부위 일괄 플랫, 조건부 옵션) 을 묶는다.
//
// 컴포지션 구조:
//  - slot-input.ts        — 타입 (SlotInput, GearMode) + 순수 헬퍼 (emptySlotInput, deriveGearMode)
//  - GearSection.tsx      — 종류별 single/multi/free + Tier/Enchant + GearOptionPicker
//  - ConditionalOptionsSection.tsx — 무기 → 의존 종류 후보 좁히기 (Migration 139)

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, X, Pencil } from 'lucide-react'
import SaveSlotAsTemplateButton from './SaveSlotAsTemplateButton'
import LoadSlotTemplateButton from './LoadSlotTemplateButton'
import RecentBuildsDropdown from './RecentBuildsDropdown'
import BuildPreview from './BuildPreview'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { saveRecentBuild } from '@/lib/recent-builds'
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
  MAX_GEAR_OPTIONS,
} from './SlotEditor/slot-input'
import { GearSection } from './SlotEditor/GearSection'
import { ConditionalOptionsSection } from './SlotEditor/ConditionalOptionsSection'

// 도메인 모델 / 헬퍼 re-export (기존 import path 호환).
export { emptySlotInput, deriveGearMode }
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
  onChange: (updated: SlotInput) => void
  onDelete: () => void
  // 단일 슬롯 편집 모드. 이 prop 이 주어지면:
  // - 접힌 요약 행은 렌더하지 않고 곧바로 편집 모달만 띄운다
  // - "완료" 버튼이 onSave 를 호출하는 저장 버튼으로 치환된다
  // - 삭제 버튼은 숨겨진다 (슬롯 번호/파티 구조는 부모 파티 에디터의 책임)
  // - 모달 dismiss (X/ESC/backdrop) 시 onClose 가 호출되어 부모가 unmount 한다
  standaloneMode?: {
    onSave: () => Promise<boolean>
    onClose: () => void
    saveLabel: string
    savingLabel: string
  }
}

export default function SlotEditor({ slot, partyNumber, autoRegearEnabled, isBombSquadParty = false, eventCategory, onChange, onDelete, standaloneMode }: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const [open, setOpen] = useState(standaloneMode ? true : false)
  const [saving, setSaving] = useState(false)

  const closeModal = useCallback(() => {
    if (standaloneMode) {
      standaloneMode.onClose()
    } else {
      setOpen(false)
    }
  }, [standaloneMode])

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
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, closeModal])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

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
    setModes((prev) => ({ ...prev, [key]: mode }))
    const emptyItem = { name: '', id: '' }
    if (mode === 'free') {
      onChange({
        ...slot,
        items: { ...slot.items, [key]: { name: t('itemFree'), id: '' } },
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
  const filledCount = SLOT_KEYS.filter((k) => {
    if (slot.options[k].length > 0) return true
    return slot.items[k].id || isFreeItem(slot.items[k].name, slot.items[k].id)
  }).length
  const roleStyle = getRoleStyle(slot.role_name)

  return (
    <>
      {!standaloneMode && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
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
            <span className="text-gray-600 text-xs ml-auto flex-shrink-0">
              {filledCount}/8
            </span>
            {slot.assigned_username && (
              <span className="text-green-400 text-xs flex-shrink-0">✓ {slot.assigned_username}</span>
            )}
          </button>
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

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={closeModal}
        >
          <div
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-2xl lg:max-w-5xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-white text-base">
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
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            {/* 편집 폼(좌/하단) + 미리보기(우/상단) 2단 레이아웃.
                lg 미만: flex-col-reverse 로 프리뷰가 모달 상단에 오고 편집 폼이 그 아래로 스크롤.
                lg 이상: flex-row 로 편집 폼이 왼쪽, 프리뷰가 오른쪽 사이드바로 고정.
                min-h-0 은 flex 자식이 overflow-y-auto 로 스크롤하려면 필수 — 없으면 부모 max-h 를 무시하고 내용이 튀어나간다. */}
            <div className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 border-t lg:border-t-0 border-gray-700">
              <div className="flex items-center flex-wrap gap-2">
                <SaveSlotAsTemplateButton
                  slot={slot}
                  defaultName={slot.role_name ? t('buildName', { role: translateSlotRole(slot.role_name, tRole) }) : ''}
                  defaultCategory={eventCategory}
                />
                <LoadSlotTemplateButton
                  slot={slot}
                  onLoad={onChange}
                  defaultCategoryFilter={eventCategory}
                />
                <RecentBuildsDropdown slot={slot} onLoad={onChange} />
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

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">{t('notesLabel')}</label>
                <textarea
                  value={slot.notes}
                  onChange={(e) => onChange({ ...slot, notes: e.target.value })}
                  placeholder={t('notesPlaceholder')}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {autoRegearEnabled && (
                <label className="flex items-start gap-2 cursor-pointer select-none bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={slot.auto_regear_excluded}
                    onChange={(e) =>
                      onChange({ ...slot, auto_regear_excluded: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                  />
                  <span>
                    <span className="text-[12px] text-white font-semibold">
                      {t('autoRegearExcludeLabel')}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {t('autoRegearExcludeHint')}
                    </span>
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2 cursor-pointer select-none bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  checked={slot.manual_regear_excluded}
                  onChange={(e) =>
                    onChange({ ...slot, manual_regear_excluded: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                <span>
                  <span className="text-[12px] text-white font-semibold">
                    {t('manualRegearExcludeLabel')}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {t('manualRegearExcludeHint')}
                  </span>
                </span>
              </label>

              {isBombSquadParty && (
                <label className="flex items-start gap-2 cursor-pointer select-none bg-rose-950/30 border border-rose-900/50 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={slot.is_solo_bomb}
                    onChange={(e) =>
                      onChange({ ...slot, is_solo_bomb: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 accent-rose-500"
                  />
                  <span>
                    <span className="text-[12px] text-rose-300 font-semibold">
                      {t('soloBomb.label')}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {t('soloBomb.hint')}
                    </span>
                  </span>
                </label>
              )}

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

              <div className="space-y-3">
                <GearSection
                  slotKey="weapon"
                  mode={modes.weapon}
                  onModeChange={(m) => setGearMode('weapon', m)}
                  singleName={slot.items.weapon.name || null}
                  singleId={slot.items.weapon.id || null}
                  onSingleChange={(n, i) => updateItem('weapon', n, i)}
                  onSingleClear={() => clearItem('weapon')}
                  options={slot.options.weapon}
                  onAddOption={(n, i) => addOption('weapon', n, i)}
                  onRemoveOption={(i) => removeOption('weapon', i)}
                  spells={slot.spells.weapon ?? []}
                  onAddSpell={(id) => addSpell('weapon', id)}
                  onRemoveSpell={(id) => removeSpell('weapon', id)}
                  onAddOptionSpell={(oid, sid) => addOptionSpell('weapon', oid, sid)}
                  onRemoveOptionSpell={(oid, sid) => removeOptionSpell('weapon', oid, sid)}
                  spec={slot.specs.weapon ?? {}}
                  onSpecChange={(patch) => setSpec('weapon', patch)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SLOT_KEYS.filter((k) => k !== 'weapon').map((key) => (
                    <GearSection
                      key={key}
                      slotKey={key}
                      mode={modes[key]}
                      onModeChange={(m) => setGearMode(key, m)}
                      singleName={slot.items[key].name || null}
                      singleId={slot.items[key].id || null}
                      onSingleChange={(n, i) => updateItem(key, n, i)}
                      onSingleClear={() => clearItem(key)}
                      options={slot.options[key]}
                      onAddOption={(n, i) => addOption(key, n, i)}
                      onRemoveOption={(i) => removeOption(key, i)}
                      spells={slot.spells[key] ?? []}
                      onAddSpell={(id) => addSpell(key, id)}
                      onRemoveSpell={(id) => removeSpell(key, id)}
                      onAddOptionSpell={(oid, sid) => addOptionSpell(key, oid, sid)}
                      onRemoveOptionSpell={(oid, sid) => removeOptionSpell(key, oid, sid)}
                      spec={slot.specs[key] ?? {}}
                      onSpecChange={(patch) => setSpec(key, patch)}
                    />
                  ))}
                </div>
              </div>

              <ConditionalOptionsSection
                weaponOptions={slot.options.weapon}
                dependentOptions={slot.options}
                conditional={slot.conditional_options ?? {}}
                onChange={(next) => onChange({ ...slot, conditional_options: next })}
              />
              </div>

              {/* 프리뷰 컬럼. lg 이상: 우측 320px 고정 폭 사이드바, 세로 overflow 자체 스크롤.
                  lg 미만: flex-col-reverse 로 모달 상단에 쌓이며 max-h-[32vh] 로 화면 과점유 방지. */}
              <div className="lg:w-80 lg:flex-shrink-0 lg:border-l lg:border-gray-700 overflow-y-auto overscroll-contain max-h-[32vh] lg:max-h-none px-4 py-4">
                <BuildPreview slot={slot} />
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
              {!standaloneMode && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete()
                    setOpen(false)
                  }}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2"
                >
                  <Trash2 size={13} /> {t('deleteSlot')}
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (standaloneMode) {
                    setSaving(true)
                    const ok = await standaloneMode.onSave()
                    setSaving(false)
                    if (ok) standaloneMode.onClose()
                    return
                  }
                  // Auto-stash the current build in browser-local recents so
                  // the admin can re-apply it without retyping. saveRecentBuild
                  // no-ops when the weapon slot is empty.
                  saveRecentBuild(slotInputToTemplateData(slot))
                  setOpen(false)
                }}
                className="ml-auto bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {standaloneMode ? (saving ? standaloneMode.savingLabel : standaloneMode.saveLabel) : t('done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
