'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ClipboardList, Boxes, ExternalLink } from 'lucide-react'
import {
  postCraftOrderAdmin,
  cancelCraftOrderAdmin,
  approveCraftOrderTaskAdmin,
  rejectCraftOrderTaskAdmin,
  type CraftOrderWithTasks,
} from '@/app/actions/craft-orders'
import { useToast } from './ToastProvider'

interface Props {
  initialOrders: CraftOrderWithTasks[]
}

// 어드민 — 길드 발주 관리. 새 발주 등록 + 발주별 상태/수주 목록 + 납품된 task
// 에 대한 승인/거절. 관리자 자체 제작은 인벤토리 페이지에서 별도 처리한다.
export default function AdminCraftOrdersPanel({ initialOrders }: Props) {
  const t = useTranslations('craftOrders')
  const toast = useToast()
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [pending, startTransition] = useTransition()

  const refresh = () => router.refresh()

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <header>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ClipboardList size={16} className="text-amber-400" />
          {t('adminPanelTitle')}
        </h2>
        <p className="text-xs text-gray-400 mt-1">{t('adminPanelDescription')}</p>
        <Link
          href="/craft/inventory"
          className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 mt-2"
        >
          <Boxes size={12} />
          {t('adminAdvancedTabSelfCraft')}
          <ExternalLink size={11} />
        </Link>
      </header>

      <PostOrderForm
        onPosted={(o) => {
          setOrders((prev) => [o, ...prev])
          refresh()
        }}
      />

      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-xs text-gray-500">{t('adminOrdersEmpty')}</p>
        ) : (
          orders.map((entry) => (
            <OrderCard
              key={entry.order.id}
              entry={entry}
              pending={pending}
              onCancel={() => {
                if (!confirm(t('adminConfirmCancelOrder'))) return
                startTransition(async () => {
                  const res = await cancelCraftOrderAdmin(entry.order.id)
                  if (res.error) toast.error(res.error)
                  else refresh()
                })
              }}
              onApprove={(taskId) => {
                startTransition(async () => {
                  const res = await approveCraftOrderTaskAdmin(taskId)
                  if (res.error) toast.error(res.error)
                  else refresh()
                })
              }}
              onReject={(taskId) => {
                const reason = prompt(t('adminRejectReasonPrompt')) ?? ''
                startTransition(async () => {
                  const res = await rejectCraftOrderTaskAdmin(taskId, reason)
                  if (res.error) toast.error(res.error)
                  else refresh()
                })
              }}
            />
          ))
        )}
      </div>
    </section>
  )
}

