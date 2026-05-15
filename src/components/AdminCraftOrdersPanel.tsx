'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import Link from 'next/link'
import { ClipboardList, Boxes, ExternalLink, Plus, Trash2 } from 'lucide-react'
import {
  postCraftOrderAdmin,
  cancelCraftOrderAdmin,
  type CraftOrderWithTasks,
} from '@/app/actions/craft-orders'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from './ToastProvider'
import ItemPicker from './ItemPicker'
import { GEAR_ENCHANT_MIN, GEAR_ENCHANT_MAX, GEAR_ENCHANT_COLOR_CLASS } from '@/types'

const ENCHANT_OPTIONS = Array.from(
  { length: GEAR_ENCHANT_MAX - GEAR_ENCHANT_MIN + 1 },
  (_, i) => GEAR_ENCHANT_MIN + i,
)

function parseEnchant(itemId: string): number {
  const at = itemId.lastIndexOf('@')
  if (at === -1) return 0
  const n = Number(itemId.slice(at + 1))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function withEnchant(itemId: string, enchant: number): string {
  const base = itemId.includes('@') ? itemId.slice(0, itemId.lastIndexOf('@')) : itemId
  return enchant > 0 ? `${base}@${enchant}` : base
}

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
  const askConfirm = useConfirm()

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

      <p className="text-[11px] text-gray-500 -mt-1">{t('adminApprovalsHint')}</p>

      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-xs text-gray-500">{t('adminOrdersEmpty')}</p>
        ) : (
          orders.map((entry) => (
            <OrderCard
              key={entry.order.id}
              entry={entry}
              pending={pending}
              onCancel={async () => {
                const ok = await askConfirm({ body: t('adminConfirmCancelOrder'), destructive: true })
                if (!ok) return
                startTransition(async () => {
                  const res = await cancelCraftOrderAdmin(entry.order.id)
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

interface OrderRow {
  id: string
  itemId: string
  itemName: string
  enchant: string
  quantity: string
  unitPrice: string
  notes: string
}

function makeBlankRow(id: string): OrderRow {
  return {
    id,
    itemId: '',
    itemName: '',
    enchant: '0',
    quantity: '1',
    unitPrice: '0',
    notes: '',
  }
}

function PostOrderForm({
  onPosted,
}: {
  onPosted: (order: CraftOrderWithTasks) => void
}) {
  const t = useTranslations('craftOrders')
  const toast = useToast()
  // Deterministic counter-based ids — stable across SSR/CSR, unique within form lifetime.
  const idCounterRef = useRef(1)
  const nextRowId = () => `row-${idCounterRef.current++}`
  const [rows, setRows] = useState<OrderRow[]>(() => [makeBlankRow('row-0')])
  const [pending, startTransition] = useTransition()

  const updateRow = (id: string, patch: Partial<OrderRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const addRow = () => setRows((prev) => [...prev, makeBlankRow(nextRowId())])
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)))

  const filledRows = rows.filter((r) => r.itemId.trim() !== '')
  const canSubmit = filledRows.length > 0 && !pending

  const submit = () => {
    if (filledRows.length === 0) {
      toast.error(t('adminItemRequired'))
      return
    }
    for (const row of filledRows) {
      const qty = Number(row.quantity)
      const price = Number(row.unitPrice)
      if (!Number.isInteger(qty) || qty < 1) {
        toast.error(t('adminQuantityLabel'))
        return
      }
      if (!Number.isFinite(price) || price < 0) {
        toast.error(t('adminUnitPriceLabel'))
        return
      }
    }

    startTransition(async () => {
      const failedIds = new Set<string>()
      let successCount = 0
      for (const row of filledRows) {
        const qty = Number(row.quantity)
        const price = Number(row.unitPrice)
        const enchant = Number(row.enchant)
        const baseId = row.itemId.trim()
        const trimmedId = withEnchant(baseId, enchant)
        const trimmedName = row.itemName.trim() || null
        const trimmedNotes = row.notes.trim() || null
        const res = await postCraftOrderAdmin({
          itemId: trimmedId,
          itemName: trimmedName,
          quantity: qty,
          unitPriceSilver: price,
          notes: trimmedNotes,
        })
        if (res.error) {
          failedIds.add(row.id)
          toast.error(res.error)
          continue
        }
        successCount++
        onPosted({
          order: {
            id: res.orderId ?? '',
            itemId: trimmedId,
            itemName: trimmedName,
            quantity: qty,
            fulfilledQuantity: 0,
            claimedQuantity: 0,
            unitPriceSilver: price,
            notes: trimmedNotes,
            status: 'open',
            postedByDiscordId: '',
            postedByUsername: null,
            createdAt: new Date().toISOString(),
            closedAt: null,
            cancelledAt: null,
          },
          tasks: [],
        })
      }

      // Keep failed rows + any blank rows (placeholders); reset successes.
      const remaining = rows.filter(
        (r) => failedIds.has(r.id) || r.itemId.trim() === '',
      )
      setRows(remaining.length > 0 ? remaining : [makeBlankRow(nextRowId())])

      if (successCount > 0 && failedIds.size === 0) {
        toast.success(t('adminPostBulkAllSuccess', { count: successCount }))
      } else if (successCount > 0 && failedIds.size > 0) {
        toast.error(
          t('adminPostBulkPartialSuccess', {
            success: successCount,
            failed: failedIds.size,
          }),
        )
      }
    })
  }

  return (
    <div className="border border-gray-700 rounded-xl p-3 sm:p-4 bg-gray-950 space-y-3">
      <p className="text-xs font-semibold text-amber-200">{t('adminPostFormTitle')}</p>
      <p className="text-[11px] text-gray-500">{t('adminPostFormHint')}</p>

      <ul className="space-y-3">
        {rows.map((row, idx) => (
          <li
            key={row.id}
            className="border border-gray-800 rounded-lg p-3 bg-gray-900/40 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400 font-medium">
                {t('adminOrderRowIndex', { index: idx + 1 })}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 disabled:opacity-50"
                  aria-label={t('adminRemoveOrderRow')}
                >
                  <Trash2 size={12} />
                  {t('adminRemoveOrderRow')}
                </button>
              )}
            </div>

            <ItemPicker
              label={t('adminItemPickerLabel')}
              itemId={row.itemId || null}
              itemName={row.itemName || null}
              onChange={(name, id) => updateRow(row.id, { itemId: id, itemName: name })}
              onClear={() => updateRow(row.id, { itemId: '', itemName: '' })}
              hideFree
            />

            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-300">
                <span className="block mb-1">{t('adminEnchantLabel')}</span>
                <select
                  value={row.enchant}
                  onChange={(e) => updateRow(row.id, { enchant: e.target.value })}
                  className={`w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-amber-500 ${
                    GEAR_ENCHANT_COLOR_CLASS[Number(row.enchant)] ?? 'text-white'
                  }`}
                >
                  {ENCHANT_OPTIONS.map((ench) => (
                    <option key={ench} value={String(ench)}>
                      +{ench}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-300">
                <span className="block mb-1">{t('adminQuantityLabel')}</span>
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                />
              </label>
              <label className="text-xs text-gray-300">
                <span className="block mb-1">{t('adminUnitPriceLabel')}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={row.unitPrice}
                  onChange={(e) => updateRow(row.id, { unitPrice: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                />
              </label>
            </div>

            <label className="text-xs text-gray-300 block">
              <span className="block mb-1">{t('adminNotesLabel')}</span>
              <textarea
                value={row.notes}
                onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                placeholder={t('adminNotesPlaceholder')}
                rows={2}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={pending}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-amber-200 border border-amber-700/50 hover:border-amber-500 hover:bg-amber-900/20 rounded disabled:opacity-50"
        >
          <Plus size={12} />
          {t('adminAddOrderRow')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="ml-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white text-sm font-medium"
        >
          {pending
            ? t('adminPosting')
            : t('adminPostBulkSubmit', { count: filledRows.length })}
        </button>
      </div>
    </div>
  )
}

function OrderCard({
  entry,
  pending,
  onCancel,
}: {
  entry: CraftOrderWithTasks
  pending: boolean
  onCancel: () => void
}) {
  const t = useTranslations('craftOrders')
  const locale = useLocale() as Locale
  const { order, tasks } = entry
  const remaining = order.quantity - order.claimedQuantity
  const label =
    getLocalizedItemNameWithEnchant(order.itemId, locale, order.itemName) ??
    order.itemId
  const enchant = parseEnchant(order.itemId)

  return (
    <div className="border border-gray-700 rounded-xl p-3 sm:p-4 bg-gray-950 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-1.5">
            <span>{t('adminOrderHeader', { item: label, quantity: order.quantity })}</span>
            {enchant > 0 && (
              <span
                className={`text-[11px] font-mono ${GEAR_ENCHANT_COLOR_CLASS[enchant] ?? 'text-white'}`}
              >
                +{enchant}
              </span>
            )}
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
              {task.deliveryMemo && (
                <p className="mt-1 text-[11px] text-gray-500 whitespace-pre-line">
                  {t('deliveryMemoLabel')}: {task.deliveryMemo}
                </p>
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
