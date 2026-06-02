'use client'

// 길드 상자 로그 임포트 폼.
//
// 플로우:
//   1. 유저가 붙여넣기 → `importChestLog(raw, { dryRun: true })` 호출 → staging 배치로 추가.
//   2. 여러 번 붙여넣어 여러 배치를 쌓을 수 있다. 각 배치는 "마지막 로그까지 이어졌는가 / 신규 N건" 판정.
//   3. "저장" 클릭 → 누적된 raw 를 합쳐 실제 import (dryRun=false). 공개 /shop 은 이 시점에만 갱신됨.
//
// 저장 전까지는 `shop_chest_logs` / `shop_inventory` 에 아무 변동도 없음.

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { getLocalizedItemName } from '@/lib/item-names'
import { toZonedParts } from '@/lib/timezone'
import type { Locale } from '@/i18n/locales'
import {
  Upload,
  Check,
  AlertCircle,
  Loader2,
  Ban,
  Package,
  Clock,
  Trash2,
  Info,
} from 'lucide-react'
import { importChestLog, addBlacklist, type ImportSummary } from '@/app/actions/shop-admin'

type ImportTranslator = ReturnType<typeof useTranslations<'adminShopImport'>>

interface StagedBatch {
  id: string
  raw: string
  preview: ImportSummary
  pastedAtIso: string
}

interface AggregatedStockChange {
  uniqueName: string
  nameKo: string
  enchant: number
  quality: number
  delta: number
  newStock: number
}

interface Props {
  lastImportAt: string | null
  timezone: string
  // 서버가 요청 시점 기준으로 계산한 stale 여부. 클라에서 Date.now() 를
  // render 시 호출하면 react-compiler purity 룰 위반 — 그래서 prop 으로 받음.
  isImportStale: boolean
}

