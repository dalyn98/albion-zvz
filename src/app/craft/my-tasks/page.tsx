import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Box, Hammer } from 'lucide-react'
import { getSession } from '@/lib/session'
import {
  listCraftQueueForCrafter,
  getMyCrafterProfile,
  getCraftConfig,
  getCraftLocationPresets,
} from '@/app/actions/craft'
import { aggregateBuildSnapshots } from '@/lib/craft-aggregation'
import CraftQueueClient from '@/components/CraftQueueClient'
import CraftQueueAggregationCard from '@/components/CraftQueueAggregationCard'

// 내 제작 작업 — 본인이 청구한 (claimed) / 납품한 (delivered) task 만 모아 보여주는
// 화면. /craft/queue 가 "남이 올린 큐 수주" 화면이라면 여기는 "내가 잡은 작업 + 재료
// 계산기" 전용 공간. claimed snapshot 들의 합산 재료를 한 번에 계산하기 위함이다.
export const dynamic = 'force-dynamic'

export default async function CraftMyTasksPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/craft/my-tasks')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const [
    { mine, isCrafter, error },
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
          <Box size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">{t('disabledTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('disabledHint')}</p>
        </div>
      </main>
    )
  }

  if (!isCrafter && !session.isAdmin) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Box size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">{t('notCrafterTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('notCrafterHint')}</p>
        </div>
      </main>
    )
  }

  // 본인이 claimed 한 task 들의 buildSnapshot 만 합산. delivered 는 이미 박스에
  // 넣었으므로 재료가 소진되어 새로 살 게 없다.
  const myClaimedSnapshots = mine
    .filter((m) => m.status === 'claimed')
    .map((m) => m.buildSnapshot)
  const myAggregateBreakdown = aggregateBuildSnapshots(myClaimedSnapshots)
  const locationPresets = locations.map((l) => ({
    id: l.id,
    i18nKey: l.i18nKey,
    defaultReturnRatePct: l.defaultReturnRatePct,
  }))

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Box size={20} className="text-emerald-400" />
          {t('myTasksPageTitle')}
        </h1>
        <p className="text-gray-400 text-sm">{t('myTasksPageDescription')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <Link
        href="/craft/queue"
        className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors"
      >
        <Hammer size={18} className="text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('queueLinkTitle')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('queueLinkHint')}</p>
        </div>
        <span className="text-xs text-amber-300 flex-shrink-0">{t('queueLinkAction')}</span>
      </Link>

      <CraftQueueAggregationCard
        breakdown={myAggregateBreakdown}
        variant="mine"
      />

      <CraftQueueClient
        queued={[]}
        mine={mine}
        profile={profile}
        config={config}
        locations={locationPresets}
        mode="mine"
      />
    </main>
  )
}
