'use client'

import { useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import AlbionItemImage from '../AlbionItemImage'
import type { MemberTradeOrderRow } from '@/app/actions/member-trade'
import { formatSilver } from '@/lib/silver'
import {
  isMemberTradeBuyerActionAllowed,
  isMemberTradeSellerActionAllowed,
} from '@/lib/member-trade'
import {
  ActionButton,
  EmptyState,
  InfoPill,
  itemImageSrcs,
} from './MemberTradeMarketShared'

interface MemberTradeOrdersTabProps {
  orders: MemberTradeOrderRow[]
  deliveryNotes: Readonly<Record<string, string>>
  pending: boolean
  onDeliveryNoteChange: (orderId: string, value: string) => void
  onDelivered: (order: MemberTradeOrderRow) => void
  onConfirm: (order: MemberTradeOrderRow) => void
  onCancel: (order: MemberTradeOrderRow) => void
  onDispute: (order: MemberTradeOrderRow) => void
}

export default function MemberTradeOrdersTab({
  orders,
  deliveryNotes,
  pending,
  onDeliveryNoteChange,
  onDelivered,
  onConfirm,
  onCancel,
  onDispute,
}: MemberTradeOrdersTabProps) {
  const t = useTranslations('memberTrade')
  useEffect(() => {
    if (!window.location.hash.startsWith('#member-trade-order-')) return
    window.requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' })
    })
  }, [])
  if (orders.length === 0) {
    return (
      <section className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        <div className="2xl:col-span-2">
          <EmptyState icon={PackageCheck} title={t('noOrders')} />
        </div>
      </section>
    )
  }
  return (
    <section className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      {orders.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          deliveryNote={deliveryNotes[order.id] ?? ''}
          pending={pending}
          onDeliveryNoteChange={(value) => onDeliveryNoteChange(order.id, value)}
          onDelivered={() => onDelivered(order)}
          onConfirm={() => onConfirm(order)}
          onCancel={() => onCancel(order)}
          onDispute={() => onDispute(order)}
        />
      ))}
    </section>
  )
}

function OrderRow({
  order,
  deliveryNote,
  pending,
  onDeliveryNoteChange,
  onDelivered,
  onConfirm,
  onCancel,
  onDispute,
}: {
  order: MemberTradeOrderRow
  deliveryNote: string
  pending: boolean
  onDeliveryNoteChange: (value: string) => void
  onDelivered: () => void
  onConfirm: () => void
  onCancel: () => void
  onDispute: () => void
}) {
  const t = useTranslations('memberTrade')
  const canDeliver =
    order.relation === 'seller' && isMemberTradeSellerActionAllowed(order.status, 'deliver')
  const canSellerCancel =
    order.relation === 'seller' && isMemberTradeSellerActionAllowed(order.status, 'cancel')
  const canBuyerCancel =
    order.relation === 'buyer' && isMemberTradeBuyerActionAllowed(order.status, 'cancel')
  const canConfirm =
    order.relation === 'buyer' && isMemberTradeBuyerActionAllowed(order.status, 'confirm')
  const canDispute =
    order.relation === 'buyer' && isMemberTradeBuyerActionAllowed(order.status, 'dispute')

  return (
    <article
      id={`member-trade-order-${order.id}`}
      className="scroll-mt-24 space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <OrderItemPreview items={order.items} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{order.listingTitle ?? order.nameKo}</h3>
            <p className="truncate text-xs text-gray-500">
              {order.relation === 'buyer'
                ? t('sellerValue', { name: order.sellerUsername })
                : t('buyerValue', { name: order.buyerUsername })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className="font-mono text-sm font-black text-amber-300">
            {formatSilver(order.totalPoints)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <InfoPill label={t('quantity')} value={formatSilver(order.quantity)} />
        <InfoPill label={t('itemCount')} value={t('itemCountValue', { count: order.items.length })} />
        <InfoPill label={t('relation')} value={t(`relationValue.${order.relation}`)} />
        <InfoPill label={t('statusLabel')} value={t(`status.${order.status}`)} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {order.items.map((item) => (
          <OrderItemLine key={item.id} item={item} />
        ))}
      </div>

      {order.sellerDeliveryNote && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {order.sellerDeliveryNote}
        </p>
      )}
      {order.disputeReason && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {order.disputeReason}
        </p>
      )}

      {canDeliver && (
        <input
          value={deliveryNote}
          onChange={(event) => onDeliveryNoteChange(event.target.value)}
          placeholder={t('deliveryDoneNotePlaceholder')}
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {canDeliver && (
          <ActionButton icon={Truck} disabled={pending} onClick={onDelivered}>
            {t('markDelivered')}
          </ActionButton>
        )}
        {canConfirm && (
          <ActionButton icon={CheckCircle2} disabled={pending} onClick={onConfirm} tone="green">
            {t('confirmReceived')}
          </ActionButton>
        )}
        {canDispute && (
          <ActionButton icon={AlertTriangle} disabled={pending} onClick={onDispute} tone="red">
            {t('openDispute')}
          </ActionButton>
        )}
        {(canSellerCancel || canBuyerCancel) && (
          <ActionButton icon={XCircle} disabled={pending} onClick={onCancel} tone="gray">
            {t('cancelOrder')}
          </ActionButton>
        )}
      </div>
    </article>
  )
}

function OrderItemPreview({ items }: { items: MemberTradeOrderRow['items'] }) {
  const previewItems = items.slice(0, 3)
  const remaining = Math.max(0, items.length - previewItems.length)
  return (
    <div className="flex h-12 min-w-20 shrink-0 items-center -space-x-2">
      {previewItems.map((item) => {
        const srcs = itemImageSrcs(item.uniqueName, item.enchant, 44)
        return (
          <span
            key={item.id}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 bg-gray-950"
          >
            <AlbionItemImage
              src={srcs[0]}
              fallbackSrcs={srcs.slice(1)}
              alt=""
              width={36}
              height={36}
              unoptimized
            />
          </span>
        )
      })}
      {remaining > 0 && (
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-xs font-black text-gray-300">
          +{remaining}
        </span>
      )}
    </div>
  )
}

function OrderItemLine({ item }: { item: MemberTradeOrderRow['items'][number] }) {
  const srcs = itemImageSrcs(item.uniqueName, item.enchant, 40)
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-800 bg-gray-950 px-2 py-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-900">
        <AlbionItemImage
          src={srcs[0]}
          fallbackSrcs={srcs.slice(1)}
          alt=""
          width={34}
          height={34}
          unoptimized
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-white">
          {item.nameKo}
          {item.enchant > 0 ? ` .${item.enchant}` : ''}
        </p>
        <p className="truncate font-mono text-[11px] text-gray-500">
          {formatSilver(item.quantity)} x {formatSilver(item.unitPoints)}p
        </p>
      </div>
      <span className="font-mono text-xs font-black text-amber-300">
        {formatSilver(item.totalPoints)}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: MemberTradeOrderRow['status'] }) {
  const t = useTranslations('memberTrade')
  const Icon =
    status === 'completed'
      ? ShieldCheck
      : status === 'delivered'
        ? Truck
        : status === 'disputed'
          ? AlertTriangle
          : status === 'cancelled' || status === 'refunded'
            ? XCircle
            : PackageCheck
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] font-bold text-gray-200">
      <Icon size={12} />
      {t(`status.${status}`)}
    </span>
  )
}
