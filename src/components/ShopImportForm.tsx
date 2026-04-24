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
import {
  Upload,
  Check,
  AlertCircle,
  Loader2,
  Ban,
  Package,
  Coins,
  Clock,
  Trash2,
  Info,
} from 'lucide-react'
import {
  importChestLog,
  addBlacklist,
  type ImportSummary,
} from '@/app/actions/shop-admin'

const PLACEHOLDER = `예시:
"04/21/2026 15:59:10"\t"SoonSem"\t"페기물"\t"0"\t"1"\t"-1"
"04/21/2026 13:42:13"\t"WarGloves"\t"스위프트클로"\t"1"\t"2"\t"1"
`

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
  // 서버가 요청 시점 기준으로 계산한 stale 여부. 클라에서 Date.now() 를
  // render 시 호출하면 react-compiler purity 룰 위반 — 그래서 prop 으로 받음.
  isImportStale: boolean
}

export default function ShopImportForm({ lastImportAt, isImportStale }: Props) {
  const router = useRouter()
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
      setPreviewError('파일 읽기 실패 — .txt 또는 .rtf 를 드롭하세요.')
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
            <h2 className="font-bold text-white">로그 임포트</h2>
            <p className="text-gray-500 text-xs mt-1">
              인게임 &quot;은행&quot; 로그 복사 → 아래 창에 Ctrl+V 또는 .txt/.rtf
              파일 드래그. 붙여넣기만으로는 저장되지 않고 미리보기만 누적됩니다.
              아래 &quot;저장&quot; 버튼을 눌러야 실제 재고/공개 상점에 반영돼요.
            </p>
          </div>
          <LastImportBadge iso={lastImportAt} stale={isImportStale} />
        </div>

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
            placeholder={PLACEHOLDER}
          />
          {previewing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-gray-900/70 rounded-lg">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                <Loader2 size={14} className="animate-spin" />
                미리보기 중…
              </div>
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-amber-500/10 rounded-lg">
              <p className="text-amber-300 text-sm font-semibold">파일 드롭</p>
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
            직접 입력 미리보기
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
            저장 {batches.length > 0 && `(${batches.length}배치 · 신규 ${totals.newEntries}건)`}
          </button>
          {batches.length > 0 && (
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={isBusy}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-rose-300 disabled:text-gray-700"
            >
              <Trash2 size={12} />
              전부 버리기
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
            <p className="text-red-300 text-xs">저장 실패: {commitError}</p>
          </div>
        )}
      </div>

      {latestBatch && <StagingStatusCard preview={latestBatch.preview} />}

      {batches.length > 0 && (
        <StagedBatchesCard batches={batches} onDiscard={handleDiscardBatch} />
      )}

      {batches.length > 0 && (
        <RunningTotalsCard
          totals={totals}
          onBlacklist={handleBlacklist}
          blacklistingName={blacklistingName}
          busy={isBusy}
        />
      )}

      {batches.length > 0 && stockChanges.length > 0 && (
        <StockPreviewCard stockChanges={stockChanges} />
      )}

      {commitResult && <CommitResultCard summary={commitResult} />}
    </div>
  )
}

