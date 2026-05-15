'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ChevronRight, ImageIcon, Loader2 } from 'lucide-react'
import { bulkApproveRegear } from '@/app/actions/regear-admin'
import type { RegearAnomalyFlag } from '@/lib/regear-anomaly'
import type { StockCheckResult } from '@/lib/inventory'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { calcPayoutSilver } from '@/lib/regear-payout'
import {
  buildClaimerGroups,
  type ClaimerSubGroup,
  type EventGroupRow,
} from '@/lib/regear-review-grouping'
import MemberAvatar from './MemberAvatar'
import RegearReviewRow from './RegearReviewRow'
import { useToast } from './ToastProvider'

interface EventGroupProps {
  group: EventGroupRow
  avatars: Record<string, string | null>
  ratePercent: number
  forceExpanded: boolean
  anomalies: Record<string, RegearAnomalyFlag[]>
  stockChecks: Record<string, StockCheckResult>
}

export default function EventGroup({
  group,
  avatars,
  ratePercent,
  forceExpanded,
  anomalies,
  stockChecks,
}: EventGroupProps) {
  const t = useTranslations('adminRegearReview')
  const tToast = useTranslations('toast')
  const router = useRouter()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [bulkPending, startBulkTransition] = useTransition()
  const [bulkError, setBulkError] = useState('')
  const isOpen = forceExpanded || expanded

  const counts = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    for (const r of group.rows) {
      if (r.status === 'pending') pending += 1
      else if (r.status === 'approved') approved += 1
      else if (r.status === 'rejected') rejected += 1
    }
    return { pending, approved, rejected, total: group.rows.length }
  }, [group.rows])

  const claimerGroups = useMemo(
    () => buildClaimerGroups(group.rows, ratePercent),
    [group.rows, ratePercent],
  )
  const hasMultiDeathClaimer = claimerGroups.some((c) => c.rows.length >= 2)

  const eventPendingIds = useMemo(
    () => group.rows.filter((r) => r.status === 'pending').map((r) => r.id),
    [group.rows],
  )
  const eventPendingPayout = useMemo(
    () =>
      group.rows
        .filter((r) => r.status === 'pending')
        .reduce(
          (sum, r) => sum + calcPayoutSilver(r.claimed_silver ?? r.silver, ratePercent),
          0,
        ),
    [group.rows, ratePercent],
  )

  const runBulkApprove = (ids: string[]) => {
    if (ids.length === 0) return
    setBulkError('')
    startBulkTransition(async () => {
      const result = await bulkApproveRegear(ids)
      if (result.fatalError) {
        setBulkError(result.fatalError)
        return
      }
      if (result.succeeded > 0 && result.failed === 0) {
        toast.success(tToast('regearBulkApproved', { n: result.succeeded }))
      } else if (result.succeeded > 0 && result.failed > 0) {
        toast.info(
          tToast('regearBulkApprovedPartial', {
            success: result.succeeded,
            total: result.total,
          }),
        )
        if (result.errors[0]) setBulkError(result.errors[0].error)
      } else {
        toast.error(tToast('regearBulkApproveFailed'))
        if (result.errors[0]) setBulkError(result.errors[0].error)
      }
      router.refresh()
    })
  }

  const latestAt = group.rows[0]?.created_at ?? null

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-800/40 text-left min-w-0"
          aria-expanded={isOpen}
        >
          <div className="min-w-0 flex-1 flex items-start gap-2">
            <ChevronRight
              size={16}
              className={`text-gray-500 mt-0.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{group.eventTitle}</div>
              {latestAt && (
                <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
                  {t('groupLatest', { datetime: formatDateTimeShort(latestAt) })}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {counts.pending > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
                {t('groupPending', { n: counts.pending })}
              </span>
            )}
            {counts.approved > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-500/20 text-green-300">
                {t('groupApproved', { n: counts.approved })}
              </span>
            )}
            {counts.rejected > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                {t('groupRejected', { n: counts.rejected })}
              </span>
            )}
            <span className="text-[11px] text-gray-500 font-mono">
              {t('groupTotal', { n: counts.total })}
            </span>
          </div>
        </button>
        {counts.pending >= 2 && (
          <button
            type="button"
            onClick={() => runBulkApprove(eventPendingIds)}
            disabled={bulkPending}
            className="flex items-center gap-1 px-3 text-xs bg-green-500/15 hover:bg-green-500/25 border-l border-gray-800 text-green-300 disabled:opacity-50 flex-shrink-0"
            title={t('groupBulkApproveTitle', {
              n: counts.pending,
              amount: formatSilver(eventPendingPayout),
            })}
          >
            {bulkPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span className="font-semibold">{t('groupBulkApproveButton')}</span>
            <span className="font-mono text-[10px] hidden sm:inline">
              ({formatSilver(eventPendingPayout)})
            </span>
          </button>
        )}
      </div>
      {bulkError && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30">
          <p className="text-red-400 text-xs">{bulkError}</p>
        </div>
      )}
      {isOpen && (
        <div className="border-t border-gray-800 p-3 bg-gray-950/40">
          {hasMultiDeathClaimer ? (
            <ul className="space-y-2">
              {claimerGroups.map((c) =>
                c.rows.length === 1 ? (
                  <li key={c.discordId}>
                    <RegearReviewRow
                      request={c.rows[0]}
                      avatar={avatars[c.discordId] ?? null}
                      ratePercent={ratePercent}
                      anomalyFlags={anomalies[c.rows[0].id]}
                      stockCheck={stockChecks[c.rows[0].id]}
                    />
                  </li>
                ) : (
                  <ClaimerGroup
                    key={c.discordId}
                    group={c}
                    avatar={avatars[c.discordId] ?? null}
                    ratePercent={ratePercent}
                    anomalies={anomalies}
                    stockChecks={stockChecks}
                    forceExpanded={forceExpanded}
                    onBulkApprove={runBulkApprove}
                    bulkPending={bulkPending}
                  />
                ),
              )}
            </ul>
          ) : (
            <ul className="space-y-3">
              {group.rows.map((r) => (
                <RegearReviewRow
                  key={r.id}
                  request={r}
                  avatar={avatars[r.discord_id] ?? null}
                  ratePercent={ratePercent}
                  anomalyFlags={anomalies[r.id]}
                  stockCheck={stockChecks[r.id]}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

interface ClaimerGroupProps {
  group: ClaimerSubGroup
  avatar: string | null
  ratePercent: number
  anomalies: Record<string, RegearAnomalyFlag[]>
  stockChecks: Record<string, StockCheckResult>
  forceExpanded: boolean
  onBulkApprove: (ids: string[]) => void
  bulkPending: boolean
}

function ClaimerGroup({
  group,
  avatar,
  ratePercent,
  anomalies,
  stockChecks,
  forceExpanded,
  onBulkApprove,
  bulkPending,
}: ClaimerGroupProps) {
  const t = useTranslations('adminRegearReview')
  const [expanded, setExpanded] = useState(false)
  const isOpen = forceExpanded || expanded
  const canBulk = group.pendingCount >= 2

  return (
    <li className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 px-3 py-2.5 hover:bg-gray-800/40 text-left min-w-0 flex-wrap"
          aria-expanded={isOpen}
        >
          <ChevronRight
            size={14}
            className={`text-gray-500 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <MemberAvatar discordId={group.discordId} avatar={avatar} size={20} />
          <span className="text-sm font-semibold text-white truncate">{group.username}</span>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex-shrink-0">
            {t('claimerDeathCount', { n: group.rows.length })}
          </span>
          {group.pendingCount > 0 && (
            <span className="text-[11px] text-gray-300 font-mono">
              {t('claimerTotalClaim', { amount: formatSilver(group.totalClaimed) })}
            </span>
          )}
          {group.screenshotCount > 0 && (
            <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
              <ImageIcon size={11} />
              {t('claimerScreenshotCount', { n: group.screenshotCount })}
            </span>
          )}
        </button>
        {canBulk && (
          <button
            type="button"
            onClick={() => onBulkApprove(group.pendingIds)}
            disabled={bulkPending}
            className="flex items-center gap-1 px-3 text-xs bg-green-500/10 hover:bg-green-500/20 border-l border-gray-800 text-green-300 disabled:opacity-50 flex-shrink-0"
            title={t('claimerBulkApproveTitle', {
              n: group.pendingCount,
              amount: formatSilver(group.pendingPayout),
            })}
          >
            {bulkPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span className="font-semibold">{t('claimerBulkApproveButton')}</span>
            <span className="font-mono text-[10px] hidden sm:inline">
              ({formatSilver(group.pendingPayout)})
            </span>
          </button>
        )}
      </div>
      {isOpen && (
        <ul className="border-t border-gray-800 p-3 space-y-3">
          {group.rows.map((r) => (
            <RegearReviewRow
              key={r.id}
              request={r}
              avatar={avatar}
              ratePercent={ratePercent}
              anomalyFlags={anomalies[r.id]}
              stockCheck={stockChecks[r.id]}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
