'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  claimCraftOrder,
  releaseCraftOrderTask,
  deliverCraftOrderTask,
  type CraftOrderWithTasks,
  type CraftOrderTaskRow,
} from '@/app/actions/craft-orders'
import { useToast } from './ToastProvider'

interface Props {
  initialOrders: CraftOrderWithTasks[]
  currentUserDiscordId: string
}

// 길드원 — 발주 목록을 보고 일부 수량 수주, 직접 제작 후 박스 번호 지정해 납품.
export default function CraftOrdersMemberClient({
  initialOrders,
  currentUserDiscordId,
}: Props) {
  const t = useTranslations('craftOrders')

  if (initialOrders.length === 0) {
    return <p className="text-sm text-gray-500">{t('memberEmpty')}</p>
  }

  return (
    <div className="space-y-4">
      {initialOrders.map((entry) => (
        <OrderCard
          key={entry.order.id}
          entry={entry}
          currentUserDiscordId={currentUserDiscordId}
        />
      ))}
    </div>
  )
}

function OrderCard({
  entry,
  currentUserDiscordId,
}: {
  entry: CraftOrderWithTasks
  currentUserDiscordId: string
}) {
  const t = useTranslations('craftOrders')
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claimQuantity, setClaimQuantity] = useState('1')

  const { order, tasks } = entry
  const remaining = order.quantity - order.claimedQuantity
  const myTasks = tasks.filter((t) => t.crafterDiscordId === currentUserDiscordId)
  const label = order.itemName || order.itemId
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
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-[11px] text-gray-400 mt-1">
          {t('postedByLabel', { name: order.postedByUsername ?? order.postedByDiscordId })} ·{' '}
          {new Date(order.createdAt).toLocaleString()}
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

      {remaining > 0 && (
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

      {myTasks.length > 0 && (
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className="text-xs font-semibold text-amber-200">{t('myClaimsHeader')}</p>
          {myTasks.map((task) => (
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
  const [boxNumber, setBoxNumber] = useState('')
  const [craftCity, setCraftCity] = useState('')

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
    const box = Number(boxNumber)
    if (!Number.isInteger(box) || box < 1) {
      toast.error(t('boxNumberLabel'))
      return
    }
    startTransition(async () => {
      const res = await deliverCraftOrderTask({
        taskId: task.taskId,
        boxNumber: box,
        craftCity: craftCity.trim(),
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
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="block mb-1">{t('boxNumberLabel')}</span>
              <input
                type="number"
                min={1}
                value={boxNumber}
                onChange={(e) => setBoxNumber(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
              />
            </label>
            <label>
              <span className="block mb-1">{t('craftCityLabel')}</span>
              <input
                value={craftCity}
                onChange={(e) => setCraftCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
              />
            </label>
          </div>
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

      {task.status === 'delivered' && task.boxNumber !== null && (
        <p className="text-[11px] text-gray-400">
          Box #{task.boxNumber}
          {task.craftCity ? ` · ${task.craftCity}` : ''}
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
