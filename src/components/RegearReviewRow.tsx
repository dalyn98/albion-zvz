'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Check,
  ChevronUp,
  Hammer,
  ImageIcon,
  Loader2,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  approveRegearAsCrafted,
  approveRegearFromStock,
  approveRegearRequest,
  getScreenshotUrl,
  recheckKillboardVerification,
  rejectRegearRequest,
  type AdminRegearRequest,
} from '@/app/actions/regear-admin'
import type { RegearAnomalyFlag } from '@/lib/regear-anomaly'
import type { StockCheckResult } from '@/lib/inventory'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  REGEAR_STATUS_CLASS,
  hasUserEdits,
  isMemberSelfClaim,
} from '@/lib/regear-review-grouping'
import {
  REGEAR_REJECT_REASON_CODES,
  type RegearRejectReasonCode,
} from '@/lib/regear-reject-reasons'
import ImageLightbox from './ImageLightbox'
import RegearBreakdownPreview from './RegearBreakdownPreview'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import {
  AnomalyBanner,
  BuildSnapshotStrip,
  StockSection,
} from './RegearReviewRowParts'
import { useToast } from './ToastProvider'

interface Props {
  request: AdminRegearRequest
  avatar: string | null
  ratePercent: number
  anomalyFlags?: RegearAnomalyFlag[]
  stockCheck?: StockCheckResult
}

