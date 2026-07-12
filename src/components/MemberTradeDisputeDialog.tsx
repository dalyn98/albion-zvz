'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, X } from 'lucide-react'
import { useBodyScrollLock } from './useBodyScrollLock'

interface Props {
  listingTitle: string | null
  pending: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

export default function MemberTradeDisputeDialog({
  listingTitle,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const t = useTranslations('memberTrade')
  const tCommon = useTranslations('common')
  const [reason, setReason] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(true)

  useEffect(() => {
    textareaRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pending])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed || pending) return
    onSubmit(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={() => !pending && onClose()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-trade-dispute-title"
        aria-describedby="member-trade-dispute-description"
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-gray-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="flex min-w-0 gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-300" />
            <div>
              <h2 id="member-trade-dispute-title" className="text-base font-bold text-white">
                {t('disputeDialogTitle')}
              </h2>
              <p id="member-trade-dispute-description" className="mt-1 text-xs leading-relaxed text-gray-400">
                {t('disputeDialogDescription', { title: listingTitle ?? '—' })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label={tCommon('close')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
        <form className="space-y-3 px-5 pb-5" onSubmit={submit}>
          <label htmlFor="member-trade-dispute-reason" className="block text-sm font-semibold text-gray-200">
            {t('disputeReasonLabel')}
          </label>
          <textarea
            ref={textareaRef}
            id="member-trade-dispute-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            disabled={pending}
            placeholder={t('disputeReasonPlaceholder')}
            className="min-h-28 w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-400 disabled:opacity-50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="min-h-10 rounded-lg px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={pending || reason.trim().length === 0}
              className="min-h-10 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('submitDispute')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
