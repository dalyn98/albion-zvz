'use client'

import { useEffect, useState } from 'react'
import { Trash2, X, Pencil, Plus } from 'lucide-react'
import ItemPicker from './ItemPicker'
import ItemImage from './ItemImage'
import SpellPicker from './SpellPicker'
import SaveSlotAsTemplateButton from './SaveSlotAsTemplateButton'
import LoadSlotTemplateButton from './LoadSlotTemplateButton'
import type { SlotKey, WeaponOption } from '@/types'
import { SLOT_KEYS, SLOT_LABELS, SLOT_ROLES, getRoleStyle, isFreeItem } from '@/types'

export interface SlotInput {
  id?: string
  slot_number: number
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  weapon_options: WeaponOption[]
  // Always an 8-keyed record in the editor — simpler than Partial here. Empty
  // arrays are serialized back to null at save time (see sanitizeSpells).
  spells: Record<SlotKey, string[]>
  assigned_username: string | null
}

function emptySpells(): Record<SlotKey, string[]> {
  return SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: [] }),
    {} as Record<SlotKey, string[]>,
  )
}

export function emptySlotInput(slotNumber: number): SlotInput {
  return {
    slot_number: slotNumber,
    role_name: '',
    notes: '',
    items: SLOT_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: { name: '', id: '' } }),
      {} as Record<SlotKey, { name: string; id: string }>,
    ),
    weapon_options: [],
    spells: emptySpells(),
    assigned_username: null,
  }
}

type WeaponMode = 'single' | 'multi' | 'free'

function deriveWeaponMode(slot: SlotInput): WeaponMode {
  if (slot.weapon_options.length > 0) return 'multi'
  if (isFreeItem(slot.items.weapon.name, slot.items.weapon.id)) return 'free'
  return 'single'
}

interface Props {
  slot: SlotInput
  partyNumber: number
  onChange: (updated: SlotInput) => void
  onDelete: () => void
}

