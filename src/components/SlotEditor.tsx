'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Trash2, X, Pencil, Plus } from 'lucide-react'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemPicker from './ItemPicker'
import ItemImage from './ItemImage'
import SpellPicker from './SpellPicker'
import SaveSlotAsTemplateButton from './SaveSlotAsTemplateButton'
import LoadSlotTemplateButton from './LoadSlotTemplateButton'
import RecentBuildsDropdown from './RecentBuildsDropdown'
import BuildPreview from './BuildPreview'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { saveRecentBuild } from '@/lib/recent-builds'
import type {
  ConditionalSlotOptions,
  DependentSlotKey,
  EventCategory,
  GearOption,
  GearSpec,
  SlotKey,
} from '@/types'
import {
  SLOT_KEYS,
  SLOT_LABELS,
  SLOT_PICKER_CATEGORY,
  SLOT_ROLES,
  T8_ONLY_SLOT_KEYS,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  GEAR_FLAT_MIN,
  GEAR_FLAT_MAX,
  GEAR_ENCHANT_COLOR_CLASS,
  flatToSpec,
  specToFlat,
  getRoleStyle,
  isFreeItem,
  isTierlessSlot,
  isSpecLessSlot,
  isT8OnlySlot,
} from '@/types'

export type GearMode = 'single' | 'multi' | 'free'

export interface SlotInput {
  id?: string
  slot_number: number
  is_hidden: boolean
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  // Always an 8-keyed record in the editor — simpler than Partial here. Empty
  // arrays are serialized back to null at save time (see sanitizeSpells).
  spells: Record<SlotKey, string[]>
  // Target tier/enchant per slot kind. Undefined entries in the shape mean
  // "no spec" — the member is free to bring any quality. Serialized to
  // `gear_specs` jsonb at save time.
  specs: Record<SlotKey, GearSpec>
  // Migration 050: per-slot opt-out for auto-regear. Only persisted to DB
  // when the global auto_regear_enabled toggle is ON; UI also only exposes
  // the checkbox in that case.
  auto_regear_excluded: boolean
  // Migration 069: per-slot opt-out for manual regear submissions. No global
  // toggle — always editable.
  manual_regear_excluded: boolean
  // Migration 134: 솔로밤 슬롯. 파티가 밤스쿼드일 때만 토글 가능 (UI 에서만
  // 노출, 비-밤스쿼드 파티에서는 항상 false 로 유지). DB 트리거가 invariants
  // 를 강제한다.
  is_solo_bomb: boolean
  // Migration 139: 무기 픽이 다른 종류의 후보를 좁히는 룰 (선택사항).
  // shape: { armor: { "<weapon_id>": [{name,id}, ...], ... }, shoes: { ... }, ... }
  // 비어 있으면 기존 *_options 가 그대로 후보. weapon 자체는 의존성 시작점.
  conditional_options: ConditionalSlotOptions
  assigned_username: string | null
}

function emptyPerSlot<T>(fill: () => T): Record<SlotKey, T> {
  return SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: fill() }),
    {} as Record<SlotKey, T>,
  )
}

export function emptySlotInput(slotNumber: number): SlotInput {
  return {
    slot_number: slotNumber,
    is_hidden: false,
    role_name: '',
    notes: '',
    items: emptyPerSlot(() => ({ name: '', id: '' })),
    options: emptyPerSlot(() => []),
    spells: emptyPerSlot(() => []),
    specs: emptyPerSlot(() => ({}) as GearSpec),
    auto_regear_excluded: false,
    manual_regear_excluded: false,
    is_solo_bomb: false,
    conditional_options: {},
    assigned_username: null,
  }
}

export function deriveGearMode(slot: SlotInput, key: SlotKey): GearMode {
  if (slot.options[key].length > 0) return 'multi'
  if (isFreeItem(slot.items[key].name, slot.items[key].id)) return 'free'
  return 'single'
}

const MAX_GEAR_OPTIONS = 6

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

