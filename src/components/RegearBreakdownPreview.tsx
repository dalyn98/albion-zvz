'use client'

// 자동 리기어의 부위별 AODP 시세 breakdown 을 관리자 검토 UI 에서 접을 수
// 있는 테이블로 표시. 청구자가 수정한 슬롯은 "직접 수정" 배지로 구분한다.
// 편집은 청구자용 /me/regear/[id] 에서만 — 여기서는 read-only 뷰.

import { useState } from 'react'
import { ChevronRight, Package } from 'lucide-react'
import { formatSilver } from '@/lib/silver'
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

export default function RegearBreakdownPreview({ items, marketSilver }: Props) {
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
          부위별 시세 내역 ({items.length}슬롯)
          {editedCount > 0 && (
            <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              직접 수정 {editedCount}
            </span>
          )}
        </span>
        <span className="text-[11px] text-gray-500 font-mono">{formatSilver(marketSilver)}s</span>
      </button>
      {open && (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-950 border-t border-gray-800 text-gray-500 uppercase tracking-wide">
              <th className="text-left px-3 py-1.5 font-semibold">슬롯</th>
              <th className="text-left px-3 py-1.5 font-semibold">아이템</th>
              <th className="text-right px-3 py-1.5 font-semibold">수량</th>
              <th className="text-right px-3 py-1.5 font-semibold">단위</th>
              <th className="text-right px-3 py-1.5 font-semibold">소계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const itemId = buildItemId(it.unique_name, it.enchant)
              return (
                <tr key={it.slot} className="border-t border-gray-900">
                  <td className="px-3 py-1.5 text-gray-500 font-mono">{it.slot}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <ItemImage itemId={itemId} itemName={it.unique_name} size={28} />
                      <div className="min-w-0">
                        <p className="text-gray-200 truncate">{it.unique_name}</p>
                        <p className="text-gray-600 text-[10px]">
                          {it.enchant > 0 ? `+${it.enchant} · ` : ''}Q{it.quality}
                          {it.city && <span className="ml-1">· {it.city}</span>}
                          {it.user_edited && (
                            <span className="ml-2 text-amber-400 font-semibold">직접 수정</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">× {it.count}</td>
                  <td className="px-3 py-1.5 text-right text-gray-300 font-mono">
                    {it.price === null ? (
                      <span className="text-gray-600">미산정</span>
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
      )}
    </div>
  )
}
