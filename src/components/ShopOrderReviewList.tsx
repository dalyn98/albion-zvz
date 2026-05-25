'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { Check, X, Loader2 } from 'lucide-react'
import {
  approveShopOrder,
  rejectShopOrder,
  type AdminShopOrder,
} from '@/app/actions/shop-admin'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-gray-700 text-gray-300',
}

function imageUrl(uniqueName: string, enchant: number, quality: number): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: '48' })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

interface Props {
  orders: AdminShopOrder[]
  timezone: string
  avatars?: Record<string, string | null>
}

export default function ShopOrderReviewList({ orders, timezone, avatars = {} }: Props) {
  const t = useTranslations('adminShopOrderReview')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return orders
    return orders.filter(
      (o) =>
        matchesName(o.username, q) ||
        matchesDate(o.createdAt, q) ||
        matchesDate(o.resolvedAt, q),
    )
  }, [orders, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              avatar={avatars[o.discordId] ?? null}
              timezone={timezone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function OrderRow({
  order,
  avatar,
  timezone,
}: {
  order: AdminShopOrder
  avatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminShopOrderReview')
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [note, setNote] = useState('')

  const statusLabel = (status: string) => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    if (status === 'rejected') return t('statusRejected')
    return t('statusCancelled')
  }

  const insufficientBalance = order.balance < order.totalPoints
  const insufficientStock = order.items.some((it) => it.stockAvailable < it.quantity)
  const blockedApprove = insufficientBalance || insufficientStock

  const approve = () => {
    setError('')
    startTransition(async () => {
      const result = await approveShopOrder(order.id, note)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const reject = () => {
    setError('')
    startTransition(async () => {
      const result = await rejectShopOrder(order.id, note)
      if (result.error) {
        setError(result.error)
        return
      }
      setRejectMode(false)
      router.refresh()
    })
  }

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MemberAvatar discordId={order.discordId} avatar={avatar} size={20} />
            <MemberLink
              discordId={order.discordId}
              username={order.username}
              className="text-white text-sm font-semibold truncate"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
            <span className="font-mono text-amber-300 font-bold">
              {order.totalPoints.toLocaleString()}p
            </span>
            <span className="text-gray-500">
              {t('balanceLabel', { amount: order.balance.toLocaleString() })}
            </span>
            <span className="font-mono text-gray-600">
              {formatDateTimeShort(order.createdAt, timezone)}
            </span>
          </div>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
            STATUS_CLASS[order.status]
          }`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      {/* 아이템 리스트 */}
      <div className="space-y-1">
        {order.items.map((it, idx) => {
          const short = insufficientStock && it.stockAvailable < it.quantity
          const displayName =
            getLocalizedItemName(it.uniqueName, locale, it.nameKo) ?? it.nameKo
          return (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                short ? 'bg-red-500/10 border border-red-500/30' : 'bg-gray-800/40'
              }`}
            >
              <div className="relative w-7 h-7 rounded bg-gray-950 flex-shrink-0">
                <Image
                  src={imageUrl(it.uniqueName, it.enchant, it.quality)}
                  alt={displayName}
                  fill
                  className="object-contain pixel-img"
                  unoptimized
                />
              </div>
              <span className="text-gray-200 flex-1 truncate">
                {displayName}
                {it.enchant > 0 && (
                  <span className="text-amber-300 ml-1 font-mono">.{it.enchant}</span>
                )}
              </span>
              <span className="text-gray-400 font-mono">× {it.quantity}</span>
              <span className={`font-mono w-16 text-right ${short ? 'text-red-300' : 'text-gray-500'}`}>
                {t('stockShort', { stock: it.stockAvailable })}
              </span>
              <span className="text-amber-300 font-mono w-20 text-right">
                {it.subtotalPoints.toLocaleString()}p
              </span>
            </div>
          )
        })}
      </div>

      {order.memberNote && (
        <p className="text-xs text-gray-400 italic bg-gray-800/50 rounded px-3 py-2">
          {order.memberNote}
        </p>
      )}
      {order.adminNote && (
        <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
          {t('adminNotePrefix', { note: order.adminNote })}
        </p>
      )}

      {insufficientBalance && order.status === 'pending' && (
        <p className="text-red-400 text-xs">{t('insufficientBalance')}</p>
      )}
      {insufficientStock && order.status === 'pending' && (
        <p className="text-red-400 text-xs">{t('insufficientStock')}</p>
      )}

      {order.status === 'pending' && !rejectMode && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="flex-1 min-w-[160px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={approve}
            disabled={pending || blockedApprove}
            className="flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded disabled:opacity-40"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {t('approveButton')}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded"
          >
            <X size={13} /> {t('rejectButton')}
          </button>
        </div>
      )}

      {rejectMode && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('rejectPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded text-xs"
            >
              {t('rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false)
                setNote('')
              }}
              disabled={pending}
              className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
            >
              {t('cancelButton')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {order.resolvedAt && order.status !== 'pending' && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2">
          {t('statusTimestamp', {
            status: statusLabel(order.status),
            datetime: formatDateTimeShort(order.resolvedAt, timezone),
          })}
        </div>
      )}
    </li>
  )
}
