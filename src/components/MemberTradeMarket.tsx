'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  CheckCircle2,
  HandCoins,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  XCircle,
} from 'lucide-react'
import AlbionItemImage from './AlbionItemImage'
import { useToast } from './ToastProvider'
import { useReportDirty } from './UnsavedChangesProvider'
import {
  buyMemberTradeListing,
  cancelMemberTradeOrder,
  confirmMemberTradeReceived,
  createMemberTradeListing,
  markMemberTradeDelivered,
  openMemberTradeDispute,
  type CreateMemberTradeListingInput,
  type MemberTradeListingRow,
  type MemberTradeOrderRow,
  type MemberTradePointSummaryRow,
} from '@/app/actions/member-trade'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import {
  isMemberTradeBuyerActionAllowed,
  isMemberTradeSellerActionAllowed,
  normalizeMemberTradeItemSearchQuery,
} from '@/lib/member-trade'

interface Props {
  listings: MemberTradeListingRow[]
  orders: MemberTradeOrderRow[]
  pointSummary: MemberTradePointSummaryRow
  isMember: boolean
}

type TabKey = 'buy' | 'sell' | 'orders'

interface ListingDraft {
  itemQuery: string
  enchant: string
  quality: string
  quantity: string
  unitPoints: string
  city: string
  deliveryNote: string
}

interface ItemSearchResult {
  uniqueName: string
  displayName: string
}

const EMPTY_LISTING_DRAFT: ListingDraft = {
  itemQuery: '',
  enchant: '0',
  quality: '',
  quantity: '1',
  unitPoints: '',
  city: '',
  deliveryNote: '',
}

function itemImageSrcs(uniqueName: string, enchant: number, size = 56): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: 1,
    size,
  })
}

function isItemSearchResult(value: unknown): value is ItemSearchResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ItemSearchResult>
  return typeof item.uniqueName === 'string' && typeof item.displayName === 'string'
}

function parseDraftInput(draft: ListingDraft): CreateMemberTradeListingInput | null {
  const quantity = parseSilverInput(draft.quantity)
  const unitPoints = parseSilverInput(draft.unitPoints)
  const enchant = Number(draft.enchant)
  const quality = draft.quality ? Number(draft.quality) : null
  if (!draft.itemQuery.trim()) return null
  if (quantity === null || quantity <= 0) return null
  if (unitPoints === null || unitPoints <= 0) return null
  if (!Number.isInteger(enchant) || enchant < 0 || enchant > 4) return null
  if (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5)) return null
  return {
    itemQuery: draft.itemQuery,
    enchant,
    quality,
    quantity,
    unitPoints,
    city: draft.city,
    deliveryNote: draft.deliveryNote,
  }
}

