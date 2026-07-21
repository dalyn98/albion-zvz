'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  ChevronDown,
  ClipboardList,
  Coins,
  Handshake,
  ShieldCheck,
  ShoppingBag,
  Wallet,
  X,
} from 'lucide-react'

export type ApprovalQueueKey =
  | 'regear'
  | 'exchange'
  | 'donation'
  | 'shop'
  | 'member_trade'
  | 'event_payout'
  | 'craft'

export interface ApprovalQueueOption {
  key: ApprovalQueueKey
  label: string
  href: string
  badge: number
}

interface ApprovalQueuePickerProps {
  active: ApprovalQueueKey
  options: ApprovalQueueOption[]
  pickerLabel: string
  pendingLabel: string
  closeLabel: string
}

const ICONS = {
  regear: ShieldCheck,
  exchange: Wallet,
  donation: Coins,
  shop: ShoppingBag,
  member_trade: Handshake,
  event_payout: Coins,
  craft: ClipboardList,
} satisfies Record<ApprovalQueueKey, React.ComponentType<{ size?: number; className?: string }>>

export default function ApprovalQueuePicker({
  active,
  options,
  pickerLabel,
  pendingLabel,
  closeLabel,
}: ApprovalQueuePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const activeOption = options.find((option) => option.key === active) ?? options[0]

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 50)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [open])

  if (!activeOption) return null
  const ActiveIcon = ICONS[activeOption.key]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-surface px-3 text-left shadow-card ring-1 ring-border transition-[background-color,box-shadow,transform] hover:bg-surface-2 hover:shadow-lift active:scale-[0.96] lg:hidden"
      >
        <ActiveIcon size={17} className="shrink-0 text-accent-soft-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {pickerLabel}
          </span>
          <span className="block truncate text-sm font-semibold text-foreground">
            {activeOption.label}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {activeOption.badge} {pendingLabel}
        </span>
        <ChevronDown size={15} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-end bg-black/70 backdrop-blur-sm lg:hidden"
          onMouseDown={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-queue-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="safe-area-bottom max-h-[82dvh] w-full overflow-hidden rounded-t-2xl bg-surface text-foreground shadow-pop ring-1 ring-white/10"
          >
            <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
              <h2 id="approval-queue-picker-title" className="text-sm font-semibold">
                {pickerLabel}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-[background-color,color,transform] hover:bg-surface-2 hover:text-foreground active:scale-[0.96]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="max-h-[calc(82dvh-3.5rem-env(safe-area-inset-bottom))] overflow-y-auto p-2">
              {options.map((option) => {
                const Icon = ICONS[option.key]
                const isActive = option.key === active
                return (
                  <Link
                    key={option.key}
                    href={option.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-[background-color,color,transform] active:scale-[0.96] ${
                      isActive
                        ? 'bg-accent-soft text-accent-soft-foreground'
                        : 'text-muted hover:bg-surface-2 hover:text-foreground'
                    }`}
                  >
                    <Icon size={17} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{option.label}</span>
                    <span className={`min-w-6 rounded-full px-1.5 text-center text-[10px] font-bold leading-5 tabular-nums ${
                      option.badge > 0
                        ? 'bg-danger text-danger-foreground'
                        : 'bg-surface-2 text-subtle'
                    }`}>
                      {option.badge > 99 ? '99+' : option.badge}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
