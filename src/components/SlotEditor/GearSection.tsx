'use client'

// 한 슬롯 안 한 종류 (weapon / armor / ...) 의 편집 UI.
// single (단일 픽) / multi (옵션 후보 풀) / free (자유 픽) 3 모드 토글 + 스펙 선택기.

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X, Plus } from 'lucide-react'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemPicker from '../ItemPicker'
import ItemImage from '../ItemImage'
import SpellPicker from '../SpellPicker'
import type { GearOption, GearSpec, SlotKey } from '@/types'
import {
  SLOT_LABELS,
  SLOT_PICKER_CATEGORY,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  GEAR_FLAT_MIN,
  GEAR_FLAT_MAX,
  GEAR_ENCHANT_COLOR_CLASS,
  flatToSpec,
  specToFlat,
  isTierlessSlot,
  isSpecLessSlot,
  isT8OnlySlot,
} from '@/types'
import { type GearMode, MAX_GEAR_OPTIONS } from './slot-input'

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

export function GearSection({
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
