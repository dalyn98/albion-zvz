'use client'

// 컨트롤드 (controlled) 빌드 스냅샷 picker. /regear 수동 청구 모달이 마운트
// 시점에 빈 스냅샷으로 시작해 슬롯별 ItemPicker + tier/enchant 셀렉트로 채워가는
// 용도. MyRegearBuildSnapshotEditor 와 달리 server action 을 호출하지 않고
// onChange 로 부모 상태에만 전달 — 부모(submit 버튼) 가 form 제출 시 한 번에
// JSON 으로 직렬화한다. 이미 처리된(=in-flight) 요청 편집 흐름이 아니므로
// disabled 는 단순히 form pending 상태를 받기만 한다.

import { useLocale, useTranslations } from 'next-intl'
import {
  GEAR_ENCHANT_COLOR_CLASS,
  GEAR_ENCHANT_MAX,
  GEAR_ENCHANT_MIN,
  GEAR_TIER_MAX,
  GEAR_TIER_MIN,
  SLOT_KEYS,
  SLOT_PICKER_CATEGORY,
  isSpecLessSlot,
  type BuildSnapshot,
  type SlotKey,
} from '@/types'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'
import ItemPicker from './ItemPicker'

interface Props {
  value: BuildSnapshot
  onChange: (next: BuildSnapshot) => void
  disabled?: boolean
}

interface ParsedId {
  baseAfterTier: string
  tier: number
  enchant: number
}

function parseItemId(id: string | null): ParsedId | null {
  if (!id) return null
  const [withoutEnchant, enchantPart] = id.split('@')
  const enchant = enchantPart ? parseInt(enchantPart, 10) : 0
  const m = withoutEnchant.match(/^T(\d+)_(.+)$/)
  if (!m) return null
  const tier = parseInt(m[1], 10)
  if (!Number.isFinite(tier)) return null
  return {
    baseAfterTier: m[2],
    tier,
    enchant: Number.isFinite(enchant) ? enchant : 0,
  }
}

function composeItemId(baseAfterTier: string, tier: number, enchant: number): string {
  const base = `T${tier}_${baseAfterTier}`
  return enchant > 0 ? `${base}@${enchant}` : base
}

export function emptyBuildSnapshot(roleName: string | null): BuildSnapshot {
  return {
    role_name: roleName,
    weapon: { name: null, id: null },
    head: { name: null, id: null },
    armor: { name: null, id: null },
    shoes: { name: null, id: null },
    offhand: { name: null, id: null },
    potion: { name: null, id: null },
    food: { name: null, id: null },
    cape: { name: null, id: null },
    mount: { name: null, id: null },
  }
}

export function isBuildSnapshotPopulated(snapshot: BuildSnapshot): boolean {
  return SLOT_KEYS.some((slot) => snapshot[slot]?.id != null)
}

const TIER_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let t = GEAR_TIER_MIN; t <= GEAR_TIER_MAX; t++) out.push(t)
  return out
})()

const ENCHANT_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let e = GEAR_ENCHANT_MIN; e <= GEAR_ENCHANT_MAX; e++) out.push(e)
  return out
})()

export default function RegearBuildSnapshotPicker({ value, onChange, disabled }: Props) {
  const t = useTranslations('regearBuildSnapshot')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale

  const setSlot = (slot: SlotKey, name: string | null, id: string | null) => {
    onChange({ ...value, [slot]: { name, id } })
  }

  const handleTierChange = (slot: SlotKey, parsed: ParsedId, nextTier: number) => {
    const id = composeItemId(parsed.baseAfterTier, nextTier, parsed.enchant)
    setSlot(slot, value[slot].name, id)
  }

  const handleEnchantChange = (slot: SlotKey, parsed: ParsedId, nextEnchant: number) => {
    const id = composeItemId(parsed.baseAfterTier, parsed.tier, nextEnchant)
    setSlot(slot, value[slot].name, id)
  }

  return (
    <div className="space-y-2">
      {SLOT_KEYS.map((slot) => {
        const item = value[slot]
        const parsed = parseItemId(item.id)
        const showSpecs = !isSpecLessSlot(slot)

        return (
          <div
            key={slot}
            className="flex items-start gap-3 bg-gray-950 border border-gray-800 rounded-lg p-2"
          >
            <div className="w-14 text-[11px] text-gray-500 font-semibold pt-2 shrink-0">
              {tGear(slot)}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <ItemPicker
                label={item.id ? t('changeItem') : t('pickItem')}
                category={SLOT_PICKER_CATEGORY[slot]}
                itemName={item.name}
                itemId={item.id}
                onChange={(name, id) => setSlot(slot, name, id)}
                onClear={() => setSlot(slot, null, null)}
              />

              {item.id && parsed && showSpecs && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-500 w-10">{t('tierLabel')}</label>
                  <select
                    value={parsed.tier}
                    disabled={disabled}
                    onChange={(e) => handleTierChange(slot, parsed, parseInt(e.target.value, 10))}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  >
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier}>
                        T{tier}
                      </option>
                    ))}
                  </select>
                  <label className="text-[11px] text-gray-500 ml-2 w-10">{t('enchantLabel')}</label>
                  <select
                    value={parsed.enchant}
                    disabled={disabled}
                    onChange={(e) => handleEnchantChange(slot, parsed, parseInt(e.target.value, 10))}
                    className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-500 disabled:opacity-60 ${
                      GEAR_ENCHANT_COLOR_CLASS[parsed.enchant] ?? 'text-white'
                    }`}
                  >
                    {ENCHANT_OPTIONS.map((ench) => (
                      <option key={ench} value={ench}>
                        +{ench}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {item.id && !showSpecs && (() => {
                const displayName =
                  getLocalizedItemName(item.id, locale, item.name) ?? item.name ?? item.id
                return (
                  <div className="flex items-center gap-2 bg-gray-800 rounded p-2">
                    <ItemImage itemId={item.id} itemName={displayName} size={32} />
                    <span className="text-xs text-gray-300 truncate flex-1">{displayName}</span>
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
