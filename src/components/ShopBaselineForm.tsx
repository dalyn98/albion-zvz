'use client'

// 길드 상자 재고 베이스라인 폼.
// 유저 플로우:
//   1. 인게임에서 모든 아이템을 출고 → 재입고
//   2. 15분 정도 기다려 로그 갱신
//   3. 이 페이지에서 로그 붙여넣기 → 미리보기 확인 → 확정

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
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
  type DriftReport,
} from '@/app/actions/shop-baseline'
import { formatDateTimeWithSeconds } from '@/lib/format-datetime'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import { useReportDirty } from './UnsavedChangesProvider'

function fmtDate(iso: string | null, timezone: string): string {
  if (!iso) return '—'
  return formatDateTimeWithSeconds(iso, timezone)
}

function useFmtDuration() {
  const t = useTranslations('shopBaselineForm')
  return (startIso: string | null, endIso: string | null): string => {
    if (!startIso || !endIso) return '—'
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
    const mins = Math.floor(ms / 60_000)
    const secs = Math.floor((ms % 60_000) / 1000)
    if (mins === 0) return t('durationSec', { s: secs })
    return t('durationMinSec', { m: mins, s: secs })
  }
}

interface ShopBaselineFormProps {
  timezone: string
}

export default function ShopBaselineForm({ timezone }: ShopBaselineFormProps) {
  const router = useRouter()
  const t = useTranslations('shopBaselineForm')
  const [raw, setRaw] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<BaselinePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<string | null>(null)
  const [confirmDrift, setConfirmDrift] = useState<DriftReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // raw 로그 또는 notes 가 입력돼 있고 아직 확정 결과가 없으면 작성 중.
  useReportDirty(
    'shop-baseline',
    !confirmResult && (raw.trim() !== '' || notes.trim() !== ''),
  )

  const runPreview = async () => {
    if (!raw.trim()) return
    setPreviewing(true)
    setError(null)
    setConfirmResult(null)
    setConfirmDrift(null)
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
    if (
      !preview ||
      !confirm(
        t('confirmDialog', {
          types: preview.items.length,
          total: preview.totalItems.toLocaleString(),
        }),
      )
    ) {
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
        t('confirmResult', {
          applied: result.appliedItems,
          total: result.totalItems.toLocaleString(),
        }),
      )
      setConfirmDrift(result.driftReport)
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
    setConfirmDrift(null)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-2 text-sm text-amber-200">
          <Shield size={16} className="mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">{t('infoTitle')}</div>
            <ol className="list-decimal space-y-1 pl-5 text-amber-100/90">
              <li>
                {t.rich('infoStep1', {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </li>
              <li>{t('infoStep2')}</li>
              <li>{t('infoStep3')}</li>
            </ol>
            <div className="mt-2 text-xs text-amber-100/70">
              {t('infoFootnote')}
            </div>
          </div>
        </div>
      </div>

      {preview?.currentBaseline && (
        <CurrentBaselineCard
          confirmedAt={preview.currentBaseline.confirmedAt}
          totalItems={preview.currentBaseline.totalItems}
          timezone={timezone}
        />
      )}

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t('placeholder')}
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
          {t('previewButton')}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={previewing || confirming}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
        >
          {t('resetButton')}
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

      {confirmDrift && <DriftPanel drift={confirmDrift} />}

      {preview && !confirmResult && <PreviewPanel preview={preview} timezone={timezone} />}

      {preview && !confirmResult && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <label className="block text-sm text-zinc-300">
            {t('notesLabel')}
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
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
            {t('confirmButton')}
          </button>
        </div>
      )}
    </div>
  )
}

function CurrentBaselineCard({
  confirmedAt,
  totalItems,
  timezone,
}: {
  confirmedAt: string | null
  totalItems: number
  timezone: string
}) {
  const t = useTranslations('shopBaselineForm')
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
      <div className="flex items-center gap-2 text-zinc-300">
        <Clock size={14} />
        {t('currentBaselineLine', {
          at: fmtDate(confirmedAt, timezone),
          total: totalItems.toLocaleString(),
        })}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{t('currentBaselineHint')}</div>
    </div>
  )
}

