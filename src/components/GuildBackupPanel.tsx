'use client'

import { useRef, useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Download, Upload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  exportGuildBackupAction,
  importGuildBackupAction,
  previewGuildBackupImportAction,
} from '@/app/actions/guild-backup'
import type { BackupImportPlan, BackupImportSummary } from '@/lib/guild-backup'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

interface PreviewState {
  rawJson: string
  fileName: string
  plan: BackupImportPlan
  meta: { exportedAt: string; sourceGuildName: string | null; sourceGuildId: string }
}

export default function GuildBackupPanel() {
  const t = useTranslations('adminBackup')
  const formatter = useFormatter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, startExport] = useTransition()
  const [previewing, startPreview] = useTransition()
  const [importing, startImport] = useTransition()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [summary, setSummary] = useState<BackupImportSummary | null>(null)
  const [error, setError] = useState('')

  const handleExport = () => {
    setError('')
    startExport(async () => {
      const result = await exportGuildBackupAction()
      if (result.error || !result.json || !result.fileName) {
        setError(result.error ?? t('errorExport'))
        return
      }
      triggerDownload(result.json, result.fileName)
    })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setSummary(null)
    setPreview(null)
    const file = event.target.files?.[0] ?? null
    if (!file) return
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t('errorFileTooLarge'))
      event.target.value = ''
      return
    }
    startPreview(async () => {
      const text = await file.text()
      const result = await previewGuildBackupImportAction(text)
      if (result.error || !result.plan || !result.meta) {
        setError(result.error ?? t('errorImport'))
        if (fileRef.current) fileRef.current.value = ''
        return
      }
      setPreview({ rawJson: text, fileName: file.name, plan: result.plan, meta: result.meta })
    })
  }

  const handleConfirmImport = () => {
    if (!preview) return
    setError('')
    startImport(async () => {
      const result = await importGuildBackupAction(preview.rawJson)
      if (result.error || !result.summary) {
        setError(result.error ?? t('errorImport'))
        return
      }
      setSummary(result.summary)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  const handleCancelPreview = () => {
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return formatter.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold">{t('exportTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('exportHint')}</p>
        </header>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {exporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
          {exporting ? t('exporting') : t('exportButton')}
        </button>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold">{t('importTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('importHint')}</p>
        </header>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
          <Upload size={16} />
          {t('importPickFile')}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
            disabled={previewing || importing}
          />
        </label>

        {previewing && (
          <p className="text-sm text-muted-foreground">{t('previewing')}</p>
        )}

        {preview && (
          <div className="space-y-4 rounded-md border border-border bg-background p-4">
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">{t('previewFileLabel')}</span>{' '}
                <span className="font-medium">{preview.fileName}</span>
              </div>
              {preview.meta.exportedAt && (
                <div>
                  <span className="text-muted-foreground">{t('previewExportedAtLabel')}</span>{' '}
                  <span>{formatDate(preview.meta.exportedAt)}</span>
                </div>
              )}
              {preview.meta.sourceGuildName && (
                <div>
                  <span className="text-muted-foreground">{t('previewSourceGuildLabel')}</span>{' '}
                  <span>{preview.meta.sourceGuildName}</span>
                </div>
              )}
            </div>

            <PlanDiff plan={preview.plan} />

            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{t('previewWarning')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {importing ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? t('importing') : t('importConfirm')}
              </button>
              <button
                type="button"
                onClick={handleCancelPreview}
                disabled={importing}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {summary && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} />
              {t('importDone')}
            </div>
            <PlanDiff plan={summary} />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>
    </div>
  )
}

function triggerDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function PlanDiff({ plan }: { plan: BackupImportPlan }) {
  const t = useTranslations('adminBackup')
  return (
    <ul className="space-y-1 text-sm">
      <li>
        <span className="text-muted-foreground">{t('planPointsLabel')}</span>{' '}
        <span className="font-medium">
          {t('planPointsValue', {
            adjustments: plan.points.adjustments,
            skipped: plan.points.skippedNonMembers,
          })}
        </span>
      </li>
      <li>
        <span className="text-muted-foreground">{t('planEventsLabel')}</span>{' '}
        <span className="font-medium">
          {t('planTemplatesValue', { added: plan.events.added, updated: plan.events.updated })}
        </span>
      </li>
      <li>
        <span className="text-muted-foreground">{t('planSlotsLabel')}</span>{' '}
        <span className="font-medium">
          {t('planTemplatesValue', { added: plan.slots.added, updated: plan.slots.updated })}
        </span>
      </li>
      <li>
        <span className="text-muted-foreground">{t('planInventoryLabel')}</span>{' '}
        <span className="font-medium">
          {t('planInventoryValue', {
            added: plan.inventory.added,
            updated: plan.inventory.updated,
          })}
        </span>
      </li>
    </ul>
  )
}
