'use client'

import { Pause, Play, Plus, Store, Trash2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import TradeItemSearchInput from './TradeItemSearchInput'
import type { MemberTradeListingRow } from '@/app/actions/member-trade'
import type { MemberTradeListingLifecycleAction } from '@/lib/member-trade'
import {
  ActionButton,
  EmptyState,
  InfoPill,
  ListingHeader,
} from './MemberTradeMarketShared'
import {
  createEmptyItemDraft,
  formatPointDraftInput,
  type ListingDraft,
  type ListingItemDraft,
} from './market-model'
import { formatSilver } from '@/lib/silver'

interface MemberTradeSellTabProps {
  draft: ListingDraft
  listings: MemberTradeListingRow[]
  pending: boolean
  onChange: (patch: Partial<ListingDraft>) => void
  onSubmit: () => void
  onLifecycleChange: (
    listing: MemberTradeListingRow,
    action: MemberTradeListingLifecycleAction,
  ) => void
}

export default function MemberTradeSellTab({
  draft,
  listings,
  pending,
  onChange,
  onSubmit,
  onLifecycleChange,
}: MemberTradeSellTabProps) {
  const t = useTranslations('memberTrade')
  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(520px,640px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(620px,760px)_minmax(0,1fr)]">
      <ListingForm draft={draft} pending={pending} onChange={onChange} onSubmit={onSubmit} />
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white">{t('myListings')}</h2>
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {listings.length === 0 ? (
            <div className="2xl:col-span-2">
              <EmptyState icon={Store} title={t('noMyListings')} />
            </div>
          ) : (
            listings.map((listing) => (
              <MyListingCard
                key={listing.id}
                listing={listing}
                pending={pending}
                onLifecycleChange={(action) => onLifecycleChange(listing, action)}
              />
            ))
          )}
        </div>
      </div>
    </section>
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

      <div className="grid gap-2 xl:grid-cols-[minmax(220px,0.85fr)_minmax(260px,1.15fr)] xl:items-start 2xl:grid-cols-[minmax(260px,0.85fr)_minmax(360px,1.15fr)]">
        <TradeItemSearchInput
          value={item.itemQuery}
          selectedItem={selectedItem}
          enchant={enchant}
          placeholder={t('itemPlaceholder')}
          ariaLabel={t('itemSearchLabel')}
          noResultsLabel={t('itemSearchNoResults')}
          invalidQueryLabel={t('itemSearchInvalid')}
          fallbackLabel={t('itemSearchFallback')}
          loadingLabel={t('itemSearchLoading')}
          keyboardHintLabel={t('itemSearchKeyboardHint')}
          onQueryChange={(value) => onChange({ itemQuery: value, selectedItem: null })}
          onSelect={(selected) =>
            onChange({ itemQuery: selected.uniqueName, selectedItem: selected })
          }
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-[84px_100px_minmax(96px,1fr)]">
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
          <div className="relative col-span-2 sm:col-span-2 xl:col-span-3">
            <input
              value={item.unitPoints}
              onChange={(event) =>
                onChange({ unitPoints: formatPointDraftInput(event.target.value) })
              }
              placeholder={t('unitPointsPlaceholder')}
              inputMode="numeric"
              aria-label={t('unitPointsPlaceholder')}
              className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 pr-8 font-mono text-base font-black tabular-nums text-amber-100 outline-none placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:text-amber-200/50 focus:border-amber-400"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-black text-amber-300">
              p
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MyListingCard({
  listing,
  pending,
  onLifecycleChange,
}: {
  listing: MemberTradeListingRow
  pending: boolean
  onLifecycleChange: (action: MemberTradeListingLifecycleAction) => void
}) {
  const t = useTranslations('memberTrade')
  const canPause = listing.status === 'active'
  const canResume = listing.status === 'paused'
  const canClose = ['active', 'paused', 'sold_out'].includes(listing.status)
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <ListingHeader listing={listing} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label={t('stock')} value={formatSilver(listing.quantityAvailable)} />
        <InfoPill label={t('itemCount')} value={t('itemCountValue', { count: listing.itemCount })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
        <span className="text-xs text-gray-500">{t('listingStatusLabel')}</span>
        <ListingStatusBadge status={listing.status} />
      </div>
      {(listing.city || listing.description) && (
        <div className="space-y-1 text-xs text-gray-400">
          {listing.city && <p>{listing.city}</p>}
          {listing.description && <p className="line-clamp-2 text-gray-500">{listing.description}</p>}
        </div>
      )}
      {(canPause || canResume || canClose) && (
        <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-3">
          {canPause && (
            <ActionButton icon={Pause} disabled={pending} onClick={() => onLifecycleChange('pause')} tone="gray">
              {t('pauseListing')}
            </ActionButton>
          )}
          {canResume && (
            <ActionButton icon={Play} disabled={pending} onClick={() => onLifecycleChange('resume')} tone="green">
              {t('resumeListing')}
            </ActionButton>
          )}
          {canClose && (
            <ActionButton icon={XCircle} disabled={pending} onClick={() => onLifecycleChange('close')} tone="red">
              {t('closeListing')}
            </ActionButton>
          )}
        </div>
      )}
    </article>
  )
}

function ListingStatusBadge({ status }: { status: MemberTradeListingRow['status'] }) {
  const t = useTranslations('memberTrade')
  const className = {
    active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    paused: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    sold_out: 'border-gray-600 bg-gray-800 text-gray-300',
    closed: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    expired: 'border-gray-700 bg-gray-900 text-gray-400',
  }[status]
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${className}`}>
      {t(`listingStatus.${status}`)}
    </span>
  )
}

