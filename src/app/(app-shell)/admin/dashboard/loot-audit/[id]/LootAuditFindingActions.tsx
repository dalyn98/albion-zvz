'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2, RotateCcw, X } from 'lucide-react'
import {
  updateLootAuditFinding,
  type LootAuditFindingRow,
} from '@/app/actions/loot-audit'

export default function LootAuditFindingActions({
  finding,
}: {
  finding: LootAuditFindingRow
}) {
  const router = useRouter()
  const t = useTranslations('adminLootAuditPage')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const update = (status: 'open' | 'resolved' | 'ignored') => {
    setError(null)
    startTransition(async () => {
      const result = await updateLootAuditFinding({
        findingId: finding.id,
        status,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Loader2 size={13} className="animate-spin" />
        {t('updating')}
      </span>
    )
  }

  if (finding.status !== 'open') {
    return (
      <div className="space-y-1 text-right">
        <button
          type="button"
          onClick={() => update('open')}
          className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-amber-400 hover:text-amber-200"
        >
          <RotateCcw size={12} />
          {t('reopen')}
        </button>
        {error && <p className="max-w-40 text-xs text-red-300">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => update('resolved')}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
        >
          <Check size={12} />
          {t('resolve')}
        </button>
        <button
          type="button"
          onClick={() => update('ignored')}
          className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400"
        >
          <X size={12} />
          {t('ignore')}
        </button>
      </div>
      {error && <p className="max-w-48 text-right text-xs text-red-300">{error}</p>}
    </div>
  )
}
