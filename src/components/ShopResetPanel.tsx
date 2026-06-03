'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { resetShopInventory } from '@/app/actions/shop-inventory'
import { useConfirm } from '@/components/ConfirmDialog'

export default function ShopResetPanel() {
  const router = useRouter()
  const t = useTranslations('adminShopInventory')
  const askConfirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<{
    inventoryRowsDeleted: number
    logsDeleted: number
    ordersCancelled: number
    baselinesSuperseded: number
  } | null>(null)

  const handleReset = async () => {
    const ok = await askConfirm({ body: t('resetConfirm'), destructive: true })
    if (!ok) return

    setError('')
    setSummary(null)
    startTransition(async () => {
      const result = await resetShopInventory()
      if (result.error) {
        setError(result.error)
        return
      }

      setSummary({
        inventoryRowsDeleted: result.inventoryRowsDeleted,
        logsDeleted: result.logsDeleted,
        ordersCancelled: result.ordersCancelled,
        baselinesSuperseded: result.baselinesSuperseded,
      })
      router.refresh()
    })
  }

  return (
    <div id="shop-reset" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-red-100">{t('freshStartTitle')}</h3>
            <p className="text-xs leading-relaxed text-red-100/75">
              {t('freshStartDescription')}
            </p>
            <p className="text-[11px] leading-relaxed text-red-100/60">
              {t('freshStartPreserves')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-500/50 bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors hover:border-red-400 hover:bg-red-900/70 disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-600"
          title={t('resetTitle')}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          {t('freshStartButton')}
        </button>
      </div>

      {summary !== null && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
          {t('resetSummary', {
            rows: summary.inventoryRowsDeleted.toLocaleString(),
            logs: summary.logsDeleted.toLocaleString(),
            orders: summary.ordersCancelled.toLocaleString(),
            baselines: summary.baselinesSuperseded.toLocaleString(),
          })}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </div>
  )
}
