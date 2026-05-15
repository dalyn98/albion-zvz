'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Coins, Minus, Plus, X } from 'lucide-react'
import { adjustMemberPoints } from '@/app/actions/points-admin'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  discordId: string
  username: string
  balance: number
}

type Direction = 'grant' | 'deduct'

export default function AdminPointAdjuster({ discordId, username, balance }: Props) {
  const router = useRouter()
  const t = useTranslations('adminPointAdjust')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<Direction>('grant')
  const [amountInput, setAmountInput] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()

  const parsed = parseSilverInput(amountInput)
  const canSubmit = parsed !== null && parsed > 0 && memo.trim().length > 0 && !pending

  // Reset transient state whenever the modal is closed so the next open starts
  // clean; also lock body scroll while the modal is up.
  useEffect(() => {
    if (!open) {
      // 모달 닫힐 때 일괄 reset — 외부 (open prop) → 로컬 form state 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountInput('')
      setMemo('')
      setError('')
      setDirection('grant')
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ESC closes the modal, matching native dialog behavior.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending])

  const handleSubmit = async () => {
    setError('')
    if (parsed === null || parsed <= 0) {
      setError(t('invalidAmount'))
      return
    }
    if (!memo.trim()) {
      setError(t('memoRequired'))
      return
    }

    const delta = direction === 'grant' ? parsed : -parsed
    const projected = balance + delta
    if (direction === 'deduct' && projected < 0) {
      const ok = await askConfirm({
        body: t('negativeWarn', { balance: formatSilver(projected) }),
        destructive: false,
      })
      if (!ok) return
    }

    const actionLabel = direction === 'grant' ? t('actionGrant') : t('actionDeduct')
    const ok = await askConfirm({
      body: t('confirmAction', {
        name: username,
        amount: formatSilver(parsed),
        action: actionLabel,
      }),
      destructive: direction === 'deduct',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await adjustMemberPoints(discordId, delta, memo)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const projected = parsed !== null && parsed > 0
    ? balance + (direction === 'grant' ? parsed : -parsed)
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
      >
        <Coins size={13} />
        {t('openButton')}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('dialogTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={() => {
              if (!pending) setOpen(false)
            }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
          />

          <div className="relative w-full max-w-md bg-gray-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Coins size={16} className="text-amber-400" />
                <h2 className="text-white font-bold">{t('dialogTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-gray-500 hover:text-white disabled:opacity-40"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <p className="text-gray-400">
                {t('targetLabel')}: <span className="text-white font-semibold">{username}</span>
              </p>
              <p className="text-gray-400 font-mono">
                {t('balanceLabel')}: <span className="text-amber-300">{formatSilver(balance)}</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('grant')}
                className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  direction === 'grant'
                    ? 'bg-green-500/20 border-green-500/50 text-green-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <Plus size={12} />
                {t('actionGrant')}
              </button>
              <button
                type="button"
                onClick={() => setDirection('deduct')}
                className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  direction === 'deduct'
                    ? 'bg-red-500/20 border-red-500/50 text-red-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <Minus size={12} />
                {t('actionDeduct')}
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-gray-400 text-xs font-medium">{t('amountLabel')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={t('amountPlaceholder')}
                  autoFocus
                  className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-amber-500/60 focus:outline-none"
                />
                {projected !== null && parsed !== null && (
                  <span className="text-[11px] text-gray-500 mt-1 inline-block font-mono">
                    {t('projectedPreview', {
                      sign: direction === 'grant' ? '+' : '-',
                      amount: formatSilver(parsed),
                    })}{' '}
                    <span className={projected < 0 ? 'text-red-400' : 'text-amber-300'}>
                      {formatSilver(projected)}
                    </span>
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-gray-400 text-xs font-medium">{t('memoLabel')}</span>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('memoPlaceholder')}
                  maxLength={200}
                  className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500/60 focus:outline-none"
                />
              </label>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  direction === 'grant'
                    ? 'bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/40'
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {pending ? t('processing') : direction === 'grant' ? t('actionGrant') : t('actionDeduct')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
