'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import { Check, X, Loader2 } from 'lucide-react'
import {
  approveCraftOrderTaskAdmin,
  rejectCraftOrderTaskAdmin,
  type CraftOrderTaskReviewRow,
} from '@/app/actions/craft-orders'
import { GEAR_ENCHANT_COLOR_CLASS } from '@/types'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'

function parseEnchant(itemId: string): number {
  const at = itemId.lastIndexOf('@')
  if (at === -1) return 0
  const n = Number(itemId.slice(at + 1))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const STATUS_CLASS: Record<string, string> = {
  delivered: 'bg-amber-500/20 text-amber-200',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  claimed: 'bg-sky-500/20 text-sky-200',
  cancelled: 'bg-gray-700 text-gray-300',
}

interface Props {
  tasks: CraftOrderTaskReviewRow[]
  timezone: string
  avatars?: Record<string, string | null>
}

export default function CraftOrderReviewList({ tasks, timezone, avatars = {} }: Props) {
  const t = useTranslations('adminCraftOrderReview')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return tasks
    return tasks.filter(
      (task) =>
        matchesName(task.crafterUsername ?? task.crafterDiscordId, q) ||
        matchesDate(task.deliveredAt, q) ||
        matchesDate(task.claimedAt, q),
    )
  }, [tasks, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((task) => (
            <TaskRow
              key={task.taskId}
              task={task}
              avatar={avatars[task.crafterDiscordId] ?? null}
              timezone={timezone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskRow({
  task,
  avatar,
  timezone,
}: {
  task: CraftOrderTaskReviewRow
  avatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminCraftOrderReview')
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')

  const itemLabel =
    getLocalizedItemNameWithEnchant(task.itemId, locale, task.itemName) ??
    task.itemId
  const enchant = parseEnchant(task.itemId)
  const payout = task.unitPriceSilver * task.orderQuantity

  const onApprove = () => {
    setError('')
    startTransition(async () => {
      const res = await approveCraftOrderTaskAdmin(task.taskId)
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  const onReject = () => {
    setError('')
    startTransition(async () => {
      const res = await rejectCraftOrderTaskAdmin(task.taskId, reason.trim())
      if (res.error) {
        setError(res.error)
        return
      }
      setRejectMode(false)
      setReason('')
      router.refresh()
    })
  }

  const statusLabel = (status: string) => {
    if (status === 'claimed') return t('statusClaimed')
    if (status === 'delivered') return t('statusDelivered')
    if (status === 'approved') return t('statusApproved')
    if (status === 'rejected') return t('statusRejected')
    if (status === 'cancelled') return t('statusCancelled')
    return status
  }

  return (
    <li className="border border-gray-800 rounded-xl bg-gray-900 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MemberAvatar discordId={task.crafterDiscordId} avatar={avatar} size={28} />
          <div>
            <MemberLink
              discordId={task.crafterDiscordId}
              username={task.crafterUsername ?? task.crafterDiscordId}
              className="text-white font-medium text-sm"
            />
            <p className="text-[11px] text-gray-500">
              {task.deliveredAt ? formatDateTimeShort(task.deliveredAt, timezone) : '-'}
            </p>
          </div>
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded ${STATUS_CLASS[task.status] ?? 'bg-gray-700 text-gray-300'}`}
        >
          {statusLabel(task.status)}
        </span>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 space-y-1.5">
        <p className="text-sm font-semibold text-white flex items-center gap-1.5">
          <span>{itemLabel}</span>
          {enchant > 0 && (
            <span
              className={`text-[11px] font-mono ${GEAR_ENCHANT_COLOR_CLASS[enchant] ?? 'text-white'}`}
            >
              +{enchant}
            </span>
          )}
        </p>
        <p className="text-[11px] text-gray-400">
          {t('quantityLabel', { count: task.orderQuantity })} ·{' '}
          {t('unitPriceLabel', { silver: task.unitPriceSilver.toLocaleString() })} ·{' '}
          {t('payoutLabel', { silver: payout.toLocaleString() })}
        </p>
        {task.deliveryMemo && (
          <p className="text-[11px] text-gray-300 whitespace-pre-line">
            {t('memoLabel')}: {task.deliveryMemo}
          </p>
        )}
        {task.notes && (
          <p className="text-[11px] text-gray-400 whitespace-pre-line">
            {t('orderNotesLabel')}: {task.notes}
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-900/20 border border-rose-700/40 rounded px-2 py-1">
          {error}
        </p>
      )}

      {task.status === 'delivered' && !rejectMode && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {t('approve')}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-medium"
          >
            <X size={12} />
            {t('reject')}
          </button>
        </div>
      )}

      {task.status === 'delivered' && rejectMode && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('rejectReasonPlaceholder')}
            rows={2}
            className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-medium"
            >
              {pending ? t('rejecting') : t('rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false)
                setReason('')
              }}
              disabled={pending}
              className="px-3 py-1.5 rounded text-gray-300 hover:text-white text-xs disabled:opacity-50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
