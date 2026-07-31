'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, UserX } from 'lucide-react'
import { cancelSlot } from '@/app/actions/member'
import { useConfirm } from '@/components/ConfirmDialog'

export default function EventGuestApplicationControls({
  slotId,
}: {
  slotId: string
}) {
  const t = useTranslations('eventGuestExperience')
  const router = useRouter()
  const askConfirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const cancel = async () => {
    const confirmed = await askConfirm({
      body: t('cancelConfirm'),
      destructive: true,
    })
    if (!confirmed) return
    setError('')
    startTransition(async () => {
      const result = await cancelSlot(slotId)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={cancel}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
        {pending ? t('cancelling') : t('cancel')}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}
