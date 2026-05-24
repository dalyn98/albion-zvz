'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Bell, ChevronDown, Coins, ListChecks, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GuardedLink } from './UnsavedChangesProvider'

export type UserStatusSiphonState = 'ready' | 'unverified' | 'unavailable'

export interface UserStatusSummary {
  displayName: string
  balance: number | null
  pendingCount: number
  pendingRegearCount: number
  pendingExchangeCount: number
  pendingDonationCount: number
  siphonBalance: number | null
  siphonState: UserStatusSiphonState
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const t = useTranslations('sidebar')

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!summary) return null

  const balanceLabel = summary.balance == null
    ? null
    : t('statusChipPoints', { points: formatCompactPoints(summary.balance) })
  const pendingLabel = summary.pendingCount > 0
    ? t('statusChipCheckCount', { count: summary.pendingCount })
    : t('statusChipNoCheck')
  const siphonLabel = formatSiphonLabel(summary, t)
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
    <div ref={rootRef} className={`relative inline-flex max-w-full ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        title={ariaLabel}
        data-tour-id={tourId}
        onClick={() => setOpen((value) => !value)}
        className={[
          'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface/90 text-muted shadow-sm backdrop-blur transition-colors hover:border-accent/50 hover:text-foreground',
          compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
          open ? 'border-accent/60 text-foreground' : '',
        ].join(' ')}
      >
        <span className="shrink-0 font-semibold text-foreground">{t('myInfo')}</span>
        {!compact && (
          <>
            <span className="text-subtle">·</span>
            <span className="max-w-[9rem] truncate font-medium text-muted">
              {summary.displayName}
            </span>
          </>
        )}
        {balanceLabel && (
          <>
            <span className="text-subtle">·</span>
            <span className="font-mono text-accent">{balanceLabel}</span>
          </>
        )}
        {summary.pendingCount > 0 ? (
          <>
            <span className="text-subtle">·</span>
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-200">
              {pendingLabel}
            </span>
          </>
        ) : (
          <span className="relative ml-0.5 inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
            <Bell size={compact ? 12 : 13} className="text-subtle" />
          </span>
        )}
        <ChevronDown
          size={compact ? 12 : 14}
          className={`shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={t('statusPopoverTitle')}
          className={[
            'absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl ring-1 ring-black/30',
            compact ? 'origin-top-right' : '',
          ].join(' ')}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold text-accent">{t('statusPopoverEyebrow')}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-foreground">{summary.displayName}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{t('statusPopoverDescription')}</p>
          </div>

          <div className="grid gap-2 px-3 py-3">
            <PopoverMetric
              icon={<Coins size={15} />}
              label={t('statusPopoverPoints')}
              value={balanceLabel ?? t('statusChipUnavailable')}
              tone="accent"
            />
            <PopoverMetric
              icon={<Zap size={15} />}
              label={t('statusPopoverSiphon')}
              value={siphonLabel}
              tone={
                summary.siphonState !== 'ready'
                  ? 'neutral'
                  : summary.siphonBalance != null && summary.siphonBalance < 0
                    ? 'danger'
                    : 'success'
              }
            />
            <PopoverMetric
              icon={<ListChecks size={15} />}
              label={t('statusPopoverChecks')}
              value={pendingLabel}
              tone={summary.pendingCount > 0 ? 'danger' : 'neutral'}
              detail={pendingDetail(summary, t)}
            />
          </div>

          <div className="grid gap-2 border-t border-border bg-background/40 px-3 py-3">
            <GuardedLink
              href="/me"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              {t('statusPopoverOpenMe')}
            </GuardedLink>
            <div className="grid grid-cols-2 gap-2">
              <GuardedLink
                href="/me/requests"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-center text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-foreground"
              >
                {t('statusPopoverOpenRequests')}
              </GuardedLink>
              <GuardedLink
                href="/me/siphon"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-center text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-foreground"
              >
                {t('statusPopoverOpenSiphon')}
              </GuardedLink>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSiphonLabel(
  summary: UserStatusSummary,
  t: ReturnType<typeof useTranslations<'sidebar'>>,
): string {
  if (summary.siphonState === 'unverified') return t('statusChipSiphonUnverified')
  if (summary.siphonState === 'unavailable') return t('statusChipUnavailable')
  return t('statusChipSiphonCount', {
    count: formatSignedCompact(summary.siphonBalance ?? 0),
  })
}

function formatSignedCompact(value: number): string {
  if (value === 0) return '0'
  const prefix = value > 0 ? '+' : '-'
  return `${prefix}${formatCompactPoints(Math.abs(value))}`
}

function pendingDetail(
  summary: UserStatusSummary,
  t: ReturnType<typeof useTranslations<'sidebar'>>,
): string {
  if (summary.pendingCount === 0) return t('statusPopoverNoChecks')
  return t('statusPopoverCheckBreakdown', {
    regear: summary.pendingRegearCount,
    exchange: summary.pendingExchangeCount,
    donation: summary.pendingDonationCount,
  })
}

function PopoverMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  tone: 'accent' | 'success' | 'danger' | 'neutral'
}) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent-soft text-accent-soft-foreground'
      : tone === 'success'
        ? 'bg-success-soft text-success-soft-foreground'
        : tone === 'danger'
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-surface-2 text-muted'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background/35 px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-subtle">{label}</span>
        <span className="block truncate text-sm font-bold text-foreground">{value}</span>
        {detail && <span className="block truncate text-[11px] text-subtle">{detail}</span>}
      </span>
    </div>
  )
}
