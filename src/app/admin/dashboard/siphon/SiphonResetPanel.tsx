'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { resetSiphonLedger } from '@/app/actions/siphon-admin'
import { useConfirm } from '@/components/ConfirmDialog'

export default function SiphonResetPanel() {
  const router = useRouter()
  const t = useTranslations('adminSiphonPage')
  const askConfirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deletedRows, setDeletedRows] = useState<number | null>(null)

  const handleReset = async () => {
    const ok = await askConfirm({
      body: t('resetConfirm'),
      destructive: true,
    })
    if (!ok) return

    setError(null)
    setDeletedRows(null)
    startTransition(async () => {
      const result = await resetSiphonLedger()
      if (result.error) {
        setError(t('resetFailed', { error: result.error }))
        return
      }
      setDeletedRows(result.deletedRows)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-900/50 bg-rose-950/10 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <div className="min-w-0">
            <h2 className="font-bold text-white">{t('resetTitle')}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-rose-100/75">
              {t('resetDescription')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-500 disabled:bg-gray-800 disabled:text-gray-500 sm:w-auto"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RotateCcw size={14} />
          )}
          {t('resetButton')}
        </button>
      </div>

      {deletedRows !== null && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {t('resetSuccess', {
            count: deletedRows.toLocaleString('en-US'),
          })}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
    </section>
  )
}
