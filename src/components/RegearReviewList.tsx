'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, X, ShieldCheck, ShieldAlert, ImageIcon, Loader2, ZoomIn, ChevronUp } from 'lucide-react'
import {
  approveRegearRequest,
  rejectRegearRequest,
  getScreenshotUrl,
  type AdminRegearRequest,
} from '@/app/actions/regear-admin'
import { formatSilver } from '@/lib/silver'
import { regearPayoutSilver } from '@/types'
import ImageLightbox from './ImageLightbox'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface RegearReviewListProps {
  requests: AdminRegearRequest[]
  avatars?: Record<string, string | null>
}

export default function RegearReviewList({ requests, avatars = {} }: RegearReviewListProps) {
  const t = useTranslations('adminRegearReview')
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
            <RegearRow key={r.id} request={r} avatar={avatars[r.discord_id] ?? null} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RegearRow({ request, avatar }: { request: AdminRegearRequest; avatar: string | null }) {
  const router = useRouter()
  const t = useTranslations('adminRegearReview')
  const tCommon = useTranslations('common')
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
      const result = await getScreenshotUrl(request.screenshot_path!)
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
      const result = await approveRegearRequest(request.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const reject = () => {
    setError('')
    startTransition(async () => {
      const result = await rejectRegearRequest(request.id, rejectNotes)
      if (result.error) setError(result.error)
      else {
        setRejectMode(false)
        router.refresh()
      }
    })
  }

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MemberAvatar discordId={request.discord_id} avatar={avatar} size={20} />
            <span className="text-white text-sm font-semibold truncate">{request.username}</span>
            <span className="text-gray-400 text-xs truncate">· {request.event_title}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">{request.role_name}</span>
            <span className="font-mono text-amber-400">
              {t('claimed', { amount: formatSilver(regearPayoutSilver(request)) })}
              <span className="text-gray-500"> / {t('cap', { amount: formatSilver(request.silver) })}</span>
            </span>
            <span className="font-mono text-gray-500">{formatDateTime(request.created_at)}</span>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {request.killboard_verified ? (
          <span className="flex items-center gap-1 text-green-400">
            <ShieldCheck size={13} /> {t('killboardVerified')}
            {request.killboard_event_id && (
              <span className="font-mono text-gray-500">#{request.killboard_event_id}</span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-yellow-400">
            <ShieldAlert size={13} /> {t('killboardNotVerified')}
          </span>
        )}
      </div>

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
            className="group relative block w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950 hover:border-amber-500/50"
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
      ) : (
        <p className="text-xs text-gray-500 italic">{t('screenshotDeleted')}</p>
      )}

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
              {t('approveWithPayout', { amount: formatSilver(regearPayoutSilver(request)) })}
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
        <p className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2">
          {t('resolvedAt', { status: statusLabel(request.status), datetime: formatDateTime(request.resolved_at) })}
        </p>
      )}

      {zoomed && screenshotUrl && (
        <ImageLightbox src={screenshotUrl} alt={t('screenshotAlt')} onClose={() => setZoomed(false)} />
      )}
    </li>
  )
}
