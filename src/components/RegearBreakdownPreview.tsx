'use client'

// 자동 리기어의 부위별 AODP 시세 breakdown 을 관리자 검토 UI 에서 접을 수
// 있는 테이블로 표시. 청구자가 수정한 슬롯은 "직접 수정" 배지로 구분한다.
// 편집은 청구자용 /me/regear/[id] 에서만 — 여기서는 read-only 뷰.

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Package } from 'lucide-react'
import { formatSilver } from '@/lib/silver'
import { useItemNameResolver } from '@/lib/item-names-client'
import type { Locale } from '@/i18n/locales'
import { SLOT_KEYS, type SlotKey } from '@/types'
import ItemImage from './ItemImage'

export interface BreakdownItem {
  slot: string
  unique_name: string
  enchant: number
  quality: number
  count: number
  price: number | null
  city: string | null
  fallback_tier: string | null
  user_edited: boolean
}

interface Props {
  items: BreakdownItem[]
  marketSilver: number
}

function buildItemId(uniqueName: string, enchant: number): string {
  return enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
}

function subtotal(item: BreakdownItem): number {
  if (!item.price || item.price <= 0) return 0
  return item.price * item.count
}

const SLOT_KEY_SET: ReadonlySet<string> = new Set(SLOT_KEYS)

function slotLabel(slot: string, tGear: ReturnType<typeof useTranslations>): string {
  return SLOT_KEY_SET.has(slot) ? tGear(slot as SlotKey) : slot
}

export default function RegearBreakdownPreview({ items, marketSilver }: Props) {
  const t = useTranslations('regearBreakdown')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const editedCount = items.filter((it) => it.user_edited).length

  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-900/60"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs text-gray-300">
          <ChevronRight
            size={13}
            className={`text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <Package size={13} className="text-gray-500" />
          {t('previewTitle')} {t('slotCount', { count: items.length })}
          {editedCount > 0 && (
            <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              {t('userEditedBadge', { count: editedCount })}
            </span>
          )}
        </span>
        <span className="text-[11px] text-gray-500 font-mono">{formatSilver(marketSilver)}s</span>
      </button>
      {open && (
        <>
          <div className="space-y-2 p-2 sm:hidden">
            {items.map((item) => {
              const itemId = buildItemId(item.unique_name, item.enchant)
              const displayName =
                getLocalizedItemName(item.unique_name, locale, item.unique_name) ?? item.unique_name
              return (
                <article key={item.slot} className="rounded-lg border border-gray-800 bg-gray-900/60 p-2.5">
                  <div className="flex items-start gap-2">
                    <ItemImage itemId={itemId} itemName={displayName} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-gray-500">{slotLabel(item.slot, tGear)}</p>
                      <p className="truncate text-xs font-semibold text-gray-200">{displayName}</p>
                      <p className="text-[10px] text-gray-600">
                        {item.enchant > 0 ? `+${item.enchant} · ` : ''}Q{item.quality}
                        {item.city && <span className="ml-1">· {item.city}</span>}
                        {item.user_edited && <span className="ml-2 font-semibold text-amber-400">{t('userEditedLabel')}</span>}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-gray-800 pt-2 text-[10px]">
                    <Metric label={t('countHeader')} value={`× ${item.count}`} />
                    <Metric label={t('unitHeader')} value={item.price === null ? t('priceUnassigned') : `${formatSilver(item.price)}s`} />
                    <Metric label={t('subtotalHeader')} value={subtotal(item) > 0 ? `${formatSilver(subtotal(item))}s` : '—'} accent />
                  </dl>
                </article>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="bg-gray-950 border-t border-gray-800 text-gray-500 uppercase tracking-wide">
              <th className="text-left px-3 py-1.5 font-semibold">{t('slotHeader')}</th>
              <th className="text-left px-3 py-1.5 font-semibold">{t('itemHeader')}</th>
              <th className="text-right px-3 py-1.5 font-semibold">{t('countHeader')}</th>
              <th className="text-right px-3 py-1.5 font-semibold">{t('unitHeader')}</th>
              <th className="text-right px-3 py-1.5 font-semibold">{t('subtotalHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const itemId = buildItemId(it.unique_name, it.enchant)
              const displayName =
                getLocalizedItemName(it.unique_name, locale, it.unique_name) ?? it.unique_name
              return (
                <tr key={it.slot} className="border-t border-gray-900">
                  <td className="px-3 py-1.5 text-gray-500">{slotLabel(it.slot, tGear)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <ItemImage itemId={itemId} itemName={displayName} size={28} />
                      <div className="min-w-0">
                        <p className="text-gray-200 truncate">{displayName}</p>
                        <p className="text-gray-600 text-[10px]">
                          {it.enchant > 0 ? `+${it.enchant} · ` : ''}Q{it.quality}
                          {it.city && <span className="ml-1">· {it.city}</span>}
                          {it.user_edited && (
                            <span className="ml-2 text-amber-400 font-semibold">{t('userEditedLabel')}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">× {it.count}</td>
                  <td className="px-3 py-1.5 text-right text-gray-300 font-mono">
                    {it.price === null ? (
                      <span className="text-gray-600">{t('priceUnassigned')}</span>
                    ) : (
                      <>{formatSilver(it.price)}s</>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-amber-300 font-mono">
                    {subtotal(it) > 0 ? `${formatSilver(subtotal(it))}s` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-gray-600">{label}</dt>
      <dd className={`mt-0.5 font-mono ${accent ? 'text-amber-300' : 'text-gray-300'}`}>{value}</dd>
    </div>
  )
}