export default function RegearReviewRow({
  request,
  avatar,
  ratePercent,
  anomalyFlags,
  stockCheck,
}: Props) {
  const router = useRouter()
  const t = useTranslations('adminRegearReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const tRole = useTranslations('slotRole')
  const tReason = useTranslations('regearRejectReason')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [rechecking, setRechecking] = useState(false)
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [rejectReasonCode, setRejectReasonCode] = useState<RegearRejectReasonCode | ''>('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [screenshot2Url, setScreenshot2Url] = useState<string | null>(null)
  const [loadingScreenshot2, setLoadingScreenshot2] = useState(false)
  const [zoomed2, setZoomed2] = useState(false)
  // 관리자가 청구 금액을 재량으로 조정해서 승인할 수 있게 — 빈 값 = 요율 기본.
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideInput, setOverrideInput] = useState('')

  const statusLabel = (status: string): string => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    return t('statusRejected')
  }

  // Approved rows: RPC already persisted the credited amount, use it verbatim
  // so historical rows display correctly even after the admin changes the rate.
  // Pending rows: preview what approval would credit at the *current* rate.
  const claimed = request.claimed_silver ?? request.silver
  const approvedPayout = request.payout_silver
  const pendingPayout = calcPayoutSilver(claimed, ratePercent)

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

  const loadScreenshot2 = () => {
    if (loadingScreenshot2 || screenshot2Url || !request.screenshot_path_2) return
    setLoadingScreenshot2(true)
    setError('')
    ;(async () => {
      const result = await getScreenshotUrl(request.screenshot_path_2!)
      setLoadingScreenshot2(false)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) setScreenshot2Url(result.url)
    })()
  }

  const approve = (override?: number) => {
    setError('')
    startTransition(async () => {
      const result = await approveRegearRequest(request.id, override)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(tToast('regearApproved'))
      router.refresh()
    })
  }

  const approveFromStock = () => {
    setError('')
    startTransition(async () => {
      const result = await approveRegearFromStock(request.id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(tToast('regearApproved'))
      router.refresh()
    })
  }

  const approveAsCrafted = () => {
    setError('')
    startTransition(async () => {
      const result = await approveRegearAsCrafted(request.id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(t('queueAsCraftedToast'))
      router.refresh()
    })
  }

  const approveWithOverride = () => {
    const trimmed = overrideInput.trim().replace(/,/g, '')
    if (!trimmed) {
      approve()
      return
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n < 0) {
      setError(t('payoutMustBeNonNegInt'))
      return
    }
    if (n > claimed) {
      setError(t('payoutExceedsClaimed', { amount: claimed.toLocaleString() }))
      return
    }
    approve(n)
  }

  const recheckKillboard = async () => {
    if (rechecking) return
    setError('')
    setRechecking(true)
    const result = await recheckKillboardVerification(request.id)
    setRechecking(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.killboard_verified) {
      if (result.estimated_silver && result.estimated_silver > 0) {
        toast.success(
          tToast('killboardVerifiedNowWithEstimate', {
            amount: formatSilver(result.estimated_silver),
          }),
        )
      } else {
        toast.success(tToast('killboardVerifiedNow'))
      }
    } else {
      toast.info(tToast('killboardStillNotVerified'))
    }
    router.refresh()
  }

  const reject = () => {
    setError('')
    if (!rejectReasonCode) {
      setError(t('rejectReasonRequired'))
      return
    }
    startTransition(async () => {
      const result = await rejectRegearRequest(request.id, rejectReasonCode, rejectNotes)
      if (result.error) {
        setError(result.error)
        return
      }
      setRejectMode(false)
      setRejectReasonCode('')
      setRejectNotes('')
      toast.success(tToast('regearRejected'))
      router.refresh()
    })
  }

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <MemberAvatar discordId={request.discord_id} avatar={avatar} size={20} />
            <MemberLink
              discordId={request.discord_id}
              username={request.username}
              className="text-white text-sm font-semibold truncate"
            />
            {request.request_type === 'overcharge' && (
              <span className="inline-flex items-center gap-1 bg-orange-500 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                {t('requestTypeOverchargeBadge')}
              </span>
            )}
            {hasUserEdits(request) && (
              <span className="inline-flex items-center gap-1 bg-sky-400 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                {t('userEditedRowBadge')}
              </span>
            )}
            {isMemberSelfClaim(request) && (
              <span className="inline-flex items-center gap-1 bg-violet-400 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                {t('memberSelfClaimBadge')}
              </span>
            )}
            <span className="text-gray-400 text-xs truncate">· {request.event_title}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">{translateSlotRole(request.role_name, tRole)}</span>
            <span className="font-mono text-amber-400">
              {t('claimed', { amount: formatSilver(claimed) })}
              <span className="text-gray-500"> / {t('cap', { amount: formatSilver(request.silver) })}</span>
            </span>
            {request.estimated_silver !== null && (
              <span
                className="font-mono text-cyan-300"
                title={t('estimatedMarketHint')}
              >
                {t('estimatedMarket', { amount: formatSilver(request.estimated_silver) })}
              </span>
            )}
            {request.price_warning_level &&
              !(request.auto_generated && request.price_warning_level === 'redzone') && (
                <span
                  className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                    request.price_warning_level === 'redzone'
                      ? 'bg-red-600 text-white'
                      : request.price_warning_level === 'bluezone'
                      ? 'bg-orange-500/90 text-black'
                      : 'bg-yellow-500/80 text-black'
                  }`}
                  title={t(`priceWarningTooltip_${request.price_warning_level}` as const)}
                >
                  {t(`priceWarningLabel_${request.price_warning_level}` as const)}
                </span>
              )}
            {request.status === 'approved' && approvedPayout !== null && approvedPayout !== claimed && (
              <span className="font-mono text-emerald-400">
                {t('paidOut', { amount: formatSilver(approvedPayout) })}
              </span>
            )}
            <span className="font-mono text-gray-500">{formatDateTimeShort(request.created_at)}</span>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${REGEAR_STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {request.request_type === 'overcharge' ? (
            <span className="flex items-center gap-1 text-orange-300">
              <ShieldAlert size={13} /> {t('overchargeNoKillboard')}
            </span>
          ) : request.killboard_verified ? (
            <span className="flex items-center gap-1 text-green-400">
              <ShieldCheck size={13} /> {t('killboardVerified')}
              {request.killboard_event_id && (
                <span className="font-mono text-gray-500">#{request.killboard_event_id}</span>
              )}
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-yellow-400">
                <ShieldAlert size={13} /> {t('killboardNotVerified')}
              </span>
              {request.status === 'pending' && (
                <button
                  type="button"
                  onClick={recheckKillboard}
                  disabled={rechecking || pending}
                  className="flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-2 py-0.5 rounded disabled:opacity-50"
                >
                  {rechecking ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RotateCw size={11} />
                  )}
                  {rechecking ? t('recheckingKillboard') : t('recheckKillboard')}
                </button>
              )}
            </>
          )}
        </div>
        {!request.killboard_verified && request.status === 'pending' && (
          <p className="text-[11px] text-gray-500">{t('killboardDelayHint')}</p>
        )}
      </div>

      {anomalyFlags && anomalyFlags.length > 0 && (
        <AnomalyBanner flags={anomalyFlags} />
      )}

      {request.build_snapshot && <BuildSnapshotStrip snapshot={request.build_snapshot} />}

      {request.auto_generated && request.breakdown_items.length > 0 && (
        <RegearBreakdownPreview
          items={request.breakdown_items}
          marketSilver={request.estimated_silver ?? 0}
        />
      )}

      {(request.reject_reason_code || request.admin_notes) && (
        <div className="bg-gray-800/50 rounded px-3 py-2 space-y-1">
          {request.reject_reason_code && (
            <p className="text-xs font-semibold text-red-300">
              {t('rejectReasonLabel')}: <span className="font-normal">{tReason(request.reject_reason_code)}</span>
            </p>
          )}
          {request.admin_notes && (
            <p className="text-gray-400 text-xs italic">{request.admin_notes}</p>
          )}
        </div>
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
      ) : request.resolved_at ? (
        // 처리 완료 후 48시간 cleanup cron 으로 path 가 NULL 된 행. 신청 당시
        // 스크린샷이 있었음을 시사 — 기존 메시지 유지.
        <p className="text-xs text-gray-500 italic">{t('screenshotDeleted')}</p>
      ) : request.killboard_verified ? (
        // 킬보드로 즉시 검증된 신청은 스크린샷 자체가 없다 (자동 리기어 + 추적
        // 사망 청구 모두 동일). 검토자에게는 아래 kill_summary 가 단서가 된다.
        <p className="text-xs text-gray-500 italic">{t('screenshotNotRequired')}</p>
      ) : (
        // killboard_verified=false + 스크린샷 미업로드. 정상 흐름이라면 발생하지
        // 않는 상태지만 방어적으로 처리.
        <p className="text-xs text-gray-500 italic">{t('screenshotMissing')}</p>
      )}

      {request.kill_summary && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-gray-400 font-semibold uppercase tracking-wide text-[10px]">
            <ShieldCheck size={12} className="text-emerald-400" />
            {t('killSummaryTitle')}
          </div>
          <div className="text-gray-200 flex flex-wrap gap-x-3 gap-y-0.5">
            {request.kill_summary.opponent_name && (
              <span>
                {t('killSummaryOpponent')}{' '}
                <span className="font-mono">{request.kill_summary.opponent_name}</span>
                {request.kill_summary.opponent_guild && (
                  <span className="text-gray-500 ml-1">
                    ({request.kill_summary.opponent_guild})
                  </span>
                )}
              </span>
            )}
            <span className="text-gray-400">
              {t('killSummaryFame')}{' '}
              <span className="font-mono text-gray-200">
                {request.kill_summary.fame.toLocaleString()}
              </span>
            </span>
            {request.kill_summary.item_power != null && (
              <span className="text-gray-400">
                {t('killSummaryItemPower')}{' '}
                <span className="font-mono text-gray-200">
                  {request.kill_summary.item_power.toLocaleString()}
                </span>
              </span>
            )}
          </div>
          <p className="text-gray-500 font-mono text-[10px]">
            {formatDateTimeShort(request.kill_summary.occurred_at)}
          </p>
        </div>
      )}

      {screenshot2Url ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setZoomed2(true)}
            className="group relative block w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950 hover:border-amber-500/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshot2Url}
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
            onClick={() => setScreenshot2Url(null)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
          >
            <ChevronUp size={13} />
            {t('collapseScreenshot')}
          </button>
        </div>
      ) : request.screenshot_path_2 ? (
        <button
          type="button"
          onClick={loadScreenshot2}
          disabled={loadingScreenshot2}
          className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded"
        >
          {loadingScreenshot2 ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
          {loadingScreenshot2 ? tCommon('loadingDots') : t('viewScreenshot2')}
        </button>
      ) : null}

      {request.status === 'pending'
        && request.fulfillment_mode === 'crafted'
        && stockCheck
        && stockCheck.perItem.length > 0 && (
          <StockSection
            stockCheck={stockCheck}
            payoutSilver={pendingPayout}
            onIssue={approveFromStock}
            disabled={pending || rejectMode || overrideMode}
          />
        )}

      <div className="flex items-center gap-2 flex-wrap">
        {request.status === 'pending' && !rejectMode && !overrideMode && (
          <>
            <button
              type="button"
              onClick={() => approve()}
              disabled={pending}
              className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded"
            >
              <Check size={13} />
              {ratePercent === 100
                ? t('approveWithPayout', { amount: formatSilver(pendingPayout) })
                : t('approveWithPayoutRate', {
                    amount: formatSilver(pendingPayout),
                    rate: ratePercent,
                  })}
            </button>
            {request.fulfillment_mode === 'crafted' && request.build_snapshot && (
              <button
                type="button"
                onClick={approveAsCrafted}
                disabled={pending}
                className="flex items-center gap-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded"
                title={t('queueAsCraftedTitle')}
              >
                <Hammer size={13} />
                {t('queueAsCraftedButton')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOverrideInput(String(pendingPayout))
                setOverrideMode(true)
              }}
              disabled={pending}
              className="flex items-center gap-1 text-xs bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded"
              title={t('adjustAmountTitle')}
            >
              {t('adjustAmountButton')}
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

      {overrideMode && request.status === 'pending' && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2 space-y-2">
          <p className="text-xs text-amber-200/80">
            {t('adjustPrompt', { amount: formatSilver(claimed), rate: ratePercent })}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              inputMode="numeric"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') approveWithOverride()
                if (e.key === 'Escape') setOverrideMode(false)
              }}
              className="bg-gray-900 border border-amber-500/60 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-amber-400 w-36 text-right"
              placeholder={String(pendingPayout)}
              autoFocus
              disabled={pending}
            />
            <span className="text-xs text-gray-400 font-mono">{t('adjustSilverUnit')}</span>
            <button
              type="button"
              onClick={approveWithOverride}
              disabled={pending}
              className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded disabled:opacity-50"
            >
              <Check size={13} />
              {t('adjustApproveButton')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOverrideMode(false)
                setOverrideInput('')
              }}
              disabled={pending}
              className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}

      {rejectMode && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {t('rejectReasonLabel')}
            </label>
            <select
              value={rejectReasonCode}
              onChange={(e) =>
                setRejectReasonCode(e.target.value as RegearRejectReasonCode | '')
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              disabled={pending}
            >
              <option value="">{t('rejectReasonPlaceholder')}</option>
              {REGEAR_REJECT_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {tReason(code)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('rejectNotesPlaceholder')}
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
                setRejectReasonCode('')
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

      {zoomed && screenshotUrl && (
        <ImageLightbox src={screenshotUrl} alt={t('screenshotAlt')} onClose={() => setZoomed(false)} />
      )}

      {zoomed2 && screenshot2Url && (
        <ImageLightbox
          src={screenshot2Url}
          alt={t('screenshotAlt')}
          onClose={() => setZoomed2(false)}
        />
      )}
    </li>
  )
}
