'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Coins, CheckCircle2, X } from 'lucide-react'
import {
  payCraftSettlementBatchAdmin,
  type SupplySettlementGroup,
} from '@/app/actions/craft-admin'
import { formatSilver } from '@/lib/silver'
import { useToast } from './ToastProvider'

export default function AdminSupplySettlementPanel({
  groups,
  canPay,
}: {
  groups: SupplySettlementGroup[]
  canPay: boolean
}) {
  const t = useTranslations('adminCraft')
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingMemberId, setConfirmingMemberId] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [note, setNote] = useState('')

  function pay(group: SupplySettlementGroup) {
    if (!idempotencyKey) return
    startTransition(async () => {
      const result = await payCraftSettlementBatchAdmin(
        group.crafterMemberId,
        note,
        idempotencyKey,
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('settlementPaidToast', {
        count: result.itemCount ?? group.itemCount,
        silver: formatSilver(result.totalSilver ?? group.totalSilver),
      }))
      setConfirmingMemberId(null)
      setIdempotencyKey(null)
      setNote('')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-gray-900 p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <Coins size={16} className="text-amber-300" />
          {t('settlementTitle')}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{t('settlementHint')}</p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-4 text-center text-sm text-gray-500">
          {t('settlementEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => {
            const confirming = confirmingMemberId === group.crafterMemberId
            return (
              <li key={group.crafterMemberId} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{group.crafterName}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t('settlementSummary', {
                        count: group.itemCount,
                        silver: formatSilver(group.totalSilver),
                      })}
                    </p>
                  </div>
                  {canPay && !confirming && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingMemberId(group.crafterMemberId)
                        setIdempotencyKey(crypto.randomUUID())
                        setNote('')
                      }}
                      disabled={pending}
                      className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {t('settlementPay')}
                    </button>
                  )}
                </div>

                {confirming && (
                  <div className="mt-3 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold text-amber-100">
                      {t('settlementPayConfirmTitle')}
                    </p>
                    <p className="text-[11px] text-amber-100/75">
                      {t('settlementPayConfirmHint', {
                        name: group.crafterName,
                        count: group.itemCount,
                        silver: formatSilver(group.totalSilver),
                      })}
                    </p>
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={500}
                      placeholder={t('settlementNotePlaceholder')}
                      disabled={pending}
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-400 disabled:opacity-50"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingMemberId(null)
                          setIdempotencyKey(null)
                        }}
                        disabled={pending}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50"
                      >
                        <X size={12} /> {t('settlementCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => pay(group)}
                        disabled={pending || !idempotencyKey}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        <CheckCircle2 size={12} />
                        {pending ? t('processing') : t('settlementPayFinal')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!canPay && groups.length > 0 && (
        <p className="text-[11px] text-gray-500">{t('settlementReadOnly')}</p>
      )}
    </section>
  )
}
