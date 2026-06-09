import { getTranslations } from 'next-intl/server'
import { Hammer } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getCraftConfig } from '@/app/actions/craft'
import {
  listGuildCrafters,
  listAllCraftTasksAdmin,
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
import { listCraftOrders } from '@/app/actions/craft-orders'

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
  void guildId

  const sp = await searchParams
  const statsMode: CraftDemandStatsMode =
    sp.statsMode === 'all' ? 'all' : 'delivered'

  const [config, { crafters }, { tasks }, { members }, { orders }, t] = await Promise.all([
    getCraftConfig(),
    listGuildCrafters(),
    listAllCraftTasksAdmin('active'),
    listGuildMembers(),
    listCraftOrders(),
    getTranslations('adminCraft'),
  ])

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

      <AdminCraftSettingsForm initial={config} />

      <AdminCraftCraftersPanel
        initialCrafters={crafters}
        memberOptions={memberOptions}
      />

      <AdminCraftBoxStatusPanel config={config} tasks={tasks} />

      <AdminCraftMaterialsPanel />

      <AdminCraftStatsPanel mode={statsMode} preservedParams={{}} />

      <AdminCraftOrdersPanel initialOrders={orders} />

      <AdminCraftTasksList initialTasks={tasks} />
    </div>
  )
}
