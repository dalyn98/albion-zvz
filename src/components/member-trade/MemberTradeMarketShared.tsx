'use client'

import type { ComponentType, ReactNode } from 'react'
import AlbionItemImage from '../AlbionItemImage'
import MemberLink from '../MemberLink'
import type { MemberTradeListingRow } from '@/app/actions/member-trade'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import { formatSilver } from '@/lib/silver'

export function itemImageSrcs(uniqueName: string, enchant: number, size = 56): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: 1,
    size,
  })
}


export function ListingHeader({ listing }: { listing: MemberTradeListingRow }) {
  const previewItems = listing.items.slice(0, 4)
  const priceItems = listing.items.slice(0, 3)
  const remaining = Math.max(0, listing.itemCount - previewItems.length)
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3 xl:gap-4">
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
        <p className="truncate text-xs text-gray-500 xl:text-sm">
          <MemberLink
            discordId={listing.sellerDiscordId}
            username={listing.sellerUsername}
            className="font-black text-amber-200"
          />
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {priceItems.map((item) => (
            <span
              key={item.id}
              title={item.nameKo}
              className="max-w-full truncate rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] font-black tabular-nums text-amber-200"
            >
              {formatSilver(item.unitPoints)}p
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function InfoPill({
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

export function ActionButton({
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

export function EmptyState({
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
