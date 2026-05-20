import Link from 'next/link'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Lock, Wallet, Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSettlementDetail } from '@/app/actions/settlements'
import { formatSilver } from '@/lib/silver'
import SettlementCsvDownloadButton from '../_components/SettlementCsvDownloadButton'
import SettlementCloseButton from '../_components/SettlementCloseButton'

export const dynamic = 'force-dynamic'

export default async function AdminSettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [tNav, t, tCommon, result] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminSettlements'),
    getTranslations('common'),
    getSettlementDetail(id),
  ])

  if (!result.detail && !result.error) notFound()
  if (!result.detail) {
    return (
      <div className="space-y-4">
        <Link href="/admin/dashboard/settlements" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {result.error ?? tCommon('unknown')}
        </div>
      </div>
    )
  }

  const { period, lines } = result.detail

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/admin/dashboard/settlements" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText size={22} className="text-amber-400" />
              <h1 className="text-2xl font-bold text-white">{tNav('settlements')}</h1>
            </div>
            <p className="text-sm text-gray-400">{periodLabel(period.periodStart, period.periodEnd)}</p>
            {period.notes && <p className="text-xs text-gray-500">{period.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SettlementCsvDownloadButton period={period} lines={lines} />
            {period.status === 'draft' ? (
              <SettlementCloseButton id={period.id} />
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300">
                <Lock size={15} />
                {t('closedBadge')}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard icon={<Wallet size={16} />} label={t('receivableLabel')} value={formatSilver(period.totalReceivableSilver)} />
        <MetricCard icon={<Wallet size={16} />} label={t('payableLabel')} value={formatSilver(period.totalPayableSilver)} />
        <MetricCard icon={<Users size={16} />} label={t('lineCountLabel')} value={period.lineCount.toLocaleString()} />
      </div>

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">{t('linesTitle')}</h2>
          <p className="text-xs text-gray-500 mt-1">{t('linesDescription')}</p>
        </header>
        {lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">{t('emptyLines')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-950/60 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('memberHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('openingHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('earnedHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('spentHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('closingHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('receivableHeader')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('payableHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <Link href={`/members/${line.discordId}`} className="font-medium text-white hover:text-amber-200">
                        {line.username || line.discordId}
                      </Link>
                      <p className="text-[11px] text-gray-600 font-mono">{line.discordId}</p>
                    </td>
                    <MoneyCell value={line.openingBalance} />
                    <MoneyCell value={line.earned} tone="positive" />
                    <MoneyCell value={line.spent} tone="negative" />
                    <MoneyCell value={line.closingBalance} />
                    <MoneyCell value={line.receivableSilver} tone="positive" />
                    <MoneyCell value={line.payableSilver} tone="negative" />
                  </tr>
                ))}
              </tbody>
            </table>
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

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 text-gray-300">
        <span className="text-amber-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono text-white">{value}</p>
    </div>
  )
}

function MoneyCell({ value, tone }: { value: number; tone?: 'positive' | 'negative' }) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-200' : tone === 'negative' ? 'text-rose-200' : 'text-gray-200'
  return <td className={`px-4 py-3 text-right font-mono ${toneClass}`}>{formatSilver(value)}</td>
}
