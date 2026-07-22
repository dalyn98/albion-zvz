'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import {
  approveExchangeRequest,
  rejectExchangeRequest,
  type AdminExchangeRequest,
} from '@/app/actions/regear-admin'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { useToast } from './ToastProvider'
import {
  ApprovalActionFeedback,
  ApprovalReviewDialog,
  useApprovalWorkflow,
} from './ApprovalWorkflow'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

interface ExchangeReviewListProps {
  requests: AdminExchangeRequest[]
  timezone: string
  avatars?: Record<string, string | null>
}

export default function ExchangeReviewList({
  requests,
  timezone,
  avatars = {},
}: ExchangeReviewListProps) {
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter(
      (r) =>
        matchesName(r.username, q) ||
        matchesDate(r.created_at, q) ||
        matchesDate(r.resolved_at, q),
    )
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((r) => (
            <ExchangeRow
              key={r.id}
              request={r}
              avatar={avatars[r.discord_id] ?? null}
              timezone={timezone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ExchangeRow({
  request,
  avatar,
  timezone,
}: {
  request: AdminExchangeRequest
  avatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const approvalWorkflow = useApprovalWorkflow()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  const statusLabel = (status: string): string => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    return t('statusRejected')
  }

  const approve = () => {
    setError('')
    approvalWorkflow.requestReview({
      action: 'approve-exchange',
      subjectId: request.id,
      title: t('approveButton'),
      summary: `${request.username}\n${formatSilver(request.silver)}\n${t('balanceLabel', { amount: formatSilver(request.balance) })}`,
      confirmLabel: t('approveButton'),
      pendingLabel: tCommon('saving'),
      receipt: tToast('exchangeApproved'),
      execute: () => approveExchangeRequest(request.id),
      onCompleted: () => {
        toast.success(tToast('exchangeApproved'))
        router.refresh()
      },
    })
  }

  const reject = () => {
    setError('')
    approvalWorkflow.runAction({
      action: 'reject-exchange',
      subjectId: request.id,
      title: t('rejectConfirm'),
      summary: `${request.username}\n${rejectNotes.trim()}`,
      confirmLabel: t('rejectConfirm'),
      pendingLabel: tCommon('saving'),
      receipt: tToast('exchangeRejected'),
      execute: () => rejectExchangeRequest(request.id, rejectNotes),
      onCompleted: () => {
        setRejectMode(false)
        toast.success(tToast('exchangeRejected'))
        router.refresh()
      },
    })
  }

  const insufficient = request.balance < request.silver

  return (
    <li
      className="space-y-3 px-1 py-4 sm:px-2"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 230px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MemberAvatar discordId={request.discord_id} avatar={avatar} size={20} />
            <MemberLink
              discordId={request.discord_id}
              username={request.username}
              className="text-white text-sm font-semibold truncate"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
            <span className="font-mono text-amber-400">{formatSilver(request.silver)}</span>
            <span className="text-gray-500">{t('balanceLabel', { amount: formatSilver(request.balance) })}</span>
            <span className="font-mono text-gray-600">
              {formatDateTimeShort(request.created_at, timezone)}
            </span>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      {insufficient && request.status === 'pending' && (
        <p className="text-red-400 text-xs">
          {t('insufficientWarn')}
        </p>
      )}

      {request.admin_notes && (
        <p className="text-gray-400 text-xs italic bg-gray-800/50 rounded px-3 py-2">
          {request.admin_notes}
        </p>
      )}

      {request.status === 'pending' && !rejectMode && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={approve}
            disabled={approvalWorkflow.isPending || insufficient}
            className="flex min-h-10 items-center gap-1 rounded-lg border border-green-500/40 bg-green-500/20 px-3 text-xs text-green-300 hover:bg-green-500/30 disabled:opacity-50"
          >
            <Check size={13} />
            {t('approveButton')}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={approvalWorkflow.isPending}
            className="flex min-h-10 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/20 px-3 text-xs text-red-300 hover:bg-red-500/30"
          >
            <X size={13} /> {t('reject')}
          </button>
        </div>
      )}

      {rejectMode && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('rejectPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={approvalWorkflow.isPending}
              className="min-h-10 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50"
            >
              {t('rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false)
                setRejectNotes('')
              }}
              disabled={approvalWorkflow.isPending}
              className="min-h-10 px-3 text-xs text-gray-400 hover:text-white"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <ApprovalActionFeedback workflow={approvalWorkflow} />
      <ApprovalReviewDialog workflow={approvalWorkflow} />

      {request.resolved_at && request.status !== 'pending' && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
          <p>
            {t('resolvedAt', {
              status: statusLabel(request.status),
              datetime: formatDateTimeShort(request.resolved_at, timezone),
            })}
          </p>
          <p>
            {t('handledBy', {
              status: statusLabel(request.status),
              handler: request.handled_by_username ?? tCommon('unknown'),
            })}
          </p>
        </div>
      )}
    </li>
  )
}
