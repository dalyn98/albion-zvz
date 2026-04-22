'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import {
  importChestLog,
  addBlacklist,
  type ImportSummary,
} from '@/app/actions/shop-admin'

// 6시간 이상 import 공백 = 인게임 로그 페이지 범람으로 유실될 가능성.
// 관리자에게 경고만 띄우고 차단하지는 않음.
const STALENESS_HOURS = 6

const PLACEHOLDER = `예시:
"04/21/2026 15:59:10"\t"SoonSem"\t"페기물"\t"0"\t"1"\t"-1"
"04/21/2026 13:42:13"\t"WarGloves"\t"스위프트클로"\t"1"\t"2"\t"1"
`

interface RunningTotals {
  batches: number
  parsed: number
  inserted: number
  duplicatesSkipped: number
  blacklistedRows: number
  unresolvedRows: number
  unresolvedNames: string[]
  errors: string[]
}

function emptyTotals(): RunningTotals {
  return {
    batches: 0,
    parsed: 0,
    inserted: 0,
    duplicatesSkipped: 0,
    blacklistedRows: 0,
    unresolvedRows: 0,
    unresolvedNames: [],
    errors: [],
  }
}

function accumulate(prev: RunningTotals, s: ImportSummary): RunningTotals {
  return {
    batches: prev.batches + 1,
    parsed: prev.parsed + s.parsed,
    inserted: prev.inserted + s.inserted,
    duplicatesSkipped: prev.duplicatesSkipped + s.duplicatesSkipped,
    blacklistedRows: prev.blacklistedRows + s.blacklistedRows,
    unresolvedRows: prev.unresolvedRows + s.unresolvedRows,
    unresolvedNames: Array.from(
      new Set([...prev.unresolvedNames, ...s.unresolvedNames]),
    ),
    errors: s.error ? [...prev.errors, s.error] : prev.errors,
  }
}

interface Props {
  lastImportAt: string | null
}

export default function ShopImportForm({ lastImportAt }: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [queue, setQueue] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [totals, setTotals] = useState<RunningTotals>(emptyTotals())
  const [autoSubmit, setAutoSubmit] = useState(true)
  const [blacklistingName, setBlacklistingName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // 큐를 직렬 처리 — 동시에 두 배치가 DB 에 insert 하면 apply_shop_stock_delta
  // RPC 경쟁으로 재고 수치가 순간적으로 튈 수 있어서 하나씩 순차 처리.
  useEffect(() => {
    if (processing || queue.length === 0) return
    const first = queue[0]
    setProcessing(true)
    setQueue((q) => q.slice(1))
    void (async () => {
      try {
        const result = await importChestLog(first)
        setSummary(result)
        setTotals((prev) => accumulate(prev, result))
        if (!result.error) router.refresh()
      } finally {
        setProcessing(false)
      }
    })()
  }, [queue, processing, router])

  const enqueue = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setQueue((q) => [...q, trimmed])
  }, [])

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!autoSubmit) return
    const clip = e.clipboardData.getData('text/plain')
    if (!clip.trim()) return
    // textarea 에 내용이 누적되지 않게 preventDefault + 큐에만 적재.
    e.preventDefault()
    setText('')
    enqueue(clip)
  }

  const handleManualSubmit = () => {
    if (!text.trim()) return
    const raw = text
    setText('')
    enqueue(raw)
  }

  const handleBlacklist = async (name: string) => {
    setBlacklistingName(name)
    try {
      await addBlacklist(name)
      setTotals((prev) => ({
        ...prev,
        unresolvedNames: prev.unresolvedNames.filter((n) => n !== name),
      }))
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              unresolvedNames: prev.unresolvedNames.filter((n) => n !== name),
            }
          : prev,
      )
      router.refresh()
    } finally {
      setBlacklistingName(null)
    }
  }

  const handleFile = async (file: File) => {
    try {
      const content = await file.text()
      enqueue(content)
    } catch {
      setSummary({
        parsed: 0,
        parseErrors: [],
        inserted: 0,
        duplicatesSkipped: 0,
        blacklistedRows: 0,
        unresolvedRows: 0,
        unresolvedNames: [],
        stockChanges: [],
        error: '파일 읽기 실패 — .txt 또는 .rtf 를 드롭하세요.',
      })
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

  const handleReset = () => {
    setText('')
    setSummary(null)
    setTotals(emptyTotals())
  }

  const isBusy = processing || queue.length > 0
  const showManualButton = !autoSubmit

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">로그 임포트</h2>
            <p className="text-gray-500 text-xs mt-1">
              인게임 "은행" 로그 복사 → 아래 창에 Ctrl+V (자동 제출) 또는 .txt/.rtf
              파일 드래그.
            </p>
          </div>
          <LastImportBadge iso={lastImportAt} />
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
            placeholder={
              autoSubmit
                ? '여기에 붙여넣기 (Ctrl+V) 또는 파일 드래그 → 자동 제출'
                : PLACEHOLDER
            }
          />
          {isBusy && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-gray-900/70 rounded-lg">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                <Loader2 size={14} className="animate-spin" />
                처리 중{queue.length > 0 ? ` (대기 ${queue.length})` : '…'}
              </div>
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-amber-500/10 rounded-lg">
              <p className="text-amber-300 text-sm font-semibold">파일 드롭</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              className="accent-amber-500"
            />
            붙여넣기 시 자동 제출
          </label>
          {showManualButton && (
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={isBusy || !text.trim()}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-1.5 rounded-lg transition-colors text-xs"
            >
              <Upload size={12} />
              반영
            </button>
          )}
          {(totals.batches > 0 || text) && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isBusy}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:text-gray-700"
            >
              누계 초기화
            </button>
          )}
        </div>
      </div>

      {totals.batches > 0 && (
        <RunningTotalsCard
          totals={totals}
          onBlacklist={handleBlacklist}
          blacklistingName={blacklistingName}
          busy={isBusy}
        />
      )}

      {summary && <LastBatchDetails summary={summary} />}
    </div>
  )
}

