'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ClipboardPaste, Loader2 } from 'lucide-react'
import { importTreasuryDepositLog } from '@/app/actions/treasury-deposits'

export default function TreasuryDepositImportPanel() {
  const t = useTranslations('treasuryDeposits')
  const router = useRouter()
  const [raw, setRaw] = useState('')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await importTreasuryDepositLog(raw)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(t('importResult', {
        imported: result.imported,
        duplicates: result.duplicates,
        skipped: result.skippedLines.length,
      }))
      setRaw('')
      router.refresh()
    })
  }

  return (
    <details className="rounded-xl border border-sky-500/25 bg-sky-500/5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-sky-100 [&::-webkit-details-marker]:hidden">
        <ClipboardPaste size={15} aria-hidden="true" />
        {t('importTitle')}
      </summary>
      <div className="space-y-3 border-t border-sky-500/20 p-4">
        <p className="text-xs leading-relaxed text-gray-400">{t('importDescription')}</p>
        <textarea
          rows={6}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder={t('importPlaceholder')}
          className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-white placeholder:text-gray-600 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !raw.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
          {t('importButton')}
        </button>
        {message && <p className="text-xs text-emerald-300">{message}</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    </details>
  )
}
