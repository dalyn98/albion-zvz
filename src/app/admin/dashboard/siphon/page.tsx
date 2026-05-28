import { redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { CAP } from '@/lib/permissions'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  getSiphonBalances,
  listSiphonLedger,
  type SiphonLedgerRow,
  type SiphonPlayerBalance,
} from '@/app/actions/siphon-admin'
import SiphonImportForm from './SiphonImportForm'
import SiphonBalanceTable from './SiphonBalanceTable'
import SiphonLogTable from './SiphonLogTable'
import SiphonResetPanel from './SiphonResetPanel'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { getTenantTimezone } from '@/lib/timezone-server'
import LogOperatingStartSettingsForm from '@/components/LogOperatingStartSettingsForm'

export const dynamic = 'force-dynamic'

const LOG_PAGE_SIZE = 50

interface SearchParams {
  searchParams?: Promise<{ page?: string; player?: string }>
}

export default async function AdminSiphonPage(props: SearchParams) {
  const session = await getSession()
  if (!session) redirect('/')
  if (!sessionHas(session, CAP.SIPHON_MANAGE)) redirect('/admin/dashboard')

  // Next.js 16 — searchParams 는 promise.
  const sp = (await props.searchParams) ?? {}
  const pageParam = Number.parseInt(sp.page ?? '1', 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1
  const offset = (page - 1) * LOG_PAGE_SIZE
  const playerFilter = sp.player?.trim() || undefined

  const t = await getTranslations('adminSiphonPage')
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const [operatingStart, tenantTimezone, logStartSiphonAt] = await Promise.all([
    getLogOperatingStart('siphon', guildId),
    getTenantTimezone(guildId),
    getAppSetting('log_start_siphon_at', '', guildId),
  ])

  let lastImportQuery = db
    .from('siphon_ledger')
    .select('imported_at')
    .eq('guild_id', guildId)
  if (operatingStart) {
    lastImportQuery = lastImportQuery.gte('logged_at', operatingStart.toISOString())
  }

  // 병렬 read: balances + ledger 1 페이지 + 마지막 import 시각 + reset 대상 수.
  const [balancesResult, ledgerResult, lastImportRow, resetCountResult] = await Promise.all([
    getSiphonBalances(),
    listSiphonLedger({ limit: LOG_PAGE_SIZE, offset, player: playerFilter }),
    lastImportQuery
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('siphon_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId),
  ])

  const balances: SiphonPlayerBalance[] =
    'balances' in balancesResult ? balancesResult.balances : []
  const ledgerRows: SiphonLedgerRow[] =
    'rows' in ledgerResult ? ledgerResult.rows : []
  const ledgerTotal = 'total' in ledgerResult ? ledgerResult.total : 0
  const resetLogCount = resetCountResult.error ? null : resetCountResult.count ?? 0
  const lastImportAt =
    (lastImportRow.data?.imported_at as string | null | undefined) ?? null

  const errorMessage =
    'error' in balancesResult
      ? balancesResult.error
      : 'error' in ledgerResult
        ? ledgerResult.error
        : null

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Zap size={22} className="text-amber-300" />
          {t('title')}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl leading-relaxed">
          {t('description')}
        </p>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <SiphonImportForm lastImportAt={lastImportAt} timezone={tenantTimezone} />

      <LogOperatingStartSettingsForm
        domains={['siphon']}
        timezone={tenantTimezone}
        initialShopChestStartAt=""
        initialSiphonStartAt={logStartSiphonAt}
      />

      <SiphonResetPanel logCount={resetLogCount} />

      <SiphonBalanceTable balances={balances} timezone={tenantTimezone} />

      <SiphonLogTable
        rows={ledgerRows}
        total={ledgerTotal}
        page={page}
        pageSize={LOG_PAGE_SIZE}
        playerFilter={playerFilter ?? null}
        timezone={tenantTimezone}
      />
    </div>
  )
}
