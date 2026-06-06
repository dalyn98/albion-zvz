'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Check, X, Loader2, Pencil, ExternalLink, Save } from 'lucide-react'
import {
  approveShopOrder,
  rejectShopOrder,
  type AdminShopOrder,
} from '@/app/actions/shop-admin'
import { setManualPrice } from '@/app/actions/shop-inventory'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { getLocalizedItemName } from '@/lib/item-names'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import { SHOP_CANONICAL_QUALITY } from '@/lib/shop/quality'
import {
  hasBlockingShopOrderLineStockShortage,
  hasBlockingShopOrderStockShortage,
} from '@/lib/shop/order-approval'
import type { Locale } from '@/i18n/locales'
import AlbionItemImage from './AlbionItemImage'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-gray-700 text-gray-300',
}

function imageSrcs(uniqueName: string, enchant: number): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: SHOP_CANONICAL_QUALITY,
    size: 48,
  })
}

interface Props {
  orders: AdminShopOrder[]
  timezone: string
  avatars?: Record<string, string | null>
  focusedOrderId?: string
}

export default function ShopOrderReviewList({
  orders,
  timezone,
  avatars = {},
  focusedOrderId = '',
}: Props) {
  const t = useTranslations('adminShopOrderReview')
  const locale = useLocale() as Locale
  const [search, setSearch] = useState(focusedOrderId)
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return orders
    return orders.filter((o) => {
      if (
        matchesName(o.username, q) ||
        matchesDate(o.createdAt, q) ||
        matchesDate(o.resolvedAt, q) ||
        o.id.toLowerCase().includes(q)
      ) {
        return true
      }
      return o.items.some((item) => {
        const localizedName =
          getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
        return (
          normalizeQuery(item.uniqueName).includes(q) ||
          normalizeQuery(item.nameKo).includes(q) ||
          normalizeQuery(localizedName).includes(q)
        )
      })
    })
  }, [locale, orders, search])

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
              highlighted={focusedOrderId === o.id}
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
  highlighted,
}: {
  order: AdminShopOrder
  avatar: string | null
  timezone: string
  highlighted: boolean
}) {
  const router = useRouter()
  const t = useTranslations('adminShopOrderReview')
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [adjustMode, setAdjustMode] = useState(false)
  const [totalInput, setTotalInput] = useState('')
  const [note, setNote] = useState('')
  const [pickupNote, setPickupNote] = useState(order.pickupNote ?? '')

  const statusLabel = (status: string) => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    if (status === 'rejected') return t('statusRejected')
    return t('statusCancelled')
  }

  const insufficientBalance = order.balance < order.totalPoints
  const insufficientStock = hasBlockingShopOrderStockShortage({
    stockReservedAt: order.stockReservedAt,
    items: order.items,
  })
  const blockedApprove = insufficientBalance || insufficientStock
  const quoteApproveTotal = order.suggestedTotalPoints
  const quoteApproveBlocked =
    quoteApproveTotal === null ||
    quoteApproveTotal <= 0 ||
    quoteApproveTotal > order.balance ||
    insufficientStock

  const approve = (totalPointsOverride?: number) => {
    setError('')
    startTransition(async () => {
      const result = await approveShopOrder(
        order.id,
        note,
        totalPointsOverride ?? null,
        pickupNote,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const approveWithAdjustedTotal = () => {
    const trimmed = totalInput.trim().replace(/,/g, '')
    if (!trimmed) {
      approve()
      return
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n <= 0) {
      setError(t('totalMustBePositiveInt'))
      return
    }
    if (n > order.balance) {
      setError(t('adjustInsufficientBalance', { amount: order.balance.toLocaleString() }))
      return
    }
    approve(n)
  }

  const approveWithQuoteTotal = () => {
    if (quoteApproveTotal === null) return
    approve(quoteApproveTotal)
  }

  const saveQuoteAsManualPrice = (item: AdminShopOrder['items'][number]) => {
    if (!item.inventoryId || item.memberQuoteUnitSilver === null) return
    setError('')
    startTransition(async () => {
      const result = await setManualPrice(item.inventoryId as string, item.memberQuoteUnitSilver as number)
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
    <li
      id={`shop-order-${order.id}`}
      className={`scroll-mt-24 rounded-lg border p-4 space-y-3 ${
        highlighted
          ? 'border-amber-400/70 bg-amber-500/10 ring-1 ring-amber-400/40'
          : 'bg-gray-900 border-gray-800'
      }`}
    >
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
            {order.priceReviewRequired && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                {t('priceReviewBadge')}
              </span>
            )}
            {quoteApproveTotal !== null && quoteApproveTotal !== order.totalPoints && (
              <span className="text-amber-200/80">
                {t('quoteTotalLabel', { amount: quoteApproveTotal.toLocaleString() })}
              </span>
            )}
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
          const short = hasBlockingShopOrderLineStockShortage({
            stockReservedAt: order.stockReservedAt,
            item: it,
          })
          const displayName =
            getLocalizedItemName(it.uniqueName, locale, it.nameKo) ?? it.nameKo
          const quoteDelta =
            it.memberQuoteUnitSilver !== null && it.catalogUnitSilverSnapshot !== null
              ? it.memberQuoteUnitSilver - it.catalogUnitSilverSnapshot
              : null
          const quoteDeltaPercent =
            quoteDelta !== null && it.catalogUnitSilverSnapshot && it.catalogUnitSilverSnapshot > 0
              ? Math.round((quoteDelta / it.catalogUnitSilverSnapshot) * 100)
              : null
          const itemImageSrcs = imageSrcs(it.uniqueName, it.enchant)
          return (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${
                short ? 'bg-red-500/10 border border-red-500/30' : 'bg-gray-800/40'
              }`}
            >
              <div className="relative w-7 h-7 rounded bg-gray-950 flex-shrink-0">
                <AlbionItemImage
                  src={itemImageSrcs[0]}
                  fallbackSrcs={itemImageSrcs.slice(1)}
                  alt={displayName}
                  fill
                  className="object-contain pixel-img"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 min-w-0">
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
                {it.memberQuoteUnitSilver !== null && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-100/85">
                    <span className="font-mono">
                      {t('quotePriceLabel', {
                        silver: it.memberQuoteUnitSilver.toLocaleString(),
                        points: (it.memberQuoteUnitPoints ?? 0).toLocaleString(),
                      })}
                    </span>
                    {quoteDeltaPercent !== null && (
                      <span
                        className={
                          quoteDeltaPercent < 0
                            ? 'text-emerald-300'
                            : quoteDeltaPercent > 0
                              ? 'text-red-300'
                              : 'text-gray-400'
                        }
                      >
                        {t('quoteDeltaLabel', { percent: quoteDeltaPercent })}
                      </span>
                    )}
                    {it.memberQuoteCity && (
                      <span className="text-gray-400">{t('quoteCityLabel', { city: it.memberQuoteCity })}</span>
                    )}
                    {it.memberQuoteNote && (
                      <span className="text-gray-400 truncate max-w-[18rem]">
                        {t('quoteNoteLabel', { note: it.memberQuoteNote })}
                      </span>
                    )}
                    {it.memberQuoteEvidenceUrl && (
                      <a
                        href={it.memberQuoteEvidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-sky-300 hover:text-sky-200"
                      >
                        <ExternalLink size={10} />
                        {t('quoteEvidenceLabel')}
                      </a>
                    )}
                    {order.status === 'pending' && it.inventoryId && (
                      <button
                        type="button"
                        onClick={() => saveQuoteAsManualPrice(it)}
                        disabled={pending}
                        className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
                        title={t('saveQuotePriceTitle')}
                      >
                        <Save size={10} />
                        {t('saveQuotePriceButton')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {order.memberNote && (
        <p className="text-xs text-gray-400 italic bg-gray-800/50 rounded px-3 py-2">
          {order.memberNote}
        </p>
      )}
      {order.pickupNote && (
        <p className="text-xs text-emerald-200/90 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
          {t('pickupNotePrefix', { note: order.pickupNote })}
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
            value={pickupNote}
            onChange={(e) => setPickupNote(e.target.value)}
            placeholder={t('pickupNotePlaceholder')}
            maxLength={300}
            className="flex-[1.2] min-w-[190px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="flex-1 min-w-[160px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={() => approve()}
            disabled={pending || blockedApprove}
            className="flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded disabled:opacity-40"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {t('approveButton')}
          </button>
          {quoteApproveTotal !== null && quoteApproveTotal !== order.totalPoints && (
            <button
              type="button"
              onClick={approveWithQuoteTotal}
              disabled={pending || quoteApproveBlocked}
              className="flex items-center gap-1 text-xs bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 px-3 py-1.5 rounded disabled:opacity-40"
              title={t('quoteApproveTitle')}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('quoteApproveButton')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTotalInput(String(order.totalPoints))
              setAdjustMode(true)
            }}
            disabled={pending || insufficientStock}
            className="flex items-center gap-1 text-xs bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded disabled:opacity-40"
            title={t('adjustTotalTitle')}
          >
            <Pencil size={13} />
            {t('adjustTotalButton')}
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

      {adjustMode && order.status === 'pending' && !rejectMode && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2 space-y-2">
          <p className="text-xs text-amber-200/80">
            {t('adjustTotalPrompt', {
              total: order.totalPoints.toLocaleString(),
              balance: order.balance.toLocaleString(),
            })}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              inputMode="numeric"
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') approveWithAdjustedTotal()
                if (e.key === 'Escape') setAdjustMode(false)
              }}
              className="bg-gray-900 border border-amber-500/60 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-amber-400 w-32 text-right"
              placeholder={String(order.totalPoints)}
              autoFocus
              disabled={pending}
            />
            <span className="text-xs text-gray-400 font-mono">{t('pointsUnit')}</span>
            <button
              type="button"
              onClick={approveWithAdjustedTotal}
              disabled={pending || insufficientStock}
              className="flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('adjustApproveButton')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustMode(false)
                setTotalInput('')
              }}
              disabled={pending}
              className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
            >
              {t('cancelButton')}
            </button>
          </div>
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
