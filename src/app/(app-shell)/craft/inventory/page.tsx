import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, Boxes } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { listInventoryGearBaseCatalog } from '@/lib/inventory'
import { listTrackedItems } from '@/app/actions/inventory-tracked'
import AdminInventoryGearPanel from '@/components/AdminInventoryGearPanel'

// 제작자/어드민이 길드 장비 재고를 직접 손볼 수 있는 페이지. 어드민의
// /admin/dashboard/inventory 와 동일한 패널을 띄우되, 일반 제작자도 진입 가능.
export const dynamic = 'force-dynamic'

export default async function CraftInventoryPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/craft/inventory')
  }
  if (!session.isMember) redirect('/')

  const guildId = await getSessionGuildId(session)

  // is_crafter 권한 확인. 어드민은 무조건 통과.
  let isCrafter = false
  if (!session.isAdmin) {
    const db = getAdminClient()
    const { data } = await db
      .from('guild_avatars')
      .select('is_crafter')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    isCrafter = (data?.is_crafter as boolean | undefined) === true
  }

  const t = await getTranslations('adminInventory')
  const tQueue = await getTranslations('craftQueue')

  if (!session.isAdmin && !isCrafter) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Boxes size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">{tQueue('notCrafterTitle')}</h1>
          <p className="text-gray-400 text-sm">{tQueue('notCrafterHint')}</p>
        </div>
      </main>
    )
  }

  const [gear, tracked] = await Promise.all([
    listInventoryGearBaseCatalog(guildId),
    listTrackedItems(guildId),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <Link
        href="/craft/queue"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={12} />
        {tQueue('detailBackToQueue')}
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Boxes size={20} className="text-amber-400" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('pageDescription')}</p>
      </div>

      <AdminInventoryGearPanel initialGear={gear} initialTracked={tracked} />
    </main>
  )
}
