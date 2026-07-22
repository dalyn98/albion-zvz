'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import {
  ChevronDown,
  HandCoins,
  PackageCheck,
  Search,
  ShoppingCart,
  Store,
} from 'lucide-react'
import AlbionItemImage from './AlbionItemImage'
import { useToast } from './ToastProvider'
import { useReportDirty } from './UnsavedChangesProvider'
import { useConfirm } from './ConfirmDialog'
import {
  acceptMemberTradePriceOffer,
  buyMemberTradeListing,
  cancelMemberTradeOrder,
  cancelMemberTradePriceOffer,
  confirmMemberTradeReceived,
  createMemberTradePriceOffer,
  createMemberTradeListing,
  declineMemberTradePriceOffer,
  markMemberTradeDelivered,
  openMemberTradeDispute,
  updateMemberTradeListingLifecycle,
  type MemberTradeListingRow,
  type MemberTradeOrderRow,
  type MemberTradePriceOfferRow,
  type MemberTradePointSummaryRow,
} from '@/app/actions/member-trade'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import {
  isMemberTradeListingPurchasable,
  type MemberTradeListingLifecycleAction,
} from '@/lib/member-trade'
import {
  EmptyState,
  InfoPill,
  ListingHeader,
  itemImageSrcs,
} from './member-trade/MemberTradeMarketShared'
import {
  createEmptyListingDraft,
  formatPointDraftInput,
  isListingDraftDirty,
  parseDraftInput,
  type ListingDraft,
} from './member-trade/market-model'

interface Props {
  listings: MemberTradeListingRow[]
  orders: MemberTradeOrderRow[]
  offers: MemberTradePriceOfferRow[]
  pointSummary: MemberTradePointSummaryRow
  isMember: boolean
}

type TabKey = 'buy' | 'sell' | 'orders' | 'offers'

interface TradeReviewItem {
  itemId: string
  name: string
  quantity: number
  unitPoints: number
}

interface TradeReview {
  kind: 'purchase' | 'offer'
  listingId: string
  listingTitle: string
  items: TradeReviewItem[]
  note: string
  totalPoints: number
}

const MemberTradeSellTab = dynamic(() =>
  import('./member-trade/MemberTradeSellTab'),
  { loading: DeferredTabSkeleton },
)
const MemberTradeOrdersTab = dynamic(() =>
  import('./member-trade/MemberTradeOrdersTab'),
  { loading: DeferredTabSkeleton },
)
const MemberTradeOffersTab = dynamic(() =>
  import('./member-trade/MemberTradeOffersTab'),
  { loading: DeferredTabSkeleton },
)
const MemberTradeDisputeDialog = dynamic(() =>
  import('./MemberTradeDisputeDialog'),
)

function preloadMemberTradeTab(tab: Exclude<TabKey, 'buy'>): void {
  if (tab === 'sell') void import('./member-trade/MemberTradeSellTab')
  if (tab === 'orders') void import('./member-trade/MemberTradeOrdersTab')
  if (tab === 'offers') void import('./member-trade/MemberTradeOffersTab')
}

function DeferredTabSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-44 animate-pulse rounded-lg border border-gray-800 bg-gray-900/70"
    />
  )
}

