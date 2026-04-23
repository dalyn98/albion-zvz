'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { GearOption, GearSpec, Slot, SlotKey, SlotSpells } from '@/types'
import {
  SLOT_KEYS,
  SLOT_LABELS,
  getDisplayGear,
  getGearOptions,
  getRoleStyle,
  isFreeItem,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import GearPreview from './GearPreview'
import SpellImage from './SpellImage'
import type { SlotInput } from './SlotEditor'

// 사이드바 프리뷰는 weapon/head/armor/shoes 에만 스킬 아이콘을 노출한다.
// 나머지 슬롯은 실전에서 액티브 스킬을 담지 않으므로 행만 차지할 뿐 의미가 없다.
const SPELL_CAPABLE_KEYS: readonly SlotKey[] = ['weapon', 'head', 'armor', 'shoes']

// Converts the editor's nested SlotInput to a read-only Slot shape that the
// preview components (GearPreview, SlotSpellPanel) already know how to render.
// All assigned_*/requested_* fields stay null — the preview always renders
// the admin-defined build, never a member's current pick.
function buildDisplaySlot(input: SlotInput): Slot {
  const flat: Record<string, unknown> = {
    id: 'preview',
    party_id: 'preview',
    slot_number: input.slot_number,
    is_hidden: input.is_hidden,
    role_name: input.role_name || null,
    notes: input.notes || null,
    auto_regear_excluded: input.auto_regear_excluded,
    manual_regear_excluded: input.manual_regear_excluded,
    assigned_discord_id: null,
    assigned_username: null,
    requested_discord_id: null,
    requested_username: null,
    requested_picks: null,
    requested_at: null,
  }

  for (const key of SLOT_KEYS) {
    const item = input.items[key]
    const opts = input.options[key]
    const hasOptions = Array.isArray(opts) && opts.length > 0
    // When options are set, the fixed item fields should be null — mirrors
    // the server-side slotToRow convention so getGearOptions wins in display.
    flat[`${key}_name`] = hasOptions ? null : item.name || null
    flat[`${key}_id`] = hasOptions ? null : item.id || null
    flat[`${key}_options`] = hasOptions
      ? opts.map((o: GearOption) => ({ ...o, spells: o.spells ? [...o.spells] : undefined }))
      : null
    flat[`assigned_${key}_name`] = null
    flat[`assigned_${key}_id`] = null
  }

  const spells: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const list = input.spells[key]
    if (Array.isArray(list) && list.length > 0) spells[key] = [...list]
  }
  flat.spells = Object.keys(spells).length > 0 ? spells : null

  const specs: Partial<Record<SlotKey, GearSpec>> = {}
  for (const key of SLOT_KEYS) {
    const spec = input.specs[key]
    if (!spec) continue
    const clean: GearSpec = {}
    if (typeof spec.tier === 'number') clean.tier = spec.tier
    if (typeof spec.enchant === 'number') clean.enchant = spec.enchant
    if (clean.tier != null || clean.enchant != null) specs[key] = clean
  }
  flat.gear_specs = Object.keys(specs).length > 0 ? specs : null

  return flat as unknown as Slot
}

// 슬롯별로 표시할 스킬 아이콘 id 목록을 뽑는다.
//   - multi 옵션 슬롯: 옵션별 spells 를 합쳐서 중복 제거 (세부 매핑은 좌측 에디터에서 확인 가능)
//   - 그 외: input.spells[key] 그대로
// SPELL_CAPABLE_KEYS 에 속하지 않는 슬롯은 호출부에서 이미 필터링된다.
function spellIdsForKey(input: SlotInput, key: SlotKey): string[] {
  const opts = input.options[key]
  if (Array.isArray(opts) && opts.length > 0) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const opt of opts) {
      for (const sid of opt.spells ?? []) {
        if (seen.has(sid)) continue
        seen.add(sid)
        out.push(sid)
      }
    }
    return out
  }
  return input.spells[key] ?? []
}

export default function BuildPreview({ slot: input }: { slot: SlotInput }) {
  const t = useTranslations('adminParty')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const displaySlot = useMemo(() => buildDisplaySlot(input), [input])
  const roleStyle = getRoleStyle(input.role_name)

  return (
    <div className="rounded-xl p-3 space-y-2 border bg-gray-900/60 border-gray-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">
          {t('previewLabel')}
        </span>
        {input.role_name && (
          <span
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {input.role_name}
          </span>
        )}
      </div>

      <ul className="space-y-1">
        {SLOT_KEYS.map((key) => {
          const gear = getDisplayGear(displaySlot, key)
          const opts = getGearOptions(displaySlot, key)
          const hasOptions = Array.isArray(opts) && opts.length > 0
          const free = isFreeItem(gear.name, gear.id)
          const hasGear = !!gear.id || free || hasOptions
          const spellIds = SPELL_CAPABLE_KEYS.includes(key) ? spellIdsForKey(input, key) : []

          // 이름 표시: multi 모드는 첫 옵션 이름 (아이콘 위 +N 배지가 나머지 개수를 암시).
          // free 마커는 "자유" 로 바꿔 다른 슬롯과 시각적으로 구분.
          let displayName: string | null = null
          if (hasOptions) {
            const first = opts![0]
            displayName = stripTierPrefix(
              getLocalizedItemName(first.id, locale, first.name) ?? first.name,
            )
          } else if (free) {
            displayName = t('itemFree')
          } else if (gear.name) {
            displayName = stripTierPrefix(
              getLocalizedItemName(gear.id, locale, gear.name) ?? gear.name,
            )
          }

          return (
            <li
              key={key}
              className={`flex items-center gap-2 px-1.5 py-1 rounded-md ${
                hasGear ? 'bg-gray-950/40' : 'opacity-50'
              }`}
            >
              <span className="text-gray-500 text-[10px] w-10 flex-shrink-0 truncate">
                {SLOT_LABELS[key]}
              </span>
              <GearPreview slot={displaySlot} kind={key} size={34} isTaken={false} />
              <div className="flex-1 min-w-0">
                {displayName ? (
                  <p className="text-white text-[11px] truncate leading-tight">{displayName}</p>
                ) : (
                  <p className="text-gray-600 text-[11px] italic leading-tight">—</p>
                )}
                {spellIds.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {spellIds.map((sid, i) => (
                      <SpellImage key={`${sid}-${i}`} spellId={sid} size={24} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
