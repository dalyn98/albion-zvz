import Link from 'next/link'
import { Eye, Pencil, Video } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { MyRegearRequest } from '@/app/actions/regear'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { regearPayoutSilver } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { shouldShowKillboardUnverified } from '@/lib/regear-display'
import { youtubeVideoProofWatchUrl } from '@/lib/regear-video-proof'
import RegearRequestCancelButton from './RegearRequestCancelButton'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

function sortPendingFirst(items: MyRegearRequest[]): MyRegearRequest[] {
  return [...items].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    if (aPending !== bPending) return aPending - bPending
    return b.created_at.localeCompare(a.created_at)
  })
}

interface Props {
  requests: MyRegearRequest[]
  timezone?: string
  detailHrefPrefix?: string
  interactionMode?: 'live' | 'demo'
  readOnly?: boolean
}

export default async function MyRegearList({
  requests,
  timezone = DEFAULT_TENANT_TIMEZONE,
  detailHrefPrefix = '/me/regear',
  interactionMode = 'live',
  readOnly = false,
}: Props) {
  const [tMe, tStatus, tRole, tReason] = await Promise.all([
    getTranslations('me'),
    getTranslations('status'),
    getTranslations('slotRole'),
    getTranslations('regearRejectReason'),
  ])

  if (requests.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-6">{tMe('noRegears')}</p>
  }

  const sorted = sortPendingFirst(requests)

  return (
    <ul className="divide-y divide-border border-y border-border">
      {sorted.map((r) => {
        const videoProofWatchUrl = youtubeVideoProofWatchUrl(r.video_proof_url)
        const videoProofLabel = r.video_proof_title?.trim() || tMe('regearVideoBadge')
        return (
          <li
            key={r.id}
            className="space-y-1 px-1 py-4 sm:px-2"
          >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <p className="text-white text-sm font-medium truncate">{r.event_title}</p>
              {r.request_type === 'overcharge' && (
                <span className="shrink-0 rounded bg-orange-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">
                  {tMe('regearOverchargeBadge')}
                </span>
              )}
              {r.requester_relation === 'alliance' && (
                <span className="shrink-0 rounded bg-violet-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">
                  {tMe('regearAllianceBadge')}
                </span>
              )}
              {r.participant_confirmation_status === 'awaiting_closeout' && (
                <span className="shrink-0 rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-extrabold text-yellow-200">
                  {tMe('regearParticipantConfirmationPending')}
                </span>
              )}
              {videoProofWatchUrl && (
                <a
                  href={videoProofWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 max-w-[180px] items-center gap-1 rounded bg-sky-400 px-2 py-0.5 text-[10px] font-extrabold text-black hover:bg-sky-300 sm:max-w-[240px]"
                  title={videoProofLabel}
                >
                  <Video size={11} className="shrink-0" />
                  <span className="min-w-0 truncate">{videoProofLabel}</span>
                </a>
              )}
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[r.status]}`}>
              {tStatus(r.status)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span>{r.role_name ? translateSlotRole(r.role_name, tRole) : ''}</span>
            {r.regear_role_policy_enabled && r.regear_role_policy_match_status !== 'disabled' && (
              <span
                className={
                  r.regear_role_policy_match_status === 'matched'
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }
              >
                {r.regear_role_policy_match_status === 'matched'
                  ? tMe('regearRolePolicyMatched', {
                      role: r.regear_role_policy_discord_role_name ?? '-',
                    })
                  : tMe(`regearRolePolicy_${r.regear_role_policy_match_status}` as const)}
              </span>
            )}
            <span className="font-mono text-amber-400">
              {tMe('claimed')} {formatSilver(regearPayoutSilver(r))}
              <span className="text-gray-500"> / {tMe('ceiling')} {formatSilver(r.silver)}</span>
            </span>
            {r.request_type === 'overcharge' && (
              <span className="text-orange-300">{tMe('regearOverchargeNoKillboard')}</span>
            )}
            {shouldShowKillboardUnverified({
              requestType: r.request_type,
              killboardVerified: r.killboard_verified,
              status: r.status,
            }) && (
              <span className="text-yellow-400">{tMe('killboardUnverified')}</span>
            )}
          </div>
          {r.reject_reason_code && (
            <p className="text-xs text-red-300">
              <span className="font-semibold">{tMe('rejectReasonLabel')}:</span>{' '}
              {tReason(r.reject_reason_code)}
            </p>
          )}
          {r.admin_notes && (
            <p className="text-gray-500 text-xs truncate">{r.admin_notes}</p>
          )}
          <p className="text-gray-400 text-xs font-mono">
            {tMe('requestedAt', { when: formatDateTime(r.created_at, timezone) })}
            {r.resolved_at && r.status !== 'pending' && (
              <span className="ml-2">
                · {tStatus(r.status)} {formatDateTime(r.resolved_at, timezone)}
                {r.handled_by_username && (
                  <span className="ml-1 text-gray-400">
                    · {tMe('handledBy', { handler: r.handled_by_username })}
                  </span>
                )}
              </span>
            )}
          </p>
          {r.status === 'pending' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`${detailHrefPrefix}/${r.id}`}
                className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded mt-1"
              >
                {readOnly ? <Eye size={11} /> : <Pencil size={11} />}
                {readOnly
                  ? tMe('regearViewClaim')
                  : r.auto_generated
                    ? tMe('regearEditBreakdown')
                    : tMe('regearEditClaim')}
              </Link>
              {!readOnly && interactionMode === 'live' && (
                <RegearRequestCancelButton id={r.id} />
              )}
            </div>
          )}
          </li>
        )
      })}
    </ul>
  )
}