interface GearSectionProps {
  slotKey: SlotKey
  mode: GearMode
  onModeChange: (mode: GearMode) => void
  singleName: string | null
  singleId: string | null
  onSingleChange: (name: string, id: string) => void
  onSingleClear: () => void
  options: GearOption[]
  onAddOption: (name: string, id: string) => void
  onRemoveOption: (id: string) => void
  spells: string[]
  onAddSpell: (id: string) => void
  onRemoveSpell: (id: string) => void
  onAddOptionSpell: (optId: string, spellId: string) => void
  onRemoveOptionSpell: (optId: string, spellId: string) => void
  spec: GearSpec
  onSpecChange: (patch: Partial<GearSpec>) => void
}

function GearSection({
  slotKey,
  mode,
  onModeChange,
  singleName,
  singleId,
  onSingleChange,
  onSingleClear,
  options,
  onAddOption,
  onRemoveOption,
  spells,
  onAddSpell,
  onRemoveSpell,
  onAddOptionSpell,
  onRemoveOptionSpell,
  spec,
  onSpecChange,
}: GearSectionProps) {
  const t = useTranslations('adminParty')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  // Single 모드 전용 pool — multi 모드에서는 옵션마다 개별 SpellPicker 가
  // 자기 itemId 로 pool 을 불러오므로 여기선 single 의 singleId 만 반영.
  const singlePickerItemIds = mode === 'single' && singleId ? [singleId] : []
  const category = SLOT_PICKER_CATEGORY[slotKey]
  const tierFilter = isT8OnlySlot(slotKey) ? 8 : undefined
  return (
    <div className="border border-gray-800 rounded-lg p-3 space-y-2 bg-gray-950/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-amber-400 text-[11px] font-semibold">{SLOT_LABELS[slotKey]}</span>
        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-[11px] font-semibold">
          {(['single', 'multi', 'free'] as GearMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                mode === m
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {m === 'single' ? t('modeSingle') : m === 'multi' ? t('modeMulti') : t('modeFree')}
            </button>
          ))}
        </div>
      </div>

      <TierEnchantPicker slotKey={slotKey} spec={spec} onChange={onSpecChange} />


      {mode === 'multi' ? (
        <div className="space-y-2">
          {options.length > 0 && (
            <ul className="space-y-2">
              {options.map((opt) => (
                <li
                  key={opt.id}
                  className="bg-gray-800 rounded-lg p-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <ItemImage itemId={opt.id} itemName={opt.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{getLocalizedItemName(opt.id, locale, opt.name)}</p>
                      <p className="text-gray-500 text-[10px] font-mono truncate">{opt.id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveOption(opt.id)}
                      className="text-gray-500 hover:text-red-400 p-1"
                      aria-label={t('removeAria')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <SpellPicker
                    itemIds={[opt.id]}
                    spells={opt.spells ?? []}
                    onAdd={(sid) => onAddOptionSpell(opt.id, sid)}
                    onRemove={(sid) => onRemoveOptionSpell(opt.id, sid)}
                  />
                </li>
              ))}
            </ul>
          )}
          {options.length < MAX_GEAR_OPTIONS ? (
            <GearOptionPicker
              category={category}
              tier={tierFilter}
              disabledIds={options.map((o) => o.id)}
              onAdd={onAddOption}
              count={options.length}
            />
          ) : (
            <p className="text-[11px] text-gray-500">{t('maxOptionsReached', { max: MAX_GEAR_OPTIONS })}</p>
          )}
          {options.length === 0 && (
            <p className="text-[11px] text-amber-300/80">
              {t('addMultiHint')}
            </p>
          )}
        </div>
      ) : mode === 'free' ? (
        <p className="text-[11px] text-emerald-300/90">{t('freeHint')}</p>
      ) : (
        <>
          <ItemPicker
            label=""
            category={category}
            tier={tierFilter}
            itemName={singleName}
            itemId={singleId}
            onChange={onSingleChange}
            onClear={onSingleClear}
          />
          <SpellPicker
            itemIds={singlePickerItemIds}
            spells={spells}
            onAdd={onAddSpell}
            onRemove={onRemoveSpell}
          />
        </>
      )}
    </div>
  )
}

