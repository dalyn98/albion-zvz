'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Plus, Save, Shield, Trash2 } from 'lucide-react'
import type { InventoryGearRow } from '@/lib/inventory'
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
  const [, startTransition] = useTransition()

  const visible = initialGear.filter((r) => r.quantity > 0)

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
    startTransition(async () => {
      const r = await adjustGearAction({ itemId: pickerId, delta: 1 })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setPickerName(null)
      setPickerId(null)
      router.refresh()
    })
  }

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
        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
          <ItemPicker
            label={t('addGearPickerLabel')}
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

      {visible.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-6">{t('gearEmpty')}</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {visible.map((row) => {
            const isEditing = editingId === row.itemId
            const name = getLocalizedItemNameWithEnchant(row.itemId, locale, null) ?? row.itemId
            return (
              <li key={row.itemId} className="py-2.5 flex items-center gap-3">
                <ItemImage itemId={row.itemId} itemName={name} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{name}</p>
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
      )}
    </section>
  )
}