function LastImportBadge({ iso }: { iso: string | null }) {
  // hydration mismatch 방지 — 상대시간 계산은 mount 후에만.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!iso) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
        <Clock size={11} />
        <span>import 기록 없음</span>
      </div>
    )
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
        <Clock size={11} />
        <span>—</span>
      </div>
    )
  }

  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000
  const stale = ageH > STALENESS_HOURS
  const color = stale ? 'text-amber-400' : 'text-gray-400'

  return (
    <div className={`flex items-center gap-1 text-[11px] shrink-0 ${color}`}>
      <Clock size={11} />
      <span>
        마지막 {relTime(iso)}
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
  totals: RunningTotals
  onBlacklist: (name: string) => void
  blacklistingName: string | null
  busy: boolean
}) {
  return (
    <div className="space-y-3">
      {totals.errors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 space-y-1.5">
          {totals.errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-xs">{err}</p>
            </div>
          ))}
        </div>
      )}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Check size={16} className="text-emerald-400" />
          <h3 className="font-bold text-white">누계 · {totals.batches} 배치</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCell label="파싱" value={totals.parsed} />
          <StatCell label="신규 적재" value={totals.inserted} accent="emerald" />
          <StatCell label="중복 스킵" value={totals.duplicatesSkipped} />
          <StatCell label="블랙리스트" value={totals.blacklistedRows} />
          <StatCell
            label="미해결"
            value={totals.unresolvedRows}
            accent={totals.unresolvedRows > 0 ? 'amber' : undefined}
          />
        </div>
      </div>

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

function LastBatchDetails({ summary }: { summary: ImportSummary }) {
  const hasParseErrors = summary.parseErrors.length > 0
  const hasStock = summary.stockChanges.length > 0
  const hasPrice = !!summary.priceSync
  if (!hasParseErrors && !hasStock && !hasPrice) return null

  return (
    <div className="space-y-3">
      {hasParseErrors && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 text-xs text-gray-400 space-y-1">
          <p className="font-semibold text-gray-300">
            마지막 배치 파싱 실패 {summary.parseErrors.length}행
          </p>
          {summary.parseErrors.slice(0, 3).map((e) => (
            <p key={e.line} className="font-mono truncate">
              #{e.line} {e.text}
            </p>
          ))}
          {summary.parseErrors.length > 3 && (
            <p className="text-gray-500">
              ... 외 {summary.parseErrors.length - 3}건
            </p>
          )}
        </div>
      )}

      {hasPrice && summary.priceSync && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-amber-400" />
            <h3 className="font-bold text-white">시세 갱신 (AODP)</h3>
          </div>
          {summary.priceSync.error ? (
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
              <p className="text-red-300 text-xs">{summary.priceSync.error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <StatCell label="요청" value={summary.priceSync.requested} />
              <StatCell
                label="갱신"
                value={summary.priceSync.updated}
                accent="emerald"
              />
              <StatCell
                label="시세 없음"
                value={summary.priceSync.missing}
                accent={summary.priceSync.missing > 0 ? 'amber' : undefined}
              />
            </div>
          )}
        </div>
      )}

      {hasStock && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-emerald-400" />
            <h3 className="font-bold text-white">
              재고 변동 · 마지막 배치 ({summary.stockChanges.length}개)
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
                  <th className="text-right font-normal pb-2 w-20">재고</th>
                </tr>
              </thead>
              <tbody>
                {summary.stockChanges.slice(0, 50).map((c) => (
                  <tr
                    key={`${c.uniqueName}|${c.enchant}|${c.quality}`}
                    className="border-b border-gray-800/50"
                  >
                    <td className="py-1.5 text-gray-200 text-xs">{c.nameKo}</td>
                    <td className="py-1.5 text-gray-500 text-center text-xs">
                      {c.enchant}
                    </td>
                    <td className="py-1.5 text-gray-500 text-center text-xs">
                      {c.quality}
                    </td>
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
            {summary.stockChanges.length > 50 && (
              <p className="text-xs text-gray-500 mt-2">
                ... 외 {summary.stockChanges.length - 50}개 아이템
              </p>
            )}
          </div>
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

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.max(0, Math.round(diffMs / 60000))
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}시간 전`
  const diffD = Math.round(diffH / 24)
  return `${diffD}일 전`
}
