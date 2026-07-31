'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Swords, Loader2 } from 'lucide-react'
import { startBattle } from '@/app/actions/admin'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  eventId: string
  battleStartedAt: string | null
  disabledReason?: string
}

export default function InlineBattleStartButton({ eventId, battleStartedAt, disabledReason }: Props) {
  const t = useTranslations('adminDashboard')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [startIdempotencyKey, setStartIdempotencyKey] = useState('')
  const askConfirm = useConfirm()

  const start = async () => {
    const ok = await askConfirm({ body: t('battleStartConfirm'), destructive: false })
    if (!ok) return
    setError('')
    const idempotencyKey = startIdempotencyKey || crypto.randomUUID()
    if (!startIdempotencyKey) setStartIdempotencyKey(idempotencyKey)
    startTransition(async () => {
      const result = await startBattle(eventId, idempotencyKey)
      if (result.error) setError(result.error)
      else {
        setStartIdempotencyKey('')
        router.refresh()
      }
    })
  }

  if (disabledReason) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        aria-label={disabledReason}
        className="flex items-center gap-1 text-xs bg-gray-800/70 border border-gray-700 text-gray-500 font-semibold px-3 py-1.5 rounded-lg cursor-not-allowed"
      >
        <Swords size={13} />
        {t('battleStart')}
      </button>
    )
  }

  if (battleStartedAt) return null

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex items-center gap-1 text-xs bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Swords size={13} />}
        {t('battleStart')}
      </button>
      {error && <span className="text-red-400 text-[11px]">{error}</span>}
    </>
  )
}
