'use client'

// 사이펀 로그 임포트 폼. shop chest 버전보다 단순 — 단일 아이템이라
// 블랙리스트/재고/시세가 없다. dryRun preview → commit 흐름만 유지.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Upload, Check, AlertCircle, Loader2, Trash2, Clock } from 'lucide-react'
import {
  importSiphonLog,
  type SiphonImportSummary,
} from '@/app/actions/siphon-admin'
import { DEFAULT_TENANT_TIMEZONE, toZonedParts } from '@/lib/timezone'

interface Props {
  lastImportAt: string | null
}

export default function SiphonImportForm({ lastImportAt }: Props) {
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
          <LastImportBadge iso={lastImportAt} />
        </div>

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

      {preview && <PreviewCard preview={preview} t={t} />}

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
}: {
  preview: SiphonImportSummary
  t: ReturnType<typeof useTranslations<'adminSiphonPage'>>
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label={t('previewParsed')} value={preview.parsedTotal} />
        <StatCell
          label={t('previewSiphon')}
          value={preview.siphonRows}
          accent="emerald"
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

function LastImportBadge({ iso }: { iso: string | null }) {
  if (!iso) return null
  const p = toZonedParts(iso, DEFAULT_TENANT_TIMEZONE)
  const formatted = `${p.year}-${String(p.month).padStart(2, '0')}-${String(
    p.day,
  ).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(
    p.minute,
  ).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
      <Clock size={11} />
      <span>{formatted}</span>
    </div>
  )
}
