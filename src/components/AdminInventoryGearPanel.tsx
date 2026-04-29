'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Plus, Save, Search, Shield, Trash2 } from 'lucide-react'
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
  enchant: number
  localizedName: string
}

// Tailwind purge 안전을 위한 정적 매핑. 클래스를 동적으로 조합하지 않는다.
const MATERIAL_BADGE_STYLE: Record<GearArmorMaterial, string> = {
  PLATE: 'bg-slate-500/15 text-slate-200 border-slate-500/40',
  LEATHER: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  CLOTH: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const re = new RegExp(`(${escapeRegex(query)})`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-amber-300/40 text-amber-100 rounded px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function extractEnchant(itemId: string): number {
  const m = itemId.match(/@(\d)$/)
  if (m) return Number(m[1])
  return 0
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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [, startTransition] = useTransition()

  const rows = useMemo<CategorizedRow[]>(() => {
    return initialGear
      .filter((r) => r.quantity > 0)
      .map((r) => {
        const cat = categorizeGearItem(r.itemId)
        const localizedName = getLocalizedItemNameWithEnchant(r.itemId, locale, null) ?? r.itemId
        return {
          ...r,
          ...cat,
          enchant: extractEnchant(r.itemId),
          localizedName,
        }
      })
      .sort((a, b) => {
        // GEAR_SLOTS 순서로 1차 정렬, 그 안에서 tier desc → name asc.
        const sa = GEAR_SLOTS.indexOf(a.slot)
        const sb = GEAR_SLOTS.indexOf(b.slot)
        if (sa !== sb) return sa - sb
        const ta = a.tier ?? 0
        const tb = b.tier ?? 0
        if (ta !== tb) return tb - ta
        return a.localizedName.localeCompare(b.localizedName)
      })
  }, [initialGear, locale])

  // 슬롯별 카운트 — 칩 배지에 표시.
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

  const trimmedQuery = searchQuery.trim()

  const filtered = useMemo<CategorizedRow[]>(() => {
    let out = rows
    if (slotFilter !== 'all') out = out.filter((r) => r.slot === slotFilter)
    if (trimmedQuery) {
      const q = trimmedQuery.toLowerCase()
      out = out.filter(
        (r) =>
          r.itemId.toLowerCase().includes(q) ||
          r.localizedName.toLowerCase().includes(q),
      )
    }
    return out
  }, [rows, slotFilter, trimmedQuery])

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
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder:text-gray-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

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
                  <span
                    className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="text-xs text-gray-500 tabular-nums">
            {t('matchCount', { matched: filtered.length, total: rows.length })}
          </p>

          {filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-6">{t('gearEmptyFiltered')}</p>
          ) : (
            <div className="overflow-x-auto border border-gray-800 rounded-xl bg-gray-950/30">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2 font-semibold w-[72px]">{t('colImage')}</th>
                    <th className="px-3 py-2 font-semibold">{t('colName')}</th>
                    <th className="px-3 py-2 font-semibold">{t('colSlot')}</th>
                    <th className="px-3 py-2 font-semibold">{t('colTier')}</th>
                    <th className="px-3 py-2 font-semibold">{t('colEnchant')}</th>
                    <th className="px-3 py-2 font-semibold">{t('colMaterial')}</th>
                    <th className="px-3 py-2 font-semibold text-right">{t('colQuantity')}</th>
                    <th className="px-3 py-2 font-semibold text-right">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((row) => {
                    const isEditing = editingId === row.itemId
                    return (
                      <tr key={row.itemId} className="hover:bg-gray-800/30">
                        <td className="px-3 py-2 align-middle">
                          <ItemImage itemId={row.itemId} itemName={row.localizedName} size={48} />
                        </td>
                        <td className="px-3 py-2 align-middle min-w-[200px]">
                          <p className="text-white text-sm font-medium leading-tight">
                            <HighlightedText text={row.localizedName} query={trimmedQuery} />
                          </p>
                          <p className="text-gray-500 text-xs font-mono mt-0.5 leading-tight">
                            <HighlightedText text={row.itemId} query={trimmedQuery} />
                          </p>
                        </td>
                        <td className="px-3 py-2 align-middle text-gray-300 text-xs whitespace-nowrap">
                          {t(`gearSlot.${row.slot}`)}
                        </td>
                        <td className="px-3 py-2 align-middle text-gray-300 text-xs tabular-nums">
                          {row.tier ? `T${row.tier}` : '—'}
                        </td>
                        <td className="px-3 py-2 align-middle text-gray-300 text-xs tabular-nums whitespace-nowrap">
                          {row.enchant > 0 ? `@${row.enchant}` : t('thEnchBase')}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {row.armorMaterial ? (
                            <span
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded border inline-block whitespace-nowrap ${MATERIAL_BADGE_STYLE[row.armorMaterial]}`}
                            >
                              {t(`armorMaterial.${row.armorMaterial}`)}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                min={0}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => onSet(row.itemId, draft)}
                                className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                                aria-label={t('btnSave')}
                              >
                                <Save size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setDraft('')
                                }}
                                className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white"
                              >
                                {t('btnCancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(row.itemId)
                                setDraft(String(row.quantity))
                              }}
                              className="px-2 py-0.5 rounded font-mono font-bold text-amber-200 hover:bg-amber-500/10 tabular-nums min-w-[44px] text-center text-base"
                            >
                              {row.quantity}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {!isEditing && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => onAdjust(row.itemId, -1)}
                                className="p-1.5 rounded text-gray-500 hover:text-rose-300 hover:bg-rose-500/10"
                                aria-label={t('btnMinus')}
                              >
                                <Minus size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjust(row.itemId, 1)}
                                className="p-1.5 rounded text-gray-500 hover:text-emerald-300 hover:bg-emerald-500/10"
                                aria-label={t('btnPlus')}
                              >
                                <Plus size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSet(row.itemId, '0')}
                                className="ml-1 p-1.5 rounded text-gray-600 hover:text-rose-400 hover:bg-rose-500/10"
                                aria-label={t('btnRemove')}
                                title={t('btnRemove')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
