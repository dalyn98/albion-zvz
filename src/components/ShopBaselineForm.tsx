'use client'

// 길드 상자 재고 베이스라인 폼.
// 유저 플로우:
//   1. 인게임에서 모든 아이템을 출고 → 재입고
//   2. 15분 정도 기다려 로그 갱신
//   3. 이 페이지에서 로그 붙여넣기 → 미리보기 확인 → 확정

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  Loader2,
  Package,
  Shield,
} from 'lucide-react'
import {
  previewBaseline,
  confirmBaseline,
  type BaselinePreview,
  type BaselineItem,
} from '@/app/actions/shop-baseline'

const PLACEHOLDER = `인게임 "은행" 로그에서 복사한 텍스트를 붙여넣으세요. 예시:
"04/24/2026 10:15:12"\t"GuildMaster"\t"벼락의 사슬"\t"1"\t"3"\t"5"
"04/24/2026 10:15:08"\t"GuildMaster"\t"신도의 로브"\t"0"\t"1"\t"20"
`

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  if (mins === 0) return `${secs}초`
  return `${mins}분 ${secs}초`
}

export default function ShopBaselineForm() {
  const router = useRouter()
  const [raw, setRaw] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<BaselinePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runPreview = async () => {
    if (!raw.trim()) return
    setPreviewing(true)
    setError(null)
    setConfirmResult(null)
    try {
      const result = await previewBaseline(raw)
      if (result.error) {
        setError(result.error)
        setPreview(null)
        return
      }
      setPreview(result)
    } finally {
      setPreviewing(false)
    }
  }

  const runConfirm = async () => {
    if (!preview || !confirm(
      `정말 이 스냅샷으로 상자 재고를 재설정할까요?\n\n- 아이템 종류: ${preview.items.length}개\n- 총 수량: ${preview.totalItems.toLocaleString('ko-KR')}개\n\n이전 재고 데이터는 덮어써지고 복구할 수 없습니다.`,
    )) {
      return
    }
    setConfirming(true)
    setError(null)
    try {
      const result = await confirmBaseline({
        raw,
        notes: notes.trim() || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setConfirmResult(
        `베이스라인 저장 완료. ${result.appliedItems}종 / ${result.totalItems.toLocaleString('ko-KR')}개 재고 확정.`,
      )
      setRaw('')
      setNotes('')
      setPreview(null)
      router.refresh()
    } finally {
      setConfirming(false)
    }
  }

  const reset = () => {
    setRaw('')
    setNotes('')
    setPreview(null)
    setError(null)
    setConfirmResult(null)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-2 text-sm text-amber-200">
          <Shield size={16} className="mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">베이스라인이란?</div>
            <ol className="list-decimal space-y-1 pl-5 text-amber-100/90">
              <li>
                인게임 길드 상자에서 <strong>모든 아이템을 출고</strong> → <strong>그대로 재입고</strong>
              </li>
              <li>약 15분 기다려 게임 내 로그가 갱신되는지 확인 (로그에 내 입고가 보일 때까지)</li>
              <li>은행 로그 전체를 복사 → 아래에 붙여넣기 → 미리보기 확인 → 확정</li>
            </ol>
            <div className="mt-2 text-xs text-amber-100/70">
              혼자 작업할 때 정확도가 높습니다. 작업 중 다른 길드원이 상자를 건드리면 경고가 표시됩니다.
            </div>
          </div>
        </div>
      </div>

      {preview?.currentBaseline && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock size={14} />
            현재 베이스라인: {fmtDate(preview.currentBaseline.confirmedAt)} · 총 {preview.currentBaseline.totalItems.toLocaleString('ko-KR')}개
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            새 베이스라인을 확정하면 기존 것은 superseded 처리되고 상자 재고가 다시 계산됩니다.
          </div>
        </div>
      )}

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={10}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={previewing || !raw.trim()}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileText size={14} />
          )}
          미리보기
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={previewing || confirming}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
        >
          초기화
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {confirmResult && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <div className="flex items-center gap-2">
            <Check size={14} />
            {confirmResult}
          </div>
        </div>
      )}

      {preview && !confirmResult && <PreviewPanel preview={preview} />}

      {preview && !confirmResult && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <label className="block text-sm text-zinc-300">
            메모 (선택)
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: 2026-04-24 정기 재고 정리"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={runConfirm}
            disabled={confirming || preview.items.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            이 스냅샷으로 재고 확정
          </button>
        </div>
      )}
    </div>
  )
}

function PreviewPanel({ preview }: { preview: BaselinePreview }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      {preview.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={14} />
            경고
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-yellow-100/90">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <MetricCard icon={<Package size={14} />} label="아이템 종류" value={`${preview.items.length}종`} />
        <MetricCard icon={<Package size={14} />} label="총 수량" value={preview.totalItems.toLocaleString('ko-KR')} />
        <MetricCard icon={<Clock size={14} />} label="입고 이벤트" value={`${preview.totalEvents}건`} />
        <MetricCard
          icon={<Clock size={14} />}
          label="창 길이"
          value={fmtDuration(preview.baselineStart, preview.baselineAt)}
        />
      </div>

      <div className="rounded-md bg-zinc-950 p-3 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">첫 입고:</span> {fmtDate(preview.firstEvent?.at ?? null)} · {preview.firstEvent?.player} ·{' '}
          <span className="text-zinc-200">{preview.firstEvent?.itemName}</span> +{preview.firstEvent?.quantity}
        </div>
        <div>
          <span className="text-zinc-500">마지막 입고:</span> {fmtDate(preview.lastEvent?.at ?? null)} · {preview.lastEvent?.player} ·{' '}
          <span className="text-zinc-200">{preview.lastEvent?.itemName}</span> +{preview.lastEvent?.quantity}
        </div>
        {preview.depositors.length > 0 && (
          <div>
            <span className="text-zinc-500">입고자:</span> {preview.depositors.join(', ')}
          </div>
        )}
      </div>

      <ItemsTable items={preview.items} />

      {preview.unresolvedNames.length > 0 && (
        <div className="rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs">
          <div className="text-zinc-400 mb-1">매핑되지 않아 제외된 아이템 ({preview.unresolvedNames.length}종):</div>
          <div className="text-zinc-500">{preview.unresolvedNames.join(', ')}</div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950 p-2">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function ItemsTable({ items }: { items: BaselineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-950 p-4 text-center text-sm text-zinc-500">
        집계된 아이템이 없습니다.
      </div>
    )
  }
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
          <tr>
            <th className="p-2 text-left">아이템</th>
            <th className="p-2 text-center">E</th>
            <th className="p-2 text-center">Q</th>
            <th className="p-2 text-right">수량</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.uniqueName}|${item.enchant}|${item.quality}`}
              className="border-t border-zinc-800 text-zinc-200"
            >
              <td className="p-2">
                <div>{item.nameKo}</div>
                <div className="text-[10px] text-zinc-600">{item.uniqueName}</div>
              </td>
              <td className="p-2 text-center">{item.enchant}</td>
              <td className="p-2 text-center">{item.quality}</td>
              <td className="p-2 text-right font-mono">{item.quantity.toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
