'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { resetSiphonLedger } from '@/app/actions/siphon-admin'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  logCount: number | null
}

const RESET_CONFIRM_TEXT = 'RESET'

export default function SiphonResetPanel({ logCount }: Props) {
  const router = useRouter()
  const t = useTranslations('adminSiphonPage')
  const askConfirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deletedRows, setDeletedRows] = useState<number | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const effectiveLogCount = deletedRows !== null ? 0 : logCount
  const hasUnknownLogCount = effectiveLogCount === null
  const hasNoLogs = effectiveLogCount === 0
  const canReset =
    !pending &&
    !hasUnknownLogCount &&
    !hasNoLogs &&
    confirmText.trim().toUpperCase() === RESET_CONFIRM_TEXT

  const handleReset = async () => {
    if (!canReset) return

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
      setConfirmText('')
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
            <p className="mt-2 text-xs font-semibold text-rose-100">
              {effectiveLogCount === null
                ? t('resetTargetUnknown')
                : effectiveLogCount === 0
                  ? t('resetTargetEmpty')
                  : t('resetTargetCount', {
                      count: effectiveLogCount.toLocaleString('en-US'),
                    })}
            </p>
            {!hasUnknownLogCount && !hasNoLogs && (
              <label className="mt-3 block max-w-xs text-xs font-semibold text-rose-100">
                <span>{t('resetPhraseLabel', { phrase: RESET_CONFIRM_TEXT })}</span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  disabled={pending}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={RESET_CONFIRM_TEXT}
                  className="mt-1 h-9 w-full rounded-lg border border-rose-800/70 bg-gray-950 px-3 text-xs text-white outline-none transition-colors placeholder:text-gray-600 focus:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={!canReset}
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
