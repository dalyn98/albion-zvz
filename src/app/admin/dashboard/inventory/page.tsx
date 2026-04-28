import { getTranslations } from 'next-intl/server'
import { Boxes } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { listInventoryMaterials, listInventoryGear } from '@/lib/inventory'
import AdminInventoryMaterialsPanel from '@/components/AdminInventoryMaterialsPanel'
import AdminInventoryGearPanel from '@/components/AdminInventoryGearPanel'

// 길드 재고 관리 (Phase 1). 정련 재료 + 완제품 두 섹션. 수동 +/- 와 절대값
// 설정만 지원. 자동 +/- (제작 납품/리기어 지급 시) 는 P2 로 분리.
export const dynamic = 'force-dynamic'

export default async function AdminInventoryPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const [materials, gear, t] = await Promise.all([
    listInventoryMaterials(guildId),
    listInventoryGear(guildId),
    getTranslations('adminInventory'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Boxes size={20} className="text-amber-400" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('pageDescription')}</p>
      </div>

      <AdminInventoryMaterialsPanel initialMaterials={materials} />
      <AdminInventoryGearPanel initialGear={gear} />
    </div>
  )
}
