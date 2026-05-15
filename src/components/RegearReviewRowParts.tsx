'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, Package, Swords } from 'lucide-react'
import {
  ANOMALY_SEVERITY,
  type RegearAnomalyFlag,
} from '@/lib/regear-anomaly'
import type { StockCheckResult } from '@/lib/inventory'
import { formatSilver } from '@/lib/silver'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'

export function StockSection({
  stockCheck,
  payoutSilver,
  onIssue,
  disabled,
}: {
  stockCheck: StockCheckResult
  payoutSilver: number
  onIssue: () => void
  disabled: boolean
}) {
  const t = useTranslations('adminRegearReview')
  const allSufficient = stockCheck.allSufficient
  return (
    <div
      className={`rounded-lg border px-3 py-2 space-y-2 ${
        allSufficient
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-gray-900/40 border-gray-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Package size={13} className={allSufficient ? 'text-emerald-300' : 'text-gray-400'} />
          <span className={allSufficient ? 'text-emerald-300' : 'text-gray-300'}>
            {t('stockSectionLabel')}
          </span>
          <span
            className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
              allSufficient
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            {allSufficient ? t('stockSufficient') : t('stockInsufficient')}
          </span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {stockCheck.perItem.map((p) => (
          <li
            key={p.itemId}
            className={`flex items-center gap-1 text-[11px] ${
              p.sufficient ? 'text-emerald-300/80' : 'text-rose-300'
            }`}
            title={t('stockItemRow', { required: p.required, available: p.available })}
          >
            <ItemImage itemId={p.itemId} itemName={null} size={28} hoverPreview />
            <span className="font-mono text-[10px]">
              {p.available}/{p.required}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onIssue}
          disabled={disabled || !allSufficient}
          className="flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 disabled:hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded"
          title={allSufficient ? t('issueFromStockTitle') : t('issueFromStockDisabledHint')}
        >
          <Package size={13} />
          {t('issueFromStockButton', { amount: formatSilver(payoutSilver) })}
        </button>
        {!allSufficient && (
          <span className="text-[10px] text-gray-500">{t('issueFromStockDisabledHint')}</span>
        )}
      </div>
    </div>
  )
}

// Frozen at request time so admins can verify in-game what the member actually
// wore — the live slot may have been re-assigned or edited since.
export function BuildSnapshotStrip({ snapshot }: { snapshot: BuildSnapshot }) {
  const t = useTranslations('adminRegearReview')
  const tGear = useTranslations('gear')
  const tRole = useTranslations('slotRole')
  return (
    <div className="space-y-1.5 border-t border-gray-800 pt-2.5">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Swords size={12} />
        <span className="font-semibold text-gray-300">{t('appliedBuild')}</span>
        {snapshot.role_name && (
          <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[11px] font-semibold">
            {translateSlotRole(snapshot.role_name, tRole)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {SLOT_KEYS.map((key: SlotKey) => {
          // 마이그 036 이전 스냅샷은 `mount` 키가 없다 — 누락된 슬롯은 건너뛴다.
          const item = snapshot[key]
          if (!item) return null
          return (
            <div key={key} className="flex flex-col items-center" title={tGear(key)}>
              <ItemImage itemId={item.id} itemName={item.name} size={36} hoverPreview />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ANOMALY_TONE: Record<'high' | 'medium' | 'low', { chip: string; label: string }> = {
  high: {
    chip: 'bg-red-500/20 text-red-300 border border-red-500/40',
    label: 'text-red-300',
  },
  medium: {
    chip: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
    label: 'text-amber-300',
  },
  low: {
    chip: 'bg-slate-700/50 text-slate-300 border border-slate-600',
    label: 'text-slate-300',
  },
}

export function AnomalyBanner({ flags }: { flags: RegearAnomalyFlag[] }) {
  const t = useTranslations('adminRegearAnomaly')
  // 가장 높은 severity 를 컨테이너 톤으로 사용. high > medium > low.
  const severities = flags.map((f) => ANOMALY_SEVERITY[f])
  const topSeverity: 'high' | 'medium' | 'low' = severities.includes('high')
    ? 'high'
    : severities.includes('medium')
      ? 'medium'
      : 'low'
  const tone = ANOMALY_TONE[topSeverity]
  return (
    <div
      className={`rounded-lg px-3 py-2 space-y-1 ${tone.chip}`}
      role="alert"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <AlertTriangle size={13} />
        <span>{t('bannerTitle')}</span>
      </div>
      <ul className="space-y-0.5">
        {flags.map((flag) => (
          <li key={flag} className={`text-[11px] ${tone.label}`}>
            · {t(`flag_${flag}_title`)}
            <span className="text-[10px] text-gray-400 ml-1">
              {t(`flag_${flag}_detail`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