export default function ShopImportForm({ lastImportAt, timezone, isImportStale }: Props) {
  const router = useRouter()
  const t = useTranslations('adminShopImport')
  const [text, setText] = useState('')
  const [batches, setBatches] = useState<StagedBatch[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<ImportSummary | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [blacklistingName, setBlacklistingName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // 붙여넣기/파일 드롭 공용 preview 러너. dryRun=true 로 DB 변경 없이 결과만 받아온다.
  const runPreview = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const result = await importChestLog(trimmed, { dryRun: true })
      if (result.error && result.parsed === 0) {
        setPreviewError(result.error)
        return
      }
      setBatches((prev) => [
        ...prev,
        {
          id:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${new Date().toISOString()}-${Math.random()}`,
          raw: trimmed,
          preview: result,
          pastedAtIso: new Date().toISOString(),
        },
      ])
      // 새 배치가 추가되면 직전 commit 결과/에러는 스쳐 지난 정보라 치움.
      setCommitResult(null)
      setCommitError(null)
    } finally {
      setPreviewing(false)
    }
  }, [])

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clip = e.clipboardData.getData('text/plain')
    if (!clip.trim()) return
    // textarea 에 내용이 누적되지 않게 preventDefault — preview 결과만 staging 으로.
    e.preventDefault()
    setText('')
    void runPreview(clip)
  }

  const handleManualSubmit = () => {
    if (!text.trim()) return
    const raw = text
    setText('')
    void runPreview(raw)
  }

  const handleCommit = async () => {
    if (batches.length === 0) return
    setCommitting(true)
    setCommitError(null)
    try {
      const combined = batches.map((b) => b.raw).join('\n')
      const result = await importChestLog(combined)
      if (result.error) {
        setCommitError(result.error)
        return
      }
      setBatches([])
      setCommitResult(result)
      router.refresh()
    } finally {
      setCommitting(false)
    }
  }

  const handleDiscardBatch = (id: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== id))
  }

  const handleDiscardAll = () => {
    setBatches([])
    setCommitResult(null)
    setCommitError(null)
    setPreviewError(null)
  }

  const handleBlacklist = async (name: string) => {
    setBlacklistingName(name)
    try {
      await addBlacklist(name)
      // staging 상태에서 블랙리스트 처리된 이름은 각 배치 미해결 목록에서도 제거해
      // 사용자가 다시 눌러도 no-op 되게 한다. 실제 재고 영향은 commit 시 다시 계산.
      setBatches((prev) =>
        prev.map((b) => ({
          ...b,
          preview: {
            ...b.preview,
            unresolvedNames: b.preview.unresolvedNames.filter((n) => n !== name),
          },
        })),
      )
      router.refresh()
    } finally {
      setBlacklistingName(null)
    }
  }

  const handleFile = async (file: File) => {
    try {
      const content = await file.text()
      void runPreview(content)
    } catch {
      setPreviewError(t('fileReadFail'))
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!dragging) setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
  }

  const totals = useMemo(() => aggregateTotals(batches), [batches])
  const stockChanges = useMemo(() => aggregateStockChanges(batches), [batches])
  // 가장 최근 배치 기준으로 "마지막 로그" 상태 메시지 표시.
  // 여러 배치를 쌓았다면 가장 나중 붙여넣은 쪽이 DB 와의 "연결 지점" 을 가장 잘 반영.
  const latestBatch = batches.length > 0 ? batches[batches.length - 1] : null

  const isBusy = previewing || committing

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">{t('title')}</h2>
            <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
          </div>
          <LastImportBadge iso={lastImportAt} stale={isImportStale} timezone={timezone} t={t} />
        </div>

        {!lastImportAt && (
          <div className="flex items-start gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">{t('firstImportHint')}</p>
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-lg transition-colors ${
            dragging ? 'ring-2 ring-amber-500/60' : ''
          }`}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono resize-y"
            placeholder={t('placeholder')}
          />
          {previewing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-gray-900/70 rounded-lg">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                <Loader2 size={14} className="animate-spin" />
                {t('previewing')}
              </div>
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-amber-500/10 rounded-lg">
              <p className="text-amber-300 text-sm font-semibold">{t('dropHere')}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={isBusy || !text.trim()}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors text-xs"
          >
            <Upload size={12} />
            {t('manualSubmit')}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={isBusy || batches.length === 0}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-1.5 rounded-lg transition-colors text-sm"
          >
            {committing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {batches.length > 0
              ? t('saveButtonWithCount', { batches: batches.length, items: totals.newEntries })
              : t('saveButton')}
          </button>
          {batches.length > 0 && (
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={isBusy}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-rose-300 disabled:text-gray-700"
            >
              <Trash2 size={12} />
              {t('discardAll')}
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
            <p className="text-red-300 text-xs">{t('saveFailed', { error: commitError })}</p>
          </div>
        )}
      </div>

      {latestBatch && (
        <StagingStatusCard preview={latestBatch.preview} timezone={timezone} t={t} />
      )}

      {batches.length > 0 && (
        <StagedBatchesCard
          batches={batches}
          onDiscard={handleDiscardBatch}
          timezone={timezone}
          t={t}
        />
      )}

      {batches.length > 0 && (
        <RunningTotalsCard
          totals={totals}
          onBlacklist={handleBlacklist}
          blacklistingName={blacklistingName}
          busy={isBusy}
          t={t}
        />
      )}

      {batches.length > 0 && stockChanges.length > 0 && (
        <StockPreviewCard stockChanges={stockChanges} t={t} />
      )}

      {commitResult && <CommitResultCard summary={commitResult} t={t} />}
    </div>
  )
}

interface Totals {
  batches: number
  parsed: number
  newEntries: number
  duplicatesSkipped: number
  skippedBeforeStart: number
  blacklistedRows: number
  tierEnchantExcludedRows: number
  unresolvedRows: number
  unresolvedNames: string[]
  parseErrors: Array<{ line: number; text: string; reason: string }>
}

function aggregateTotals(batches: StagedBatch[]): Totals {
  const acc: Totals = {
    batches: batches.length,
    parsed: 0,
    newEntries: 0,
    duplicatesSkipped: 0,
    skippedBeforeStart: 0,
    blacklistedRows: 0,
    tierEnchantExcludedRows: 0,
    unresolvedRows: 0,
    unresolvedNames: [],
    parseErrors: [],
  }
  const unresolvedSet = new Set<string>()
  for (const b of batches) {
    const p = b.preview
    acc.parsed += p.parsed
    // newEntries 는 "DB 기준 마지막 로그 이후로 새로 찍히는 수" 가 의미상 맞지만
    // 여러 배치를 합치면 겹치는 경우가 있으므로, 각 배치의 newEntriesAfterLast 합은
    // 상한선에 가깝다. 엄밀한 전역 계산은 commit 시 재계산되므로 여기선 휴리스틱.
    acc.newEntries += p.newEntriesAfterLast
    acc.duplicatesSkipped += p.duplicatesSkipped
    acc.skippedBeforeStart += p.skippedBeforeStart
    acc.blacklistedRows += p.blacklistedRows
    acc.tierEnchantExcludedRows += p.tierEnchantExcludedRows
    acc.unresolvedRows += p.unresolvedRows
    for (const n of p.unresolvedNames) unresolvedSet.add(n)
    acc.parseErrors.push(...p.parseErrors)
  }
  acc.unresolvedNames = Array.from(unresolvedSet)
  return acc
}

function aggregateStockChanges(batches: StagedBatch[]): AggregatedStockChange[] {
  // 여러 배치의 (uniqueName, enchant, quality) 델타를 합산. newStock 은 가장 마지막
  // 배치의 기준값 위에 이후 델타가 더해진 형태로 근사 — commit 시 DB 에서 정확한
  // 값이 재계산되므로 미리보기는 "현재재고 + 총델타" 만 맞춰 보이면 충분.
  const byKey = new Map<string, AggregatedStockChange>()
  for (const b of batches) {
    for (const c of b.preview.stockChanges) {
      const key = `${c.uniqueName}|${c.enchant}|${c.quality}`
      const prev = byKey.get(key)
      if (prev) {
        prev.delta += c.delta
        prev.newStock = c.newStock // 마지막 배치의 newStock 이 델타를 누적 반영한 것으로 간주
      } else {
        byKey.set(key, { ...c })
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.delta - a.delta)
}

function StagingStatusCard({
  preview,
  timezone,
  t,
}: {
  preview: ImportSummary
  timezone: string
  t: ImportTranslator
}) {
  const {
    lastKnownLoggedAt,
    lastKnownLabel,
    lastKnownInBatch,
    newEntriesAfterLast,
    gapFromLastKnownMs,
  } = preview
  const saveableRows = Math.max(
    0,
    preview.parsed -
      preview.skippedBeforeStart -
      preview.duplicatesSkipped -
      preview.tierEnchantExcludedRows,
  )

  // tone 은 최종 본문을 쓸 때 다시 덮어씀. 초기값은 '이전 기록 없음' 케이스 기준.
  let tone: 'ok' | 'warn' | 'danger' | 'info' = 'info'
  let title = ''
  let body = ''
  let gapBody: string | null = null

  const GAP_DANGER_MS = 7 * 24 * 60 * 60 * 1000
  const GAP_WARN_MS = 6 * 60 * 60 * 1000

  if (!lastKnownLoggedAt) {
    tone = 'info'
    title = t('stagingNoPrevTitle')
    body = t('stagingNoPrevBody', { count: newEntriesAfterLast })
  } else {
    const when = formatLoggedAt(lastKnownLoggedAt, timezone)
    const tail = lastKnownLabel ? ` · ${lastKnownLabel}` : ''
    if (newEntriesAfterLast === 0 && lastKnownInBatch) {
      tone = 'ok'
      title = t('stagingNoNewTitle')
      body = t('stagingNoNewBody', { when, tail })
    } else if (newEntriesAfterLast === 0 && !lastKnownInBatch) {
      if (saveableRows > 0) {
        tone = 'warn'
        title = t('stagingBackfillTitle')
        body = t('stagingBackfillBody', { when, tail, count: saveableRows })
      } else {
        tone = 'warn'
        title = t('stagingSkippedTitle')
        body = t('stagingSkippedBody', { when, tail })
      }
    } else if (newEntriesAfterLast > 0 && lastKnownInBatch) {
      tone = 'ok'
      title = t('stagingContinuedTitle')
      body = t('stagingContinuedBody', { when, tail, count: newEntriesAfterLast })
    } else {
      // newEntriesAfterLast > 0 && !lastKnownInBatch — gap 이 있다.
      const gapLabel = formatGap(gapFromLastKnownMs, t)
      if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_DANGER_MS) {
        tone = 'danger'
        title = t('stagingGapDangerTitle', { gap: gapLabel ?? '' })
        body = t('stagingGapDangerBody', { when, tail, gap: gapLabel ?? '' })
      } else if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_WARN_MS) {
        tone = 'warn'
        title = t('stagingGapWarnTitle', { gap: gapLabel ?? '' })
        body = t('stagingGapWarnBody', { when, tail, gap: gapLabel ?? '' })
      } else {
        tone = 'warn'
        title = t('stagingGapNoOverlapTitle')
        const gapSuffix = gapLabel ? t('stagingGapSuffix', { gap: gapLabel }) : ''
        body = t('stagingGapNoOverlapBody', { when, tail, gapSuffix })
      }
      gapBody = t('stagingGapAddLine', { count: newEntriesAfterLast })
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
    <div className={`border rounded-xl p-4 flex items-start gap-3 ${styles}`}>
      <Info size={16} className="mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-90 leading-relaxed">{body}</p>
        {gapBody && <p className="text-xs opacity-75 leading-relaxed">{gapBody}</p>}
      </div>
    </div>
  )
}

function formatGap(ms: number | null, t: ImportTranslator): string | null {
  if (ms === null || ms <= 0) return null
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return t('gapMinutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('gapHours', { hours, mins: mins % 60 })
  const days = Math.floor(hours / 24)
  return t('gapDays', { days, hours: hours % 24 })
}

function StagedBatchesCard({
  batches,
  onDiscard,
  timezone,
  t,
}: {
  batches: StagedBatch[]
  onDiscard: (id: string) => void
  timezone: string
  t: ImportTranslator
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-white">{t('batchListTitle', { count: batches.length })}</h3>
      <ul className="space-y-2">
        {batches.map((b, i) => {
          const p = b.preview
          return (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500 font-mono">#{i + 1}</span>
                <span className="text-gray-300">
                  {t('batchStatLine', {
                    parsed: p.parsed,
                    newCount: p.newEntriesAfterLast,
                    dup: p.duplicatesSkipped,
                    skipped: p.skippedBeforeStart,
                  })}
                  {p.unresolvedRows > 0 && (
                    <span className="text-amber-300">
                      {t('batchUnresolvedChip', { count: p.unresolvedRows })}
                    </span>
                  )}
                  {p.tierEnchantExcludedRows > 0 && (
                    <span className="text-sky-300">
                      {t('batchTierFilterChip', { count: p.tierEnchantExcludedRows })}
                    </span>
                  )}
                </span>
                <span className="text-gray-500">{formatLoggedAt(b.pastedAtIso, timezone)}</span>
              </div>
              <button
                type="button"
                onClick={() => onDiscard(b.id)}
                className="text-gray-500 hover:text-rose-300 transition-colors"
                title={t('batchDiscardTitle')}
              >
                <Trash2 size={12} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LastImportBadge({
  iso,
  stale,
  timezone,
  t,
}: {
  iso: string | null
  stale: boolean
  timezone: string
  t: ImportTranslator
}) {
  if (!iso) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
        <Clock size={11} />
        <span>{t('importBadgeNone')}</span>
      </div>
    )
  }
  const color = stale ? 'text-amber-400' : 'text-gray-400'
  return (
    <div className={`flex items-center gap-1 text-[11px] shrink-0 ${color}`}>
      <Clock size={11} />
      <span>
        {t('importBadgeLast', { when: formatLoggedAt(iso, timezone) })}
        {stale && <span className="ml-1">{t('importBadgeStale')}</span>}
      </span>
    </div>
  )
}

function RunningTotalsCard({
  totals,
  onBlacklist,
  blacklistingName,
  busy,
  t,
}: {
  totals: Totals
  onBlacklist: (name: string) => void
  blacklistingName: string | null
  busy: boolean
  t: ImportTranslator
}) {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Check size={16} className="text-emerald-400" />
          <h3 className="font-bold text-white">{t('runningTotalsTitle')}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
          <StatCell label={t('statParsed')} value={totals.parsed} />
          <StatCell
            label={t('statNewEntries')}
            value={totals.newEntries}
            accent="emerald"
          />
          <StatCell label={t('statDuplicates')} value={totals.duplicatesSkipped} />
          <StatCell label={t('statSkippedBeforeStart')} value={totals.skippedBeforeStart} />
          <StatCell
            label={t('statTierFilter')}
            value={totals.tierEnchantExcludedRows}
            accent={totals.tierEnchantExcludedRows > 0 ? 'amber' : undefined}
          />
          <StatCell label={t('statBlacklist')} value={totals.blacklistedRows} />
          <StatCell
            label={t('statUnresolved')}
            value={totals.unresolvedRows}
            accent={totals.unresolvedRows > 0 ? 'amber' : undefined}
          />
        </div>
      </div>

      {totals.parseErrors.length > 0 && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 text-xs text-gray-400 space-y-1">
          <p className="font-semibold text-gray-300">
            {t('parseErrorsTitle', { count: totals.parseErrors.length })}
          </p>
          {totals.parseErrors.slice(0, 3).map((e, i) => (
            <p key={`${e.line}-${i}`} className="font-mono truncate">
              #{e.line} {e.text}
            </p>
          ))}
          {totals.parseErrors.length > 3 && (
            <p className="text-gray-500">
              {t('parseErrorsOverflow', { count: totals.parseErrors.length - 3 })}
            </p>
          )}
        </div>
      )}

      {totals.unresolvedNames.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400" />
            <h3 className="font-bold text-white">
              {t('unresolvedTitle', { count: totals.unresolvedNames.length })}
            </h3>
          </div>
          <p className="text-gray-400 text-xs">{t('unresolvedHint')}</p>
          <div className="flex flex-wrap gap-2">
            {totals.unresolvedNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-200">{name}</span>
                <button
                  type="button"
                  onClick={() => onBlacklist(name)}
                  disabled={busy}
                  className="flex items-center gap-1 text-gray-500 hover:text-red-300 disabled:text-gray-700 transition-colors"
                  title={t('blacklistAddTitle')}
                >
                  {blacklistingName === name ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Ban size={10} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StockPreviewCard({
  stockChanges,
  t,
}: {
  stockChanges: AggregatedStockChange[]
  t: ImportTranslator
}) {
  const locale = useLocale() as Locale
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-emerald-400" />
        <h3 className="font-bold text-white">
          {t('stockPreviewTitle', { count: stockChanges.length })}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left font-normal pb-2">{t('stockItemHeader')}</th>
              <th className="text-center font-normal pb-2 w-16">@</th>
              <th className="text-center font-normal pb-2 w-16">Q</th>
              <th className="text-right font-normal pb-2 w-20">{t('stockDeltaHeader')}</th>
              <th className="text-right font-normal pb-2 w-24">{t('stockAfterHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {stockChanges.slice(0, 50).map((c) => {
              const displayName =
                getLocalizedItemName(c.uniqueName, locale, c.nameKo) ?? c.nameKo
              return (
              <tr
                key={`${c.uniqueName}|${c.enchant}|${c.quality}`}
                className="border-b border-gray-800/50"
              >
                <td className="py-1.5 text-gray-200 text-xs">{displayName}</td>
                <td className="py-1.5 text-gray-500 text-center text-xs">{c.enchant}</td>
                <td className="py-1.5 text-gray-500 text-center text-xs">{c.quality}</td>
                <td
                  className={`py-1.5 text-right text-xs font-mono ${
                    c.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {c.delta > 0 ? `+${c.delta}` : c.delta}
                </td>
                <td className="py-1.5 text-right text-xs font-mono text-white">
                  {c.newStock}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {stockChanges.length > 50 && (
          <p className="text-xs text-gray-500 mt-2">
            {t('stockOverflow', { count: stockChanges.length - 50 })}
          </p>
        )}
      </div>
    </div>
  )
}

function CommitResultCard({ summary, t }: { summary: ImportSummary; t: ImportTranslator }) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Check size={16} className="text-emerald-400" />
        <h3 className="font-bold text-white">{t('commitResultTitle')}</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCell label={t('commitStatNew')} value={summary.inserted} accent="emerald" />
        <StatCell label={t('commitStatDup')} value={summary.duplicatesSkipped} />
        <StatCell label={t('commitStatSkippedBeforeStart')} value={summary.skippedBeforeStart} />
        <StatCell label={t('commitStatTierFilter')} value={summary.tierEnchantExcludedRows} />
        <StatCell label={t('commitStatStockChanges')} value={summary.stockChanges.length} />
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Info size={12} className="shrink-0" />
        <span>{t('commitPriceSyncDeferred')}</span>
      </div>
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
  accent?: 'emerald' | 'amber'
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-300'
        : 'text-white'
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function formatLoggedAt(iso: string, timezone: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return iso
  const p = toZonedParts(iso, timezone)
  const mm = String(p.month).padStart(2, '0')
  const dd = String(p.day).padStart(2, '0')
  const hh = String(p.hour).padStart(2, '0')
  const mi = String(p.minute).padStart(2, '0')
  return `${p.year}-${mm}-${dd} ${hh}:${mi}`
}