function PostOrderForm({
  onPosted,
}: {
  onPosted: (order: CraftOrderWithTasks) => void
}) {
  const t = useTranslations('craftOrders')
  const toast = useToast()
  const [itemId, setItemId] = useState('')
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('0')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const qty = Number(quantity)
    const price = Number(unitPrice)
    if (!itemId.trim()) return toast.error(t('adminItemIdLabel'))
    if (!Number.isInteger(qty) || qty < 1) return toast.error(t('adminQuantityLabel'))
    if (!Number.isFinite(price) || price < 0) return toast.error(t('adminUnitPriceLabel'))

    startTransition(async () => {
      const res = await postCraftOrderAdmin({
        itemId: itemId.trim(),
        itemName: itemName.trim() || null,
        quantity: qty,
        unitPriceSilver: price,
        notes: notes.trim() || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setItemId('')
      setItemName('')
      setQuantity('1')
      setUnitPrice('0')
      setNotes('')
      onPosted({
        order: {
          id: res.orderId ?? '',
          itemId: itemId.trim(),
          itemName: itemName.trim() || null,
          quantity: qty,
          fulfilledQuantity: 0,
          claimedQuantity: 0,
          unitPriceSilver: price,
          notes: notes.trim() || null,
          status: 'open',
          postedByDiscordId: '',
          postedByUsername: null,
          createdAt: new Date().toISOString(),
          closedAt: null,
          cancelledAt: null,
        },
        tasks: [],
      })
    })
  }

  return (
    <div className="border border-gray-700 rounded-xl p-3 sm:p-4 bg-gray-950 space-y-3">
      <p className="text-xs font-semibold text-amber-200">{t('adminPostFormTitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-300">
          <span className="block mb-1">{t('adminItemIdLabel')}</span>
          <input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder={t('adminItemIdPlaceholder')}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
          />
        </label>
        <label className="text-xs text-gray-300">
          <span className="block mb-1">{t('adminItemNameLabel')}</span>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
          />
        </label>
        <label className="text-xs text-gray-300">
          <span className="block mb-1">{t('adminQuantityLabel')}</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
          />
        </label>
        <label className="text-xs text-gray-300">
          <span className="block mb-1">{t('adminUnitPriceLabel')}</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
          />
        </label>
        <label className="text-xs text-gray-300 sm:col-span-2">
          <span className="block mb-1">{t('adminNotesLabel')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('adminNotesPlaceholder')}
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white text-sm font-medium"
      >
        {pending ? t('adminPosting') : t('adminPostSubmit')}
      </button>
    </div>
  )
}

function OrderCard({
  entry,
  pending,
  onCancel,
  onApprove,
  onReject,
}: {
  entry: CraftOrderWithTasks
  pending: boolean
  onCancel: () => void
  onApprove: (taskId: string) => void
  onReject: (taskId: string) => void
}) {
  const t = useTranslations('craftOrders')
  const { order, tasks } = entry
  const remaining = order.quantity - order.claimedQuantity
  const label = order.itemName || order.itemId

  return (
    <div className="border border-gray-700 rounded-xl p-3 sm:p-4 bg-gray-950 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {t('adminOrderHeader', { item: label, quantity: order.quantity })}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {t('unitPriceLabel')}: {formatSilver(order.unitPriceSilver)} · {t('remainingLabel')}: {remaining} · {t('fulfilledLabel')}: {order.fulfilledQuantity}
          </p>
          {order.notes && (
            <p className="text-[11px] text-gray-400 mt-1 whitespace-pre-line">{order.notes}</p>
          )}
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded ${statusBadgeClass(order.status)}`}>
          {t(`status${capitalize(order.status)}` as 'statusOpen' | 'statusClosed' | 'statusCancelled')}
        </span>
      </div>

      {tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.taskId}
              className="border border-gray-800 rounded-lg p-2 sm:p-3 bg-gray-900 text-xs text-gray-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-white">
                  {t('adminTaskHeader', {
                    name: task.crafterUsername ?? task.crafterDiscordId,
                    quantity: task.orderQuantity,
                  })}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded ${taskBadgeClass(task.status)}`}>
                  {t(`status${capitalize(task.status)}` as 'statusClaimed' | 'statusDelivered' | 'statusApproved' | 'statusRejected' | 'statusCancelled')}
                </span>
              </div>
              {(task.boxNumber !== null || task.craftCity) && (
                <p className="mt-1 text-[11px] text-gray-500">
                  {task.boxNumber !== null ? `Box #${task.boxNumber}` : ''}
                  {task.craftCity ? ` · ${task.craftCity}` : ''}
                  {task.craftFocusUsed ? ' · focus' : ''}
                </p>
              )}
              {task.status === 'delivered' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(task.taskId)}
                    disabled={pending}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-white text-xs font-medium"
                  >
                    {pending ? t('adminApproving') : t('adminApprove')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(task.taskId)}
                    disabled={pending}
                    className="px-3 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 rounded text-white text-xs font-medium"
                  >
                    {pending ? t('adminRejecting') : t('adminReject')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {order.status === 'open' && (
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-xs text-rose-300 hover:text-rose-200 underline disabled:opacity-50"
        >
          {pending ? t('adminCancelling') : t('adminCancelOrder')}
        </button>
      )}
    </div>
  )
}

function statusBadgeClass(status: 'open' | 'closed' | 'cancelled'): string {
  if (status === 'open') return 'bg-emerald-900 text-emerald-300'
  if (status === 'closed') return 'bg-gray-800 text-gray-300'
  return 'bg-rose-900 text-rose-200'
}

function taskBadgeClass(status: string): string {
  if (status === 'approved') return 'bg-emerald-900 text-emerald-300'
  if (status === 'delivered') return 'bg-amber-900 text-amber-200'
  if (status === 'claimed') return 'bg-sky-900 text-sky-200'
  if (status === 'rejected') return 'bg-rose-900 text-rose-200'
  return 'bg-gray-800 text-gray-300'
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

function formatSilver(value: number): string {
  return value.toLocaleString()
}
