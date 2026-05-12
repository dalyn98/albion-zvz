'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { formatDateTime } from '@/lib/format-datetime'
import type { Locale } from '@/i18n/locales'
import {
  claimCraftOrder,
  releaseCraftOrderTask,
  deliverCraftOrderTask,
  type CraftOrderWithTasks,
  type CraftOrderTaskRow,
} from '@/app/actions/craft-orders'
import { useToast } from './ToastProvider'
import { GEAR_ENCHANT_COLOR_CLASS } from '@/types'

function parseEnchant(itemId: string): number {
  const at = itemId.lastIndexOf('@')
  if (at === -1) return 0
  const n = Number(itemId.slice(at + 1))
  return Number.isFinite(n) && n > 0 ? n : 0
}

interface Props {
  initialOrders: CraftOrderWithTasks[]
  currentUserDiscordId: string
}

type Tab = 'available' | 'mine'

// 길드원 — 발주 목록을 보고 일부 수량 수주, 직접 제작 후 메모와 함께 납품.
export default function CraftOrdersMemberClient({
  initialOrders,
  currentUserDiscordId,
}: Props) {
  const t = useTranslations('craftOrders')
  const [tab, setTab] = useState<Tab>('available')

  const myActiveOrders = useMemo(
    () =>
      initialOrders.filter((entry) =>
        entry.tasks.some(
          (task) =>
            task.crafterDiscordId === currentUserDiscordId &&
            (task.status === 'claimed' || task.status === 'delivered'),
        ),
      ),
    [initialOrders, currentUserDiscordId],
  )

  const visibleOrders = tab === 'available' ? initialOrders : myActiveOrders
  const myCount = myActiveOrders.length

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('memberTabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        <TabButton
          active={tab === 'available'}
          onClick={() => setTab('available')}
          label={t('memberTabAvailable')}
          count={initialOrders.length}
        />
        <TabButton
          active={tab === 'mine'}
          onClick={() => setTab('mine')}
          label={t('memberTabMine')}
          count={myCount}
        />
      </nav>

      {visibleOrders.length === 0 ? (
        <p className="text-sm text-gray-500">
          {tab === 'available' ? t('memberEmpty') : t('memberMineEmpty')}
        </p>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((entry) => (
            <OrderCard
              key={entry.order.id}
              entry={entry}
              currentUserDiscordId={currentUserDiscordId}
              hideClaimForm={tab === 'mine'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active
          ? 'text-amber-300 border-amber-400'
          : 'text-gray-400 border-transparent hover:text-white'
      }`}
    >
      <span>{label}</span>
      <span
        className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
          active ? 'bg-amber-500/30 text-amber-100' : 'bg-gray-800 text-gray-300'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function OrderCard({
  entry,
  currentUserDiscordId,
  hideClaimForm,
}: {
  entry: CraftOrderWithTasks
  currentUserDiscordId: string
  hideClaimForm: boolean
}) {
  const t = useTranslations('craftOrders')
  const locale = useLocale() as Locale
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claimQuantity, setClaimQuantity] = useState('1')

  const { order, tasks } = entry
  const remaining = order.quantity - order.claimedQuantity
  // 승인/거절/취소된 task 는 노이즈가 되어 자기 작업 목록에서 숨긴다.
  const myActiveTasks = tasks.filter(
    (task) =>
      task.crafterDiscordId === currentUserDiscordId &&
      (task.status === 'claimed' || task.status === 'delivered'),
  )
  const label =
    getLocalizedItemNameWithEnchant(order.itemId, locale, order.itemName) ??
    order.itemId
  const enchant = parseEnchant(order.itemId)
  const totalPayout = order.unitPriceSilver * order.quantity

  const claim = () => {
    const qty = Number(claimQuantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > remaining) {
      toast.error(t('claimQuantityLabel'))
      return
    }
    startTransition(async () => {
      const res = await claimCraftOrder({ orderId: order.id, quantity: qty })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(t('toastClaimed'))
      setClaimQuantity('1')
      router.refresh()
    })
  }

  return (
    <section className="border border-gray-700 rounded-2xl p-4 bg-gray-900 space-y-3">
      <header>
        <p className="text-sm font-semibold text-white flex items-center gap-1.5">
          <span>{label}</span>
          {enchant > 0 && (
            <span
              className={`text-[11px] font-mono ${GEAR_ENCHANT_COLOR_CLASS[enchant] ?? 'text-white'}`}
            >
              +{enchant}
            </span>
          )}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          {t('postedByLabel', { name: order.postedByUsername ?? order.postedByDiscordId })} ·{' '}
          {formatDateTime(order.createdAt)}
        </p>
        {order.notes && (
          <p className="text-[11px] text-gray-300 mt-1 whitespace-pre-line">{order.notes}</p>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Stat label={t('remainingLabel')} value={String(remaining)} />
        <Stat label={t('claimedLabel')} value={String(order.claimedQuantity)} />
        <Stat label={t('unitPriceLabel')} value={formatSilver(order.unitPriceSilver)} />
        <Stat label={t('totalPayoutLabel')} value={formatSilver(totalPayout)} />
      </div>

      {!hideClaimForm && remaining > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-gray-800 pt-3">
          <label className="text-xs text-gray-300 flex-1 min-w-[120px]">
            <span className="block mb-1">{t('claimQuantityLabel')}</span>
            <input
              type="number"
              min={1}
              max={remaining}
              value={claimQuantity}
              onChange={(e) => setClaimQuantity(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-sm"
            />
          </label>
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white text-sm font-medium"
          >
            {pending ? t('claiming') : t('claimSubmit')}
          </button>
        </div>
      )}

      {myActiveTasks.length > 0 && (
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className="text-xs font-semibold text-amber-200">{t('myClaimsHeader')}</p>
          {myActiveTasks.map((task) => (
            <MyTaskRow key={task.taskId} task={task} order={entry.order} />
          ))}
        </div>
      )}
    </section>
  )
}

function MyTaskRow({
  task,
  order,
}: {
  task: CraftOrderTaskRow
  order: CraftOrderWithTasks['order']
}) {
  const t = useTranslations('craftOrders')
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [memo, setMemo] = useState('')

  const release = () => {
    startTransition(async () => {
      const res = await releaseCraftOrderTask(task.taskId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(t('toastReleased'))
      router.refresh()
    })
  }

  const deliver = () => {
    startTransition(async () => {
      const res = await deliverCraftOrderTask({
        taskId: task.taskId,
        memo: memo.trim(),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(t('toastDelivered'))
      router.refresh()
    })
  }

  const payoutHint = order.unitPriceSilver * task.orderQuantity

  return (
    <div className="border border-gray-800 rounded-lg p-2.5 bg-gray-950 space-y-2 text-xs text-gray-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-white font-medium">
          {task.orderQuantity} × · {formatSilver(payoutHint)}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded ${badge(task.status)}`}>
          {t(`status${cap(task.status)}` as 'statusClaimed' | 'statusDelivered' | 'statusApproved' | 'statusRejected' | 'statusCancelled')}
        </span>
      </div>

      {task.status === 'claimed' && (
        <>
          <label className="block">
            <span className="block mb-1">{t('deliveryMemoLabel')}</span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t('deliveryMemoPlaceholder')}
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={deliver}
              disabled={pending}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-white text-xs font-medium"
            >
              {pending ? t('delivering') : t('deliverSubmit')}
            </button>
            <button
              type="button"
              onClick={release}
              disabled={pending}
              className="text-rose-300 hover:text-rose-200 underline text-xs disabled:opacity-50"
            >
              {pending ? t('releasing') : t('release')}
            </button>
          </div>
        </>
      )}

      {task.status === 'delivered' && task.deliveryMemo && (
        <p className="text-[11px] text-gray-400 whitespace-pre-line">
          {t('deliveryMemoLabel')}: {task.deliveryMemo}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-white text-sm font-semibold">{value}</p>
    </div>
  )
}

function badge(status: string): string {
  if (status === 'approved') return 'bg-emerald-900 text-emerald-300'
  if (status === 'delivered') return 'bg-amber-900 text-amber-200'
  if (status === 'claimed') return 'bg-sky-900 text-sky-200'
  if (status === 'rejected') return 'bg-rose-900 text-rose-200'
  return 'bg-gray-800 text-gray-300'
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

function formatSilver(value: number): string {
  return value.toLocaleString()
}