export default function SlotEditor({ slot, partyNumber, onChange, onDelete }: Props) {
  const [open, setOpen] = useState(false)

  // Mode is stored locally because 'multi' with an empty options list is a
  // legitimate intermediate state: the user just switched to multi and hasn't
  // added options yet. Deriving mode from slot data alone would snap them
  // back to 'single' on the next render and make the button unclickable.
  const [weaponMode, setWeaponModeLocal] = useState<WeaponMode>(() => deriveWeaponMode(slot))

  // If the slot prop gets reset from outside and now unambiguously signals
  // 'multi' (options present), 'free' (free marker), or 'single' (a weapon
  // is actually picked — e.g. from a loaded template), mirror that. Leave
  // the user's in-progress 'multi' selection alone when the slot is blank
  // (empty options AND empty weapon) — otherwise we'd wipe the mode switch
  // they just made before they had a chance to add options.
  useEffect(() => {
    const derived = deriveWeaponMode(slot)
    if (derived !== 'single') {
      setWeaponModeLocal(derived)
      return
    }
    if (slot.items.weapon.id) setWeaponModeLocal('single')
  }, [slot])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      // Always reset to empty — capturing `prev` under StrictMode double-invoke
      // can snapshot 'hidden' and re-apply it after close, leaving the page unscrollable.
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Defensive unmount cleanup: if the editor is removed from the tree while open
  // (e.g. slot deleted, party re-saved), the [open] effect's cleanup may not fire.
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const updateItem = (key: SlotKey, name: string, id: string) => {
    onChange({ ...slot, items: { ...slot.items, [key]: { name, id } } })
  }

  const clearItem = (key: SlotKey) => {
    onChange({ ...slot, items: { ...slot.items, [key]: { name: '', id: '' } } })
  }

  const addSpell = (key: SlotKey, spellId: string) => {
    const current = slot.spells[key] ?? []
    if (current.includes(spellId)) return
    onChange({ ...slot, spells: { ...slot.spells, [key]: [...current, spellId] } })
  }

  const removeSpell = (key: SlotKey, spellId: string) => {
    const current = slot.spells[key] ?? []
    onChange({ ...slot, spells: { ...slot.spells, [key]: current.filter((s) => s !== spellId) } })
  }

  const setWeaponMode = (mode: WeaponMode) => {
    if (mode === weaponMode) return
    setWeaponModeLocal(mode)
    const emptyWeapon = { name: '', id: '' }
    if (mode === 'free') {
      onChange({ ...slot, items: { ...slot.items, weapon: { name: '자유', id: '' } }, weapon_options: [] })
    } else {
      // single / multi both start with no weapon picked; multi expects
      // options to be filled in next.
      onChange({ ...slot, items: { ...slot.items, weapon: emptyWeapon }, weapon_options: [] })
    }
  }

  const addWeaponOption = (name: string, id: string) => {
    if (!id) return
    if (slot.weapon_options.some((w) => w.id === id)) return
    if (slot.weapon_options.length >= 6) return
    onChange({ ...slot, weapon_options: [...slot.weapon_options, { name, id }] })
  }

  const removeWeaponOption = (id: string) => {
    onChange({ ...slot, weapon_options: slot.weapon_options.filter((w) => w.id !== id) })
  }

  // Both picked items (have id) and "free" markers (name=자유, no id) count as configured.
  // For weapon, a filled multi-option list also counts.
  const filledCount = SLOT_KEYS.filter((k) => {
    if (k === 'weapon' && slot.weapon_options.length > 0) return true
    return slot.items[k].id || isFreeItem(slot.items[k].name, slot.items[k].id)
  }).length
  const roleStyle = getRoleStyle(slot.role_name)

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          <span className="text-gray-400 text-xs flex-shrink-0">
            {partyNumber}파티 · {slot.slot_number}번
          </span>
          {slot.role_name ? (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded truncate ${
                roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {slot.role_name}
            </span>
          ) : (
            <span className="text-gray-600 text-xs italic">역할 미선택</span>
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
            aria-label="편집"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-400 transition-colors"
            aria-label="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-white text-base">
                  {partyNumber}파티 {slot.slot_number}번
                </h3>
                {slot.role_name && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {slot.role_name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {/* min-h-0 is required on flex children that should scroll — without it, flex items
                default to min-height:auto (content-based) and overflow the parent's max-height. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
              <div className="flex items-center flex-wrap gap-2">
                <SaveSlotAsTemplateButton
                  slot={slot}
                  defaultName={slot.role_name ? `${slot.role_name} 빌드` : ''}
                />
                <LoadSlotTemplateButton slot={slot} onLoad={onChange} />
              </div>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">역할</label>
                <select
                  value={slot.role_name}
                  onChange={(e) => onChange({ ...slot, role_name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">역할 선택 안 함</option>
                  {SLOT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">메모</label>
                <textarea
                  value={slot.notes}
                  onChange={(e) => onChange({ ...slot, notes: e.target.value })}
                  placeholder="예: 팟밥 필수 / 스웜힐러 위치 고정"
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="space-y-3">
                <WeaponSection
                  mode={weaponMode}
                  onModeChange={setWeaponMode}
                  singleName={slot.items.weapon.name || null}
                  singleId={slot.items.weapon.id || null}
                  onSingleChange={(name, id) => updateItem('weapon', name, id)}
                  onSingleClear={() => clearItem('weapon')}
                  options={slot.weapon_options}
                  onAddOption={addWeaponOption}
                  onRemoveOption={removeWeaponOption}
                  spells={slot.spells.weapon ?? []}
                  onAddSpell={(id) => addSpell('weapon', id)}
                  onRemoveSpell={(id) => removeSpell('weapon', id)}
                />

                <div className="grid grid-cols-2 gap-2">
                  {SLOT_KEYS.filter((k) => k !== 'weapon').map((key) => {
                    const itemId = slot.items[key].id || null
                    return (
                      <div key={key} className="space-y-1.5">
                        <ItemPicker
                          label={SLOT_LABELS[key]}
                          category={key}
                          itemName={slot.items[key].name || null}
                          itemId={itemId}
                          onChange={(name, id) => updateItem(key, name, id)}
                          onClear={() => clearItem(key)}
                        />
                        <SpellPicker
                          itemIds={itemId ? [itemId] : []}
                          spells={slot.spells[key] ?? []}
                          onAdd={(id) => addSpell(key, id)}
                          onRemove={(id) => removeSpell(key, id)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDelete()
                  setOpen(false)
                }}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2"
              >
                <Trash2 size={13} /> 슬롯 삭제
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface WeaponSectionProps {
  mode: WeaponMode
  onModeChange: (mode: WeaponMode) => void
  singleName: string | null
  singleId: string | null
  onSingleChange: (name: string, id: string) => void
  onSingleClear: () => void
  options: WeaponOption[]
  onAddOption: (name: string, id: string) => void
  onRemoveOption: (id: string) => void
  spells: string[]
  onAddSpell: (id: string) => void
  onRemoveSpell: (id: string) => void
}

const MAX_WEAPON_OPTIONS = 6

function WeaponSection({
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
}: WeaponSectionProps) {
  // 'free' weapons have no item id — there's no pool to show. Multi-weapon
  // merges pools across all options at the picker level.
  const pickerItemIds =
    mode === 'multi'
      ? options.map((o) => o.id).filter(Boolean)
      : mode === 'single' && singleId
        ? [singleId]
        : []
  return (
    <div className="border border-gray-800 rounded-lg p-3 space-y-2 bg-gray-950/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-amber-400 text-[11px] font-semibold">{SLOT_LABELS.weapon}</span>
        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-[11px] font-semibold">
          {(['single', 'multi', 'free'] as WeaponMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                mode === m
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {m === 'single' ? '단일 고정' : m === 'multi' ? '복수 허용' : '자유'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'multi' ? (
        <div className="space-y-2">
          {options.length > 0 && (
            <ul className="space-y-1">
              {options.map((opt) => (
                <li
                  key={opt.id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg p-1.5"
                >
                  <ItemImage itemId={opt.id} itemName={opt.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{opt.name}</p>
                    <p className="text-gray-500 text-[10px] font-mono truncate">{opt.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveOption(opt.id)}
                    className="text-gray-500 hover:text-red-400 p-1"
                    aria-label="제거"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {options.length < MAX_WEAPON_OPTIONS ? (
            <WeaponOptionPicker
              disabledIds={options.map((o) => o.id)}
              onAdd={onAddOption}
              count={options.length}
            />
          ) : (
            <p className="text-[11px] text-gray-500">최대 {MAX_WEAPON_OPTIONS}개까지 추가할 수 있습니다.</p>
          )}
          {options.length === 0 && (
            <p className="text-[11px] text-amber-300/80">
              허용할 무기를 2개 이상 추가하세요. 구성원은 신청 시 이 중 하나를 고릅니다.
            </p>
          )}
        </div>
      ) : (
        <ItemPicker
          label=""
          category="weapon,mount"
          itemName={singleName}
          itemId={singleId}
          onChange={onSingleChange}
          onClear={onSingleClear}
        />
      )}

      <SpellPicker
        itemIds={pickerItemIds}
        spells={spells}
        onAdd={onAddSpell}
        onRemove={onRemoveSpell}
      />
    </div>
  )
}

function WeaponOptionPicker({
  disabledIds,
  onAdd,
  count,
}: {
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
          category="weapon,mount"
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
        <Plus size={10} className="inline" /> {count}/{MAX_WEAPON_OPTIONS}
      </span>
    </div>
  )
}
