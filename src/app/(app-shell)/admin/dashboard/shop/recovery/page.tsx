import Link from 'next/link'
import { AlertTriangle, ArrowLeft, History, Shield } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import ShopBaselineForm from '@/components/ShopBaselineForm'
import ShopResetPanel from '@/components/ShopResetPanel'
import { formatDateTime } from '@/lib/format-datetime'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

const SHOP_RECOVERY_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

export default async function ShopRecoveryPage() {
  const db = await requireAnyCapability(SHOP_RECOVERY_CAPS)
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const canResetInventory = session.isAdmin || sessionHas(session, CAP.INVENTORY_MANAGE)
  const [t, tenantTimezone, baselineResult, receiptResult] = await Promise.all([
    getTranslations('adminShopRecovery'),
    getTenantTimezone(guildId),
    db
      .from('shop_baselines')
      .select('id, baseline_at, total_items, total_events, confirmed_at, status, drift_report')
      .eq('guild_id', guildId)
      .order('confirmed_at', { ascending: false })
      .limit(10),
    db
      .from('shop_recovery_receipts')
      .select('id, operation, result_payload, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const baselines = baselineResult.data ?? []
  const receipts = receiptResult.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Shield size={22} className="mt-1 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">{t('description')}</p>
          </div>
        </div>
        <Link
          href="/admin/dashboard/shop"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft size={14} />
          {t('backToShop')}
        </Link>
      </div>

      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
        <div className="flex gap-3 text-sm text-amber-100">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <p className="font-semibold">{t('warningTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/75">{t('warningBody')}</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">{t('baselineTitle')}</h2>
        <p className="text-sm text-zinc-400">{t('baselineDescription')}</p>
        <ShopBaselineForm timezone={tenantTimezone} />
      </section>

      {canResetInventory && (
        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="text-lg font-semibold text-white">{t('resetTitle')}</h2>
          <ShopResetPanel />
        </section>
      )}

      <section className="space-y-3 border-t border-zinc-800 pt-6">
        <div className="flex items-center gap-2">
          <History size={17} className="text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">{t('receiptTitle')}</h2>
        </div>
        {receipts.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            {t('receiptEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900">
            <table className="w-full text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-3 text-left">{t('receiptTime')}</th>
                  <th className="p-3 text-left">{t('receiptOperation')}</th>
                  <th className="p-3 text-left">{t('receiptResult')}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => {
                  const result = (receipt.result_payload ?? {}) as Record<string, unknown>
                  const operation = receipt.operation as 'baseline' | 'inventory_reset'
                  return (
                    <tr key={receipt.id as string} className="border-t border-zinc-800">
                      <td className="whitespace-nowrap p-3 font-mono">
                        {formatDateTime(receipt.created_at as string, tenantTimezone)}
                      </td>
                      <td className="p-3 font-semibold">
                        {operation === 'baseline'
                          ? t('operationBaseline')
                          : t('operationInventoryReset')}
                      </td>
                      <td className="p-3 text-zinc-400">
                        {operation === 'baseline'
                          ? t('baselineReceiptResult')
                          : t('resetReceiptResult', {
                              rows: Number(result.inventory_rows_deleted ?? 0),
                              logs: Number(result.logs_deleted ?? 0),
                              orders: Number(result.orders_cancelled ?? 0),
                            })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {baselines.length > 0 && (
        <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300">
            {t('baselineHistoryTitle', { count: baselines.length })}
          </summary>
          <div className="mt-3 space-y-2">
            {baselines.map((row) => {
              const drift = (row.drift_report ?? {}) as Record<string, unknown>
              return (
                <div key={row.id as string} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
                  <span className="font-mono">
                    {formatDateTime(row.confirmed_at as string, tenantTimezone)}
                  </span>
                  <span>{t('baselineItems', { count: Number(row.total_items ?? 0) })}</span>
                  <span>{t('baselineChanges', { count: Number(drift.changed_items ?? 0) })}</span>
                  <span>{row.status === 'confirmed' ? t('statusActive') : t('statusSuperseded')}</span>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
