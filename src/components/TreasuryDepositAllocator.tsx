'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'
import {
  allocateMyTreasuryDeposit,
  type MemberTreasuryDeposit,
  type TreasuryDepositPurpose,
} from '@/app/actions/treasury-deposits'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'

export default function TreasuryDepositAllocator({
  deposits,
  timezone,
}: {
  deposits: MemberTreasuryDeposit[]
  timezone: string
}) {
  const t = useTranslations('treasuryDeposits')
  if (deposits.length === 0) {
    return <p className="text-xs leading-relaxed text-gray-500">{t('memberEmpty')}</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-gray-400">{t('memberDescription')}</p>
      {deposits.map((deposit) => (
        <DepositRow key={deposit.id} deposit={deposit} timezone={timezone} />
      ))}
    </div>
  )
}

function DepositRow({ deposit, timezone }: { deposit: MemberTreasuryDeposit; timezone: string }) {
  const t = useTranslations('treasuryDeposits')
  const router = useRouter()
  const [purpose, setPurpose] = useState<TreasuryDepositPurpose>('point_top_up')
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const allocate = () => {
    setError('')
    const idempotencyKey = crypto.randomUUID()
    startTransition(async () => {
      const result = await allocateMyTreasuryDeposit({
        depositId: deposit.id,
        purpose,
        purposeNote: note,
        idempotencyKey,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      id={`treasury-deposit-${deposit.id}`}
      className="scroll-mt-24 rounded-lg border border-gray-800 bg-gray-900/70 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-emerald-300">
          {formatSilver(deposit.amountSilver)}
        </span>
        <span className="text-[11px] text-gray-500">
          {formatDateTimeShort(deposit.depositedAt, timezone)}
        </span>
        <select
          value={purpose}
          onChange={(event) => setPurpose(event.target.value as TreasuryDepositPurpose)}
          className="ml-auto rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white"
          aria-label={t('purposeLabel')}
        >
          <option value="point_top_up">{t('purposePointTopUp')}</option>
          <option value="guild_donation">{t('purposeGuildDonation')}</option>
          <option value="other">{t('purposeOther')}</option>
        </select>
        <button
          type="button"
          onClick={allocate}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('allocateButton')}
        </button>
      </div>
      {(purpose === 'other' || purpose === 'guild_donation') && (
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder={t('purposeNotePlaceholder')}
          className="mt-2 w-full rounded-lg border border-gray-800 bg-gray-950 px-2.5 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-emerald-500 focus:outline-none"
        />
      )}
      {purpose === 'point_top_up' && (
        <p className="mt-2 text-[11px] text-emerald-200/75">{t('autoCreditHint')}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  )
}
