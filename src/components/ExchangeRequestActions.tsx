'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  cancelMyExchangeRequest,
  updateMyExchangeRequest,
} from '@/app/actions/exchange'
import { formatSilver, parseSilverInput } from '@/lib/silver'

interface Props {
  id: string
  silver: number
}

export default function ExchangeRequestActions({ id, silver }: Props) {
  const router = useRouter()
  const t = useTranslations('exchangeActions')
  const [mode, setMode] = useState<'idle' | 'confirm-cancel' | 'edit'>('idle')
  const initialDraft = silver.toString()
  const [draft, setDraft] = useState(initialDraft)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const resetEdit = () => {
    setMode('idle')
    setDraft(initialDraft)
    setError('')
  }

  const confirmCancel = () => {
    setError('')
    startTransition(async () => {
      const result = await cancelMyExchangeRequest(id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const save = () => {
    setError('')
    const nextSilver = parseSilverInput(draft)
    if (nextSilver === null || nextSilver <= 0) {
      setError(t('invalidNumber'))
      return
    }
    if (nextSilver === silver) {
      resetEdit()
      return
    }
    startTransition(async () => {
      const result = await updateMyExchangeRequest(id, nextSilver)
      if (result.error) setError(result.error)
      else {
        setMode('idle')
        router.refresh()
      }
    })
  }

  if (mode === 'edit') {
    return (
      <div className="space-y-2 mt-2 bg-gray-800/50 border border-gray-700 rounded-lg p-3">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('editPlaceholder')}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold px-3 py-1.5 rounded text-xs"
          >
            <Check size={12} />
            {t('save')}
          </button>
          <button
            type="button"
            onClick={resetEdit}
            disabled={pending}
            className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-cancel') {
    return (
      <div className="space-y-2 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        <p className="text-red-200 text-xs">
          {t('cancelConfirm', { amount: formatSilver(silver) })}
        </p>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={confirmCancel}
            disabled={pending}
            className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded text-xs"
          >
            {t('cancelConfirmButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle')
              setError('')
            }}
            disabled={pending}
            className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
          >
            {t('keep')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        type="button"
        onClick={() => setMode('edit')}
        className="flex items-center gap-1 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2.5 py-1 rounded"
      >
        <Pencil size={11} />
        {t('edit')}
      </button>
      <button
        type="button"
        onClick={() => setMode('confirm-cancel')}
        className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded"
      >
        <X size={11} />
        {t('cancelButton')}
      </button>
    </div>
  )
}