export default function MemberTradeMarket({
  listings,
  orders,
  pointSummary,
  isMember,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('memberTrade')
  const [tab, setTab] = useState<TabKey>('buy')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_LISTING_DRAFT)
  const [buyQuantities, setBuyQuantities] = useState<Record<string, string>>({})
  const [buyNotes, setBuyNotes] = useState<Record<string, string>>({})
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  useReportDirty(
    'member-trade-listing',
    tab === 'sell' && Object.values(draft).some((value) => value.trim()),
  )

  const filteredListings = useMemo(() => {
    const normalized = normalizeQuery(query)
    if (!normalized) return listings
    return listings.filter((listing) =>
      matchesName(`${listing.nameKo} ${listing.uniqueName} ${listing.sellerUsername}`, normalized),
    )
  }, [listings, query])

  const myListings = listings.filter((listing) => listing.isMine)
  const activeOrders = orders.filter((order) =>
    ['awaiting_delivery', 'delivered', 'disputed'].includes(order.status),
  )

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
      setDraft(EMPTY_LISTING_DRAFT)
      toast.success(t('listingCreated'))
      router.refresh()
    })
  }

  const buyListing = (listing: MemberTradeListingRow) => {
    const quantity = parseSilverInput(buyQuantities[listing.id] ?? '1')
    if (quantity === null || quantity <= 0) {
      toast.error(t('invalidQuantity'))
      return
    }
    startTransition(async () => {
      const result = await buyMemberTradeListing(
        listing.id,
        quantity,
        buyNotes[listing.id] ?? '',
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('purchaseSubmitted'))
      router.refresh()
    })
  }

  const markDelivered = (order: MemberTradeOrderRow) => {
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

  const confirmReceived = (order: MemberTradeOrderRow) => {
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

  const cancelOrder = (order: MemberTradeOrderRow) => {
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
    const reason = window.prompt(t('disputePrompt'))?.trim()
    if (!reason) return
    startTransition(async () => {
      const result = await openMemberTradeDispute(order.id, reason)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('disputed'))
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PointMetric label={t('balance')} value={formatSilver(pointSummary.balance)} />
        <PointMetric label={t('escrowed')} value={formatSilver(pointSummary.escrowed)} tone="amber" />
        <PointMetric label={t('spendable')} value={formatSilver(pointSummary.spendable)} tone="green" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-950 p-1">
          <TabButton active={tab === 'buy'} onClick={() => setTab('buy')} icon={ShoppingCart}>
            {t('tabBuy')}
          </TabButton>
          <TabButton active={tab === 'sell'} onClick={() => setTab('sell')} icon={Store}>
            {t('tabSell')}
          </TabButton>
          <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={PackageCheck}>
            {t('tabOrders', { count: activeOrders.length })}
          </TabButton>
        </div>
        {tab === 'buy' && (
          <div className="relative w-full sm:w-72">
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
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredListings.length === 0 ? (
            <EmptyState icon={Store} title={t('noListings')} />
          ) : (
            filteredListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                quantity={buyQuantities[listing.id] ?? '1'}
                note={buyNotes[listing.id] ?? ''}
                disabled={!isMember || listing.isMine || pending}
                onQuantityChange={(value) =>
                  setBuyQuantities((prev) => ({ ...prev, [listing.id]: value }))
                }
                onNoteChange={(value) =>
                  setBuyNotes((prev) => ({ ...prev, [listing.id]: value }))
                }
                onBuy={() => buyListing(listing)}
              />
            ))
          )}
        </section>
      )}

      {tab === 'sell' && (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
          <ListingForm
            draft={draft}
            pending={pending}
            onChange={updateDraft}
            onSubmit={submitListing}
          />
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">{t('myListings')}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {myListings.length === 0 ? (
                <EmptyState icon={Store} title={t('noMyListings')} />
              ) : (
                myListings.map((listing) => (
                  <ReadOnlyListingCard key={listing.id} listing={listing} />
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'orders' && (
        <section className="space-y-3">
          {orders.length === 0 ? (
            <EmptyState icon={PackageCheck} title={t('noOrders')} />
          ) : (
            orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                deliveryNote={deliveryNotes[order.id] ?? ''}
                pending={pending}
                onDeliveryNoteChange={(value) =>
                  setDeliveryNotes((prev) => ({ ...prev, [order.id]: value }))
                }
                onDelivered={() => markDelivered(order)}
                onConfirm={() => confirmReceived(order)}
                onCancel={() => cancelOrder(order)}
                onDispute={() => disputeOrder(order)}
              />
            ))
          )}
        </section>
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
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ComponentType<{ size?: number }>
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? 'bg-amber-500 text-black' : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

function ListingForm({
  draft,
  pending,
  onChange,
  onSubmit,
}: {
  draft: ListingDraft
  pending: boolean
  onChange: (patch: Partial<ListingDraft>) => void
  onSubmit: () => void
}) {
  const t = useTranslations('memberTrade')
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([])
  const [itemSearchOpen, setItemSearchOpen] = useState(false)
  const [itemSearching, setItemSearching] = useState(false)
  const [selectedItemDraft, setSelectedItemDraft] = useState<ItemSearchResult | null>(null)
  const itemSearchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const normalizedItemSearch = normalizeMemberTradeItemSearchQuery(draft.itemQuery)
  const previewEnchant = Number.isInteger(Number(draft.enchant)) ? Number(draft.enchant) : 0
  const selectedItem =
    selectedItemDraft?.uniqueName === draft.itemQuery ? selectedItemDraft : null
  const selectedItemSrcs = selectedItem
    ? itemImageSrcs(selectedItem.uniqueName, previewEnchant, 64)
    : []

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!itemSearchRef.current?.contains(event.target as Node)) {
        setItemSearchOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const handleItemQueryChange = (value: string) => {
    onChange({ itemQuery: value })
    setSelectedItemDraft(null)
    setItemSearchOpen(true)
    requestSeqRef.current += 1
    const requestSeq = requestSeqRef.current
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    const query = normalizeMemberTradeItemSearchQuery(value)
    if (!query) {
      setItemResults([])
      setItemSearching(false)
      return
    }

    setItemSearching(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params = new URLSearchParams({ q: query })
        const response = await fetch(`/api/items/search?${params.toString()}`, {
          signal: controller.signal,
        })
        const data: unknown = await response.json()
        if (requestSeqRef.current !== requestSeq) return
        setItemResults(Array.isArray(data) ? data.filter(isItemSearchResult) : [])
      } catch {
        if (requestSeqRef.current === requestSeq) setItemResults([])
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (requestSeqRef.current === requestSeq) setItemSearching(false)
      }
    }, 250)
  }

  const selectItem = (item: ItemSearchResult) => {
    requestSeqRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    setSelectedItemDraft(item)
    setItemResults([])
    setItemSearchOpen(false)
    setItemSearching(false)
    onChange({ itemQuery: item.uniqueName })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-white">
        <Plus size={16} className="text-amber-300" />
        {t('createListing')}
      </h2>
      <div ref={itemSearchRef} className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 focus-within:border-amber-500/70">
          <Search size={14} className="shrink-0 text-gray-500" />
          <input
            value={draft.itemQuery}
            onChange={(event) => handleItemQueryChange(event.target.value)}
            onFocus={() => normalizedItemSearch && setItemSearchOpen(true)}
            placeholder={t('itemPlaceholder')}
            aria-label={t('itemSearchLabel')}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          {itemSearching && normalizedItemSearch && (
            <div
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-amber-400 border-t-transparent"
              aria-hidden="true"
            />
          )}
        </div>

        {itemSearchOpen && normalizedItemSearch && itemResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 shadow-xl">
            {itemResults.map((item) => {
              const srcs = itemImageSrcs(item.uniqueName, previewEnchant, 40)
              return (
                <button
                  key={item.uniqueName}
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-800"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-800 bg-gray-900">
                    <AlbionItemImage
                      src={srcs[0]}
                      fallbackSrcs={srcs.slice(1)}
                      alt=""
                      width={34}
                      height={34}
                      unoptimized
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {item.displayName}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-gray-500">
                      {item.uniqueName}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {itemSearchOpen && !itemSearching && normalizedItemSearch && itemResults.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-center text-xs text-gray-500 shadow-xl">
            {t('itemSearchNoResults')}
          </div>
        )}
      </div>

      {selectedItem && selectedItemSrcs.length > 0 && (
        <div className="flex items-center gap-3 rounded-md bg-gray-950/70 px-3 py-2">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-gray-800 bg-gray-950">
            <AlbionItemImage
              src={selectedItemSrcs[0]}
              fallbackSrcs={selectedItemSrcs.slice(1)}
              alt={selectedItem.displayName}
              width={48}
              height={48}
              unoptimized
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {selectedItem.displayName}
              {previewEnchant > 0 ? ` .${previewEnchant}` : ''}
            </p>
            <p className="truncate font-mono text-[11px] text-gray-500">
              {selectedItem.uniqueName}
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <select
          value={draft.enchant}
          onChange={(event) => onChange({ enchant: event.target.value })}
          className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-500/70"
          aria-label={t('enchant')}
        >
          {[0, 1, 2, 3, 4].map((value) => (
            <option key={value} value={value}>
              .{value}
            </option>
          ))}
        </select>
        <select
          value={draft.quality}
          onChange={(event) => onChange({ quality: event.target.value })}
          className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-500/70"
          aria-label={t('quality')}
        >
          <option value="">{t('qualityAny')}</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              Q{value}
            </option>
          ))}
        </select>
        <input
          value={draft.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          placeholder={t('quantity')}
          inputMode="numeric"
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
        />
      </div>
      <input
        value={draft.unitPoints}
        onChange={(event) => onChange({ unitPoints: event.target.value })}
        placeholder={t('unitPointsPlaceholder')}
        inputMode="numeric"
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />
      <input
        value={draft.city}
        onChange={(event) => onChange({ city: event.target.value })}
        placeholder={t('cityPlaceholder')}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />
      <textarea
        value={draft.deliveryNote}
        onChange={(event) => onChange({ deliveryNote: event.target.value })}
        placeholder={t('deliveryNotePlaceholder')}
        rows={3}
        className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Store size={15} />
        {t('createListingButton')}
      </button>
    </div>
  )
}

function ListingCard({
  listing,
  quantity,
  note,
  disabled,
  onQuantityChange,
  onNoteChange,
  onBuy,
}: {
  listing: MemberTradeListingRow
  quantity: string
  note: string
  disabled: boolean
  onQuantityChange: (value: string) => void
  onNoteChange: (value: string) => void
  onBuy: () => void
}) {
  const t = useTranslations('memberTrade')
  const total = (parseSilverInput(quantity) ?? 0) * listing.unitPoints
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <ListingHeader listing={listing} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label={t('seller')} value={listing.sellerUsername} />
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill label={t('unitPrice')} value={formatSilver(listing.unitPoints)} accent />
        <InfoPill label={t('total')} value={formatSilver(total)} accent />
      </div>
      {listing.city && <p className="text-xs text-gray-400">{listing.city}</p>}
      <div className="flex gap-2">
        <input
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          inputMode="numeric"
          aria-label={t('quantity')}
          className="w-20 rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-500/70"
        />
        <input
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={t('buyerNotePlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
        />
      </div>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <HandCoins size={15} />
        {listing.isMine ? t('ownListing') : t('buyButton')}
      </button>
    </article>
  )
}

function ReadOnlyListingCard({ listing }: { listing: MemberTradeListingRow }) {
  const t = useTranslations('memberTrade')
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <ListingHeader listing={listing} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill label={t('unitPrice')} value={formatSilver(listing.unitPoints)} accent />
      </div>
    </article>
  )
}

function ListingHeader({ listing }: { listing: MemberTradeListingRow }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gray-800 bg-gray-950">
        <AlbionItemImage
          src={itemImageSrcs(listing.uniqueName, listing.enchant, 56)[0]}
          fallbackSrcs={itemImageSrcs(listing.uniqueName, listing.enchant, 56).slice(1)}
          alt=""
          width={48}
          height={48}
          unoptimized
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-white">
          {listing.nameKo}
          {listing.enchant > 0 ? ` .${listing.enchant}` : ''}
        </h3>
        <p className="truncate text-xs text-gray-500">{listing.uniqueName}</p>
      </div>
    </div>
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
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-800 bg-gray-950">
            <AlbionItemImage
              src={itemImageSrcs(order.uniqueName, order.enchant, 48)[0]}
              fallbackSrcs={itemImageSrcs(order.uniqueName, order.enchant, 48).slice(1)}
              alt=""
              width={40}
              height={40}
              unoptimized
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">
              {order.nameKo}
              {order.enchant > 0 ? ` .${order.enchant}` : ''}
            </h3>
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
        <InfoPill label={t('unitPrice')} value={formatSilver(order.unitPoints)} />
        <InfoPill label={t('relation')} value={t(`relationValue.${order.relation}`)} />
        <InfoPill label={t('statusLabel')} value={t(`status.${order.status}`)} />
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

function InfoPill({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <p className={`truncate font-mono text-sm font-bold ${accent ? 'text-amber-300' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  disabled,
  onClick,
  tone = 'amber',
  children,
}: {
  icon: ComponentType<{ size?: number }>
  disabled: boolean
  onClick: () => void
  tone?: 'amber' | 'green' | 'red' | 'gray'
  children: ReactNode
}) {
  const classes =
    tone === 'green'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
      : tone === 'red'
        ? 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20'
        : tone === 'gray'
          ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

function EmptyState({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-800 bg-gray-900 px-4 py-10 text-center">
      <Icon size={22} className="mx-auto text-gray-600" />
      <p className="mt-2 text-sm text-gray-500">{title}</p>
    </div>
  )
}
