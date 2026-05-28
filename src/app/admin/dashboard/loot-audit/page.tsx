import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ExternalLink, ScrollText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { listLootAudits } from '@/app/actions/loot-audit'
import { getAppSetting } from '@/lib/app-settings'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import LogOperatingStartSettingsForm from '@/components/LogOperatingStartSettingsForm'
import LootAuditForm from './LootAuditForm'

export const dynamic = 'force-dynamic'

const LOOT_AUDIT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

export default async function AdminLootAuditPage() {
  const session = await getSession()
  if (!session) redirect('/')
  if (!session.isAdmin && !sessionHasAny(session, LOOT_AUDIT_CAPS)) {
    redirect('/admin/dashboard')
  }

  const guildId = await getSessionGuildId(session)
  const [t, auditResult, tenantTimezone, logStartLootAuditAt] = await Promise.all([
    getTranslations('adminLootAuditPage'),
    listLootAudits(),
    getTenantTimezone(guildId),
    getAppSetting('log_start_loot_audit_at', '', guildId),
  ])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText size={22} className="text-amber-300" />
          <h1 className="text-2xl font-semibold text-white">{t('title')}</h1>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
          {t('description')}
        </p>
      </header>

      {auditResult.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-900/25 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{auditResult.error}</p>
        </div>
      )}

      <LogOperatingStartSettingsForm
        domains={['lootAudit']}
        timezone={tenantTimezone}
        initialShopChestStartAt=""
        initialSiphonStartAt=""
        initialLootAuditStartAt={logStartLootAuditAt}
      />

      <LootAuditForm />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{t('recentTitle')}</h2>
          <span className="text-xs text-gray-500">
            {t('recentCount', { count: auditResult.audits.length })}
          </span>
        </div>

        {auditResult.audits.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
            {t('emptyRecent')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/60">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('colTitle')}</th>
                  <th className="px-3 py-2 font-medium">{t('colRows')}</th>
                  <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
                  <th className="px-3 py-2 font-medium">{t('colFindings')}</th>
                  <th className="px-3 py-2 font-medium">{t('colCreated')}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {auditResult.audits.map((audit) => (
                  <tr key={audit.id} className="text-gray-200">
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{audit.title}</p>
                        <p className="text-xs text-gray-500">{audit.createdByUsername}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {t('rowsValue', {
                        loot: audit.lootRowsCount.toLocaleString(),
                        deposit: audit.depositRowsCount.toLocaleString(),
                      })}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">
                      {formatSilver(audit.missingEstimatedValue)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={audit.status}
                        count={audit.unresolvedFindingsCount}
                        labels={{
                          resolved: t('statusResolved'),
                          open: t('statusOpenWithCount', {
                            count: audit.unresolvedFindingsCount.toLocaleString(),
                          }),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {formatDateTimeShort(audit.createdAt, tenantTimezone)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/dashboard/loot-audit/${audit.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-amber-400 hover:text-amber-200"
                      >
                        {t('viewDetail')}
                        <ExternalLink size={12} />
                      </Link>
                    </td>
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

function StatusPill({
  status,
  count,
  labels,
}: {
  status: string
  count: number
  labels: { resolved: string; open: string }
}) {
  const color = count > 0
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${color}`}>
      {status === 'resolved' ? labels.resolved : labels.open}
    </span>
  )
}

function formatSilver(value: number): string {
  return `${Math.round(value).toLocaleString()}`
}
