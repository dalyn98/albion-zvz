'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Boxes, Minus, Plus, Save } from 'lucide-react'
import {
  INVENTORY_ENCHANTMENTS,
  INVENTORY_MATERIAL_TYPES,
  INVENTORY_TIERS,
  type InventoryEnchantment,
  type InventoryMaterialRow,
  type InventoryMaterialType,
  type InventoryTier,
} from '@/lib/inventory'
import {
  adjustMaterialAction,
  setMaterialAction,
} from '@/app/actions/inventory'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { useToast } from './ToastProvider'

interface Props {
  initialMaterials: InventoryMaterialRow[]
}

interface CellKey {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
}

// (type/tier/ench) → quantity 빠른 lookup 용. 없는 셀은 0 으로 간주.
function buildIndex(rows: InventoryMaterialRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(`${r.materialType}|${r.tier}|${r.enchantment}`, r.quantity)
  }
  return map
}

function cellKey(k: CellKey): string {
  return `${k.materialType}|${k.tier}|${k.enchantment}`
}

// 정련 재료 id 규칙: 기본은 T{tier}_{TYPE}, 인챈트는 @N suffix.
// 예: T6_METALBAR / T6_METALBAR@1 / T6_METALBAR@2 / T6_METALBAR@3.
function materialItemId(k: CellKey): string {
  const base = `T${k.tier}_${k.materialType}`
  return k.enchantment > 0 ? `${base}@${k.enchantment}` : base
}

export default function AdminInventoryMaterialsPanel({ initialMaterials }: Props) {
  const t = useTranslations('adminInventory')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const toast = useToast()
  const router = useRouter()
  const [activeType, setActiveType] = useState<InventoryMaterialType>('METALBAR')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [, startTransition] = useTransition()

  const index = useMemo(() => buildIndex(initialMaterials), [initialMaterials])

  const onAdjust = (key: CellKey, delta: number) => {
    startTransition(async () => {
      const r = await adjustMaterialAction({ ...key, delta })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const onSet = (key: CellKey) => {
    const qty = Number(draft)
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error(t('errInvalidQty'))
      return
    }
    startTransition(async () => {
      const r = await setMaterialAction({ ...key, quantity: qty })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setEditing(null)
      setDraft('')
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('materialsHint')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {INVENTORY_MATERIAL_TYPES.map((type) => {
          const active = activeType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setActiveType(type)
                setEditing(null)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {t(`materialType.${type}`)}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-2 font-semibold text-gray-400">
                {t('thTier')}
              </th>
              {INVENTORY_ENCHANTMENTS.map((ench) => (
                <th key={ench} className="text-left py-2 px-2 font-semibold text-gray-400">
                  {ench === 0 ? t('thEnchBase') : `.${ench}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVENTORY_TIERS.map((tier) => (
              <tr key={tier} className="border-b border-gray-800/60">
                <td className="py-2 px-2 text-gray-300 font-medium whitespace-nowrap">
                  T{tier}
                </td>
                {INVENTORY_ENCHANTMENTS.map((ench) => {
                  const key: CellKey = { materialType: activeType, tier, enchantment: ench }
                  const id = cellKey(key)
                  const qty = index.get(id) ?? 0
                  const isEditing = editing === id
                  const itemId = materialItemId(key)
                  const itemName = getLocalizedItemNameWithEnchant(itemId, locale, null) ?? itemId
                  return (
                    <td key={ench} className="py-1.5 px-2 align-top min-w-[140px]">
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
                            onClick={() => onSet(key)}
                            className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                            aria-label={t('btnSave')}
                          >
                            <Save size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null)
                              setDraft('')
                            }}
                            className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white"
                          >
                            {t('btnCancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(id)
                            setDraft(String(qty))
                          }}
                          title={itemName}
                          className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                            qty > 0
                              ? 'text-amber-200 hover:bg-amber-500/10'
                              : 'text-gray-500 hover:bg-gray-800'
                          }`}
                        >
                          <span className="font-mono font-semibold tabular-nums">
                            {qty}
                          </span>
                        </button>
                      )}
                      {!isEditing && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <button
                            type="button"
                            onClick={() => onAdjust(key, -1)}
                            disabled={qty <= 0}
                            className="p-0.5 rounded text-gray-500 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label={t('btnMinus')}
                          >
                            <Minus size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdjust(key, 1)}
                            className="p-0.5 rounded text-gray-500 hover:text-emerald-300 hover:bg-emerald-500/10"
                            aria-label={t('btnPlus')}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
