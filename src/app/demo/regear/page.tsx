import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Inbox, ArrowRight, ShieldCheck, XCircle, Sparkles } from 'lucide-react'
import {
  DEMO_REGEAR_LIST,
  type DemoRegearListItem,
  type DemoRegearStatus,
} from '@/data/demo-seed'
import { formatTimeLabel, formatSilver } from '../_lib/format'
import { RegearOriginPill } from '../_components/Pills'
import DemoApprovalsTabs from '../_components/DemoApprovalsTabs'

// 어드민 승인 큐 — `/admin/approvals` 의 데모 클론.
// - 3 탭: 대기 / 승인 / 반려.
// - 대기 탭 카드에는 [승인] [반려] 버튼 표시 (데모이므로 비활성, 안내 문구).
// - rg-1 만 상세 페이지 링크 가능 (DEMO_REGEAR_DETAIL).
export default async function DemoApprovalsPage() {
  const t = await getTranslations('demo.approvals')
  const tDemo = await getTranslations('demo')

  const pending = DEMO_REGEAR_LIST.filter((r) => r.status === 'pending')
  const approved = DEMO_REGEAR_LIST.filter((r) => r.status === 'approved')
  const rejected = DEMO_REGEAR_LIST.filter((r) => r.status === 'rejected')

  const labels = {
    approve: t('actionApprove'),
    reject: t('actionReject'),
    approvedBadge: t('tabApproved'),
    rejectedBadge: t('tabRejected'),
  }

  const renderList = (items: DemoRegearListItem[], mode: DemoRegearStatus) => (
    <ul className="space-y-3">
      {items.map((rg) => (
        <ApprovalCard key={rg.id} rg={rg} t={tDemo} mode={mode} labels={labels} />
      ))}
    </ul>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('subtitle')}</p>
      </div>

      <DemoApprovalsTabs
        pendingCount={pending.length}
        approvedCount={approved.length}
        rejectedCount={rejected.length}
        pendingSection={
          pending.length === 0 ? (
            <EmptyState message={t('emptyPending')} />
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2 text-[11px] text-amber-200">
                <Sparkles size={12} className="flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{t('actionsDemoNote')}</span>
              </div>
              {renderList(pending, 'pending')}
            </div>
          )
        }
        approvedSection={
          approved.length === 0 ? (
            <EmptyState message={t('emptyApproved')} />
          ) : (
            renderList(approved, 'approved')
          )
        }
        rejectedSection={
          rejected.length === 0 ? (
            <EmptyState message={t('emptyRejected')} />
          ) : (
            renderList(rejected, 'rejected')
          )
        }
      />

      <p className="text-[11px] text-gray-600 italic px-1">{t('demoOnlyDetail')}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-2">
      <Inbox size={28} className="text-gray-600 mx-auto" />
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  )
}

interface CardLabels {
  approve: string
  reject: string
  approvedBadge: string
  rejectedBadge: string
}

interface ApprovalCardProps {
  rg: DemoRegearListItem
  t: (key: string) => string
  mode: DemoRegearStatus
  labels: CardLabels
}

function ApprovalCard({ rg, t, mode, labels }: ApprovalCardProps) {
  const linkable = rg.id === 'rg-1'
  const card = (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-base font-bold text-white truncate">{rg.victim}</h3>
            <RegearOriginPill origin={rg.origin} t={t} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
            <span>{rg.battleLabel}</span>
            <span className="text-gray-600">·</span>
            <span>{formatTimeLabel(t, rg.diedAt)}</span>
            <span className="text-gray-600">·</span>
            <span>
              {rg.killerName} <span className="text-gray-600">({rg.killerWeapon})</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-base font-mono font-bold text-amber-400">
            {formatSilver(rg.totalSilver)}
          </span>
          {linkable && <ArrowRight size={14} className="text-gray-500" />}
        </div>
      </div>

      {mode === 'pending' && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            disabled
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold px-3 py-2 rounded-lg cursor-not-allowed"
          >
            <ShieldCheck size={13} />
            {labels.approve}
          </button>
          <button
            type="button"
            disabled
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold px-3 py-2 rounded-lg cursor-not-allowed"
          >
            <XCircle size={13} />
            {labels.reject}
          </button>
        </div>
      )}
      {mode === 'approved' && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-800 text-[11px] text-emerald-300">
          <ShieldCheck size={12} />
          <span>{labels.approvedBadge}</span>
        </div>
      )}
      {mode === 'rejected' && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-800 text-[11px] text-rose-300">
          <XCircle size={12} />
          <span>{labels.rejectedBadge}</span>
        </div>
      )}
    </div>
  )

  if (!linkable) return <li>{card}</li>
  return (
    <li>
      <Link href={`/demo/regear/${rg.id}`} className="block">
        {card}
      </Link>
    </li>
  )
}
