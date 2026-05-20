import Link from 'next/link'
import type { ReactNode } from 'react'
import { FileText, Wallet, Users, ArrowRight, AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { listSettlementPeriods } from '@/app/actions/settlements'
import { formatSilver } from '@/lib/silver'
import SettlementCreateForm from './_components/SettlementCreateForm'

export const dynamic = 'force-dynamic'

export default async function AdminSettlementsPage() {
  const [tNav, t, result] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminSettlements'),
    listSettlementPeriods(),
  ])

  const periods = result.periods
  const latest = periods[0]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">{tNav('settlements')}</h1>
        </div>
        <p className="text-sm text-gray-400">{t('description')}</p>
      </header>

      {result.error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <p>{result.error}</p>
        </div>
      )}

      <SettlementCreateForm />

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            icon={<Wallet size={16} />}
            label={t('latestReceivable')}
            value={formatSilver(latest.totalReceivableSilver)}
            hint={periodLabel(latest.periodStart, latest.periodEnd)}
          />
          <MetricCard
            icon={<Wallet size={16} />}
            label={t('latestPayable')}
            value={formatSilver(latest.totalPayableSilver)}
            hint={t(`status.${latest.status}`)}
          />
          <MetricCard
            icon={<Users size={16} />}
            label={t('latestMembers')}
            value={latest.lineCount.toLocaleString()}
            hint={t('memberCountHint')}
          />
        </div>
      )}

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">{t('periodsTitle')}</h2>
        </header>
        {periods.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">{t('emptyPeriods')}</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {periods.map((period) => (
              <Link
                key={period.id}
                href={`/admin/dashboard/settlements/${period.id}`}
                className="grid grid-cols-1 md:grid-cols-[1fr_120px_160px_160px_32px] gap-2 px-4 py-3 hover:bg-gray-800/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{periodLabel(period.periodStart, period.periodEnd)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {period.notes || t('noNotes')}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">{t('statusLabel')}</p>
                  <p className="text-sm text-gray-200">{t(`status.${period.status}`)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">{t('receivableLabel')}</p>
                  <p className="text-sm font-mono text-amber-200">{formatSilver(period.totalReceivableSilver)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">{t('payableLabel')}</p>
                  <p className="text-sm font-mono text-sky-200">{formatSilver(period.totalPayableSilver)}</p>
                </div>
                <ArrowRight size={16} className="hidden md:block text-gray-500 self-center" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function periodLabel(start: string, end: string): string {
  return `${start} - ${exclusiveEndToInclusive(end)}`
}

function exclusiveEndToInclusive(end: string): string {
  const date = new Date(`${end}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 text-gray-300">
        <span className="text-amber-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono text-white">{value}</p>
      <p className="text-[11px] text-gray-500">{hint}</p>
    </div>
  )
}
