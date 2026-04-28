'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Plus, Save, Shield, Trash2 } from 'lucide-react'
import {
  GEAR_SLOTS,
  categorizeGearItem,
  type GearArmorMaterial,
  type GearSlot,
  type InventoryGearRow,
} from '@/lib/inventory'
import {
  adjustGearAction,
  setGearAction,
} from '@/app/actions/inventory'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemImage from './ItemImage'
import ItemPicker from './ItemPicker'
import { useToast } from './ToastProvider'

interface Props {
  initialGear: InventoryGearRow[]
}

interface CategorizedRow extends InventoryGearRow {
  slot: GearSlot
  armorMaterial: GearArmorMaterial | null
  tier: number | null
}

// Tailwind purge 안전을 위한 정적 매핑. 클래스를 동적으로 조합하지 않는다.
const MATERIAL_BADGE_STYLE: Record<GearArmorMaterial, string> = {
  PLATE: 'bg-slate-500/15 text-slate-200 border-slate-500/40',
  LEATHER: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  CLOTH: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
}

export default function AdminInventoryGearPanel({ initialGear }: Props) {
  const t = useTranslations('adminInventory')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const toast = useToast()
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [pickerName, setPickerName] = useState<string | null>(null)
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [pickerEnchant, setPickerEnchant] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [slotFilter, setSlotFilter] = useState<GearSlot | 'all'>('all')
  const [, startTransition] = useTransition()

  const rows = useMemo<CategorizedRow[]>(() => {
    return initialGear
      .filter((r) => r.quantity > 0)
      .map((r) => {
        const cat = categorizeGearItem(r.itemId)
        return { ...r, ...cat }
      })
  }, [initialGear])

  // 슬롯별 카운트 — 칩 배지에 표시. armor 슬롯도 모두 별도 카운트.
  const countsBySlot = useMemo(() => {
    const counts: Record<GearSlot | 'all', number> = {
      all: 0,
      weapon: 0,
      head: 0,
      armor: 0,
      shoes: 0,
      offhand: 0,
      cape: 0,
      bag: 0,
      other: 0,
    }
    for (const r of rows) {
      counts.all += r.quantity
      counts[r.slot] += r.quantity
    }
    return counts
  }, [rows])

  // 필터된 + 그룹된 결과: slot → CategorizedRow[]
  const groups = useMemo(() => {
    const filtered = slotFilter === 'all'
      ? rows
      : rows.filter((r) => r.slot === slotFilter)

    const map = new Map<GearSlot, CategorizedRow[]>()
    for (const r of filtered) {
      const list = map.get(r.slot) ?? []
      list.push(r)
      map.set(r.slot, list)
    }
    // 슬롯 순서를 GEAR_SLOTS 상수 순서로 고정. 각 그룹 내부는 tier desc → name asc.
    const ordered: Array<[GearSlot, CategorizedRow[]]> = []
    for (const slot of GEAR_SLOTS) {
      const items = map.get(slot)
      if (items && items.length > 0) {
        items.sort((a, b) => {
          const ta = a.tier ?? 0
          const tb = b.tier ?? 0
          if (ta !== tb) return tb - ta
          return a.itemId.localeCompare(b.itemId)
        })
        ordered.push([slot, items])
      }
    }
    return ordered
  }, [rows, slotFilter])

  const onAdjust = (itemId: string, delta: number) => {
    startTransition(async () => {
      const r = await adjustGearAction({ itemId, delta })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const onSet = (itemId: string, raw: string) => {
    const qty = Number(raw)
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error(t('errInvalidQty'))
      return
    }
    startTransition(async () => {
      const r = await setGearAction({ itemId, quantity: qty })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setEditingId(null)
      setDraft('')
      router.refresh()
    })
  }

  const onAddSelected = () => {
    if (!pickerId) {
      toast.error(t('errPickItemFirst'))
      return
    }
    // ItemPicker 가 돌려주는 itemId 는 base (티어 포함, 인챈트 미포함). 사용자가 고른 인챈트만 @N 으로 합친다.
    const base = pickerId.split('@')[0]
    const finalId = pickerEnchant > 0 ? `${base}@${pickerEnchant}` : base
    startTransition(async () => {
      const r = await adjustGearAction({ itemId: finalId, delta: 1 })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setPickerName(null)
      setPickerId(null)
      setPickerEnchant(0)
      router.refresh()
    })
  }

  const slotChips: Array<GearSlot | 'all'> = ['all', ...GEAR_SLOTS]

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Shield size={16} className="text-amber-400" />
          {t('gearTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('gearHint')}</p>
      </div>

      <div className="bg-gray-950/40 border border-gray-800 rounded-xl p-3 space-y-2">
        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
          {t('addGearLabel')}
        </p>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <ItemPicker
            label={t('addGearPickerLabel')}
            category="weapon,offhand,head,armor,shoes,cape,bag"
            itemName={pickerName}
            itemId={pickerId}
            onChange={(name, id) => {
              setPickerName(name)
              setPickerId(id)
            }}
            onClear={() => {
              setPickerName(null)
              setPickerId(null)
            }}
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
              {t('addGearEnchantLabel')}
            </label>
            <select
              value={pickerEnchant}
              onChange={(e) => setPickerEnchant(Number(e.target.value) as 0 | 1 | 2 | 3 | 4)}
              className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
            >
              <option value={0}>@0</option>
              <option value={1}>@1</option>
              <option value={2}>@2</option>
              <option value={3}>@3</option>
              <option value={4}>@4</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onAddSelected}
            disabled={!pickerId}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 justify-center"
          >
            <Plus size={12} />
            {t('btnAddGear')}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-6">{t('gearEmpty')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {slotChips.map((s) => {
              const active = slotFilter === s
              const count = countsBySlot[s]
              if (s !== 'all' && count === 0) return null
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlotFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <span>{t(`gearSlot.${s}`)}</span>
                  <span className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {groups.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-6">{t('gearEmptyFiltered')}</p>
          ) : (
            <div className="space-y-4">
              {groups.map(([slot, items]) => (
                <div key={slot} className="space-y-1.5">
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1 flex items-center gap-2">
                    <span>{t(`gearSlot.${slot}`)}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500 normal-case font-normal tabular-nums">
                      {items.reduce((acc, r) => acc + r.quantity, 0)}
                    </span>
                  </h3>
                  <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden bg-gray-950/30">
                    {items.map((row) => {
                      const isEditing = editingId === row.itemId
                      const name = getLocalizedItemNameWithEnchant(row.itemId, locale, null) ?? row.itemId
                      return (
                        <li key={row.itemId} className="px-3 py-2 flex items-center gap-3">
                          <ItemImage itemId={row.itemId} itemName={name} size={36} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-white text-xs font-medium truncate">{name}</p>
                              {row.armorMaterial && (
                                <span
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${MATERIAL_BADGE_STYLE[row.armorMaterial]}`}
                                >
                                  {t(`armorMaterial.${row.armorMaterial}`)}
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500 text-[10px] font-mono truncate">{row.itemId}</p>
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => onSet(row.itemId, draft)}
                                className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                                aria-label={t('btnSave')}
                              >
                                <Save size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setDraft('')
                                }}
                                className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white"
                              >
                                {t('btnCancel')}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onAdjust(row.itemId, -1)}
                                className="p-1 rounded text-gray-500 hover:text-rose-300 hover:bg-rose-500/10"
                                aria-label={t('btnMinus')}
                              >
                                <Minus size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(row.itemId)
                                  setDraft(String(row.quantity))
                                }}
                                className="px-2 py-0.5 rounded font-mono font-semibold text-amber-200 hover:bg-amber-500/10 tabular-nums min-w-[36px] text-center"
                              >
                                {row.quantity}
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjust(row.itemId, 1)}
                                className="p-1 rounded text-gray-500 hover:text-emerald-300 hover:bg-emerald-500/10"
                                aria-label={t('btnPlus')}
                              >
                                <Plus size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSet(row.itemId, '0')}
                                className="ml-1 p-1 rounded text-gray-600 hover:text-rose-400 hover:bg-rose-500/10"
                                aria-label={t('btnRemove')}
                                title={t('btnRemove')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