export default function MemberTradeMarket({
  listings,
  orders,
  offers,
  pointSummary,
  isMember,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const t = useTranslations('memberTrade')
  const [tab, setTab] = useState<TabKey>('buy')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ListingDraft>(() => createEmptyListingDraft())
  const [expandedListings, setExpandedListings] = useState<Record<string, boolean>>({})
  const [buyQuantities, setBuyQuantities] = useState<Record<string, Record<string, string>>>({})
  const [offerUnitPoints, setOfferUnitPoints] = useState<Record<string, Record<string, string>>>({})
  const [buyNotes, setBuyNotes] = useState<Record<string, string>>({})
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({})
  const [disputeTarget, setDisputeTarget] = useState<MemberTradeOrderRow | null>(null)
  const [tradeReview, setTradeReview] = useState<TradeReview | null>(null)
  const [pending, startTransition] = useTransition()

  useReportDirty(
    'member-trade-listing',
    tab === 'sell' && isListingDraftDirty(draft),
  )

  const filteredListings = useMemo(() => {
    const normalized = normalizeQuery(query)
    const purchasableListings = listings.filter((listing) =>
      isMemberTradeListingPurchasable({
        status: listing.status,
        quantityAvailable: listing.quantityAvailable,
        expiresAt: listing.expiresAt,
      }),
    )
    if (!normalized) return purchasableListings
    return purchasableListings.filter((listing) =>
      matchesName(
        `${listing.title} ${listing.sellerUsername} ${listing.items
          .map((item) => `${item.nameKo} ${item.uniqueName}`)
          .join(' ')}`,
        normalized,
      ),
    )
  }, [listings, query])

  const myListings = listings.filter((listing) => listing.isMine)
  const activeOrders = orders.filter((order) =>
    ['awaiting_delivery', 'delivered', 'disputed'].includes(order.status),
  )
  const activeOffers = offers.filter((offer) => offer.status === 'pending')

  const updateDraft = (patch: Partial<ListingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const submitListing = () => {
    const input = parseDraftInput(draft)
    if (!input) {
      toast.error(t('invalidListing'))
      return
    }
    startTransition(async () => {
      const result = await createMemberTradeListing(input)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDraft(createEmptyListingDraft())
      toast.success(t('listingCreated'))
      router.refresh()
    })
  }

  const updateListingLifecycle = async (
    listing: MemberTradeListingRow,
    action: MemberTradeListingLifecycleAction,
  ) => {
    if (
      action === 'close' &&
      !(await confirm({
        body: t('closeListingConfirm', { title: listing.title }),
        destructive: true,
      }))
    ) {
      return
    }
    startTransition(async () => {
      const result = await updateMemberTradeListingLifecycle(listing.id, action)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        action === 'pause'
          ? t('listingPaused')
          : action === 'resume'
            ? t('listingResumed')
            : t('listingClosed'),
      )
      router.refresh()
    })
  }

  const buyListing = (listing: MemberTradeListingRow) => {
    const selectedItems = listing.items
      .map((item) => {
        const quantity = parseSilverInput(buyQuantities[listing.id]?.[item.id] ?? '0')
        if (quantity === null || quantity <= 0) return null
        return { itemId: item.id, name: item.nameKo, quantity, unitPoints: item.unitPoints }
      })
      .filter((item): item is TradeReviewItem => item !== null)
    if (selectedItems.length === 0) {
      toast.error(t('invalidQuantity'))
      return
    }
    setTradeReview({
      kind: 'purchase',
      listingId: listing.id,
      listingTitle: listing.title,
      items: selectedItems,
      note: buyNotes[listing.id] ?? '',
      totalPoints: selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPoints, 0),
    })
    emitUxWorkflowEvent({ eventType: 'previewed', metadata: { workflow: 'member_trade', action: 'purchase' } })
  }

  const submitPriceOffer = (listing: MemberTradeListingRow) => {
    const selectedItems: TradeReviewItem[] = []
    for (const item of listing.items) {
      const quantity = parseSilverInput(buyQuantities[listing.id]?.[item.id] ?? '0')
      if (quantity === null || quantity <= 0) continue
      const unitPoints = parseSilverInput(offerUnitPoints[listing.id]?.[item.id] ?? '')
      if (unitPoints === null || unitPoints <= 0) {
        toast.error(t('invalidOffer'))
        return
      }
      selectedItems.push({ itemId: item.id, name: item.nameKo, quantity, unitPoints })
    }
    if (selectedItems.length === 0) {
      toast.error(t('invalidOffer'))
      return
    }
    setTradeReview({
      kind: 'offer',
      listingId: listing.id,
      listingTitle: listing.title,
      items: selectedItems,
      note: buyNotes[listing.id] ?? '',
      totalPoints: selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPoints, 0),
    })
    emitUxWorkflowEvent({ eventType: 'previewed', metadata: { workflow: 'member_trade', action: 'offer' } })
  }

  const commitTradeReview = () => {
    if (!tradeReview || pending) return
    const reviewed = tradeReview
    startTransition(async () => {
      emitUxWorkflowEvent({ eventType: 'submitted', metadata: { workflow: 'member_trade', action: reviewed.kind } })
      const result = reviewed.kind === 'purchase'
        ? await buyMemberTradeListing(
            reviewed.listingId,
            reviewed.items.map(({ itemId, quantity }) => ({ itemId, quantity })),
            reviewed.note,
          )
        : await createMemberTradePriceOffer(
            reviewed.listingId,
            reviewed.items.map(({ itemId, quantity, unitPoints }) => ({ itemId, quantity, unitPoints })),
            reviewed.note,
          )
      if (result.error) {
        toast.error(result.error)
        setTradeReview(null)
        emitUxWorkflowEvent({ eventType: 'partial_failed', metadata: { workflow: 'member_trade', action: reviewed.kind } })
        return
      }
      setTradeReview(null)
      toast.success(reviewed.kind === 'purchase' ? t('purchaseSubmitted') : t('offerSubmitted'))
      emitUxWorkflowEvent({ eventType: 'completed', metadata: { workflow: 'member_trade', action: reviewed.kind } })
      router.refresh()
    })
  }

  const confirmTradeStatusChange = (
    body: string,
    destructive = false,
  ) => confirm({ body, destructive })

  const updateBuyQuantity = (listingId: string, itemId: string, value: string) => {
    setBuyQuantities((prev) => ({
      ...prev,
      [listingId]: {
        ...(prev[listingId] ?? {}),
        [itemId]: value,
      },
    }))
  }

  const updateOfferUnitPoints = (listingId: string, itemId: string, value: string) => {
    setOfferUnitPoints((prev) => ({
      ...prev,
      [listingId]: {
        ...(prev[listingId] ?? {}),
        [itemId]: formatPointDraftInput(value),
      },
    }))
  }

  const acceptOffer = async (offer: MemberTradePriceOfferRow) => {
    if (!(await confirmTradeStatusChange(t('acceptOfferConfirm')))) return
    startTransition(async () => {
      const result = await acceptMemberTradePriceOffer(offer.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('offerAccepted'))
      router.refresh()
    })
  }

  const declineOffer = (offer: MemberTradePriceOfferRow) => {
    startTransition(async () => {
      const result = await declineMemberTradePriceOffer(offer.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('offerDeclined'))
      router.refresh()
    })
  }

  const cancelOffer = async (offer: MemberTradePriceOfferRow) => {
    if (!(await confirmTradeStatusChange(t('cancelOfferConfirm'), true))) return
    startTransition(async () => {
      const result = await cancelMemberTradePriceOffer(offer.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('offerCancelled'))
      router.refresh()
    })
  }

  const markDelivered = async (order: MemberTradeOrderRow) => {
    if (!(await confirmTradeStatusChange(t('markDeliveredConfirm')))) return
    startTransition(async () => {
      const result = await markMemberTradeDelivered(
        order.id,
        deliveryNotes[order.id] ?? '',
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('delivered'))
      router.refresh()
    })
  }

  const confirmReceived = async (order: MemberTradeOrderRow) => {
    if (!(await confirmTradeStatusChange(t('confirmReceivedConfirm')))) return
    startTransition(async () => {
      const result = await confirmMemberTradeReceived(order.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('completed'))
      router.refresh()
    })
  }

  const cancelOrder = async (order: MemberTradeOrderRow) => {
    if (!(await confirmTradeStatusChange(t('cancelOrderConfirm'), true))) return
    startTransition(async () => {
      const result = await cancelMemberTradeOrder(order.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('cancelled'))
      router.refresh()
    })
  }

  const disputeOrder = (order: MemberTradeOrderRow) => {
    void import('./MemberTradeDisputeDialog')
    setDisputeTarget(order)
  }

  const submitDispute = (reason: string) => {
    if (!disputeTarget) return
    startTransition(async () => {
      const result = await openMemberTradeDispute(disputeTarget.id, reason)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDisputeTarget(null)
      toast.success(t('disputed'))
      router.refresh()
    })
  }

  return (
    <div className="space-y-5 xl:space-y-6">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PointMetric label={t('balance')} value={formatSilver(pointSummary.balance)} />
        <PointMetric label={t('escrowed')} value={formatSilver(pointSummary.escrowed)} tone="amber" />
        <PointMetric label={t('spendable')} value={formatSilver(pointSummary.spendable)} tone="green" />
      </section>

      <div className="flex flex-col gap-3 border-b border-gray-800 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-1 sm:w-auto">
          <TabButton active={tab === 'buy'} onClick={() => setTab('buy')} icon={ShoppingCart}>
            {t('tabBuy')}
          </TabButton>
          <TabButton
            active={tab === 'sell'}
            onClick={() => {
              preloadMemberTradeTab('sell')
              setTab('sell')
            }}
            onPreload={() => preloadMemberTradeTab('sell')}
            icon={Store}
          >
            {t('tabSell')}
          </TabButton>
          <TabButton
            active={tab === 'orders'}
            onClick={() => {
              preloadMemberTradeTab('orders')
              setTab('orders')
            }}
            onPreload={() => preloadMemberTradeTab('orders')}
            icon={PackageCheck}
          >
            {t('tabOrders', { count: activeOrders.length })}
          </TabButton>
          <TabButton
            active={tab === 'offers'}
            onClick={() => {
              preloadMemberTradeTab('offers')
              setTab('offers')
            }}
            onPreload={() => preloadMemberTradeTab('offers')}
            icon={HandCoins}
          >
            {t('tabOffers', { count: activeOffers.length })}
          </TabButton>
        </div>
        {tab === 'buy' && (
          <div className="relative w-full sm:w-72 lg:w-80 xl:w-96">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border border-gray-800 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500/70"
            />
          </div>
        )}
      </div>

      {tab === 'buy' && (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          {filteredListings.length === 0 ? (
            <div className="xl:col-span-2">
              <EmptyState icon={Store} title={t('noListings')} />
            </div>
          ) : (
            filteredListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                expanded={expandedListings[listing.id] ?? false}
                quantities={buyQuantities[listing.id] ?? {}}
                offerUnitPoints={offerUnitPoints[listing.id] ?? {}}
                note={buyNotes[listing.id] ?? ''}
                disabled={!isMember || listing.isMine || pending}
                onToggle={() =>
                  setExpandedListings((prev) => ({ ...prev, [listing.id]: !prev[listing.id] }))
                }
                onQuantityChange={(itemId, value) =>
                  updateBuyQuantity(listing.id, itemId, value)
                }
                onOfferUnitPointChange={(itemId, value) =>
                  updateOfferUnitPoints(listing.id, itemId, value)
                }
                onNoteChange={(value) =>
                  setBuyNotes((prev) => ({ ...prev, [listing.id]: value }))
                }
                onBuy={() => buyListing(listing)}
                onOffer={() => submitPriceOffer(listing)}
              />
            ))
          )}
        </section>
      )}

      {tab === 'sell' && (
        <MemberTradeSellTab
          draft={draft}
          listings={myListings}
          pending={pending}
          onChange={updateDraft}
          onSubmit={submitListing}
          onLifecycleChange={(listing, action) => {
            void updateListingLifecycle(listing, action)
          }}
        />
      )}

      {tab === 'orders' && (
        <MemberTradeOrdersTab
          orders={orders}
          deliveryNotes={deliveryNotes}
          pending={pending}
          onDeliveryNoteChange={(orderId, value) =>
            setDeliveryNotes((prev) => ({ ...prev, [orderId]: value }))
          }
          onDelivered={markDelivered}
          onConfirm={confirmReceived}
          onCancel={cancelOrder}
          onDispute={disputeOrder}
        />
      )}

      {tab === 'offers' && (
        <MemberTradeOffersTab
          offers={offers}
          pending={pending}
          onAccept={acceptOffer}
          onDecline={declineOffer}
          onCancel={cancelOffer}
        />
      )}

      {disputeTarget && (
        <MemberTradeDisputeDialog
          listingTitle={disputeTarget.listingTitle}
          pending={pending}
          onClose={() => setDisputeTarget(null)}
          onSubmit={submitDispute}
        />
      )}

      {tradeReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-trade-review-title"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 sm:items-center"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/40 bg-gray-950 p-5 shadow-2xl">
            <div>
              <h2 id="member-trade-review-title" className="text-lg font-bold text-white">
                {t('tradeReviewTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {t('tradeReviewDescription', {
                  action: tradeReview.kind === 'purchase' ? t('buyButton') : t('offerButton'),
                  title: tradeReview.listingTitle,
                })}
              </p>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {tradeReview.items.map((item) => (
                <li key={item.itemId} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-gray-100">{item.name}</span>
                    <span className="shrink-0 font-mono text-amber-300">
                      {formatSilver(item.quantity * item.unitPoints)}p
                    </span>
                  </div>
                  <p className="mt-1 text-gray-500">
                    {t('tradeReviewLine', {
                      quantity: formatSilver(item.quantity),
                      unitPoints: formatSilver(item.unitPoints),
                    })}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('tradeReviewTotal')}</dt>
                <dd className="font-mono font-bold text-amber-300">{formatSilver(tradeReview.totalPoints)}p</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('spendable')}</dt>
                <dd className="font-mono text-gray-200">{formatSilver(pointSummary.spendable)}p</dd>
              </div>
            </dl>
            <p className="text-xs text-amber-200">{t('tradeReviewWarning')}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTradeReview(null)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {t('tradeReviewBack')}
              </button>
              <button
                type="button"
                onClick={commitTradeReview}
                disabled={pending || tradeReview.totalPoints > pointSummary.spendable}
                className="min-h-11 rounded-lg bg-amber-500 px-5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {pending ? t('tradeReviewSubmitting') : t('tradeReviewConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PointMetric({
  label,
  value,
  tone = 'gray',
}: {
  label: string
  value: string
  tone?: 'gray' | 'amber' | 'green'
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : 'text-white'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-black ${toneClass}`}>{value}</p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  onPreload,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  onPreload?: () => void
  icon: ComponentType<{ size?: number }>
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? 'bg-amber-500 text-black' : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

function ListingCard({
  listing,
  expanded,
  quantities,
  offerUnitPoints,
  note,
  disabled,
  onToggle,
  onQuantityChange,
  onOfferUnitPointChange,
  onNoteChange,
  onBuy,
  onOffer,
}: {
  listing: MemberTradeListingRow
  expanded: boolean
  quantities: Record<string, string>
  offerUnitPoints: Record<string, string>
  note: string
  disabled: boolean
  onToggle: () => void
  onQuantityChange: (itemId: string, value: string) => void
  onOfferUnitPointChange: (itemId: string, value: string) => void
  onNoteChange: (value: string) => void
  onBuy: () => void
  onOffer: () => void
}) {
  const t = useTranslations('memberTrade')
  const selectedTotal = listing.items.reduce((sum, item) => {
    const quantity = parseSilverInput(quantities[item.id] ?? '0') ?? 0
    return sum + quantity * item.unitPoints
  }, 0)
  const offeredTotal = listing.items.reduce((sum, item) => {
    const quantity = parseSilverInput(quantities[item.id] ?? '0') ?? 0
    const unitPoints = parseSilverInput(offerUnitPoints[item.id] ?? '') ?? 0
    return sum + quantity * unitPoints
  }, 0)
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <div className="flex items-start justify-between gap-3">
        <ListingHeader listing={listing} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('toggleListing')}
          className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill
          label={t('itemCount')}
          value={t('itemCountValue', { count: listing.itemCount })}
        />
      </div>
      {listing.city && <p className="text-xs text-gray-400">{listing.city}</p>}
      {listing.description && (
        <p className="line-clamp-2 text-xs text-gray-500 xl:text-sm">{listing.description}</p>
      )}

      {expanded && (
        <div className="space-y-3 border-t border-gray-800 pt-3">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {listing.items.map((item) => (
              <ListingPurchaseItemRow
                key={item.id}
                item={item}
                quantity={quantities[item.id] ?? ''}
                offerUnitPoint={offerUnitPoints[item.id] ?? ''}
                onQuantityChange={(value) => onQuantityChange(item.id, value)}
                onOfferUnitPointChange={(value) => onOfferUnitPointChange(item.id, value)}
              />
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <input
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={t('buyerNotePlaceholder')}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PriceTotal label={t('buyTotal')} value={selectedTotal} />
              <PriceTotal label={t('offerTotal')} value={offeredTotal} tone="green" />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onOffer}
                  disabled={disabled}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HandCoins size={15} />
                  {listing.isMine ? t('ownListing') : t('offerButton')}
                </button>
                <button
                  type="button"
                  onClick={onBuy}
                  disabled={disabled}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShoppingCart size={15} />
                  {listing.isMine ? t('ownListing') : t('buyButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function PriceTotal({
  label,
  value,
  tone = 'amber',
}: {
  label: string
  value: number
  tone?: 'amber' | 'green'
}) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : 'text-amber-300'
  return (
    <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs font-bold text-gray-500">
      {label}
      <span className={`font-mono font-black tabular-nums ${toneClass}`}>
        {formatSilver(value)}p
      </span>
    </span>
  )
}

function ListingPurchaseItemRow({
  item,
  quantity,
  offerUnitPoint,
  onQuantityChange,
  onOfferUnitPointChange,
}: {
  item: MemberTradeListingRow['items'][number]
  quantity: string
  offerUnitPoint: string
  onQuantityChange: (value: string) => void
  onOfferUnitPointChange: (value: string) => void
}) {
  const t = useTranslations('memberTrade')
  const srcs = itemImageSrcs(item.uniqueName, item.enchant, 48)
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-lg border border-gray-800 bg-gray-950 px-2 py-2 xl:grid-cols-[52px_minmax(0,1fr)] xl:px-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-900">
        <AlbionItemImage
          src={srcs[0]}
          fallbackSrcs={srcs.slice(1)}
          alt=""
          width={40}
          height={40}
          unoptimized
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white">
          {item.nameKo}
          {item.enchant > 0 ? ` .${item.enchant}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] font-black tabular-nums text-amber-200">
            {formatSilver(item.unitPoints)}p
          </span>
          <span className="text-[11px] text-gray-500">
            {t('stockValue', { count: formatSilver(item.quantityAvailable) })}
          </span>
        </div>
      </div>
      <div className="col-span-2 grid gap-2 sm:grid-cols-[96px_minmax(140px,1fr)] xl:grid-cols-[104px_minmax(160px,1fr)]">
        <input
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          inputMode="numeric"
          aria-label={t('quantity')}
          placeholder="0"
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-500/70"
        />
        <div className="relative">
          <input
            value={offerUnitPoint}
            onChange={(event) => onOfferUnitPointChange(event.target.value)}
            inputMode="numeric"
            aria-label={t('offerUnitPointsPlaceholder')}
            placeholder={t('offerUnitPointsPlaceholder')}
            className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 pr-8 font-mono text-sm font-black tabular-nums text-emerald-100 outline-none placeholder:font-sans placeholder:text-xs placeholder:font-medium placeholder:text-emerald-200/50 focus:border-emerald-400"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-black text-emerald-300">
            p
          </span>
        </div>
      </div>
    </div>
  )
}