function TierEnchantPicker({
  slotKey,
  spec,
  onChange,
}: {
  slotKey: SlotKey
  spec: GearSpec
  onChange: (patch: Partial<GearSpec>) => void
}) {
  const t = useTranslations('adminParty')
  // Mount has no tier/enchant concept at all — skip the whole row rather than
  // showing empty selects that save nothing (sanitizeGearSpecs drops it anyway).
  if (isSpecLessSlot(slotKey)) return null
  // Food/potion: enchant only (the tier is baked into the item id).
  if (isTierlessSlot(slotKey)) {
    const enchants: number[] = []
    for (let e = GEAR_ENCHANT_MIN; e <= GEAR_ENCHANT_MAX; e++) enchants.push(e)
    const hasSpec = spec.enchant != null
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">{t('specLabel')}</span>
        <select
          value={spec.enchant ?? ''}
          onChange={(e) => onChange({ enchant: e.target.value ? Number(e.target.value) : undefined })}
          className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-amber-500 ${
            spec.enchant != null ? GEAR_ENCHANT_COLOR_CLASS[spec.enchant] ?? 'text-white' : 'text-white'
          }`}
          aria-label={t('specEnchant')}
        >
          <option value="">{t('specEnchantAny')}</option>
          {enchants.map((level) => (
            <option key={level} value={level}>
              @{level}
            </option>
          ))}
        </select>
        {hasSpec && (
          <button
            type="button"
            onClick={() => onChange({ tier: undefined, enchant: undefined })}
            className="text-gray-500 hover:text-red-400 text-[10px]"
          >
            {t('specClear')}
          </button>
        )}
      </div>
    )
  }
  // Gear: single flat select. Legacy partial specs (only tier or only enchant)
  // can't be expressed as flat so they show "Any" until the admin picks again.
  const flats: number[] = []
  for (let f = GEAR_FLAT_MIN; f <= GEAR_FLAT_MAX; f++) flats.push(f)
  const currentFlat = specToFlat(spec)
  const hasSpec = currentFlat != null || spec.tier != null || spec.enchant != null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">{t('specLabel')}</span>
      <select
        value={currentFlat ?? ''}
        onChange={(e) => {
          if (!e.target.value) {
            onChange({ tier: undefined, enchant: undefined })
            return
          }
          onChange(flatToSpec(Number(e.target.value)))
        }}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500"
        aria-label={t('specFlat')}
      >
        <option value="">{t('specFlatAny')}</option>
        {flats.map((flat) => (
          <option key={flat} value={flat}>
            {flat}F
          </option>
        ))}
      </select>
      {hasSpec && (
        <button
          type="button"
          onClick={() => onChange({ tier: undefined, enchant: undefined })}
          className="text-gray-500 hover:text-red-400 text-[10px]"
        >
          {t('specClear')}
        </button>
      )}
    </div>
  )
}

function GearOptionPicker({
  category,
  tier,
  disabledIds,
  onAdd,
  count,
}: {
  category: string
  tier?: number
  disabledIds: string[]
  onAdd: (name: string, id: string) => void
  count: number
}) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <ItemPicker
          label=""
          category={category}
          tier={tier}
          itemName={name || null}
          itemId={id || null}
          onChange={(n, i) => {
            if (disabledIds.includes(i)) return
            onAdd(n, i)
            setName('')
            setId('')
          }}
          onClear={() => {
            setName('')
            setId('')
          }}
        />
      </div>
      <span className="text-gray-500 text-[10px] flex-shrink-0">
        <Plus size={10} className="inline" /> {count}/{MAX_GEAR_OPTIONS}
      </span>
    </div>
  )
}

// Migration 139: 무기 픽이 의존하는 종류 (방어구/신발/...) 후보를 좁히는 룰을
// 편집한다. weapon 자체는 의존성 시작점이라 대상에서 제외. 무기 옵션이 2개 이상
// + 의존 종류에 multi 옵션이 있을 때만 의미 있는 화면이라 그렇지 않으면 자체적
// 으로 noop. 매핑이 없으면 베이스 *_options 가 그대로 후보 (RPC 폴백과 동일).
function ConditionalOptionsSection({
  weaponOptions,
  dependentOptions,
  conditional,
  onChange,
}: {
  weaponOptions: GearOption[]
  dependentOptions: SlotInput['options']
  conditional: ConditionalSlotOptions
  onChange: (next: ConditionalSlotOptions) => void
}) {
  const t = useTranslations('adminParty')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const dependentKinds = (SLOT_KEYS as readonly SlotKey[])
    .filter((k): k is DependentSlotKey => k !== 'weapon')
    .filter((k) => dependentOptions[k].length > 0)

  if (weaponOptions.length < 2 || dependentKinds.length === 0) return null

  const setMapping = (kind: DependentSlotKey, weaponId: string, opts: GearOption[] | null) => {
    const nextKindMap: Record<string, GearOption[]> = { ...(conditional[kind] ?? {}) }
    if (opts === null) {
      delete nextKindMap[weaponId]
    } else {
      nextKindMap[weaponId] = opts
    }
    const nextConditional: ConditionalSlotOptions = { ...conditional }
    if (Object.keys(nextKindMap).length === 0) {
      delete nextConditional[kind]
    } else {
      nextConditional[kind] = nextKindMap
    }
    onChange(nextConditional)
  }

  const toggleOption = (kind: DependentSlotKey, weaponId: string, opt: GearOption) => {
    const current = conditional[kind]?.[weaponId] ?? null
    if (current === null) {
      // First narrow: start by excluding the toggled option (assume "narrow"
      // semantically means "remove some"). All-but-this is more useful than
      // only-this when the admin is just trying to drop one bad combo.
      const allBut = dependentOptions[kind].filter((o) => o.id !== opt.id)
      setMapping(kind, weaponId, allBut)
      return
    }
    const exists = current.some((o) => o.id === opt.id)
    if (exists) {
      const next = current.filter((o) => o.id !== opt.id)
      // 후보 0 개로 떨어지면 검증 자체가 실패하므로 매핑 자체를 drop —
      // "베이스로 되돌리기" 와 같은 효과 + 0개 후보라는 갑갑한 상태를 막는다.
      if (next.length === 0) {
        setMapping(kind, weaponId, null)
      } else {
        setMapping(kind, weaponId, next)
      }
      return
    }
    setMapping(kind, weaponId, [...current, { name: opt.name, id: opt.id }])
  }

  const resetMapping = (kind: DependentSlotKey, weaponId: string) => {
    setMapping(kind, weaponId, null)
  }

  const isUsing = (kind: DependentSlotKey, weaponId: string) =>
    conditional[kind]?.[weaponId] != null

  const isOptionEnabled = (kind: DependentSlotKey, weaponId: string, opt: GearOption) => {
    const current = conditional[kind]?.[weaponId]
    if (!current) return true
    return current.some((o) => o.id === opt.id)
  }

  return (
    <details className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-2">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-amber-400 text-[12px] font-semibold">
        <span>{t('conditionalOptions.sectionTitle')}</span>
        <span className="text-gray-500 text-[10px] font-normal">
          {t('conditionalOptions.sectionHint')}
        </span>
      </summary>
      <div className="pt-2 space-y-3">
        {dependentKinds.map((kind) => (
          <div key={kind} className="rounded-lg border border-gray-800 bg-gray-900/40 p-2 space-y-2">
            <div className="text-[11px] font-semibold text-amber-300/90">
              {t('conditionalOptions.kindLabel', { kind: SLOT_LABELS[kind] })}
            </div>
            <div className="space-y-2">
              {weaponOptions.map((weapon) => {
                const narrowed = isUsing(kind, weapon.id)
                return (
                  <div
                    key={weapon.id}
                    className="rounded-md border border-gray-800 bg-gray-950/40 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ItemImage itemId={weapon.id} itemName={weapon.name} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[12px] font-medium truncate">
                          {getLocalizedItemName(weapon.id, locale, weapon.name)}
                        </p>
                        <p className="text-gray-500 text-[10px] font-mono truncate">
                          {weapon.id}
                        </p>
                      </div>
                      {narrowed ? (
                        <button
                          type="button"
                          onClick={() => resetMapping(kind, weapon.id)}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
                        >
                          {t('conditionalOptions.resetButton')}
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-300/80 font-medium">
                          {t('conditionalOptions.usingDefault')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dependentOptions[kind].map((opt) => {
                        const enabled = isOptionEnabled(kind, weapon.id, opt)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleOption(kind, weapon.id, opt)}
                            className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[10px] transition-colors ${
                              enabled
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'
                            }`}
                            title={enabled
                              ? t('conditionalOptions.includedHint')
                              : t('conditionalOptions.excludedHint')}
                          >
                            <ItemImage itemId={opt.id} itemName={opt.name} size={20} />
                            <span className="truncate max-w-[8rem]">
                              {getLocalizedItemName(opt.id, locale, opt.name)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
