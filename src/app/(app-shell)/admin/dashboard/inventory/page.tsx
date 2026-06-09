import { getTranslations } from 'next-intl/server'
import { Boxes } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { listInventoryGearBaseCatalog } from '@/lib/inventory'
import { listTrackedItems } from '@/app/actions/inventory-tracked'
import AdminInventoryGearPanel from '@/components/AdminInventoryGearPanel'

// 길드 장비 재고 관리. 수동 +/- 와 절대값 설정. 자동 -1 (제작 deliver 시) 은
// craft.ts 의 deliverCraftQueueItem 에서 처리.
export const dynamic = 'force-dynamic'

export default async function AdminInventoryPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const [gear, tracked, t] = await Promise.all([
    listInventoryGearBaseCatalog(guildId),
    listTrackedItems(guildId),
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

      <AdminInventoryGearPanel initialGear={gear} initialTracked={tracked} />
    </div>
  )
}
