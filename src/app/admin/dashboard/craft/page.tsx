import { getTranslations } from 'next-intl/server'
import { Hammer } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  getCraftConfig,
  listGuildCrafters,
  listAllCraftTasksAdmin,
  type CraftDemandStatsMode,
} from '@/app/actions/craft'
import { listGuildMembers } from '@/app/actions/members-admin'
import AdminCraftSettingsForm from '@/components/AdminCraftSettingsForm'
import AdminCraftCraftersPanel from '@/components/AdminCraftCraftersPanel'
import AdminCraftTasksList from '@/components/AdminCraftTasksList'
import AdminCraftBoxStatusPanel from '@/components/AdminCraftBoxStatusPanel'
import AdminCraftStatsPanel from '@/components/AdminCraftStatsPanel'
import AdminCraftMaterialsPanel from '@/components/AdminCraftMaterialsPanel'

// 제작 리기어 운영 화면. 토글, 보관함 번호 범위 / 만료일 / 포커스 보너스, 제작자
// 권한 부여 (guild_avatars.is_crafter), 진행 중 작업 모니터링 + 강제 취소 / 실버 변환.
export const dynamic = 'force-dynamic'

const ALLOWED_BOM_LOCATIONS = new Set([
  'royal_city',
  'caerleon',
  'hideout_t5',
  'hideout_t8',
])

export default async function AdminCraftPage({
  searchParams,
}: {
  searchParams: Promise<{
    statsMode?: string
    bomLoc?: string
    bomFocus?: string
  }>
}) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  void guildId

  const sp = await searchParams
  const statsMode: CraftDemandStatsMode =
    sp.statsMode === 'all' ? 'all' : 'delivered'
  const bomLocation =
    sp.bomLoc && ALLOWED_BOM_LOCATIONS.has(sp.bomLoc) ? sp.bomLoc : null
  const bomFocus = sp.bomFocus === 'on'

  // 패널끼리 다른 키 (예: BoM 셀렉터가 statsMode, Stats 토글이 bomLoc/bomFocus) 를
  // 보존하도록 모아 각 패널에 전달. 각 패널은 자기 키를 직접 관리해 해당 키는
  // 셀렉터에서 다시 set/delete 한다.
  const preservedForBom: Record<string, string> = {}
  if (sp.statsMode === 'all') preservedForBom.statsMode = 'all'
  const preservedForStats: Record<string, string> = {}
  if (bomLocation) preservedForStats.bomLoc = bomLocation
  if (bomFocus) preservedForStats.bomFocus = 'on'

  const [config, { crafters }, { tasks }, { members }, t] = await Promise.all([
    getCraftConfig(),
    listGuildCrafters(),
    listAllCraftTasksAdmin('active'),
    listGuildMembers(),
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

      <AdminCraftMaterialsPanel
        locationId={bomLocation}
        focusUsed={bomFocus}
        preservedParams={preservedForBom}
      />

      <AdminCraftStatsPanel mode={statsMode} preservedParams={preservedForStats} />

      <AdminCraftTasksList initialTasks={tasks} />
    </div>
  )
}
