'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { CheckCircle2, RotateCcw, Search, XCircle } from 'lucide-react'
import {
  resolveMemberTradeDispute,
  type AdminMemberTradeDisputeRow,
} from '@/app/actions/member-trade'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { formatSilver } from '@/lib/silver'
import { getLocalizedItemName } from '@/lib/item-names'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import type { Locale } from '@/i18n/locales'
import AlbionItemImage from './AlbionItemImage'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import SearchBox from './SearchBox'

const STATUS_CLASS: Record<string, string> = {
  disputed: 'bg-red-500/20 text-red-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  refunded: 'bg-gray-700 text-gray-300',
}

function itemImageSrcs(uniqueName: string, enchant: number): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: 1,
    size: 48,
  })
}

interface Props {
  disputes: AdminMemberTradeDisputeRow[]
  avatars?: Record<string, string | null>
  timezone: string
}

export default function MemberTradeDisputeReviewList({
  disputes,
  avatars = {},
  timezone,
}: Props) {
  const t = useTranslations('adminMemberTradeReview')
  const locale = useLocale() as Locale
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return disputes
    return disputes.filter((row) => {
      const localizedName =
        getLocalizedItemName(row.uniqueName, locale, row.nameKo) ?? row.nameKo
      const itemSearchText = row.items
        .map((item) => {
          const itemLocalizedName = getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
          return `${item.uniqueName} ${item.nameKo} ${itemLocalizedName}`
        })
        .join(' ')
      return (
        matchesName(row.buyerUsername, q) ||
        matchesName(row.sellerUsername, q) ||
        matchesName(row.listingTitle ?? '', q) ||
        matchesDate(row.createdAt, q) ||
        row.id.toLowerCase().includes(q) ||
        normalizeQuery(row.uniqueName).includes(q) ||
        normalizeQuery(row.nameKo).includes(q) ||
        normalizeQuery(localizedName).includes(q) ||
        normalizeQuery(itemSearchText).includes(q)
      )
    })
  }, [disputes, locale, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Search size={14} />
          {t('searchNoResults')}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <DisputeRow
              key={row.id}
              dispute={row}
              buyerAvatar={avatars[row.buyerDiscordId] ?? null}
              sellerAvatar={avatars[row.sellerDiscordId] ?? null}
              timezone={timezone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DisputeRow({
  dispute,
  buyerAvatar,
  sellerAvatar,
  timezone,
}: {
  dispute: AdminMemberTradeDisputeRow
  buyerAvatar: string | null
  sellerAvatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminMemberTradeReview')
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [adminNote, setAdminNote] = useState(dispute.adminNote ?? '')
  const fallbackDisplayName =
    getLocalizedItemName(dispute.uniqueName, locale, dispute.nameKo) ?? dispute.nameKo
  const displayTitle = dispute.listingTitle ?? fallbackDisplayName
  const canResolve = dispute.status === 'disputed'

  const resolve = (resolution: 'release' | 'refund') => {
    setError('')
    startTransition(async () => {
      const result = await resolveMemberTradeDispute(dispute.id, resolution, adminNote)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <DisputeItemPreview items={dispute.items} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{displayTitle}</h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {t('tradeItemCount', { count: dispute.items.length })}
            </p>
            <p className="mt-1 text-xs font-mono text-amber-300">
              {t('tradeTotal', {
                quantity: dispute.quantity.toLocaleString(),
                total: formatSilver(dispute.totalPoints),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[dispute.status] ?? 'bg-gray-700 text-gray-300'}`}>
            {statusLabel(dispute.status, t)}
          </span>
          <span className="font-mono text-xs text-gray-500">
            {formatDateTimeShort(dispute.createdAt, timezone)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <PersonPill
          label={t('buyer')}
          discordId={dispute.buyerDiscordId}
          username={dispute.buyerUsername}
          avatar={buyerAvatar}
        />
        <PersonPill
          label={t('seller')}
          discordId={dispute.sellerDiscordId}
          username={dispute.sellerUsername}
          avatar={sellerAvatar}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {dispute.items.map((item) => (
          <DisputeItemLine key={item.id} item={item} locale={locale} />
        ))}
      </div>

      {dispute.disputeReason && (
        <MessageBox tone="red" label={t('disputeReason')} value={dispute.disputeReason} />
      )}
      {dispute.sellerDeliveryNote && (
        <MessageBox tone="green" label={t('sellerDeliveryNote')} value={dispute.sellerDeliveryNote} />
      )}
      {dispute.buyerNote && (
        <MessageBox tone="gray" label={t('buyerNote')} value={dispute.buyerNote} />
      )}
      {dispute.adminNote && dispute.status !== 'disputed' && (
        <MessageBox tone="amber" label={t('adminNote')} value={dispute.adminNote} />
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {canResolve && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
          <input
            type="text"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            placeholder={t('adminNotePlaceholder')}
            maxLength={1000}
            className="min-w-[220px] flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-500/70"
          />
          <ActionButton icon={CheckCircle2} disabled={pending} onClick={() => resolve('release')} tone="green">
            {t('releaseButton')}
          </ActionButton>
          <ActionButton icon={RotateCcw} disabled={pending} onClick={() => resolve('refund')} tone="gray">
            {t('refundButton')}
          </ActionButton>
        </div>
      )}
    </li>
  )
}

function statusLabel(
  status: AdminMemberTradeDisputeRow['status'],
  t: ReturnType<typeof useTranslations<'adminMemberTradeReview'>>,
): string {
  if (status === 'disputed') return t('statusDisputed')
  if (status === 'completed') return t('statusCompleted')
  if (status === 'refunded') return t('statusRefunded')
  return status
}

function DisputeItemPreview({ items }: { items: AdminMemberTradeDisputeRow['items'] }) {
  const previewItems = items.slice(0, 3)
  const remaining = Math.max(0, items.length - previewItems.length)
  return (
    <div className="flex h-12 min-w-20 shrink-0 items-center -space-x-2">
      {previewItems.map((item) => {
        const srcs = itemImageSrcs(item.uniqueName, item.enchant)
        return (
          <span
            key={item.id}
            className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 bg-gray-950"
          >
            <AlbionItemImage
              src={srcs[0]}
              fallbackSrcs={srcs.slice(1)}
              alt=""
              fill
              className="object-contain pixel-img"
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

function DisputeItemLine({
  item,
  locale,
}: {
  item: AdminMemberTradeDisputeRow['items'][number]
  locale: Locale
}) {
  const displayName = getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
  const srcs = itemImageSrcs(item.uniqueName, item.enchant)
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-800 bg-gray-950 px-2 py-2">
      <span className="relative h-10 w-10 shrink-0 rounded bg-gray-900">
        <AlbionItemImage
          src={srcs[0]}
          fallbackSrcs={srcs.slice(1)}
          alt={displayName}
          fill
          className="object-contain pixel-img"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-white">
          {displayName}
          {item.enchant > 0 && (
            <span className="ml-1 font-mono text-amber-300">.{item.enchant}</span>
          )}
        </p>
        <p className="truncate font-mono text-[11px] text-gray-500">
          {item.quantity.toLocaleString()} x {formatSilver(item.unitPoints)}p
        </p>
      </div>
      <span className="font-mono text-xs font-black text-amber-300">
        {formatSilver(item.totalPoints)}
      </span>
    </div>
  )
}

function PersonPill({
  label,
  discordId,
  username,
  avatar,
}: {
  label: string
  discordId: string
  username: string
  avatar: string | null
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
      <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <div className="flex min-w-0 items-center gap-2">
        <MemberAvatar discordId={discordId} avatar={avatar} size={18} />
        <MemberLink
          discordId={discordId}
          username={username}
          className="truncate text-xs font-semibold text-gray-200"
        />
      </div>
    </div>
  )
}

function MessageBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'red' | 'green' | 'amber' | 'gray'
}) {
  const classes =
    tone === 'red'
      ? 'border-red-500/25 bg-red-500/10 text-red-100'
      : tone === 'green'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
        : tone === 'amber'
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
          : 'border-gray-800 bg-gray-950 text-gray-300'
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${classes}`}>
      <p className="mb-1 font-semibold">{label}</p>
      <p className="leading-relaxed">{value}</p>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  disabled,
  onClick,
  tone,
  children,
}: {
  icon: ComponentType<{ size?: number }>
  disabled: boolean
  onClick: () => void
  tone: 'green' | 'gray'
  children: ReactNode
}) {
  const classes =
    tone === 'green'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
      : 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {disabled ? <XCircle size={13} /> : <Icon size={13} />}
      {children}
    </button>
  )
}
