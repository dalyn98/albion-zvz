'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { requestExchange } from '@/app/actions/exchange'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { useToast } from './ToastProvider'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  balance: number
  disabled: boolean
  restrictionUntil: string | null
}

export default function RequestExchangeForm({
  balance,
  disabled,
  restrictionUntil,
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('requestExchange')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const amountId = useId()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const silver = parseSilverInput(amount)
  const isRestricted = restrictionUntil !== null
  const canSubmit =
    !disabled && !isRestricted && silver !== null && silver > 0 && silver <= balance
  useReportDirty('request-exchange', !disabled && !isRestricted && amount.trim() !== '')

  const submit = () => {
    if (silver === null) {
      setError(t('invalidNumber'))
      return
    }
    setError('')
    startTransition(async () => {
      const result = await requestExchange(silver)
      if (result.error) {
        setError(result.error)
        return
      }
      setAmount('')
      toast.success(tToast('exchangeSubmitted'))
      router.refresh()
    })
  }

  if (disabled) {
    return (
      <div className="bg-gray-950/40 border border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-100/80">
        {t('pendingNotice')}
      </div>
    )
  }

  if (restrictionUntil) {
    return (
      <div className="bg-gray-950/40 border border-rose-500/25 rounded-lg px-4 py-3 text-sm text-rose-100/85">
        {t('restrictedNotice', {
          until: new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(restrictionUntil)),
        })}
      </div>
    )
  }

  return (
    <div className="bg-gray-950/40 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor={amountId} className="text-gray-400 text-[11px] font-semibold block">
              {t('amountLabel', { max: formatSilver(balance) })}
            </label>
            <button
              type="button"
              onClick={() => setAmount(String(balance))}
              disabled={balance <= 0}
              className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 disabled:text-gray-600"
            >
              {t('fillMax')}
            </button>
          </div>
          <input
            id={amountId}
            type="text"
            inputMode="numeric"
            placeholder={t('amountPlaceholder')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap"
        >
          <ArrowRightLeft size={13} />
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
      {balance <= 0 && (
        <p className="text-gray-500 text-xs">{t('noBalanceNotice')}</p>
      )}
      {silver !== null && silver > 0 && (
        <p className="text-gray-500 text-xs">
          {t('amountDisplay')}{' '}
          <span className="font-mono text-gray-300">{t('amountWithUnit', { amount: formatSilver(silver) })}</span>
          {silver > balance && (
            <span className="text-red-400 ml-2">{t('overBalance')}</span>
          )}
        </p>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}
