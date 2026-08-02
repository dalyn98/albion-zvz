import { getTranslations } from 'next-intl/server'
import { Hammer } from 'lucide-react'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getCraftConfig } from '@/app/actions/craft'
import {
  listGuildCrafters,
  listAllCraftTasksAdmin,
  listPayableSupplySettlements,
} from '@/app/actions/craft-admin'
import type { CraftDemandStatsMode } from '@/app/actions/craft-stats-admin'
import { listGuildMembers } from '@/app/actions/members-admin'
import AdminCraftSettingsForm from '@/components/AdminCraftSettingsForm'
import AdminCraftCraftersPanel from '@/components/AdminCraftCraftersPanel'
import AdminCraftTasksList from '@/components/AdminCraftTasksList'
import AdminCraftBoxStatusPanel from '@/components/AdminCraftBoxStatusPanel'
import AdminCraftStatsPanel from '@/components/AdminCraftStatsPanel'
import AdminCraftMaterialsPanel from '@/components/AdminCraftMaterialsPanel'
import AdminCraftOrdersPanel from '@/components/AdminCraftOrdersPanel'
import AdminSupplySettlementPanel from '@/components/AdminSupplySettlementPanel'
import { listCraftOrders } from '@/app/actions/craft-orders'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'
import { CAP } from '@/lib/permissions'
import { getTenantTimezone } from '@/lib/timezone-server'

// 제작 리기어 운영 화면. 토글, 보관함 번호 범위 / 만료일 / 포커스 보너스, 제작자
// 권한 부여 (guild_avatars.is_crafter), 진행 중 작업 모니터링 + 강제 취소 / 실버 변환.
export const dynamic = 'force-dynamic'

export default async function AdminCraftPage({
  searchParams,
}: {
  searchParams: Promise<{
    statsMode?: string
  }>
}) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const sp = await searchParams
  const statsMode: CraftDemandStatsMode =
    sp.statsMode === 'all' ? 'all' : 'delivered'

  const [
    config,
    { crafters },
    { tasks },
    { groups: settlementGroups },
    { members },
    { orders },
    t,
    tRegear,
    support,
    timezone,
  ] = await Promise.all([
    getCraftConfig(),
    listGuildCrafters(),
    listAllCraftTasksAdmin('active'),
    listPayableSupplySettlements(),
    listGuildMembers(),
    listCraftOrders(),
    getTranslations('adminCraft'),
    getTranslations('regear'),
    getRegearSupportConfiguration(guildId),
    getTenantTimezone(guildId),
  ])
  const regearSupported = support.state === 'supported'
  const craftedRegearEnabled =
    regearSupported && support.fulfillmentMode === 'crafted'
  const canPaySettlements = sessionHasAny(session, [CAP.CRAFT_MASTER])
  const canMoveCraftCustody = sessionHasAny(session, [
    CAP.CRAFT_TASK_DELIVER,
    CAP.CRAFT_MASTER,
  ])
  const canReturnCraftCustody = canPaySettlements

  const memberOptions = members
    .map((m) => ({ discordId: m.discord_id, username: m.username }))
    .sort((a, b) => a.username.localeCompare(b.username))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Hammer size={20} className="text-amber-400" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('pageDescription')}</p>
      </div>

      {!regearSupported && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">{tRegear('supportDisabledTitle')}</p>
          <p className="mt-1 text-xs text-amber-100/80">
            {tRegear('supportDisabledDescription')}
          </p>
        </div>
      )}

      {craftedRegearEnabled && (
        <>
          <AdminCraftSettingsForm initial={config} />

          <AdminCraftCraftersPanel
            initialCrafters={crafters}
            memberOptions={memberOptions}
          />

          <AdminCraftBoxStatusPanel
            config={config}
            tasks={tasks}
            canMoveCustody={canMoveCraftCustody}
            canReturnCustody={canReturnCraftCustody}
          />

          <AdminCraftMaterialsPanel />

          <AdminCraftStatsPanel mode={statsMode} preservedParams={{}} />
        </>
      )}

      <AdminCraftOrdersPanel initialOrders={orders} />

      {(craftedRegearEnabled || settlementGroups.length > 0) && (
        <AdminSupplySettlementPanel
          groups={settlementGroups}
          canPay={canPaySettlements}
        />
      )}

      {(craftedRegearEnabled || tasks.length > 0) && (
        <AdminCraftTasksList
          initialTasks={tasks}
          readOnly={!regearSupported}
          timezone={timezone}
        />
      )}
    </div>
  )
}
