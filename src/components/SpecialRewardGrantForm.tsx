'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Gift, Loader2, Search } from 'lucide-react'
import { grantSpecialReward } from '@/app/actions/special-rewards'

export interface SpecialRewardMemberOption {
  discordId: string
  username: string
}

export default function SpecialRewardGrantForm({ members }: { members: SpecialRewardMemberOption[] }) {
  const t = useTranslations('specialRewards')
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [commandKey, setCommandKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => members.filter((member) => member.username.toLocaleLowerCase().includes(normalizedSearch)),
    [members, normalizedSearch],
  )
  const amountValue = Number(amount.replace(/,/g, ''))
  const validAmount = Number.isInteger(amountValue) && amountValue > 0
  const total = validAmount ? amountValue * selected.size : 0

  const changePayload = (change: () => void) => {
    change()
    setCommandKey(null)
    setError('')
    setReceipt('')
  }

  const submit = () => {
    if (!validAmount) {
      setError(t('invalidAmount'))
      return
    }
    const idempotencyKey = commandKey ?? crypto.randomUUID()
    setCommandKey(idempotencyKey)
    setError('')
    setReceipt('')
    startTransition(async () => {
      const result = await grantSpecialReward({
        discordIds: [...selected],
        amountPerMember: amountValue,
        memo,
        confirmation,
        idempotencyKey,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setReceipt(t('success', {
        count: result.recipientCount ?? selected.size,
        total: (result.totalPoints ?? total).toLocaleString(),
      }))
      setSelected(new Set())
      setAmount('')
      setMemo('')
      setConfirmation('')
      setCommandKey(null)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="relative mb-3">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-gray-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
          <span>{t('selectedCount', { count: selected.size })}</span>
          <button
            type="button"
            onClick={() => changePayload(() => setSelected(new Set(filtered.map((member) => member.discordId))))}
            className="text-violet-300 hover:text-violet-200"
          >
            {t('selectVisible')}
          </button>
        </div>
        <div className="max-h-[32rem] divide-y divide-gray-800 overflow-y-auto border-y border-gray-800">
          {filtered.map((member) => (
            <label key={member.discordId} className="flex cursor-pointer items-center gap-3 px-2 py-2.5 hover:bg-gray-900">
              <input
                type="checkbox"
                checked={selected.has(member.discordId)}
                onChange={() => changePayload(() => setSelected((current) => {
                  const next = new Set(current)
                  if (next.has(member.discordId)) next.delete(member.discordId)
                  else next.add(member.discordId)
                  return next
                }))}
                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-violet-500"
              />
              <span className="truncate text-sm text-white">{member.username}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="h-fit space-y-4 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 lg:sticky lg:top-20">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-300">{t('amountLabel')}</label>
          <input
            value={amount}
            onChange={(event) => changePayload(() => setAmount(event.target.value))}
            inputMode="numeric"
            placeholder={t('amountPlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-white focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-300">{t('memoLabel')}</label>
          <textarea
            rows={3}
            value={memo}
            maxLength={300}
            onChange={(event) => changePayload(() => setMemo(event.target.value))}
            placeholder={t('memoPlaceholder')}
            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div className="rounded-lg border border-violet-500/20 bg-gray-950/60 p-3 text-xs text-gray-300">
          <p>{t('summaryRecipients', { count: selected.size })}</p>
          <p className="mt-1 font-mono font-bold text-violet-200">{t('summaryTotal', { total: total.toLocaleString() })}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-300">{t('confirmationLabel')}</label>
          <p className="mb-2 text-[11px] leading-relaxed text-gray-500">{t('confirmationHint')}</p>
          <input
            value={confirmation}
            onChange={(event) => changePayload(() => setConfirmation(event.target.value))}
            placeholder="SPECIAL REWARD"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm text-white focus:border-violet-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0 || !validAmount || !memo.trim() || confirmation !== 'SPECIAL REWARD'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/20 px-4 py-2.5 text-sm font-bold text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Gift size={15} />}
          {t('grantButton')}
        </button>
        {receipt && <p className="text-xs text-emerald-300">{receipt}</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </section>
    </div>
  )
}
