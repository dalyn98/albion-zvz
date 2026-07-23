import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ClipboardList } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { listOpenCraftOrdersForMember } from '@/app/actions/craft-orders'
import CraftOrdersMemberClient from '@/components/CraftOrdersMemberClient'
import { getTenantTimezone } from '@/lib/timezone-server'

// 길드 발주 멤버 페이지 — 관리자가 등록한 발주를 길드원이 일부 수주해 직접
// 제작·납품, 관리자 승인 후 단가 × 수량을 포인트로 받는다. 데스로그/리기어와
// 무관한 임의 아이템 보충 흐름.
export const dynamic = 'force-dynamic'

export default async function CraftOrdersPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login?returnTo=%2Fcraft%2Forders')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [{ orders, error }, t, timezone] = await Promise.all([
    listOpenCraftOrdersForMember(),
    getTranslations('craftOrders'),
    getTenantTimezone(guildId),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <ClipboardList size={20} className="text-amber-400" />
          {t('memberPageTitle')}
        </h1>
        <p className="text-gray-400 text-sm">{t('memberPageDescription')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <CraftOrdersMemberClient
        initialOrders={orders}
        currentUserDiscordId={session.discordId}
        timezone={timezone}
      />
    </main>
  )
}
