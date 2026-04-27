import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Hammer } from 'lucide-react'
import { getSession } from '@/lib/session'
import {
  listCraftQueueForCrafter,
  getMyCrafterProfile,
  getCraftConfig,
  getCraftLocationPresets,
} from '@/app/actions/craft'
import CraftQueueClient from '@/components/CraftQueueClient'

// 제작 리기어 큐 — 길드의 is_crafter=true 권한이 있는 사람이 들어와 queued
// 항목을 잡아 제작·납품하는 화면. 제작자가 아닌 사람은 안내 카드만 보고 끝.
export const dynamic = 'force-dynamic'

export default async function CraftQueuePage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/craft/queue')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const [
    { queued, mine, isCrafter, error },
    profile,
    config,
    locations,
    t,
  ] = await Promise.all([
    listCraftQueueForCrafter(),
    getMyCrafterProfile(),
    getCraftConfig(),
    getCraftLocationPresets(),
    getTranslations('craftQueue'),
  ])

  if (!config.enabled) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Hammer size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">{t('disabledTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('disabledHint')}</p>
        </div>
      </main>
    )
  }

  // is_crafter 가 아닌 일반 멤버는 안내 + 관리자에게 권한 요청 hint.
  if (!isCrafter && !session.isAdmin) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Hammer size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">{t('notCrafterTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('notCrafterHint')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Hammer size={20} className="text-amber-400" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <CraftQueueClient
        queued={queued}
        mine={mine}
        profile={profile}
        config={config}
        locations={locations.map((l) => ({ id: l.id, i18nKey: l.i18nKey, defaultReturnRatePct: l.defaultReturnRatePct }))}
      />
    </main>
  )
}
