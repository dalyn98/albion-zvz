'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, X, History } from 'lucide-react'
import { cancelMyOrder, type MyOrderRow } from '@/app/actions/shop-member'
import { formatDateTimeShort } from '@/lib/format-datetime'

interface Props {
  orders: MyOrderRow[]
}

const STATUS_BADGE: Record<MyOrderRow['status'], { label: string; className: string }> = {
  pending: { label: '대기중', className: 'bg-yellow-500/20 text-yellow-300' },
  approved: { label: '승인', className: 'bg-emerald-500/20 text-emerald-300' },
  rejected: { label: '거절', className: 'bg-red-500/20 text-red-300' },
  cancelled: { label: '취소됨', className: 'bg-gray-700 text-gray-300' },
}

export default function ShopMyOrders({ orders }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (orders.length === 0) return null

  const pendingCount = orders.filter((o) => o.status === 'pending').length

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800/60 transition-colors"
      >
        <History size={14} className="text-gray-400" />
        <span className="text-sm text-white font-semibold">내 주문</span>
        <span className="text-xs text-gray-500">({orders.length})</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
            대기 {pendingCount}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: MyOrderRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const badge = STATUS_BADGE[order.status]

  const handleCancel = () => {
    if (!confirm('이 주문을 취소합니다. 계속?')) return
    setError('')
    startTransition(async () => {
      const result = await cancelMyOrder(order.id)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`font-semibold px-2 py-0.5 rounded ${badge.className}`}>
          {badge.label}
        </span>
        <span className="text-gray-400 font-mono">
          {order.totalPoints.toLocaleString()}p · {order.items.length}종
        </span>
        <span className="ml-auto text-gray-500 font-mono">
          {formatDateTimeShort(order.createdAt)}
        </span>
      </div>
      <div className="text-xs text-gray-400 space-y-0.5">
        {order.items.slice(0, 4).map((it, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="text-gray-200 truncate">
              {it.nameKo}
              {it.enchant > 0 && (
                <span className="text-amber-300 ml-1">.{it.enchant}</span>
              )}
            </span>
            <span className="text-gray-500 font-mono">× {it.quantity}</span>
          </div>
        ))}
        {order.items.length > 4 && (
          <p className="text-gray-500">... 외 {order.items.length - 4}종</p>
        )}
      </div>
      {order.memberNote && (
        <p className="text-[11px] text-gray-500 italic">메모: {order.memberNote}</p>
      )}
      {order.adminNote && (
        <p className="text-[11px] text-amber-200/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
          관리자: {order.adminNote}
        </p>
      )}
      {order.status === 'pending' && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 disabled:text-gray-600"
        >
          <X size={11} />
          주문 취소
        </button>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
