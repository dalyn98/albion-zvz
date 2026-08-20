'use client'

import { Ban, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cancelEventOperations } from '@/app/actions/event-operations'
import { useConfirm } from '@/components/ConfirmDialog'

export default function CancelEventOperationsButton({
  eventId,
  compact = false,
}: {
  eventId: string
  compact?: boolean
}) {
  const t = useTranslations('eventOperations')
  const router = useRouter()
  const askConfirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const cancel = async () => {
    const confirmed = await askConfirm({
      title: t('cancelOperationsTitle'),
      body: t('cancelOperationsConfirm'),
      confirmLabel: t('cancelOperationsConfirmButton'),
      destructive: true,
    })
    if (!confirmed) return

    setError('')
    startTransition(async () => {
      const result = await cancelEventOperations(eventId)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 font-semibold text-red-200 transition-[background-color,transform] duration-150 hover:bg-red-500/20 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 ${
          compact ? 'min-w-10 px-2 py-2' : 'px-3 py-2 text-xs'
        }`}
        aria-label={t('cancelOperations')}
        title={compact ? t('cancelOperations') : undefined}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
        {!compact && t('cancelOperations')}
      </button>
      {error && <span className="max-w-56 text-[11px] text-red-300">{error}</span>}
    </span>
  )
}
