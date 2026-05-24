import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import ShopBaselineForm from '@/components/ShopBaselineForm'
import { formatDateTime } from '@/lib/format-datetime'

export const dynamic = 'force-dynamic'
const SHOP_BASELINE_PAGE_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

export default async function ShopBaselinePage() {
  const db = await requireAnyCapability(SHOP_BASELINE_PAGE_CAPS)
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const t = await getTranslations('adminShopBaseline')

  // 이력 표시용 — 최근 10건 (confirmed / superseded 모두 포함)
  const { data: history } = await db
    .from('shop_baselines')
    .select('id, baseline_at, total_items, total_events, confirmed_at, confirmed_by, status, depositor, notes, drift_report')
    .eq('guild_id', guildId)
    .order('confirmed_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={22} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        </div>
        <Link
          href="/admin/dashboard/shop"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft size={14} />
          {t('backToShop')}
        </Link>
      </div>

      <ShopBaselineForm />

      {history && history.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-2">
          <div className="text-sm font-semibold text-zinc-200">{t('historyTitle')}</div>
          <div className="overflow-auto">
            <table className="w-full text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-2 text-left">{t('colConfirmedAt')}</th>
                  <th className="p-2 text-left">{t('colBaselineAt')}</th>
                  <th className="p-2 text-right">{t('colItems')}</th>
                  <th className="p-2 text-left">{t('colDepositor')}</th>
                  <th className="p-2 text-left">{t('colDrift')}</th>
                  <th className="p-2 text-left">{t('colStatus')}</th>
                  <th className="p-2 text-left">{t('colNotes')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const drift = row.drift_report as Record<string, unknown> | null
                  const changed = drift ? Number(drift.changed_items ?? 0) : null
                  const before = drift ? Number(drift.before_total ?? 0) : null
                  const after = drift ? Number(drift.after_total ?? 0) : null
                  const deltaTotal = before !== null && after !== null ? after - before : null
                  return (
                    <tr key={row.id as string} className="border-t border-zinc-800">
                      <td className="p-2 font-mono">
                        {formatDateTime(row.confirmed_at as string)}
                      </td>
                      <td className="p-2 font-mono">
                        {formatDateTime(row.baseline_at as string)}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {t('itemsSummary', {
                          items: (row.total_items as number).toLocaleString(),
                          events: row.total_events as number,
                        })}
                      </td>
                      <td className="p-2">{(row.depositor as string | null) ?? '—'}</td>
                      <td className="p-2 font-mono text-zinc-400">
                        {changed === null ? (
                          '—'
                        ) : (
                          <span>
                            {t('driftCount', { count: changed })}
                            {deltaTotal !== null && (
                              <span className={`ml-1 ${deltaTotal > 0 ? 'text-emerald-300' : deltaTotal < 0 ? 'text-rose-300' : ''}`}>
                                ({deltaTotal > 0 ? '+' : ''}
                                {deltaTotal.toLocaleString()})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {row.status === 'confirmed' ? (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">{t('statusActive')}</span>
                        ) : (
                          <span className="rounded bg-zinc-700 px-2 py-0.5 text-zinc-400">{t('statusSuperseded')}</span>
                        )}
                      </td>
                      <td className="p-2 text-zinc-500">{(row.notes as string | null) ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
