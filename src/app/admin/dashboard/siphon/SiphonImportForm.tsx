'use client'

// 사이펀 로그 임포트 폼. shop chest 버전보다 단순 — 단일 아이템이라
// 블랙리스트/재고/시세가 없다. dryRun preview → commit 흐름만 유지.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Upload, Check, AlertCircle, Loader2, Trash2, Clock, Info } from 'lucide-react'
import {
  importSiphonLog,
  type SiphonImportSummary,
} from '@/app/actions/siphon-admin'
import { toZonedParts } from '@/lib/timezone'

interface Props {
  lastImportAt: string | null
  timezone: string
}

export default function SiphonImportForm({ lastImportAt, timezone }: Props) {
  const router = useRouter()
  const t = useTranslations('adminSiphonPage')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<SiphonImportSummary | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitResult, setCommitResult] = useState<SiphonImportSummary | null>(
    null,
  )
  const [previewPending, startPreview] = useTransition()
  const [commitPending, startCommit] = useTransition()

  const runPreview = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setPreviewError(null)
    setCommitResult(null)
    setCommitError(null)
    startPreview(async () => {
      const result = await importSiphonLog(trimmed, { dryRun: true })
      if (result.error && result.parsedTotal === 0) {
        setPreviewError(result.error)
        setPreview(null)
        return
      }
      setPreview(result)
    })
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clip = e.clipboardData.getData('text/plain')
    if (!clip.trim()) return
    e.preventDefault()
    setText(clip)
    runPreview(clip)
  }

  const handleManualSubmit = () => {
    runPreview(text)
  }

  const handleCommit = () => {
    if (!text.trim() || !preview) return
    setCommitError(null)
    startCommit(async () => {
      const result = await importSiphonLog(text)
      if (result.error) {
        setCommitError(result.error)
        return
      }
      setCommitResult(result)
      setPreview(null)
      setText('')
      router.refresh()
    })
  }

  const handleDiscard = () => {
    setText('')
    setPreview(null)
    setPreviewError(null)
    setCommitError(null)
    setCommitResult(null)
  }

  const busy = previewPending || commitPending

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">{t('importTitle')}</h2>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              {t('importDescription')}
            </p>
          </div>
          <LastImportBadge iso={lastImportAt} timezone={timezone} />
        </div>

        {!lastImportAt && (
          <div className="flex items-start gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">{t('firstImportHint')}</p>
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono resize-y"
          placeholder={t('importPlaceholder')}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={busy || !text.trim()}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors text-xs"
          >
            {previewPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            {previewPending ? t('previewing') : t('manualSubmit')}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={busy || !preview || preview.siphonRows === 0}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-1.5 rounded-lg transition-colors text-sm"
          >
            {commitPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {preview && preview.siphonRows > 0
              ? t('saveButtonWithCount', {
                  items: preview.siphonRows - preview.duplicatesSkipped,
                })
              : t('saveButton')}
          </button>
          {(preview || text) && (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-rose-300 disabled:text-gray-700"
            >
              <Trash2 size={12} />
              {t('discard')}
            </button>
          )}
        </div>

        {previewError && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
            <p className="text-red-300 text-xs">{previewError}</p>
          </div>
        )}
        {commitError && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
            <p className="text-red-300 text-xs">
              {t('saveFailed', { error: commitError })}
            </p>
          </div>
        )}
      </div>

      {preview && <PreviewCard preview={preview} t={t} timezone={timezone} />}

      {commitResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-4 flex items-center gap-2">
          <Check size={14} className="text-emerald-300" />
          <p className="text-sm text-emerald-200">
            {t('saveSuccess', {
              inserted: commitResult.inserted,
              duplicatesSkipped: commitResult.duplicatesSkipped,
            })}
          </p>
        </div>
      )}
    </div>
  )
}

