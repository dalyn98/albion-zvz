'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  RefreshCw,
  Upload,
} from 'lucide-react'
import {
  exportGuildRecoveryAction,
  exportGuildTemplatePackageAction,
  importGuildRecoveryAction,
  importGuildTemplatePackageAction,
  previewGuildRecoveryImportAction,
  previewGuildTemplatePackageImportAction,
} from '@/app/actions/guild-backup'
import {
  GUILD_BACKUP_MAX_BYTES,
  type GuildRecoveryPreview,
  type GuildRecoveryReceipt,
  type GuildRecoveryReceiptListItem,
  type GuildTemplateImportPlan,
  type RecoveryStateSummary,
} from '@/lib/guild-backup'
import { formatDateTime } from '@/lib/format-datetime'

interface RecoveryPreviewState {
  rawJson: string
  fileName: string
  preview: GuildRecoveryPreview
  verifiedDigest: string
  commandId: string
}

interface TemplatePreviewState {
  rawJson: string
  fileName: string
  plan: GuildTemplateImportPlan
  verifiedDigest: string
  meta: { createdAt: string; sourceGuildName: string | null }
}

interface GuildBackupPanelProps {
  timezone: string
  recentReceipts: GuildRecoveryReceiptListItem[]
}

export default function GuildBackupPanel({
  timezone,
  recentReceipts,
}: GuildBackupPanelProps) {
  const t = useTranslations('adminBackup')
  const recoveryFileRef = useRef<HTMLInputElement>(null)
  const templateFileRef = useRef<HTMLInputElement>(null)
  const [recoveryExporting, startRecoveryExport] = useTransition()
  const [recoveryPreviewing, startRecoveryPreview] = useTransition()
  const [recoveryImporting, startRecoveryImport] = useTransition()
  const [templateExporting, startTemplateExport] = useTransition()
  const [templatePreviewing, startTemplatePreview] = useTransition()
  const [templateImporting, startTemplateImport] = useTransition()
  const [recoveryPreview, setRecoveryPreview] =
    useState<RecoveryPreviewState | null>(null)
  const [templatePreview, setTemplatePreview] =
    useState<TemplatePreviewState | null>(null)
  const [receipt, setReceipt] = useState<GuildRecoveryReceipt | null>(null)
  const [templateReceipt, setTemplateReceipt] =
    useState<GuildTemplateImportPlan | null>(null)
  const [error, setError] = useState('')

  const exportRecovery = () => {
    setError('')
    startRecoveryExport(async () => {
      const result = await exportGuildRecoveryAction()
      if (!result.json || !result.fileName) {
        setError(result.error ?? t('errorExport'))
        return
      }
      triggerDownload(result.json, result.fileName)
    })
  }

  const previewRecoveryFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setReceipt(null)
    setRecoveryPreview(null)
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > GUILD_BACKUP_MAX_BYTES) {
      setError(t('errorFileTooLarge'))
      event.target.value = ''
      return
    }
    startRecoveryPreview(async () => {
      const rawJson = await file.text()
      const result = await previewGuildRecoveryImportAction(rawJson)
      if (!result.preview || !result.verifiedDigest) {
        setError(result.error ?? t('errorImport'))
        if (recoveryFileRef.current) recoveryFileRef.current.value = ''
        return
      }
      setRecoveryPreview({
        rawJson,
        fileName: file.name,
        preview: result.preview,
        verifiedDigest: result.verifiedDigest,
        commandId: crypto.randomUUID(),
      })
    })
  }

  const applyRecovery = () => {
    if (!recoveryPreview) return
    setError('')
    startRecoveryImport(async () => {
      const result = await importGuildRecoveryAction(
        recoveryPreview.rawJson,
        recoveryPreview.verifiedDigest,
        recoveryPreview.commandId,
      )
      if (!result.receipt) {
        setError(result.error ?? t('errorImport'))
        return
      }
      setReceipt(result.receipt)
      setRecoveryPreview(null)
      if (recoveryFileRef.current) recoveryFileRef.current.value = ''
    })
  }

  const exportTemplates = () => {
    setError('')
    startTemplateExport(async () => {
      const result = await exportGuildTemplatePackageAction()
      if (!result.json || !result.fileName) {
        setError(result.error ?? t('errorTemplateExport'))
        return
      }
      triggerDownload(result.json, result.fileName)
    })
  }

  const previewTemplateFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setTemplateReceipt(null)
    setTemplatePreview(null)
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > GUILD_BACKUP_MAX_BYTES) {
      setError(t('errorFileTooLarge'))
      event.target.value = ''
      return
    }
    startTemplatePreview(async () => {
      const rawJson = await file.text()
      const result = await previewGuildTemplatePackageImportAction(rawJson)
      if (!result.plan || !result.verifiedDigest || !result.meta) {
        setError(result.error ?? t('errorTemplateImport'))
        if (templateFileRef.current) templateFileRef.current.value = ''
        return
      }
      setTemplatePreview({
        rawJson,
        fileName: file.name,
        plan: result.plan,
        verifiedDigest: result.verifiedDigest,
        meta: result.meta,
      })
    })
  }

  const applyTemplates = () => {
    if (!templatePreview) return
    setError('')
    startTemplateImport(async () => {
      const result = await importGuildTemplatePackageAction(
        templatePreview.rawJson,
        templatePreview.verifiedDigest,
      )
      if (!result.summary) {
        setError(result.error ?? t('errorTemplateImport'))
        return
      }
      setTemplateReceipt(result.summary)
      setTemplatePreview(null)
      if (templateFileRef.current) templateFileRef.current.value = ''
    })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="text-lg font-semibold">{t('recoveryExportTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('recoveryExportHint')}
          </p>
        </header>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <ScopeCard title={t('includedTitle')} text={t('includedItems')} />
          <ScopeCard title={t('excludedTitle')} text={t('excludedItems')} />
        </div>
        <button
          type="button"
          onClick={exportRecovery}
          disabled={recoveryExporting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {recoveryExporting ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {recoveryExporting ? t('exporting') : t('recoveryExportButton')}
        </button>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="text-lg font-semibold">{t('recoveryImportTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('recoveryImportHint')}
          </p>
        </header>
        <button
          type="button"
          onClick={() => recoveryFileRef.current?.click()}
          disabled={recoveryPreviewing || recoveryImporting}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          <Upload size={16} />
          {t('recoveryPickFile')}
        </button>
        <input
          ref={recoveryFileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={previewRecoveryFile}
          disabled={recoveryPreviewing || recoveryImporting}
        />
        {recoveryPreviewing && (
          <p className="text-sm text-muted-foreground">{t('previewing')}</p>
        )}

        {recoveryPreview && (
          <div className="space-y-4 rounded-md border border-border bg-background p-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Meta
                label={t('previewFileLabel')}
                value={recoveryPreview.fileName}
              />
              <Meta
                label={t('previewCreatedAtLabel')}
                value={formatAt(recoveryPreview.preview.createdAt, timezone)}
              />
              <Meta
                label={t('previewSourceGuildLabel')}
                value={recoveryPreview.preview.source.guildName ?? t('unknownGuild')}
              />
              <Meta
                label={t('previewLogicalGuildLabel')}
                value={recoveryPreview.preview.source.albionGuildId}
              />
            </dl>
            <RecoverySummaryDiff
              before={recoveryPreview.preview.currentSummary}
              after={recoveryPreview.preview.summary}
            />
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{t('recoveryWarning')}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('serverSafetyNote')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyRecovery}
                disabled={recoveryImporting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {recoveryImporting ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {recoveryImporting ? t('importing') : t('recoveryConfirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryPreview(null)
                  if (recoveryFileRef.current) recoveryFileRef.current.value = ''
                }}
                disabled={recoveryImporting}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {receipt && (
          <div
            aria-live="polite"
            className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-950 dark:text-emerald-100"
          >
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} />
              {t('receiptTitle')}
            </div>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <Meta label={t('receiptRunId')} value={receipt.runId} />
              <Meta
                label={t('receiptCompletedAt')}
                value={formatAt(receipt.completedAt, timezone)}
              />
              <Meta
                label={t('receiptSafetySnapshot')}
                value={
                  receipt.safetySnapshotStored
                    ? t('receiptSafetyStored')
                    : t('receiptSafetyMissing')
                }
              />
              <Meta
                label={t('receiptReplay')}
                value={receipt.replayed ? t('yes') : t('no')}
              />
            </dl>
            <RecoverySummaryDiff
              before={receipt.beforeSummary}
              after={receipt.afterSummary}
            />
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header>
          <div className="flex items-center gap-2">
            <FileArchive size={18} />
            <h2 className="text-lg font-semibold">{t('templateTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('templateHint')}</p>
        </header>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportTemplates}
            disabled={templateExporting}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {templateExporting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {templateExporting ? t('exporting') : t('templateExportButton')}
          </button>
          <button
            type="button"
            onClick={() => templateFileRef.current?.click()}
            disabled={templatePreviewing || templateImporting}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            <Upload size={16} />
            {t('templatePickFile')}
          </button>
          <input
            ref={templateFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={previewTemplateFile}
            disabled={templatePreviewing || templateImporting}
          />
        </div>
        {templatePreviewing && (
          <p className="text-sm text-muted-foreground">{t('previewing')}</p>
        )}
        {templatePreview && (
          <div className="space-y-3 rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium">
              {templatePreview.meta.sourceGuildName ?? t('unknownGuild')}
            </p>
            <TemplatePlan plan={templatePreview.plan} />
            <p className="text-xs text-muted-foreground">{t('templateSafetyNote')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyTemplates}
                disabled={templateImporting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {templateImporting ? t('templateImporting') : t('templateConfirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTemplatePreview(null)
                  if (templateFileRef.current) templateFileRef.current.value = ''
                }}
                disabled={templateImporting}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
        {templateReceipt && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <p className="mb-2 font-medium">{t('templateDone')}</p>
            <TemplatePlan plan={templateReceipt} />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="text-lg font-semibold">{t('recentReceiptsTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('recentReceiptsHint')}
          </p>
        </header>
        {recentReceipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('recentReceiptsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recentReceipts.map((item) => (
              <li key={item.runId} className="grid gap-1 py-3 sm:grid-cols-3">
                <span>{formatAt(item.completedAt, timezone)}</span>
                <span>{item.sourceGuildName ?? item.sourceAlbionGuildId}</span>
                <code className="text-xs text-muted-foreground">
                  {shortId(item.runId)}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  )
}

function ScopeCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  )
}

function RecoverySummaryDiff({
  before,
  after,
}: {
  before: RecoveryStateSummary
  after: RecoveryStateSummary
}) {
  const t = useTranslations('adminBackup')
  const openObligations = (summary: RecoveryStateSummary) =>
    summary.counts.exchangeRequests +
    summary.counts.regearRequests +
    summary.counts.shopOrders +
    summary.counts.craftOrders +
    summary.counts.craftTasks +
    summary.counts.tradeOrders +
    summary.counts.tradePriceOffers
  const rows = [
    [t('summaryPointMembers'), before.counts.pointBalances, after.counts.pointBalances],
    [t('summaryHeldEscrows'), before.counts.pointEscrows, after.counts.pointEscrows],
    [t('summaryShopItems'), before.counts.shopInventory, after.counts.shopInventory],
    [t('summarySupplyItems'), before.counts.supplyInventory, after.counts.supplyInventory],
    [t('summaryOpenObligations'), openObligations(before), openObligations(after)],
  ] as const
  return (
    <div className="rounded-md border border-border">
      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>{t('summaryDomain')}</span>
        <span>{t('summaryBeforeAfter')}</span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {rows.map(([label, beforeCount, afterCount]) => (
          <li key={label} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
            <span>{label}</span>
            <span className="tabular-nums">
              {t('summaryCountValue', { before: beforeCount, after: afterCount })}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-border px-3 py-2 text-sm">
        <span>{t('summaryPointTotal')}</span>
        <span className="tabular-nums">
          {t('summaryCountValue', {
            before: before.totals.pointBalance,
            after: after.totals.pointBalance,
          })}
        </span>
      </div>
    </div>
  )
}

function TemplatePlan({ plan }: { plan: GuildTemplateImportPlan }) {
  const t = useTranslations('adminBackup')
  return (
    <ul className="space-y-1 text-sm">
      <li>
        {t('templateEventPlan', {
          added: plan.events.added,
          updated: plan.events.updated,
        })}
      </li>
      <li>
        {t('templateSlotPlan', {
          added: plan.slots.added,
          updated: plan.slots.updated,
        })}
      </li>
    </ul>
  )
}

function triggerDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function formatAt(iso: string, timezone: string): string {
  try {
    return formatDateTime(iso, timezone)
  } catch {
    return iso
  }
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
