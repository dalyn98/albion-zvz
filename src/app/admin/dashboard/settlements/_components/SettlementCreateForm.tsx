'use client'

import { useActionState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createSettlementPeriodAction } from '@/app/actions/settlements'

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function SettlementCreateForm() {
  const t = useTranslations('adminSettlements')
  const [state, action, pending] = useActionState(createSettlementPeriodAction, {})

  return (
    <form action={action} className="bg-gray-900/70 border border-gray-700 rounded-lg p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{t('createTitle')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('createDescription')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-end">
        <label className="space-y-1">
          <span className="text-xs text-gray-400">{t('monthLabel')}</span>
          <input
            name="month"
            type="month"
            required
            defaultValue={currentMonthValue()}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-400">{t('notesLabel')}</span>
          <input
            name="notes"
            type="text"
            maxLength={500}
            placeholder={t('notesPlaceholder')}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-wait"
        >
          <CalendarPlus size={16} />
          {pending ? t('creating') : t('createButton')}
        </button>
      </div>
      {state.error && (
        <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  )
}
