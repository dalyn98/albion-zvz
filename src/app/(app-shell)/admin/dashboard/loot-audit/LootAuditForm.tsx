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
import type { LootAuditDepositCheckStatus, LootAuditLooterRelation } from '@/lib/loot-audit'
import {
  createPreviewSnapshot,
  isPreviewSnapshotCurrent,
} from '@/lib/workflow-state'
import { useReportDirty } from '@/components/UnsavedChangesProvider'

const TOP_FINDINGS = 12
const TOP_DEPOSITS = 12
const TOP_ITEM_CHECKS = 12

export default function LootAuditForm() {
  const router = useRouter()
  const t = useTranslations('adminLootAuditPage')
  const [title, setTitle] = useState('')
  const [lootText, setLootText] = useState('')
  const [depositText, setDepositText] = useState('')
  const [preview, setPreview] = useState<LootAuditPreviewResult | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null)
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
  const currentFields = {
    title: effectiveTitle,
    loot: lootText,
    deposit: depositText,
  }
  const previewIsCurrent =
    preview !== null &&
    !preview.error &&
    isPreviewSnapshotCurrent(previewSnapshot, currentFields)
  useReportDirty('loot-audit-create', title.length > 0 || lootText.length > 0 || depositText.length > 0)

  const handlePreview = () => {
    if (!canSubmit) return
    setMessage(null)
    const fields = currentFields
    startPreview(async () => {
      const result = await previewLootAudit({
        title: fields.title,
        lootLogRaw: fields.loot,
        depositLogRaw: fields.deposit,
      })
      setPreview(result)
      setPreviewSnapshot(result.error ? null : createPreviewSnapshot(fields))
      if (result.error) setMessage(result.error)
    })
  }

  const handleSave = () => {
    if (!canSubmit || !previewIsCurrent) return
    setMessage(null)
    const fields = currentFields
    startSave(async () => {
      const result = await createLootAudit({
        title: fields.title,
        lootLogRaw: fields.loot,
        depositLogRaw: fields.deposit,
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
      setPreviewSnapshot(null)
      router.push(`/admin/dashboard/loot-audit/${result.auditId}`)
      router.refresh()
    })
  }

  const clear = () => {
    setTitle('')
    setLootText('')
    setDepositText('')
    setPreview(null)
    setPreviewSnapshot(null)
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
            disabled={busy || !previewIsCurrent}
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
        {preview && !previewIsCurrent && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>{t('previewStale')}</p>
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
  const [showAllPreviewResults, setShowAllPreviewResults] = useState(false)
  const summary = preview.summary
  const allParseErrors = [...preview.lootParseErrors, ...preview.depositParseErrors]
  const hasParseWarnings = allParseErrors.length > 0
  const skippedBeforeStart =
    preview.skippedBeforeStart.lootRows + preview.skippedBeforeStart.depositRows
  const hasHiddenPreviewResults =
    allParseErrors.length > 4 ||
    preview.unresolvedDepositItemNames.length > 5 ||
    summary.itemCheckRows.length > TOP_ITEM_CHECKS ||
    summary.depositCheckRows.length > TOP_DEPOSITS ||
    summary.findings.length > TOP_FINDINGS
  const visibleParseErrors = showAllPreviewResults ? allParseErrors : allParseErrors.slice(0, 4)
  const visibleUnresolvedNames = showAllPreviewResults
    ? preview.unresolvedDepositItemNames
    : preview.unresolvedDepositItemNames.slice(0, 5)
  const visibleItemChecks = showAllPreviewResults
    ? summary.itemCheckRows
    : summary.itemCheckRows.slice(0, TOP_ITEM_CHECKS)
  const visibleDeposits = showAllPreviewResults
    ? summary.depositCheckRows
    : summary.depositCheckRows.slice(0, TOP_DEPOSITS)
  const visibleFindings = showAllPreviewResults
    ? summary.findings
    : summary.findings.slice(0, TOP_FINDINGS)
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Check size={16} className="text-emerald-300" />
        <h2 className="font-semibold text-white">{t('previewTitle')}</h2>
        {hasHiddenPreviewResults && (
          <button
            type="button"
            onClick={() => setShowAllPreviewResults((current) => !current)}
            className="ml-auto min-h-10 rounded-lg border border-gray-700 px-3 text-xs font-semibold text-gray-200 hover:border-amber-500/50 hover:text-amber-200"
          >
            {showAllPreviewResults ? t('showTopResults') : t('showAllResults')}
          </button>
        )}
      </div>

      <p className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-100">
        {t('targetAuditNotice')}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCell label={t('statLootRows')} value={summary.totalLootRows} />
        <StatCell label={t('statTargetRows')} value={summary.targetLootRows} accent="emerald" />
        <StatCell label={t('statExternalRows')} value={summary.externalLootRows} />
        <StatCell label={t('statDepositRows')} value={summary.totalDepositRows} />
        <StatCell label={t('statIgnoredRows')} value={summary.ignoredLootRows} />
        <StatCell label={t('statSkippedBeforeStart')} value={skippedBeforeStart} />
        <StatCell label={t('statTargetValue')} value={formatSilver(summary.totalEstimatedValue)} />
        <StatCell label={t('relationGuild')} value={summary.relationCounts.guild} accent="emerald" />
        <StatCell label={t('relationAlliance')} value={summary.relationCounts.alliance} />
        <StatCell label={t('relationOther')} value={summary.relationCounts.other} />
        <StatCell label={t('statFindings')} value={summary.findings.length} accent={summary.findings.length > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statMissingValue')} value={formatSilver(summary.missingEstimatedValue)} accent={summary.missingEstimatedValue > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statDeathLossValue')} value={formatSilver(summary.deathLostEstimatedValue)} accent={summary.deathLostEstimatedValue > 0 ? 'amber' : 'emerald'} />
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
          {visibleParseErrors.map((err, idx) => (
            <div key={`${err.line}-${idx}`} className="mt-1 space-y-0.5">
              <p className="font-semibold text-amber-200">
                {t('parseErrorLine', {
                  line: err.line,
                  reason: formatLootAuditParseErrorReason(err, t),
                })}
              </p>
              <p className="truncate font-mono text-amber-100/70" title={err.text}>
                {err.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {preview.unresolvedDepositItemNames.length > 0 && (
        <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
          {t('unresolvedDepositItems', {
            names: visibleUnresolvedNames.join(', '),
            count: preview.unresolvedDepositItemNames.length,
          })}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
        <div className="border-b border-gray-800 bg-gray-800/60 px-3 py-2">
          <p className="text-xs font-semibold text-gray-300">{t('chestCheckTitle')}</p>
          <p className="mt-1 text-[11px] text-gray-500">{t('itemCheckDescription')}</p>
        </div>
        <div className="space-y-2 p-3 sm:hidden">
          {summary.itemCheckRows.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-500">{t('noChestCheckRows')}</p>
          ) : (
            visibleItemChecks.map((row) => (
              <article key={row.itemId} className="rounded-md border border-gray-800 bg-gray-900/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-100">{row.itemName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-500">{row.itemId}</p>
                  </div>
                  <RelationPill
                    relation={row.looterRelation}
                    labels={{
                      guild: t('relationGuild'),
                      alliance: t('relationAlliance'),
                      other: t('relationOther'),
                    }}
                  />
                </div>
                <p className="mt-2 truncate text-xs text-gray-400">{formatLooterNames(row.looterNames)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-800 pt-2 text-xs">
                  <div>
                    <dt className="text-gray-500">{t('colExpected')}</dt>
                    <dd className="mt-0.5 font-mono text-gray-200">{row.expectedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colDeposited')}</dt>
                    <dd className="mt-0.5 font-mono text-emerald-200">{row.depositedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colMissing')}</dt>
                    <dd className="mt-0.5 font-mono text-amber-200">{row.missingQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colMissingValue')}</dt>
                    <dd className="mt-0.5 font-mono text-amber-200">
                      {formatSilver(row.missingEstimatedValue)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-gray-800/80 text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">{t('colRelation')}</th>
              <th className="px-3 py-2 font-medium">{t('colLooters')}</th>
              <th className="px-3 py-2 font-medium">{t('colItem')}</th>
              <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
              <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
              <th className="px-3 py-2 font-medium">{t('colMissing')}</th>
              <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {summary.itemCheckRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  {t('noChestCheckRows')}
                </td>
              </tr>
            ) : (
              visibleItemChecks.map((row) => (
                <tr key={row.itemId} className="text-gray-200">
                  <td className="px-3 py-2">
                    <RelationPill
                      relation={row.looterRelation}
                      labels={{
                        guild: t('relationGuild'),
                        alliance: t('relationAlliance'),
                        other: t('relationOther'),
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {formatLooterNames(row.looterNames)}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-gray-200">{row.itemName}</p>
                    <p className="font-mono text-[11px] text-gray-500">{row.itemId}</p>
                  </td>
                  <td className="px-3 py-2 font-mono">{row.expectedQuantity}</td>
                  <td className="px-3 py-2 font-mono text-emerald-200">{row.depositedQuantity}</td>
                  <td className="px-3 py-2 font-mono text-amber-200">{row.missingQuantity}</td>
                  <td className="px-3 py-2 font-mono text-amber-200">
                    {formatSilver(row.missingEstimatedValue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
        <div className="border-b border-gray-800 bg-gray-800/60 px-3 py-2">
          <p className="text-xs font-semibold text-gray-300">{t('depositLogTitle')}</p>
          <p className="mt-1 text-[11px] text-gray-500">{t('depositLogDescription')}</p>
        </div>
        <div className="space-y-2 p-3 sm:hidden">
          {summary.depositCheckRows.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-500">{t('noDepositLogRows')}</p>
          ) : (
            visibleDeposits.map((row) => (
              <article
                key={`${row.player}-${row.itemId ?? row.itemName}`}
                className="rounded-md border border-gray-800 bg-gray-900/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{row.player}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-300">{row.itemName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-500">
                      {row.itemId ?? t('depositItemUnresolved')}
                    </p>
                  </div>
                  <DepositCheckStatusPill
                    status={row.status}
                    labels={{
                      matched: t('depositCheckStatusMatched'),
                      extra: t('depositCheckStatusExtra'),
                      unresolved: t('depositCheckStatusUnresolved'),
                    }}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-800 pt-2 text-xs">
                  <div>
                    <dt className="text-gray-500">{t('colDeposited')}</dt>
                    <dd className="mt-0.5 font-mono text-gray-200">{row.depositedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colExpected')}</dt>
                    <dd className="mt-0.5 font-mono text-gray-200">{row.expectedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colMatched')}</dt>
                    <dd className="mt-0.5 font-mono text-emerald-200">{row.matchedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colExtra')}</dt>
                    <dd className="mt-0.5 font-mono text-amber-200">{row.extraQuantity}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
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
              visibleDeposits.map((row) => (
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
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
        <div className="space-y-2 p-3 sm:hidden">
          {summary.findings.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-500">{t('noFindings')}</p>
          ) : (
            visibleFindings.map((finding) => (
              <article
                key={`${finding.lootedByName}-${finding.itemId}`}
                className="rounded-md border border-gray-800 bg-gray-900/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-100">{finding.itemName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-500">{finding.itemId}</p>
                  </div>
                  <RelationPill
                    relation={finding.looterRelation}
                    labels={{
                      guild: t('relationGuild'),
                      alliance: t('relationAlliance'),
                      other: t('relationOther'),
                    }}
                  />
                </div>
                <p className="mt-2 truncate text-xs text-gray-400">
                  {finding.scope === 'item_pool' ? t('findingScopeItemPool') : finding.lootedByName}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-800 pt-2 text-xs">
                  <div>
                    <dt className="text-gray-500">{t('colExpected')}</dt>
                    <dd className="mt-0.5 font-mono text-gray-200">{finding.expectedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colDeposited')}</dt>
                    <dd className="mt-0.5 font-mono text-gray-200">{finding.depositedQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colMissing')}</dt>
                    <dd className="mt-0.5 font-mono text-amber-200">{finding.missingQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('colMissingValue')}</dt>
                    <dd className="mt-0.5 font-mono text-amber-200">
                      {formatSilver(finding.missingEstimatedValue)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-gray-800/80 text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">{t('colRelation')}</th>
              <th className="px-3 py-2 font-medium">{t('colScope')}</th>
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
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  {t('noFindings')}
                </td>
              </tr>
            ) : (
              visibleFindings.map((finding) => (
                <tr key={`${finding.lootedByName}-${finding.itemId}`} className="text-gray-200">
                  <td className="px-3 py-2">
                    <RelationPill
                      relation={finding.looterRelation}
                      labels={{
                        guild: t('relationGuild'),
                        alliance: t('relationAlliance'),
                        other: t('relationOther'),
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-white">
                    {finding.scope === 'item_pool'
                      ? t('findingScopeItemPool')
                      : finding.lootedByName}
                  </td>
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
    </div>
  )
}

function formatLootAuditParseErrorReason(
  error: LootAuditPreviewResult['lootParseErrors'][number],
  t: ReturnType<typeof useTranslations<'adminLootAuditPage'>>,
): string {
  switch (error.code) {
    case 'loot_missing_headers':
      return t('parseErrorReasonLootMissingHeaders')
    case 'loot_timestamp':
      return t('parseErrorReasonLootTimestamp')
    case 'loot_required_fields':
      return t('parseErrorReasonLootRequiredFields')
    case 'loot_quantity':
      return t('parseErrorReasonLootQuantity')
    case 'loot_market_value':
      return t('parseErrorReasonLootMarketValue')
    case 'chest_format':
      return t('parseErrorReasonChestFormat')
    case 'chest_date':
      return t('parseErrorReasonChestDate')
    case 'chest_numeric_fields':
      return t('parseErrorReasonChestNumericFields')
    default:
      return t('parseErrorReasonUnknown')
  }
}

function RelationPill({
  relation,
  labels,
}: {
  relation: LootAuditLooterRelation
  labels: Record<LootAuditLooterRelation, string>
}) {
  const color =
    relation === 'guild'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : relation === 'alliance'
        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
        : 'border-gray-500/40 bg-gray-500/10 text-gray-300'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 ${color}`}>
      {labels[relation]}
    </span>
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

function formatLooterNames(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}
