'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRightLeft, Plus, Search, Trash2, UserCircle2, X } from 'lucide-react'
import MemberAvatar from './MemberAvatar'
import { useToast } from './ToastProvider'
import {
  transferPoints,
  type TransferCandidate,
  type TransferInput,
} from '@/app/actions/transfer'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { useReportDirty } from './UnsavedChangesProvider'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'

interface Props {
  balance: number
  candidates: TransferCandidate[]
}

interface DraftRow {
  candidate: TransferCandidate
  amount: string
  memo: string
}

// 길드원 → 여러 길드원 포인트 양도 UI. 상위(/me 페이지)에서 잔액과 후보 목록을
// 넘겨받는다. 서버는 자체 검증을 다시 하기 때문에 이 컴포넌트는 UX 검증에 집중.
export default function TransferPointsForm({ balance, candidates }: Props) {
  const router = useRouter()
  const t = useTranslations('me')
  const tErr = useTranslations('memberActionError')
  const tCommon = useTranslations('common')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTransfers, setReviewTransfers] = useState<TransferInput[]>([])
  const [pending, startTransition] = useTransition()

  const hasBalance = balance > 0

  useEffect(() => {
    if (!open) {
      // 모달 닫힐 때 일괄 reset — open prop 변화 → 로컬 form state 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrafts([])
      setQuery('')
      setError('')
      setReviewOpen(false)
      setReviewTransfers([])
      return
    }
    return acquireBodyScrollLock()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending])

  const pickedIds = useMemo(
    () => new Set(drafts.map((d) => d.candidate.discord_id)),
    [drafts],
  )

  const filtered = useMemo(() => {
    const q = normalizeQuery(query)
    if (!q) return candidates
    return candidates.filter((c) => matchesName(c.username, q))
  }, [candidates, query])

  const totalAmount = drafts.reduce((sum, d) => sum + (parseSilverInput(d.amount) ?? 0), 0)
  const reviewTotal = reviewTransfers.reduce((sum, transfer) => sum + transfer.amount, 0)
  const overBalance = totalAmount > balance
  const anyInvalid = drafts.some((d) => {
    const n = parseSilverInput(d.amount)
    return n === null || n <= 0
  })
  const canSubmit =
    drafts.length > 0 && !anyInvalid && !overBalance && totalAmount > 0 && !pending
  // 모달이 열려 있고 수신자가 한 명이라도 추가돼 있으면 작성 중.
  useReportDirty('transfer-points', open && drafts.length > 0)

  const addRecipient = (c: TransferCandidate) => {
    if (pickedIds.has(c.discord_id)) return
    setDrafts((prev) => [...prev, { candidate: c, amount: '', memo: '' }])
  }

  const removeRecipient = (discordId: string) => {
    setDrafts((prev) => prev.filter((d) => d.candidate.discord_id !== discordId))
  }

  const updateDraft = (discordId: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.candidate.discord_id === discordId ? { ...d, ...patch } : d,
      ),
    )
  }

  const submit = () => {
    setError('')
    if (drafts.length === 0) {
      setError(tErr('transferNoRecipients'))
      return
    }
    const transfers: TransferInput[] = []
    for (const d of drafts) {
      const amount = parseSilverInput(d.amount)
      if (amount === null || amount <= 0) {
        setError(tErr('transferInvalidAmount'))
        return
      }
      transfers.push({
        discordId: d.candidate.discord_id,
        username: d.candidate.username,
        amount,
        memo: d.memo.trim() || undefined,
      })
    }
    if (totalAmount > balance) {
      setError(tErr('insufficientBalance', { balance: balance.toLocaleString() }))
      return
    }

    setReviewTransfers(transfers)
    setReviewOpen(true)
    emitUxWorkflowEvent({ eventType: 'previewed', metadata: { workflow: 'point_transfer', stage: 'review' } })
  }

  const commitTransfer = () => {
    if (reviewTransfers.length === 0 || pending) return
    startTransition(async () => {
      emitUxWorkflowEvent({ eventType: 'submitted', metadata: { workflow: 'point_transfer', stage: 'commit' } })
      const result = await transferPoints(reviewTransfers)
      if (result.error) {
        setError(result.error)
        setReviewOpen(false)
        emitUxWorkflowEvent({ eventType: 'partial_failed', metadata: { workflow: 'point_transfer', result: 'server_error' } })
        return
      }
      setReviewOpen(false)
      setOpen(false)
      toast.success(t('transferDone', { silver: formatSilver(reviewTotal) }))
      emitUxWorkflowEvent({ eventType: 'completed', metadata: { workflow: 'point_transfer', result: 'success' } })
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasBalance}
        className="inline-flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:hover:bg-amber-500/10 border border-amber-500/40 text-amber-300 disabled:text-amber-500/40 disabled:cursor-not-allowed font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
        title={hasBalance ? undefined : t('transferNoBalance')}
      >
        <ArrowRightLeft size={13} />
        {t('transferOpen')}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('transferModalTitle')}
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

          <div className="relative max-h-[calc(100dvh-3rem)] w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-amber-500/30 bg-gray-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-amber-400" />
                <h2 className="text-white font-bold">{t('transferModalTitle')}</h2>
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

            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('myPoints')}</span>
                <span className="text-amber-300">{formatSilver(balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('transferTotal')}</span>
                <span className={overBalance ? 'text-red-400' : 'text-gray-200'}>
                  {formatSilver(totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('transferBalanceAfter')}</span>
                <span className={overBalance ? 'text-red-400' : 'text-gray-200'}>
                  {formatSilver(balance - totalAmount)}
                </span>
              </div>
            </div>

            {drafts.length > 0 && (
              <ul className="space-y-2">
                {drafts.map((d) => (
                  <li
                    key={d.candidate.discord_id}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <MemberAvatar
                        discordId={d.candidate.discord_id}
                        avatar={d.candidate.avatar}
                        size={20}
                      />
                      <span className="text-sm text-white font-medium min-w-0 truncate flex-1">
                        {d.candidate.username}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(d.candidate.discord_id)}
                        disabled={pending}
                        className="text-gray-500 hover:text-red-400 disabled:opacity-40"
                        aria-label={t('transferRemove')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={d.amount}
                        onChange={(e) =>
                          updateDraft(d.candidate.discord_id, { amount: e.target.value })
                        }
                        placeholder={t('transferAmountPlaceholder')}
                        aria-label={t('transferAmountLabel')}
                        className="w-32 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-white text-sm font-mono focus:border-amber-500/60 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={d.memo}
                        onChange={(e) =>
                          updateDraft(d.candidate.discord_id, { memo: e.target.value })
                        }
                        placeholder={t('transferMemoPlaceholder')}
                        maxLength={200}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-white text-sm focus:border-amber-500/60 focus:outline-none"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-300">{t('transferAddRecipient')}</p>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('transferPlaceholder')}
                  className="w-full bg-gray-950 border border-gray-800 rounded-md pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-amber-500/60 focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-800 rounded-lg divide-y divide-gray-800">
                {filtered.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-4">
                    {t('transferNoCandidates')}
                  </p>
                ) : (
                  filtered.map((c) => {
                    const picked = pickedIds.has(c.discord_id)
                    return (
                      <button
                        key={c.discord_id}
                        type="button"
                        onClick={() => addRecipient(c)}
                        disabled={picked || pending}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {c.avatar ? (
                          <MemberAvatar
                            discordId={c.discord_id}
                            avatar={c.avatar}
                            size={18}
                          />
                        ) : (
                          <UserCircle2 size={18} className="text-gray-500" />
                        )}
                        <span className="text-sm text-white flex-1 truncate">{c.username}</span>
                        {!picked && <Plus size={13} className="text-amber-400 flex-shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {t('transferCancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold py-2 rounded-lg transition-colors"
              >
                <ArrowRightLeft size={13} />
                {pending ? t('transferSubmitting') : t('transferSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
      {reviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-review-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-4 sm:items-center"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/40 bg-gray-950 p-5 shadow-2xl">
            <div>
              <h2 id="transfer-review-title" className="text-lg font-bold text-white">
                {t('transferReviewTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {t('transferReviewRecipientCount', { count: reviewTransfers.length })}
              </p>
            </div>
            <ul className="max-h-60 space-y-2 overflow-y-auto">
              {reviewTransfers.map((transfer) => (
                <li
                  key={transfer.discordId}
                  className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-semibold text-gray-100">{transfer.username}</span>
                    <span className="shrink-0 font-mono text-amber-300">
                      {formatSilver(transfer.amount)}
                    </span>
                  </div>
                  {transfer.memo && <p className="mt-1 text-xs text-gray-500">{transfer.memo}</p>}
                </li>
              ))}
            </ul>
            <dl className="space-y-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('transferTotal')}</dt>
                <dd className="font-mono font-bold text-gray-100">{formatSilver(reviewTotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('transferBalanceAfter')}</dt>
                <dd className="font-mono font-bold text-emerald-300">
                  {formatSilver(balance - reviewTotal)}
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-amber-200">{t('transferReviewWarning')}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {t('transferReviewBack')}
              </button>
              <button
                type="button"
                onClick={commitTransfer}
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                <ArrowRightLeft size={14} />
                {pending ? t('transferSubmitting') : t('transferReviewConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