interface Totals {
  batches: number
  parsed: number
  newEntries: number
  duplicatesSkipped: number
  blacklistedRows: number
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
    blacklistedRows: 0,
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
    acc.blacklistedRows += p.blacklistedRows
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

function StagingStatusCard({ preview }: { preview: ImportSummary }) {
  const {
    lastKnownLoggedAt,
    lastKnownLabel,
    lastKnownInBatch,
    newEntriesAfterLast,
    gapFromLastKnownMs,
  } = preview

  // tone 은 최종 본문을 쓸 때 다시 덮어씀. 초기값은 '이전 기록 없음' 케이스 기준.
  let tone: 'ok' | 'warn' | 'danger' | 'info' = 'info'
  let title = ''
  let body = ''
  let gapBody: string | null = null

  const GAP_DANGER_MS = 24 * 60 * 60 * 1000
  const GAP_WARN_MS = 6 * 60 * 60 * 1000

  if (!lastKnownLoggedAt) {
    tone = 'info'
    title = '이전 기록 없음'
    body = `DB 가 비어있습니다. 이 배치의 신규 ${newEntriesAfterLast}건이 첫 기록으로 저장됩니다.`
  } else {
    const when = formatLoggedAt(lastKnownLoggedAt)
    const tail = lastKnownLabel ? ` · ${lastKnownLabel}` : ''
    if (newEntriesAfterLast === 0 && lastKnownInBatch) {
      tone = 'ok'
      title = '마지막 로그까지 이어짐'
      body = `DB 마지막 기록 ${when}${tail} 이 이 배치에 포함돼 있고 신규 entry 는 없습니다. 저장할 새 로그가 없어요.`
    } else if (newEntriesAfterLast === 0 && !lastKnownInBatch) {
      tone = 'warn'
      title = '이미 지난 로그로 보입니다'
      body = `DB 마지막 기록 ${when}${tail} 과 이 배치가 겹치지 않고 신규 entry 도 없어요. 붙여넣은 범위가 DB 최신 시점 이전 구간일 수 있습니다.`
    } else if (newEntriesAfterLast > 0 && lastKnownInBatch) {
      tone = 'ok'
      title = '마지막 로그에 이어지는 신규 감지'
      body = `DB 마지막 기록 ${when}${tail} 이후로 신규 ${newEntriesAfterLast}건. 저장할 준비가 됐습니다.`
    } else {
      // newEntriesAfterLast > 0 && !lastKnownInBatch — gap 이 있다.
      const gapLabel = formatGap(gapFromLastKnownMs)
      if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_DANGER_MS) {
        tone = 'danger'
        title = `로그 공백 ${gapLabel} 감지 (누락 가능성 높음)`
        body = `DB 마지막 기록 ${when}${tail} 이후 ${gapLabel} 동안의 로그가 이 배치에 없습니다. 인게임 로그가 잘리기 전에 중간 구간을 놓쳤을 가능성이 큽니다 — 베이스라인 재설정을 고려하세요.`
      } else if (gapFromLastKnownMs !== null && gapFromLastKnownMs >= GAP_WARN_MS) {
        tone = 'warn'
        title = `로그 공백 ${gapLabel} 감지`
        body = `DB 마지막 기록 ${when}${tail} 이후 ${gapLabel} 동안의 로그가 이 배치에 없어요. 사이 구간에 입출고가 있었다면 재고와 실제가 어긋납니다.`
      } else {
        tone = 'warn'
        title = '마지막 로그와 겹치지 않음 (누락 가능)'
        body = `DB 마지막 기록 ${when}${tail} 과 겹치는 행이 이 배치에 없습니다.${gapLabel ? ` 공백 ${gapLabel}.` : ''} 그 사이 로그가 누락됐을 수 있어요.`
      }
      gapBody = `저장하면 신규 ${newEntriesAfterLast}건이 추가됩니다.`
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

function formatGap(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 ${mins % 60}분`
  const days = Math.floor(hours / 24)
  return `${days}일 ${hours % 24}시간`
}

function StagedBatchesCard({
  batches,
  onDiscard,
}: {
  batches: StagedBatch[]
  onDiscard: (id: string) => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-white">대기 중인 배치 ({batches.length})</h3>
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
                  파싱 {p.parsed} · 신규 {p.newEntriesAfterLast} · 중복 {p.duplicatesSkipped}
                  {p.unresolvedRows > 0 && (
                    <span className="text-amber-300"> · 미해결 {p.unresolvedRows}</span>
                  )}
                </span>
                <span className="text-gray-500">{formatLoggedAt(b.pastedAtIso)}</span>
              </div>
              <button
                type="button"
                onClick={() => onDiscard(b.id)}
                className="text-gray-500 hover:text-rose-300 transition-colors"
                title="이 배치 버리기"
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

function LastImportBadge({ iso, stale }: { iso: string | null; stale: boolean }) {
  if (!iso) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
        <Clock size={11} />
        <span>import 기록 없음</span>
      </div>
    )
  }
  const color = stale ? 'text-amber-400' : 'text-gray-400'
  return (
    <div className={`flex items-center gap-1 text-[11px] shrink-0 ${color}`}>
      <Clock size={11} />
      <span>
        마지막 저장 {formatLoggedAt(iso)}
        {stale && <span className="ml-1">· 오래됨</span>}
      </span>
    </div>
  )
}

function RunningTotalsCard({
  totals,
  onBlacklist,
  blacklistingName,
  busy,
}: {
  totals: Totals
  onBlacklist: (name: string) => void
  blacklistingName: string | null
  busy: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Check size={16} className="text-emerald-400" />
          <h3 className="font-bold text-white">누계 (저장 전)</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCell label="파싱" value={totals.parsed} />
          <StatCell
            label="신규 예상"
            value={totals.newEntries}
            accent="emerald"
          />
          <StatCell label="중복 스킵" value={totals.duplicatesSkipped} />
          <StatCell label="블랙리스트" value={totals.blacklistedRows} />
          <StatCell
            label="미해결"
            value={totals.unresolvedRows}
            accent={totals.unresolvedRows > 0 ? 'amber' : undefined}
          />
        </div>
      </div>

      {totals.parseErrors.length > 0 && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 text-xs text-gray-400 space-y-1">
          <p className="font-semibold text-gray-300">
            파싱 실패 {totals.parseErrors.length}행
          </p>
          {totals.parseErrors.slice(0, 3).map((e, i) => (
            <p key={`${e.line}-${i}`} className="font-mono truncate">
              #{e.line} {e.text}
            </p>
          ))}
          {totals.parseErrors.length > 3 && (
            <p className="text-gray-500">
              ... 외 {totals.parseErrors.length - 3}건
            </p>
          )}
        </div>
      )}

      {totals.unresolvedNames.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400" />
            <h3 className="font-bold text-white">
              미해결 아이템 ({totals.unresolvedNames.length}개)
            </h3>
          </div>
          <p className="text-gray-400 text-xs">
            번들 사전에서 한글명 매칭에 실패했습니다. 잡템이면 블랙리스트에 추가하세요.
          </p>
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
                  title="블랙리스트에 추가"
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

function StockPreviewCard({ stockChanges }: { stockChanges: AggregatedStockChange[] }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-emerald-400" />
        <h3 className="font-bold text-white">
          예상 재고 변동 · 저장 시 반영 ({stockChanges.length}개)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left font-normal pb-2">아이템</th>
              <th className="text-center font-normal pb-2 w-16">@</th>
              <th className="text-center font-normal pb-2 w-16">Q</th>
              <th className="text-right font-normal pb-2 w-20">변동</th>
              <th className="text-right font-normal pb-2 w-24">적용 후</th>
            </tr>
          </thead>
          <tbody>
            {stockChanges.slice(0, 50).map((c) => (
              <tr
                key={`${c.uniqueName}|${c.enchant}|${c.quality}`}
                className="border-b border-gray-800/50"
              >
                <td className="py-1.5 text-gray-200 text-xs">{c.nameKo}</td>
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
            ))}
          </tbody>
        </table>
        {stockChanges.length > 50 && (
          <p className="text-xs text-gray-500 mt-2">
            ... 외 {stockChanges.length - 50}개 아이템
          </p>
        )}
      </div>
    </div>
  )
}

function CommitResultCard({ summary }: { summary: ImportSummary }) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Check size={16} className="text-emerald-400" />
        <h3 className="font-bold text-white">저장 완료</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="신규 저장" value={summary.inserted} accent="emerald" />
        <StatCell label="중복 스킵" value={summary.duplicatesSkipped} />
        <StatCell label="재고 변동" value={summary.stockChanges.length} />
        <StatCell
          label="시세 갱신"
          value={summary.priceSync?.updated ?? 0}
          accent={summary.priceSync && summary.priceSync.missing > 0 ? 'amber' : undefined}
        />
      </div>
      {summary.priceSync && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Coins size={12} />
          <span>
            AODP: 요청 {summary.priceSync.requested} · 갱신 {summary.priceSync.updated} · 시세 없음{' '}
            {summary.priceSync.missing}
          </span>
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

function formatLoggedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
