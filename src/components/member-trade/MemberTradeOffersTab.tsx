'use client'

import { CheckCircle2, HandCoins, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import AlbionItemImage from '../AlbionItemImage'
import MemberLink from '../MemberLink'
import type { MemberTradePriceOfferRow } from '@/app/actions/member-trade'
import { formatSilver } from '@/lib/silver'
import {
  ActionButton,
  EmptyState,
  InfoPill,
  itemImageSrcs,
} from './MemberTradeMarketShared'

interface MemberTradeOffersTabProps {
  offers: MemberTradePriceOfferRow[]
  pending: boolean
  onAccept: (offer: MemberTradePriceOfferRow) => void
  onDecline: (offer: MemberTradePriceOfferRow) => void
  onCancel: (offer: MemberTradePriceOfferRow) => void
}

export default function MemberTradeOffersTab({
  offers,
  pending,
  onAccept,
  onDecline,
  onCancel,
}: MemberTradeOffersTabProps) {
  const t = useTranslations('memberTrade')
  if (offers.length === 0) {
    return (
      <section className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        <div className="2xl:col-span-2">
          <EmptyState icon={HandCoins} title={t('noOffers')} />
        </div>
      </section>
    )
  }
  return (
    <section className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      {offers.map((offer) => (
        <PriceOfferRow
          key={offer.id}
          offer={offer}
          pending={pending}
          onAccept={() => onAccept(offer)}
          onDecline={() => onDecline(offer)}
          onCancel={() => onCancel(offer)}
        />
      ))}
    </section>
  )
}

function PriceOfferRow({
  offer,
  pending,
  onAccept,
  onDecline,
  onCancel,
}: {
  offer: MemberTradePriceOfferRow
  pending: boolean
  onAccept: () => void
  onDecline: () => void
  onCancel: () => void
}) {
  const t = useTranslations('memberTrade')
  const canSellerRespond = offer.relation === 'seller' && offer.status === 'pending'
  const canBuyerCancel = offer.relation === 'buyer' && offer.status === 'pending'
  return (
    <article className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 xl:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <OfferItemPreview items={offer.items} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{offer.listingTitle}</h3>
            <p className="truncate text-xs text-gray-500">
              {offer.relation === 'buyer' ? t('seller') : t('buyer')}{' '}
              <MemberLink
                discordId={offer.relation === 'buyer' ? offer.sellerDiscordId : offer.buyerDiscordId}
                username={offer.relation === 'buyer' ? offer.sellerUsername : offer.buyerUsername}
                className="font-black text-amber-200"
              />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OfferStatusBadge status={offer.status} />
          <span className="font-mono text-sm font-black tabular-nums text-emerald-300">
            {formatSilver(offer.totalPoints)}p
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <InfoPill label={t('itemCount')} value={t('itemCountValue', { count: offer.items.length })} />
        <InfoPill label={t('relation')} value={t(`relationValue.${offer.relation}`)} />
        <InfoPill label={t('statusLabel')} value={t(`offerStatus.${offer.status}`)} />
        <InfoPill label={t('total')} value={`${formatSilver(offer.totalPoints)}p`} accent />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {offer.items.map((item) => (
          <OfferItemLine key={item.id} item={item} />
        ))}
      </div>

      {offer.buyerNote && (
        <p className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-300">
          {offer.buyerNote}
        </p>
      )}
      {offer.sellerNote && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {offer.sellerNote}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canSellerRespond && (
          <>
            <ActionButton icon={CheckCircle2} disabled={pending} onClick={onAccept} tone="green">
              {t('acceptOffer')}
            </ActionButton>
            <ActionButton icon={XCircle} disabled={pending} onClick={onDecline} tone="gray">
              {t('declineOffer')}
            </ActionButton>
          </>
        )}
        {canBuyerCancel && (
          <ActionButton icon={XCircle} disabled={pending} onClick={onCancel} tone="gray">
            {t('cancelOffer')}
          </ActionButton>
        )}
      </div>
    </article>
  )
}

function OfferItemPreview({ items }: { items: MemberTradePriceOfferRow['items'] }) {
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

function OfferItemLine({ item }: { item: MemberTradePriceOfferRow['items'][number] }) {
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
          {formatSilver(item.quantity)} x {formatSilver(item.offeredUnitPoints)}p
        </p>
      </div>
      <span className="font-mono text-xs font-black tabular-nums text-emerald-300">
        {formatSilver(item.offeredTotalPoints)}p
      </span>
    </div>
  )
}

function OfferStatusBadge({ status }: { status: MemberTradePriceOfferRow['status'] }) {
  const t = useTranslations('memberTrade')
  const Icon =
    status === 'accepted'
      ? CheckCircle2
      : status === 'declined' || status === 'cancelled' || status === 'expired'
        ? XCircle
        : HandCoins
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] font-bold text-gray-200">
      <Icon size={12} />
      {t(`offerStatus.${status}`)}
    </span>
  )
}

