'use client'

import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GuardedLink } from './UnsavedChangesProvider'

export interface UserStatusSummary {
  displayName: string
  balance: number | null
  pendingCount: number
}

interface Props {
  summary: UserStatusSummary | null
  compact?: boolean
  className?: string
  tourId?: string
}

function formatCompactPoints(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${trimDecimal(value / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${trimDecimal(value / 1_000_000)}M`
  if (abs >= 1_000) return `${trimDecimal(value / 1_000)}K`
  return value.toLocaleString('en-US')
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

export default function UserStatusChip({ summary, compact = false, className = '', tourId }: Props) {
  const t = useTranslations('sidebar')
  if (!summary) return null

  const href = summary.pendingCount > 0 ? '/me/requests' : '/me'
  const balanceLabel = summary.balance == null
    ? null
    : t('statusChipPoints', { points: formatCompactPoints(summary.balance) })
  const pendingLabel = summary.pendingCount > 0
    ? t('statusChipPending', { count: summary.pendingCount })
    : t('statusChipNoPending')
  const ariaLabel = summary.balance == null
    ? t('statusChipAriaGuest', {
        name: summary.displayName,
        pending: pendingLabel,
      })
    : t('statusChipAria', {
        name: summary.displayName,
        points: formatCompactPoints(summary.balance),
        pending: pendingLabel,
      })

  return (
    <GuardedLink
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-tour-id={tourId}
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface/90 text-muted shadow-sm backdrop-blur transition-colors hover:border-accent/50 hover:text-foreground',
        compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        className,
      ].join(' ')}
    >
      <span className={`truncate font-semibold text-foreground ${compact ? 'max-w-[7rem]' : 'max-w-[10rem]'}`}>
        {summary.displayName}
      </span>
      {balanceLabel && (
        <>
          <span className="text-subtle">·</span>
          <span className="font-mono text-accent">{balanceLabel}</span>
        </>
      )}
      <span className="relative ml-0.5 inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <Bell size={compact ? 12 : 13} className={summary.pendingCount > 0 ? 'text-rose-300' : 'text-subtle'} />
        {summary.pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-surface" />
        )}
      </span>
    </GuardedLink>
  )
}