function PreviewCard({
  preview,
  t,
  timezone,
}: {
  preview: SiphonImportSummary
  t: ReturnType<typeof useTranslations<'adminSiphonPage'>>
  timezone: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <SiphonContinuityCard preview={preview} t={t} timezone={timezone} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCell label={t('previewParsed')} value={preview.parsedTotal} />
        <StatCell
          label={t('previewSiphon')}
          value={preview.siphonRows}
          accent="emerald"
        />
        <StatCell
          label={t('previewSkippedBeforeStart')}
          value={preview.skippedBeforeStart}
        />
        <StatCell
          label={t('previewNonSiphon')}
          value={preview.nonSiphonRows}
        />
        <StatCell
          label={t('previewDuplicates')}
          value={preview.duplicatesSkipped}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCell
          label={t('previewDeposit')}
          value={preview.depositTotal}
          accent={preview.depositTotal > 0 ? 'emerald' : undefined}
        />
        <StatCell
          label={t('previewWithdraw')}
          value={preview.withdrawTotal}
          accent={preview.withdrawTotal < 0 ? 'rose' : undefined}
        />
        <StatCell
          label={t('previewPlayers')}
          value={preview.affectedPlayers}
        />
      </div>
      {preview.parseErrors.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle size={12} />
            <p className="font-semibold">
              {preview.parseErrors.length}
            </p>
          </div>
          {preview.parseErrors.slice(0, 3).map((e, i) => (
            <p key={`${e.line}-${i}`} className="font-mono truncate opacity-80">
              #{e.line} {e.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function SiphonContinuityCard({
  preview,
  t,
  timezone,
}: {
  preview: SiphonImportSummary
  t: ReturnType<typeof useTranslations<'adminSiphonPage'>>
  timezone: string
}) {
  const {
    lastKnownLoggedAt,
    lastKnownLabel,
    lastKnownInBatch,
    newEntriesAfterLast,
    gapFromLastKnownMs,
  } = preview
  const saveableRows = Math.max(0, preview.siphonRows - preview.duplicatesSkipped)

  let tone: 'ok' | 'warn' | 'danger' | 'info' = 'info'
  let title = ''
  let body = ''
  let gapBody: string | null = null
  const GAP_DANGER_MS = 7 * 24 * 60 * 60 * 1000
  const GAP_WARN_MS = 6 * 60 * 60 * 1000

  if (!lastKnownLoggedAt) {
    tone = 'info'
    title = t('continuityNoPrevTitle')
    body = t('continuityNoPrevBody', { count: newEntriesAfterLast })
  } else {
    const when = formatLoggedAt(lastKnownLoggedAt, timezone)
    const tail = lastKnownLabel ? ` · ${lastKnownLabel}` : ''
    if (newEntriesAfterLast === 0 && lastKnownInBatch) {
      tone = 'ok'
      title = t('continuityNoNewTitle')
      body = t('continuityNoNewBody', { when, tail })
    } else if (newEntriesAfterLast === 0 && !lastKnownInBatch) {
      if (saveableRows > 0) {
        tone = 'warn'
        title = t('continuityBackfillTitle')
        body = t('continuityBackfillBody', { when, tail, count: saveableRows })
      } else {
        tone = 'warn'
        title = t('continuitySkippedTitle')
        body = t('continuitySkippedBody', { when, tail })
      }
    } else if (newEntriesAfterLast > 0 && lastKnownInBatch) {
      tone = 'ok'
      title = t('continuityContinuedTitle')
      body = t('continuityContinuedBody', { when, tail, count: newEntriesAfterLast })
    } else {
      const gapLabel = formatGap(gapFromLastKnownMs, t)
      if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_DANGER_MS) {
        tone = 'danger'
        title = t('continuityGapDangerTitle', { gap: gapLabel ?? '' })
        body = t('continuityGapDangerBody', { when, tail, gap: gapLabel ?? '' })
      } else if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_WARN_MS) {
        tone = 'warn'
        title = t('continuityGapWarnTitle', { gap: gapLabel ?? '' })
        body = t('continuityGapWarnBody', { when, tail, gap: gapLabel ?? '' })
      } else {
        tone = 'warn'
        title = t('continuityGapNoOverlapTitle')
        const gapSuffix = gapLabel ? t('continuityGapSuffix', { gap: gapLabel }) : ''
        body = t('continuityGapNoOverlapBody', { when, tail, gapSuffix })
      }
      gapBody = t('continuityGapAddLine', { count: newEntriesAfterLast })
    }
  }

  const styles =
    tone === 'danger'
      ? 'bg-red-500/10 border-red-500/50 text-red-200'
      : tone === 'ok'
        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
        : tone === 'warn'
          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
          : 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${styles}`}>
      <Info size={15} className="mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs leading-relaxed opacity-90">{body}</p>
        {gapBody && <p className="text-xs leading-relaxed opacity-75">{gapBody}</p>}
      </div>
    </div>
  )
}

function formatGap(
  ms: number | null,
  t: ReturnType<typeof useTranslations<'adminSiphonPage'>>,
): string | null {
  if (ms === null || ms <= 0) return null
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return t('gapMinutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('gapHours', { hours, mins: mins % 60 })
  const days = Math.floor(hours / 24)
  return t('gapDays', { days, hours: hours % 24 })
}

function formatLoggedAt(iso: string, timezone: string): string {
  const p = toZonedParts(iso, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(
    2,
    '0',
  )} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'emerald' | 'amber' | 'rose'
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-300'
        : accent === 'rose'
          ? 'text-rose-300'
          : 'text-white'
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function LastImportBadge({ iso, timezone }: { iso: string | null; timezone: string }) {
  if (!iso) return null
  const formatted = formatLoggedAt(iso, timezone)
  return (
    <div className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
      <Clock size={11} />
      <span>{formatted}</span>
    </div>
  )
}