function PreviewPanel({
  preview,
  timezone,
}: {
  preview: BaselinePreview
  timezone: string
}) {
  const t = useTranslations('shopBaselineForm')
  const fmtDuration = useFmtDuration()
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      {preview.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={14} />
            {t('warningsTitle')}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-yellow-100/90">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <MetricCard
          icon={<Package size={14} />}
          label={t('metricItemTypes')}
          value={t('typesValue', { count: preview.items.length })}
        />
        <MetricCard
          icon={<Package size={14} />}
          label={t('metricTotalQty')}
          value={preview.totalItems.toLocaleString()}
        />
        <MetricCard
          icon={<Clock size={14} />}
          label={t('metricEvents')}
          value={t('eventsValue', { count: preview.totalEvents })}
        />
        <MetricCard
          icon={<Clock size={14} />}
          label={t('metricWindow')}
          value={fmtDuration(preview.baselineStart, preview.baselineAt)}
        />
      </div>

      <div className="rounded-md bg-zinc-950 p-3 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">{t('firstDeposit')}</span>{' '}
          {fmtDate(preview.firstEvent?.at ?? null, timezone)} · {preview.firstEvent?.player} ·{' '}
          <span className="text-zinc-200">{preview.firstEvent?.itemName}</span> +{preview.firstEvent?.quantity}
        </div>
        <div>
          <span className="text-zinc-500">{t('lastDeposit')}</span>{' '}
          {fmtDate(preview.lastEvent?.at ?? null, timezone)} · {preview.lastEvent?.player} ·{' '}
          <span className="text-zinc-200">{preview.lastEvent?.itemName}</span> +{preview.lastEvent?.quantity}
        </div>
        {preview.depositors.length > 0 && (
          <div>
            <span className="text-zinc-500">{t('depositors')}</span> {preview.depositors.join(', ')}
          </div>
        )}
      </div>

      <ItemsTable items={preview.items} />

      {preview.unresolvedNames.length > 0 && (
        <div className="rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs">
          <div className="text-zinc-400 mb-1">
            {t('unresolvedTitle', { count: preview.unresolvedNames.length })}
          </div>
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

function DriftPanel({ drift }: { drift: DriftReport }) {
  const t = useTranslations('shopBaselineForm')
  const locale = useLocale() as Locale
  const deltaTotal = drift.afterTotal - drift.beforeTotal
  const sign = deltaTotal > 0 ? '+' : deltaTotal < 0 ? '' : '±'
  const tone =
    drift.changedItems === 0
      ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
      : deltaTotal >= 0
        ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-100'
        : 'border-rose-500/40 bg-rose-500/5 text-rose-100'
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={14} />
        {t('driftTitle')}
        <span className="text-xs font-normal opacity-70">{t('driftSubtitle')}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <DriftStat label={t('driftChanged')} value={t('typesValue', { count: drift.changedItems })} />
        <DriftStat label={t('driftRestored')} value={t('typesValue', { count: drift.restored })} accent="emerald" />
        <DriftStat label={t('driftCleared')} value={t('typesValue', { count: drift.cleared })} accent="rose" />
        <DriftStat label={t('driftIncreased')} value={t('typesValue', { count: drift.increased })} />
        <DriftStat label={t('driftDecreased')} value={t('typesValue', { count: drift.decreased })} />
      </div>

      <div className="rounded-md bg-black/30 p-2 text-xs">
        <span className="opacity-70">{t('driftTotalLabel')}</span>{' '}
        <span className="font-mono">
          {drift.beforeTotal.toLocaleString()} → {drift.afterTotal.toLocaleString()}
        </span>{' '}
        <span className="font-mono">
          ({sign}
          {deltaTotal.toLocaleString()})
        </span>
      </div>

      {drift.topChanges.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border border-zinc-800 bg-zinc-950">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr>
                <th className="p-2 text-left">{t('colItem')}</th>
                <th className="p-2 text-center">E</th>
                <th className="p-2 text-center">Q</th>
                <th className="p-2 text-right">{t('colBefore')}</th>
                <th className="p-2 text-right">{t('colAfter')}</th>
                <th className="p-2 text-right">{t('colDelta')}</th>
              </tr>
            </thead>
            <tbody>
              {drift.topChanges.map((c) => {
                const displayName =
                  getLocalizedItemName(c.uniqueName, locale, c.nameKo ?? c.uniqueName) ??
                  c.nameKo ??
                  c.uniqueName
                return (
                <tr
                  key={`${c.uniqueName}|${c.enchant}|${c.quality}`}
                  className="border-t border-zinc-800 text-zinc-200"
                >
                  <td className="p-2">
                    <div>{displayName}</div>
                    <div className="text-[10px] text-zinc-600">{c.uniqueName}</div>
                  </td>
                  <td className="p-2 text-center">{c.enchant}</td>
                  <td className="p-2 text-center">{c.quality}</td>
                  <td className="p-2 text-right font-mono text-zinc-400">
                    {c.beforeStock.toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {c.afterStock.toLocaleString()}
                  </td>
                  <td
                    className={`p-2 text-right font-mono ${
                      c.delta > 0 ? 'text-emerald-300' : c.delta < 0 ? 'text-rose-300' : ''
                    }`}
                  >
                    {c.delta > 0 ? '+' : ''}
                    {c.delta.toLocaleString()}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DriftStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'rose'
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-200'
      : accent === 'rose'
        ? 'text-rose-200'
        : 'text-zinc-100'
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  )
}

function ItemsTable({ items }: { items: BaselineItem[] }) {
  const t = useTranslations('shopBaselineForm')
  const locale = useLocale() as Locale
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-950 p-4 text-center text-sm text-zinc-500">
        {t('emptyItems')}
      </div>
    )
  }
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
          <tr>
            <th className="p-2 text-left">{t('colItem')}</th>
            <th className="p-2 text-center">E</th>
            <th className="p-2 text-center">Q</th>
            <th className="p-2 text-right">{t('colQty')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const displayName =
              getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
            return (
              <tr
                key={`${item.uniqueName}|${item.enchant}|${item.quality}`}
                className="border-t border-zinc-800 text-zinc-200"
              >
                <td className="p-2">
                  <div>{displayName}</div>
                  <div className="text-[10px] text-zinc-600">{item.uniqueName}</div>
                </td>
                <td className="p-2 text-center">{item.enchant}</td>
                <td className="p-2 text-center">{item.quality}</td>
                <td className="p-2 text-right font-mono">{item.quantity.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
