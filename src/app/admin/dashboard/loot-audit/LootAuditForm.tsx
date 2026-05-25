'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Save,
  SearchCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  createLootAudit,
  previewLootAudit,
  type LootAuditPreviewResult,
} from '@/app/actions/loot-audit'
import type { LootAuditDepositCheckStatus } from '@/lib/loot-audit'

const TOP_FINDINGS = 12
const TOP_DEPOSITS = 12

export default function LootAuditForm() {
  const router = useRouter()
  const t = useTranslations('adminLootAuditPage')
  const [title, setTitle] = useState('')
  const [lootText, setLootText] = useState('')
  const [depositText, setDepositText] = useState('')
  const [preview, setPreview] = useState<LootAuditPreviewResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [previewPending, startPreview] = useTransition()
  const [savePending, startSave] = useTransition()

  const effectiveTitle = useMemo(() => {
    const trimmed = title.trim()
    if (trimmed) return trimmed
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return t('defaultTitle', { date: `${y}-${m}-${d}` })
  }, [title, t])

  const busy = previewPending || savePending
  const canSubmit = lootText.trim().length > 0 && depositText.trim().length > 0

  const handlePreview = () => {
    if (!canSubmit) return
    setMessage(null)
    startPreview(async () => {
      const result = await previewLootAudit({
        title: effectiveTitle,
        lootLogRaw: lootText,
        depositLogRaw: depositText,
      })
      setPreview(result)
      if (result.error) setMessage(result.error)
    })
  }

  const handleSave = () => {
    if (!canSubmit) return
    setMessage(null)
    startSave(async () => {
      const result = await createLootAudit({
        title: effectiveTitle,
        lootLogRaw: lootText,
        depositLogRaw: depositText,
      })
      if (result.error || !result.auditId) {
        setPreview(result)
        setMessage(result.error ?? t('saveFailed'))
        return
      }
      setTitle('')
      setLootText('')
      setDepositText('')
      setPreview(null)
      router.push(`/admin/dashboard/loot-audit/${result.auditId}`)
      router.refresh()
    })
  }

  const clear = () => {
    setTitle('')
    setLootText('')
    setDepositText('')
    setPreview(null)
    setMessage(null)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3 lg:col-span-2">
            <label className="block text-xs font-medium text-gray-400">
              {t('auditTitleLabel')}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-400 focus:outline-none"
                placeholder={t('auditTitlePlaceholder')}
              />
            </label>
          </div>

          <LogInput
            title={t('lootLogLabel')}
            icon={<FileText size={15} />}
            value={lootText}
            onChange={setLootText}
            placeholder={t('lootLogPlaceholder')}
            fileLabel={t('pickLootFile')}
          />
          <LogInput
            title={t('depositLogLabel')}
            icon={<Upload size={15} />}
            value={depositText}
            onChange={setDepositText}
            placeholder={t('depositLogPlaceholder')}
            fileLabel={t('pickDepositFile')}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy || !canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-gray-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500"
          >
            {previewPending ? <Loader2 size={14} className="animate-spin" /> : <SearchCheck size={14} />}
            {previewPending ? t('previewing') : t('preview')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
          >
            {savePending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {savePending ? t('saving') : t('save')}
          </button>
          {(lootText || depositText || preview) && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs text-gray-400 hover:text-rose-300 disabled:text-gray-700"
            >
              <Trash2 size={13} />
              {t('clear')}
            </button>
          )}
        </div>

        {message && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>{message}</p>
          </div>
        )}
      </div>

      {preview && <PreviewPanel preview={preview} />}
    </section>
  )
}

function LogInput({
  title,
  icon,
  value,
  onChange,
  placeholder,
  fileLabel,
}: {
  title: string
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder: string
  fileLabel: string
}) {
  const handleFile = async (file: File | undefined) => {
    if (!file) return
    onChange(await file.text())
  }

  return (
    <div className="block min-w-0 text-xs font-medium text-gray-400">
      <div className="flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="mt-2 w-full resize-y rounded-md border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-white placeholder-gray-600 focus:border-amber-400 focus:outline-none"
        placeholder={placeholder}
      />
      <label className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-amber-400 hover:text-amber-200">
        <input
          type="file"
          accept=".csv,.txt,.log,.rtf,text/*"
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="hidden"
        />
        <Upload size={12} />
        {fileLabel}
      </label>
    </div>
  )
}

