'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HandCoins,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react'
import AlbionItemImage from './AlbionItemImage'
import TradeItemSearchInput, {
  type TradeItemSearchResult,
} from './member-trade/TradeItemSearchInput'
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
} from '@/lib/member-trade'

interface Props {
  listings: MemberTradeListingRow[]
  orders: MemberTradeOrderRow[]
  pointSummary: MemberTradePointSummaryRow
  isMember: boolean
}

type TabKey = 'buy' | 'sell' | 'orders'

interface ListingDraft {
  title: string
  description: string
  city: string
  deliveryNote: string
  items: ListingItemDraft[]
}

interface ListingItemDraft {
  id: string
  itemQuery: string
  selectedItem: TradeItemSearchResult | null
  enchant: string
  quality: string
  quantity: string
  unitPoints: string
}

function itemImageSrcs(uniqueName: string, enchant: number, size = 56): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: 1,
    size,
  })
}

function createEmptyItemDraft(): ListingItemDraft {
  return {
    id: crypto.randomUUID(),
    itemQuery: '',
    selectedItem: null,
    enchant: '0',
    quality: '',
    quantity: '1',
    unitPoints: '',
  }
}

function createEmptyListingDraft(): ListingDraft {
  return {
    title: '',
    description: '',
    city: '',
    deliveryNote: '',
    items: [createEmptyItemDraft()],
  }
}

function parseDraftInput(draft: ListingDraft): CreateMemberTradeListingInput | null {
  if (!draft.title.trim()) return null
  const items = draft.items.map((item) => {
    const quantity = parseSilverInput(item.quantity)
    const unitPoints = parseSilverInput(item.unitPoints)
    const enchant = Number(item.enchant)
    const quality = item.quality ? Number(item.quality) : null
    if (!item.itemQuery.trim()) return null
    if (quantity === null || quantity <= 0) return null
    if (unitPoints === null || unitPoints <= 0) return null
    if (!Number.isInteger(enchant) || enchant < 0 || enchant > 4) return null
    if (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5)) return null
    return {
      itemQuery: item.itemQuery,
      enchant,
      quality,
      quantity,
      unitPoints,
    }
  })
  if (items.length === 0 || items.some((item) => item === null)) return null
  return {
    title: draft.title,
    description: draft.description,
    items: items as CreateMemberTradeListingInput['items'],
    city: draft.city,
    deliveryNote: draft.deliveryNote,
  }
}

