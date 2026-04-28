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
import { aggregateBuildSnapshots } from '@/lib/craft-aggregation'
import CraftQueueClient from '@/components/CraftQueueClient'
import CraftQueueAggregationCard from '@/components/CraftQueueAggregationCard'

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

  // 길드 단위 집계: queued task 들의 buildSnapshot 합산. claimed/delivered 는
  // 이미 다른 제작자가 잡았거나 마무리됐으므로 "지금 만들어야 할 것" 만 보여준다.
  const aggregateBreakdown = aggregateBuildSnapshots(queued.map((q) => q.buildSnapshot))
  // 본인이 잡은 (claimed) 작업 집계: 자기가 다음에 박스에 넣어야 할 장비/재료. 이미
  // delivered 된 건은 재료가 소진되어 새로 사야 할 게 없으므로 제외.
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

      <CraftQueueAggregationCard
        breakdown={aggregateBreakdown}
        focusBonusPct={config.focusBonusPct}
        locations={locationPresets}
      />

      <CraftQueueAggregationCard
        breakdown={myAggregateBreakdown}
        focusBonusPct={config.focusBonusPct}
        locations={locationPresets}
        variant="mine"
      />

      <CraftQueueClient
        queued={queued}
        mine={mine}
        profile={profile}
        config={config}
        locations={locationPresets}
      />
    </main>
  )
}
