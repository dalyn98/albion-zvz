'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, X, ImageIcon, Loader2, ZoomIn, ChevronUp } from 'lucide-react'
import {
  approveDonationRequest,
  rejectDonationRequest,
  getDonationScreenshotUrl,
  type AdminDonationRequest,
} from '@/app/actions/donation-admin'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import ImageLightbox from './ImageLightbox'
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

interface DonationReviewListProps {
  requests: AdminDonationRequest[]
  timezone: string
  avatars?: Record<string, string | null>
}

export default function DonationReviewList({
  requests,
  timezone,
  avatars = {},
}: DonationReviewListProps) {
  const t = useTranslations('adminDonationReview')
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
            <DonationRow
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

function DonationRow({
  request,
  avatar,
  timezone,
}: {
  request: AdminDonationRequest
  avatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminDonationReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const statusLabel = (status: string): string => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    return t('statusRejected')
  }

  const loadScreenshot = () => {
    if (loadingScreenshot || screenshotUrl || !request.screenshot_path) return
    setLoadingScreenshot(true)
    setError('')
    ;(async () => {
      const result = await getDonationScreenshotUrl(request.screenshot_path!)
      setLoadingScreenshot(false)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) setScreenshotUrl(result.url)
    })()
  }

  const approve = () => {
    setError('')
    startTransition(async () => {
      const result = await approveDonationRequest(request.id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(tToast('donationApproved'))
      router.refresh()
    })
  }

  const reject = () => {
    setError('')
    startTransition(async () => {
      const result = await rejectDonationRequest(request.id, rejectNotes)
      if (result.error) {
        setError(result.error)
        return
      }
      setRejectMode(false)
      toast.success(tToast('donationRejected'))
      router.refresh()
    })
  }

  return (
    <li
      className="space-y-3 px-1 py-4 sm:px-2"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 220px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MemberAvatar discordId={request.discord_id} avatar={avatar} size={20} />
            <MemberLink
              discordId={request.discord_id}
              username={request.username}
              className="text-white text-sm font-semibold truncate"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span className="font-mono text-emerald-400">
              {t('claimed', { amount: formatSilver(request.silver) })}
            </span>
            <span className="font-mono text-gray-500">
              {formatDateTimeShort(request.created_at, timezone)}
            </span>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      {request.memo && (
        <div className="bg-gray-800/50 rounded px-3 py-2">
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
            {t('memoLabel')}
          </p>
          <p className="text-gray-300 text-xs whitespace-pre-wrap">{request.memo}</p>
        </div>
      )}

      {request.admin_notes && (
        <p className="text-gray-400 text-xs italic bg-gray-800/50 rounded px-3 py-2">
          {request.admin_notes}
        </p>
      )}

      {screenshotUrl ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="group relative block w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950 hover:border-emerald-500/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt={t('screenshotAlt')}
              className="w-full max-h-72 object-contain bg-black"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                <ZoomIn size={12} />
                {t('zoom')}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScreenshotUrl(null)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
          >
            <ChevronUp size={13} />
            {t('collapseScreenshot')}
          </button>
        </div>
      ) : request.screenshot_path ? (
        <button
          type="button"
          onClick={loadScreenshot}
          disabled={loadingScreenshot}
          className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded"
        >
          {loadingScreenshot ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
          {loadingScreenshot ? tCommon('loadingDots') : t('viewScreenshot')}
        </button>
      ) : null}

      <div className="flex items-center gap-2 flex-wrap">
        {request.status === 'pending' && !rejectMode && (
          <>
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded"
            >
              <Check size={13} />
              {t('approveWithPayout', { amount: formatSilver(request.silver) })}
            </button>
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={pending}
              className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded"
            >
              <X size={13} /> {t('reject')}
            </button>
          </>
        )}
      </div>

      {rejectMode && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('rejectPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
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

      {zoomed && screenshotUrl && (
        <ImageLightbox src={screenshotUrl} alt={t('screenshotAlt')} onClose={() => setZoomed(false)} />
      )}
    </li>
  )
}
