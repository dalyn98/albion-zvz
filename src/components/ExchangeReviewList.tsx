'use client'

import { useMemo, useState, useTransition } from 'react'
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

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

interface ExchangeReviewListProps {
  requests: AdminExchangeRequest[]
  avatars?: Record<string, string | null>
}

export default function ExchangeReviewList({ requests, avatars = {} }: ExchangeReviewListProps) {
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
        <ul className="space-y-3">
          {filtered.map((r) => (
            <ExchangeRow key={r.id} request={r} avatar={avatars[r.discord_id] ?? null} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ExchangeRow({ request, avatar }: { request: AdminExchangeRequest; avatar: string | null }) {
  const router = useRouter()
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
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
    startTransition(async () => {
      const result = await approveExchangeRequest(request.id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(tToast('exchangeApproved'))
      router.refresh()
    })
  }

  const reject = () => {
    setError('')
    startTransition(async () => {
      const result = await rejectExchangeRequest(request.id, rejectNotes)
      if (result.error) {
        setError(result.error)
        return
      }
      setRejectMode(false)
      toast.success(tToast('exchangeRejected'))
      router.refresh()
    })
  }

  const insufficient = request.balance < request.silver

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
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
            <span className="font-mono text-gray-600">{formatDateTimeShort(request.created_at)}</span>
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
            disabled={pending || insufficient}
            className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded disabled:opacity-50"
          >
            <Check size={13} />
            {t('approveButton')}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded"
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
              disabled={pending}
              className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded text-xs"
            >
              {t('rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false)
                setRejectNotes('')
              }}
              disabled={pending}
              className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
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

      {request.resolved_at && request.status !== 'pending' && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
          <p>
            {t('resolvedAt', { status: statusLabel(request.status), datetime: formatDateTimeShort(request.resolved_at) })}
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
