'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Trash2, X, Pencil, Plus } from 'lucide-react'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemPicker from './ItemPicker'
import ItemImage from './ItemImage'
import SpellPicker from './SpellPicker'
import SaveSlotAsTemplateButton from './SaveSlotAsTemplateButton'
import LoadSlotTemplateButton from './LoadSlotTemplateButton'
import type { SlotKey, GearOption } from '@/types'
import {
  SLOT_KEYS,
  SLOT_LABELS,
  SLOT_PICKER_CATEGORY,
  SLOT_ROLES,
  getRoleStyle,
  isFreeItem,
} from '@/types'

export type GearMode = 'single' | 'multi' | 'free'

export interface SlotInput {
  id?: string
  slot_number: number
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  // Always an 8-keyed record in the editor — simpler than Partial here. Empty
  // arrays are serialized back to null at save time (see sanitizeSpells).
  spells: Record<SlotKey, string[]>
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
    role_name: '',
    notes: '',
    items: emptyPerSlot(() => ({ name: '', id: '' })),
    options: emptyPerSlot(() => []),
    spells: emptyPerSlot(() => []),
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
  onChange: (updated: SlotInput) => void
  onDelete: () => void
}

export default function SlotEditor({ slot, partyNumber, onChange, onDelete }: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)

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
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  // Both picked items (have id), "free" markers (name=자유, no id), and
  // a non-empty options list all count as configured.
  const filledCount = SLOT_KEYS.filter((k) => {
    if (slot.options[k].length > 0) return true
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
            {t('slotBreadcrumb', { party: partyNumber, slot: slot.slot_number })}
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
                  {t('slotTitle', { party: partyNumber, slot: slot.slot_number })}
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
                aria-label={tCommon('close')}
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
                  defaultName={slot.role_name ? t('buildName', { role: slot.role_name }) : ''}
                />
                <LoadSlotTemplateButton slot={slot} onLoad={onChange} />
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
                      {r}
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
                    />
                  ))}
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
                <Trash2 size={13} /> {t('deleteSlot')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                {t('done')}
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
}: GearSectionProps) {
  const t = useTranslations('adminParty')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  // 'free' has no item id — there's no pool to show. Multi merges pools
  // across all options at the picker level.
  const pickerItemIds =
    mode === 'multi'
      ? options.map((o) => o.id).filter(Boolean)
      : mode === 'single' && singleId
        ? [singleId]
        : []
  const category = SLOT_PICKER_CATEGORY[slotKey]
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
                </li>
              ))}
            </ul>
          )}
          {options.length < MAX_GEAR_OPTIONS ? (
            <GearOptionPicker
              category={category}
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
        <ItemPicker
          label=""
          category={category}
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

function GearOptionPicker({
  category,
  disabledIds,
  onAdd,
  count,
}: {
  category: string
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
