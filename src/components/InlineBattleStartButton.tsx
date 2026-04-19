'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Swords, RotateCcw, Loader2 } from 'lucide-react'
import { startBattle, resetBattleStart } from '@/app/actions/admin'

interface Props {
  eventId: string
  battleStartedAt: string | null
}

export default function InlineBattleStartButton({ eventId, battleStartedAt }: Props) {
  const t = useTranslations('adminDashboard')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const start = () => {
    if (!confirm(t('battleStartConfirm'))) return
    setError('')
    startTransition(async () => {
      const result = await startBattle(eventId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const reset = () => {
    if (!confirm(t('battleResetConfirm'))) return
    setError('')
    startTransition(async () => {
      const result = await resetBattleStart(eventId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  if (battleStartedAt) {
    return (
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        title={t('battleResetTitle')}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 disabled:opacity-50 px-2 py-1.5 rounded-lg hover:bg-gray-700"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
      </button>
    )
  }

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