function PreviewPanel({ preview }: { preview: LootAuditPreviewResult }) {
  const t = useTranslations('adminLootAuditPage')
  const summary = preview.summary
  const hasParseWarnings = preview.lootParseErrors.length > 0 || preview.depositParseErrors.length > 0
  const skippedBeforeStart =
    preview.skippedBeforeStart.lootRows + preview.skippedBeforeStart.depositRows
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Check size={16} className="text-emerald-300" />
        <h2 className="font-semibold text-white">{t('previewTitle')}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
        <StatCell label={t('statLootRows')} value={summary.totalLootRows} />
        <StatCell label={t('statDepositRows')} value={summary.totalDepositRows} />
        <StatCell label={t('statIgnoredRows')} value={summary.ignoredLootRows} />
        <StatCell label={t('statSkippedBeforeStart')} value={skippedBeforeStart} />
        <StatCell label={t('relationGuild')} value={summary.relationCounts.guild} accent="emerald" />
        <StatCell label={t('relationAlliance')} value={summary.relationCounts.alliance} />
        <StatCell label={t('relationOther')} value={summary.relationCounts.other} />
        <StatCell label={t('statFindings')} value={summary.findings.length} accent={summary.findings.length > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statMissingValue')} value={formatSilver(summary.missingEstimatedValue)} accent={summary.missingEstimatedValue > 0 ? 'amber' : 'emerald'} />
      </div>

      {skippedBeforeStart > 0 && (
        <div className="mt-4 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-indigo-100">
          {t('skippedBeforeStartNotice', {
            count: skippedBeforeStart,
            loot: preview.skippedBeforeStart.lootRows,
            deposit: preview.skippedBeforeStart.depositRows,
          })}
        </div>
      )}

      {hasParseWarnings && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p className="font-semibold">{t('parseWarnings')}</p>
          {[...preview.lootParseErrors, ...preview.depositParseErrors].slice(0, 4).map((err, idx) => (
            <p key={`${err.line}-${idx}`} className="mt-1 truncate font-mono text-amber-100/80">
              #{err.line} {err.reason}
            </p>
          ))}
        </div>
      )}

      {preview.unresolvedDepositItemNames.length > 0 && (
        <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
          {t('unresolvedDepositItems', {
            names: preview.unresolvedDepositItemNames.slice(0, 5).join(', '),
            count: preview.unresolvedDepositItemNames.length,
          })}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
        <div className="border-b border-gray-800 bg-gray-800/60 px-3 py-2 text-xs font-semibold text-gray-300">
          {t('depositLogTitle')}
        </div>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-gray-800/80 text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">{t('colDepositStatus')}</th>
              <th className="px-3 py-2 font-medium">{t('colMember')}</th>
              <th className="px-3 py-2 font-medium">{t('colItem')}</th>
              <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
              <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
              <th className="px-3 py-2 font-medium">{t('colMatched')}</th>
              <th className="px-3 py-2 font-medium">{t('colExtra')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {summary.depositCheckRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  {t('noDepositLogRows')}
                </td>
              </tr>
            ) : (
              summary.depositCheckRows.slice(0, TOP_DEPOSITS).map((row) => (
                <tr key={`${row.player}-${row.itemId ?? row.itemName}`} className="text-gray-200">
                  <td className="px-3 py-2">
                    <DepositCheckStatusPill
                      status={row.status}
                      labels={{
                        matched: t('depositCheckStatusMatched'),
                        extra: t('depositCheckStatusExtra'),
                        unresolved: t('depositCheckStatusUnresolved'),
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-white">{row.player}</td>
                  <td className="px-3 py-2">
                    <p className="text-gray-200">{row.itemName}</p>
                    <p className="font-mono text-[11px] text-gray-500">
                      {row.itemId ?? t('depositItemUnresolved')}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono">{row.depositedQuantity}</td>
                  <td className="px-3 py-2 font-mono">{row.expectedQuantity}</td>
                  <td className="px-3 py-2 font-mono text-emerald-200">{row.matchedQuantity}</td>
                  <td className="px-3 py-2 font-mono text-amber-200">{row.extraQuantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-gray-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-800/80 text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">{t('colMember')}</th>
              <th className="px-3 py-2 font-medium">{t('colItem')}</th>
              <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
              <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
              <th className="px-3 py-2 font-medium">{t('colMissing')}</th>
              <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {summary.findings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {t('noFindings')}
                </td>
              </tr>
            ) : (
              summary.findings.slice(0, TOP_FINDINGS).map((finding) => (
                <tr key={`${finding.lootedByName}-${finding.itemId}`} className="text-gray-200">
                  <td className="px-3 py-2 font-medium text-white">{finding.lootedByName}</td>
                  <td className="px-3 py-2">
                    <p className="text-gray-200">{finding.itemName}</p>
                    <p className="font-mono text-[11px] text-gray-500">{finding.itemId}</p>
                  </td>
                  <td className="px-3 py-2 font-mono">{finding.expectedQuantity}</td>
                  <td className="px-3 py-2 font-mono">{finding.depositedQuantity}</td>
                  <td className="px-3 py-2 font-mono text-amber-200">{finding.missingQuantity}</td>
                  <td className="px-3 py-2 font-mono text-amber-200">
                    {formatSilver(finding.missingEstimatedValue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DepositCheckStatusPill({
  status,
  labels,
}: {
  status: LootAuditDepositCheckStatus
  labels: Record<LootAuditDepositCheckStatus, string>
}) {
  const color =
    status === 'matched'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : status === 'extra'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 ${color}`}>
      {labels[status]}
    </span>
  )
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'amber' | 'emerald'
}) {
  const color = accent === 'amber'
    ? 'text-amber-200'
    : accent === 'emerald'
      ? 'text-emerald-200'
      : 'text-white'
  return (
    <div className="rounded-md bg-gray-800/70 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-semibold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function formatSilver(value: number): string {
  return Math.round(value).toLocaleString()
}
