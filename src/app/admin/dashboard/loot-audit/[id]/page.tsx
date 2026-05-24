import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ScrollText } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getLootAuditDetail } from '@/app/actions/loot-audit'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHasAny } from '@/lib/session'
import LootAuditFindingActions from './LootAuditFindingActions'

export const dynamic = 'force-dynamic'

const LOOT_AUDIT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

export default async function LootAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/')
  if (!session.isAdmin && !sessionHasAny(session, LOOT_AUDIT_CAPS)) {
    redirect('/admin/dashboard')
  }

  const [{ id }, t, locale] = await Promise.all([
    params,
    getTranslations('adminLootAuditPage'),
    getLocale(),
  ])
  const detail = await getLootAuditDetail(id)
  if ('error' in detail) {
    if (detail.error === 'not-found') notFound()
    throw new Error(detail.error)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/dashboard/loot-audit"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-amber-400 hover:text-amber-200"
        >
          <ArrowLeft size={13} />
          {t('backToList')}
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText size={22} className="text-amber-300" />
          <h1 className="text-2xl font-semibold text-white">{detail.audit.title}</h1>
        </div>
        <p className="text-sm text-gray-400">
          {t('detailMeta', {
            user: detail.audit.createdByUsername,
            date: formatFullDate(detail.audit.createdAt, locale),
          })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCell label={t('statLootRows')} value={detail.audit.lootRowsCount} />
        <StatCell label={t('statDepositRows')} value={detail.audit.depositRowsCount} />
        <StatCell label={t('statTotalValue')} value={formatSilver(detail.audit.totalEstimatedValue)} />
        <StatCell label={t('statMissingValue')} value={formatSilver(detail.audit.missingEstimatedValue)} accent={detail.audit.missingEstimatedValue > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statOpenFindings')} value={detail.audit.unresolvedFindingsCount} accent={detail.audit.unresolvedFindingsCount > 0 ? 'amber' : 'emerald'} />
      </div>

      {detail.unresolvedDepositItemNames.length > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-100">
          {t('unresolvedDepositItems', {
            names: detail.unresolvedDepositItemNames.slice(0, 8).join(', '),
            count: detail.unresolvedDepositItemNames.length,
          })}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">{t('findingsTitle')}</h2>
        <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/60">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t('colMember')}</th>
                <th className="px-3 py-2 font-medium">{t('colItem')}</th>
                <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
                <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissing')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
                <th className="px-3 py-2 font-medium">{t('colStatus')}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {detail.findings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('noSavedFindings')}
                  </td>
                </tr>
              ) : (
                detail.findings.map((finding) => (
                  <tr key={finding.id} className="align-top text-gray-200">
                    <td className="px-3 py-3 font-medium text-white">{finding.lootedByName}</td>
                    <td className="px-3 py-3">
                      <p>{finding.itemName}</p>
                      <p className="font-mono text-[11px] text-gray-500">{finding.itemId}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{finding.expectedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{finding.depositedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">{finding.missingQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">
                      {formatSilver(finding.missingEstimatedValue)}
                    </td>
                    <td className="px-3 py-3">
                      <FindingStatus
                        status={finding.status}
                        labels={{
                          open: t('statusOpen'),
                          resolved: t('statusResolved'),
                          ignored: t('statusIgnored'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <LootAuditFindingActions finding={finding} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function FindingStatus({
  status,
  labels,
}: {
  status: string
  labels: { open: string; resolved: string; ignored: string }
}) {
  const color =
    status === 'open'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      : status === 'ignored'
        ? 'border-gray-500/40 bg-gray-500/10 text-gray-300'
        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${color}`}>
      {status === 'open' ? labels.open : status === 'ignored' ? labels.ignored : labels.resolved}
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
    <div className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2">
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

function formatFullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