function isListingDraftDirty(draft: ListingDraft): boolean {
  return (
    Boolean(draft.title.trim()) ||
    Boolean(draft.description.trim()) ||
    Boolean(draft.city.trim()) ||
    Boolean(draft.deliveryNote.trim()) ||
    draft.items.some((item) =>
      [item.itemQuery, item.quantity, item.unitPoints].some((value) => value.trim()),
    )
  )
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
  const [draft, setDraft] = useState<ListingDraft>(() => createEmptyListingDraft())
  const [expandedListings, setExpandedListings] = useState<Record<string, boolean>>({})
  const [buyQuantities, setBuyQuantities] = useState<Record<string, Record<string, string>>>({})
  const [buyNotes, setBuyNotes] = useState<Record<string, string>>({})
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  useReportDirty(
    'member-trade-listing',
    tab === 'sell' && isListingDraftDirty(draft),
  )

  const filteredListings = useMemo(() => {
    const normalized = normalizeQuery(query)
    if (!normalized) return listings
    return listings.filter((listing) =>
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

  const buyListing = (listing: MemberTradeListingRow) => {
    const selectedItems = listing.items
      .map((item) => {
        const quantity = parseSilverInput(buyQuantities[listing.id]?.[item.id] ?? '0')
        if (quantity === null || quantity <= 0) return null
        return { itemId: item.id, quantity }
      })
      .filter((item): item is { itemId: string; quantity: number } => item !== null)
    if (selectedItems.length === 0) {
      toast.error(t('invalidQuantity'))
      return
    }
    startTransition(async () => {
      const result = await buyMemberTradeListing(
        listing.id,
        selectedItems,
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

  const updateBuyQuantity = (listingId: string, itemId: string, value: string) => {
    setBuyQuantities((prev) => ({
      ...prev,
      [listingId]: {
        ...(prev[listingId] ?? {}),
        [itemId]: value,
      },
    }))
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
          <TabButton active={tab === 'sell'} onClick={() => setTab('sell')} icon={Store}>
            {t('tabSell')}
          </TabButton>
          <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={PackageCheck}>
            {t('tabOrders', { count: activeOrders.length })}
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
                note={buyNotes[listing.id] ?? ''}
                disabled={!isMember || listing.isMine || pending}
                onToggle={() =>
                  setExpandedListings((prev) => ({ ...prev, [listing.id]: !prev[listing.id] }))
                }
                onQuantityChange={(itemId, value) =>
                  updateBuyQuantity(listing.id, itemId, value)
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
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(520px,640px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(620px,760px)_minmax(0,1fr)]">
          <ListingForm
            draft={draft}
            pending={pending}
            onChange={updateDraft}
            onSubmit={submitListing}
          />
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">{t('myListings')}</h2>
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {myListings.length === 0 ? (
                <div className="2xl:col-span-2">
                  <EmptyState icon={Store} title={t('noMyListings')} />
                </div>
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
        <section className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {orders.length === 0 ? (
            <div className="2xl:col-span-2">
              <EmptyState icon={PackageCheck} title={t('noOrders')} />
            </div>
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
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
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
  const updateItem = (id: string, patch: Partial<ListingItemDraft>) => {
    onChange({
      items: draft.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }
  const addItem = () => {
    onChange({ items: [...draft.items, createEmptyItemDraft()] })
  }
  const removeItem = (id: string) => {
    if (draft.items.length === 1) return
    onChange({ items: draft.items.filter((item) => item.id !== id) })
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-white">
        <Plus size={16} className="text-amber-300" />
        {t('createListing')}
      </h2>

      <input
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder={t('postTitlePlaceholder')}
        maxLength={80}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />
      <textarea
        value={draft.description}
        onChange={(event) => onChange({ description: event.target.value })}
        placeholder={t('postDescriptionPlaceholder')}
        rows={3}
        maxLength={1000}
        className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />

      <div className="space-y-2">
        {draft.items.map((item, index) => (
          <ListingItemDraftRow
            key={item.id}
            item={item}
            index={index}
            canRemove={draft.items.length > 1}
            onChange={(patch) => updateItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200 transition-colors hover:border-amber-500/60 hover:text-amber-200"
        >
          <Plus size={14} />
          {t('addItemButton')}
        </button>
      </div>

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
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Store size={15} />
        {t('createListingButton')}
      </button>
    </div>
  )
}

function ListingItemDraftRow({
  item,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  item: ListingItemDraft
  index: number
  canRemove: boolean
  onChange: (patch: Partial<ListingItemDraft>) => void
  onRemove: () => void
}) {
  const t = useTranslations('memberTrade')
  const enchant = Number.isInteger(Number(item.enchant)) ? Number(item.enchant) : 0
  const selectedItem =
    item.selectedItem?.uniqueName === item.itemQuery ? item.selectedItem : null

  return (
    <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/70 p-3 xl:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-300">
          {t('itemRowLabel', { number: index + 1 })}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
            aria-label={t('removeItemButton')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_minmax(300px,360px)] xl:items-start 2xl:grid-cols-[minmax(280px,1fr)_minmax(360px,420px)]">
        <TradeItemSearchInput
          value={item.itemQuery}
          selectedItem={selectedItem}
          enchant={enchant}
          placeholder={t('itemPlaceholder')}
          ariaLabel={t('itemSearchLabel')}
          noResultsLabel={t('itemSearchNoResults')}
          onQueryChange={(value) => onChange({ itemQuery: value, selectedItem: null })}
          onSelect={(selected) =>
            onChange({ itemQuery: selected.uniqueName, selectedItem: selected })
          }
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
          <select
            value={item.enchant}
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
            value={item.quality}
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
            value={item.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            placeholder={t('quantity')}
            inputMode="numeric"
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
          />
          <input
            value={item.unitPoints}
            onChange={(event) => onChange({ unitPoints: event.target.value })}
            placeholder={t('unitPointsPlaceholder')}
            inputMode="numeric"
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
          />
        </div>
      </div>
    </div>
  )
}

function ListingCard({
  listing,
  expanded,
  quantities,
  note,
  disabled,
  onToggle,
  onQuantityChange,
  onNoteChange,
  onBuy,
}: {
  listing: MemberTradeListingRow
  expanded: boolean
  quantities: Record<string, string>
  note: string
  disabled: boolean
  onToggle: () => void
  onQuantityChange: (itemId: string, value: string) => void
  onNoteChange: (value: string) => void
  onBuy: () => void
}) {
  const t = useTranslations('memberTrade')
  const selectedTotal = listing.items.reduce((sum, item) => {
    const quantity = parseSilverInput(quantities[item.id] ?? '0') ?? 0
    return sum + quantity * item.unitPoints
  }, 0)
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <ListingHeader listing={listing} />
        <ChevronDown
          size={16}
          className={`mt-1 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <InfoPill label={t('seller')} value={listing.sellerUsername} />
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill
          label={t('itemCount')}
          value={t('itemCountValue', { count: listing.itemCount })}
        />
        <InfoPill label={t('priceRange')} value={formatPriceRange(listing)} accent />
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
                onQuantityChange={(value) => onQuantityChange(item.id, value)}
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
            <div className="flex items-center justify-between gap-3 xl:justify-end">
              <span className="font-mono text-sm font-black text-amber-300">
                {formatSilver(selectedTotal)}
              </span>
              <button
                type="button"
                onClick={onBuy}
                disabled={disabled}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HandCoins size={15} />
                {listing.isMine ? t('ownListing') : t('buyButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function ReadOnlyListingCard({ listing }: { listing: MemberTradeListingRow }) {
  const t = useTranslations('memberTrade')
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <ListingHeader listing={listing} />
      <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-3">
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill label={t('itemCount')} value={t('itemCountValue', { count: listing.itemCount })} />
        <InfoPill label={t('priceRange')} value={formatPriceRange(listing)} accent />
      </div>
    </article>
  )
}

function ListingHeader({ listing }: { listing: MemberTradeListingRow }) {
  const previewItems = listing.items.slice(0, 4)
  const remaining = Math.max(0, listing.itemCount - previewItems.length)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 xl:gap-4">
      <div className="flex h-14 min-w-24 shrink-0 items-center -space-x-2 xl:h-16 xl:min-w-32">
        {previewItems.map((item) => {
          const srcs = itemImageSrcs(item.uniqueName, item.enchant, 48)
          return (
            <span
              key={item.id}
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-800 bg-gray-950 xl:h-14 xl:w-14"
            >
              <AlbionItemImage
                src={srcs[0]}
                fallbackSrcs={srcs.slice(1)}
                alt=""
                width={40}
                height={40}
                unoptimized
              />
            </span>
          )
        })}
        {remaining > 0 && (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-xs font-black text-gray-300 xl:h-14 xl:w-14">
            +{remaining}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-white xl:text-base">{listing.title}</h3>
        <p className="truncate text-xs text-gray-500 xl:text-sm">{listing.sellerUsername}</p>
      </div>
    </div>
  )
}

function ListingPurchaseItemRow({
  item,
  quantity,
  onQuantityChange,
}: {
  item: MemberTradeListingRow['items'][number]
  quantity: string
  onQuantityChange: (value: string) => void
}) {
  const t = useTranslations('memberTrade')
  const srcs = itemImageSrcs(item.uniqueName, item.enchant, 48)
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)_78px] items-center gap-2 rounded-lg border border-gray-800 bg-gray-950 px-2 py-2 xl:grid-cols-[52px_minmax(0,1fr)_96px] xl:px-3">
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
        <p className="truncate text-[11px] text-gray-500">
          {formatSilver(item.unitPoints)}p · {t('stockValue', { count: formatSilver(item.quantityAvailable) })}
        </p>
      </div>
      <input
        value={quantity}
        onChange={(event) => onQuantityChange(event.target.value)}
        inputMode="numeric"
        aria-label={t('quantity')}
        placeholder="0"
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-500/70"
      />
    </div>
  )
}

function formatPriceRange(listing: MemberTradeListingRow): string {
  if (listing.minUnitPoints === listing.maxUnitPoints) return formatSilver(listing.minUnitPoints)
  return `${formatSilver(listing.minUnitPoints)}~${formatSilver(listing.maxUnitPoints)}`
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
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
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
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
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
