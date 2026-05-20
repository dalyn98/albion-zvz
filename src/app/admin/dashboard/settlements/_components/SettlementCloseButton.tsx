'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { closeSettlementPeriodAction } from '@/app/actions/settlements'

interface Props {
  id: string
}

export default function SettlementCloseButton({ id }: Props) {
  const t = useTranslations('adminSettlements')
  const [state, action, pending] = useActionState(closeSettlementPeriodAction, {})

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-60 disabled:cursor-wait"
      >
        <Lock size={15} />
        {pending ? t('closing') : t('closePeriod')}
      </button>
      {state.error && <p className="text-xs text-rose-300">{state.error}</p>}
    </form>
  )
}
