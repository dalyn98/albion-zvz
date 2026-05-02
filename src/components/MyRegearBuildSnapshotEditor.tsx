'use client'

// 자동 생성된 제작 모드 리기어의 빌드 정보 편집기. 청구자가 부위별로 티어/인챈트를
// 보정해 제작자가 정확한 아이템을 만들 수 있게 한다. 정상 흐름에선 killboard
// equipment 가 들어와 슬롯이 채워져 있고, 청구자는 강화 수치만 조정. sync 지연
// 등으로 슬롯이 비어있으면 ItemPicker 로 처음부터 채울 수 있다.
//
// 저장은 슬롯 단위 server action 호출. 한 번에 한 슬롯만 in-flight — 동일 슬롯에
// 빠른 변경이 들어오면 마지막 것만 살아남는다 (각 셀렉트의 onChange 직후 즉시 저장).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { updateMyRegearBuildSnapshotSlot } from '@/app/actions/regear'
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
  requestId: string
  buildSnapshot: BuildSnapshot | null
  roleName: string
  editable: boolean
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

function emptySnapshot(roleName: string | null): BuildSnapshot {
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

export default function MyRegearBuildSnapshotEditor({
  requestId,
  buildSnapshot,
  roleName,
  editable,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regearBuildSnapshot')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale
  const [snapshot, setSnapshot] = useState<BuildSnapshot>(
    buildSnapshot ?? emptySnapshot(roleName || null),
  )
  const [savingSlot, setSavingSlot] = useState<SlotKey | null>(null)
  const [errorSlot, setErrorSlot] = useState<{ slot: SlotKey; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const persist = (slot: SlotKey, name: string | null, id: string | null) => {
    setErrorSlot(null)
    setSavingSlot(slot)
    startTransition(async () => {
      const result = await updateMyRegearBuildSnapshotSlot(requestId, slot, name, id)
      setSavingSlot(null)
      if (result.error) {
        setErrorSlot({ slot, message: result.error })
        return
      }
      if (result.buildSnapshot) {
        setSnapshot(result.buildSnapshot)
      }
      router.refresh()
    })
  }

  const handleTierChange = (slot: SlotKey, parsed: ParsedId, nextTier: number) => {
    const id = composeItemId(parsed.baseAfterTier, nextTier, parsed.enchant)
    setSnapshot((prev) => ({ ...prev, [slot]: { ...prev[slot], id } }))
    persist(slot, snapshot[slot].name, id)
  }

  const handleEnchantChange = (slot: SlotKey, parsed: ParsedId, nextEnchant: number) => {
    const id = composeItemId(parsed.baseAfterTier, parsed.tier, nextEnchant)
    setSnapshot((prev) => ({ ...prev, [slot]: { ...prev[slot], id } }))
    persist(slot, snapshot[slot].name, id)
  }

  const handlePick = (slot: SlotKey, name: string, id: string) => {
    setSnapshot((prev) => ({ ...prev, [slot]: { name, id } }))
    persist(slot, name, id)
  }

  const handleClear = (slot: SlotKey) => {
    setSnapshot((prev) => ({ ...prev, [slot]: { name: null, id: null } }))
    persist(slot, null, null)
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-white">{t('title')}</h2>
        <p className="text-xs text-gray-500 leading-relaxed">{t('description')}</p>
      </header>

      <div className="space-y-2">
        {SLOT_KEYS.map((slot) => {
          const item = snapshot[slot]
          const parsed = parseItemId(item.id)
          const isSaving = savingSlot === slot && pending
          const error = errorSlot?.slot === slot ? errorSlot.message : null
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
                {editable ? (
                  <ItemPicker
                    label={item.id ? t('changeItem') : t('pickItem')}
                    category={SLOT_PICKER_CATEGORY[slot]}
                    itemName={item.name}
                    itemId={item.id}
                    onChange={(name, id) => handlePick(slot, name, id)}
                    onClear={() => handleClear(slot)}
                  />
                ) : item.id ? (
                  (() => {
                    const displayName =
                      getLocalizedItemName(item.id, locale, item.name) ?? item.name ?? item.id
                    return (
                      <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
                        <ItemImage itemId={item.id} itemName={displayName} size={40} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs truncate">{displayName}</p>
                          <p className="text-gray-500 text-[10px] font-mono truncate">{item.id}</p>
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-xs text-gray-600 px-2 py-3 bg-gray-900 border border-dashed border-gray-700 rounded">
                    {t('slotEmpty')}
                  </p>
                )}

                {editable && item.id && parsed && showSpecs && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-500 w-10">{t('tierLabel')}</label>
                    <select
                      value={parsed.tier}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleTierChange(slot, parsed, parseInt(e.target.value, 10))
                      }
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
                      disabled={isSaving}
                      onChange={(e) =>
                        handleEnchantChange(slot, parsed, parseInt(e.target.value, 10))
                      }
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
                    {isSaving && <Loader2 size={14} className="animate-spin text-amber-400" />}
                  </div>
                )}

                {error && <p className="text-[11px] text-red-400">{error}</p>}
              </div>
            </div>
          )
        })}
      </div>

      {!editable && <p className="text-[11px] text-gray-500">{t('readOnlyHint')}</p>}
    </section>
  )
}
