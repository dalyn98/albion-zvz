'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, X, History } from 'lucide-react'
import { cancelMyOrder, type MyOrderRow } from '@/app/actions/shop-member'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  orders: MyOrderRow[]
  timezone: string
  interactionMode?: 'live' | 'demo'
  visualRefreshEnabled?: boolean
}

const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const STATUS_BADGE_CLASS: Record<MyOrderRow['status'], string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-gray-700 text-gray-300',
}

const STATUS_LABEL_KEY: Record<MyOrderRow['status'], string> = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  cancelled: 'statusCancelled',
}

export default function ShopMyOrders({
  orders,
  timezone,
  interactionMode = 'live',
  visualRefreshEnabled = false,
}: Props) {
  const t = useTranslations('shopMyOrders')
  const [manualExpanded, setManualExpanded] = useState(false)
  const [demoCancelledIds, setDemoCancelledIds] = useState<Set<string>>(() => new Set())
  const visibleOrders =
    interactionMode === 'demo'
      ? orders.filter((order) => !demoCancelledIds.has(order.id))
      : orders

  const pendingCount = visibleOrders.filter((o) => o.status === 'pending').length
  const pickupReadyOrders = visibleOrders.filter((o) => o.status === 'approved' && o.pickupNote)
  const firstPickupReadyOrder = pickupReadyOrders[0]
  // v3 keeps the catalog in the first viewport: ready-for-pickup is already
  // shaped as a high-signal strip, while the full order history opens on demand.
  const expanded = visualRefreshEnabled ? manualExpanded : pickupReadyOrders.length > 0 || manualExpanded

  if (visibleOrders.length === 0) return null

  return (
    <div className="v3-shop-order-history bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {firstPickupReadyOrder && (
        <button
          type="button"
          onClick={() => setManualExpanded(true)}
          className="w-full border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-left hover:bg-emerald-500/15"
        >
          <span className="block text-xs font-semibold text-emerald-200">
            {pickupReadyOrders.length === 1
              ? t('pickupReadySingle')
              : t('pickupReadyMultiple', { count: pickupReadyOrders.length })}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-emerald-100/80">
            {t('pickupNotePrefix', { note: firstPickupReadyOrder.pickupNote ?? '' })}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setManualExpanded((v) => {
          if (visualRefreshEnabled) return !v
          return firstPickupReadyOrder ? true : !v
        })}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800/60 transition-colors"
      >
        <History size={14} className="text-gray-400" />
        <span className="text-sm text-white font-semibold">{t('title')}</span>
        <span className="text-xs text-gray-500">({visibleOrders.length})</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
            {t('pendingBadge', { count: pendingCount })}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800">
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              timezone={timezone}
              interactionMode={interactionMode}
              onDemoCancel={() =>
                setDemoCancelledIds((prev) => {
                  const next = new Set(prev)
                  next.add(order.id)
                  return next
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({
  order,
  timezone,
  interactionMode,
  onDemoCancel,
}: {
  order: MyOrderRow
  timezone: string
  interactionMode: 'live' | 'demo'
  onDemoCancel: () => void
}) {
  const router = useRouter()
  const t = useTranslations('shopMyOrders')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const askConfirm = useConfirm()
  const badgeClass = STATUS_BADGE_CLASS[order.status]
  const badgeLabel = t(STATUS_LABEL_KEY[order.status])

  const handleCancel = async () => {
    const ok = await askConfirm({ body: t('cancelConfirm'), destructive: true })
    if (!ok) return
    if (interactionMode === 'demo') {
      onDemoCancel()
      return
    }
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
        <span className={`font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
          {badgeLabel}
        </span>
        <span className="text-gray-400 font-mono">
          {t('summary', {
            points: INTEGER_FORMATTER.format(order.totalPoints),
            types: order.items.length,
          })}
        </span>
        {order.priceReviewRequired && (
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
            {t('priceReviewBadge')}
          </span>
        )}
        <span className="ml-auto text-gray-500 font-mono">
          {formatDateTimeShort(order.createdAt, timezone)}
        </span>
      </div>
      <div className="text-xs text-gray-400 space-y-0.5">
        {order.items.slice(0, 4).map((it, idx) => {
          const displayName = it.nameKo
          return (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-gray-200 truncate">
                {displayName}
                {it.enchant > 0 && (
                  <span className="text-amber-300 ml-1">.{it.enchant}</span>
                )}
              </span>
              <span className="text-gray-500 font-mono">× {it.quantity}</span>
            </div>
          )
        })}
        {order.items.length > 4 && (
          <p className="text-gray-500">{t('itemsMore', { count: order.items.length - 4 })}</p>
        )}
      </div>
      {order.memberNote && (
        <p className="text-[11px] text-gray-500 italic">
          {t('memberNotePrefix', { note: order.memberNote })}
        </p>
      )}
      {order.pickupNote && (
        <p className="text-[11px] text-emerald-200/90 bg-emerald-500/10 border border-emerald-500/25 rounded px-2 py-1">
          {t('pickupNotePrefix', { note: order.pickupNote })}
        </p>
      )}
      {order.priceAdjustment && (
        <p className="text-[11px] text-sky-200/90 bg-sky-500/10 border border-sky-500/25 rounded px-2 py-1">
          {t('priceAdjustmentPrefix', {
            from: INTEGER_FORMATTER.format(order.priceAdjustment.requestedTotalPoints),
            to: INTEGER_FORMATTER.format(order.priceAdjustment.approvedTotalPoints),
          })}
        </p>
      )}
      {order.adminNote && (
        <p className="text-[11px] text-amber-200/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
          {t('adminNotePrefix', { note: order.adminNote })}
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
          {t('cancelButton')}
        </button>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
