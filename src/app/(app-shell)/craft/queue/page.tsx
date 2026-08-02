import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Hammer, Box } from 'lucide-react'
import { getSession } from '@/lib/session'
import {
  getMyCrafterProfile,
  getCraftConfig,
} from '@/app/actions/craft'
import { listCraftQueueForCrafter } from '@/app/actions/craft-queue'
import { aggregateCraftBuilds } from '@/lib/craft-aggregation'
import CraftQueueClient from '@/components/CraftQueueClient'
import CraftQueueAggregationCard from '@/components/CraftQueueAggregationCard'
import { buildLoginEntryHref, buildReturnToWithSearchParams } from '@/lib/login-entry'
import { getSessionGuildId } from '@/lib/tenant'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'
import { getTenantTimezone } from '@/lib/timezone-server'

// 제작 리기어 큐 — 길드의 is_crafter=true 권한이 있는 사람이 들어와 queued
// 항목을 잡아 제작·납품하는 화면. 제작자가 아닌 사람은 안내 카드만 보고 끝.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function CraftQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>
}) {
  const params = await searchParams
  const eventParam = Array.isArray(params.event) ? params.event[0] : params.event
  const normalizedEventId = eventParam?.trim() ?? ''
  const eventId = UUID_RE.test(normalizedEventId) ? normalizedEventId : undefined
  const session = await getSession()
  if (!session) {
    const returnParams = new URLSearchParams()
    if (eventId) returnParams.set('event', eventId)
    redirect(buildLoginEntryHref({
      returnTo: buildReturnToWithSearchParams('/craft/queue', returnParams),
    }))
  }
  if (!session.isMember) {
    redirect('/')
  }
  const guildId = await getSessionGuildId(session)

  const [
    { queued, mine, isCrafter, stockByItemId, error },
    profile,
    config,
    t,
    tRegear,
    support,
    timezone,
  ] = await Promise.all([
    listCraftQueueForCrafter(eventId),
    getMyCrafterProfile(),
    getCraftConfig(),
    getTranslations('craftQueue'),
    getTranslations('regear'),
    getRegearSupportConfiguration(guildId),
    getTenantTimezone(guildId),
  ])
  const operational =
    support.supported && support.fulfillmentMode === 'crafted'

  if (!operational && queued.length === 0 && mine.length === 0) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Hammer size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">
            {support.supported ? t('disabledTitle') : tRegear('supportDisabledTitle')}
          </h1>
          <p className="text-gray-400 text-sm">
            {support.supported ? t('disabledHint') : tRegear('supportDisabledDescription')}
          </p>
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
  const aggregateBreakdown = aggregateCraftBuilds(
    queued.map((q) => ({
      snapshot: q.buildSnapshot,
      includedSlots: q.craftIncludedSlots,
    })),
  )
  const myClaimedCount = mine.filter((m) => m.status === 'claimed').length

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Hammer size={20} className="text-amber-400" />
          {t('pageTitle')}
        </h1>
        <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
      </div>
      {!operational && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">
            {support.supported ? t('disabledTitle') : tRegear('supportDisabledTitle')}
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            {support.supported ? t('disabledHint') : tRegear('supportDisabledDescription')}
          </p>
        </div>
      )}

      {eventId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-500/30 bg-violet-500/[0.08] px-3 py-2">
          <p className="text-xs font-semibold text-violet-200">{t('eventFilterActive')}</p>
          <div className="flex items-center gap-3">
            <Link href={`/events/${eventId}/report`} className="text-xs text-violet-300 hover:text-violet-200">
              {t('eventFilterBack')}
            </Link>
            <Link href="/craft/queue" className="text-xs text-gray-400 hover:text-white">
              {t('eventFilterClear')}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <Link
        href="/craft/my-tasks"
        className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors"
      >
        <Box size={18} className="text-emerald-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('myTasksLinkTitle')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {t('myTasksLinkHint', { count: myClaimedCount })}
          </p>
        </div>
        <span className="text-xs text-amber-300 flex-shrink-0">{t('myTasksLinkAction')}</span>
      </Link>

      <CraftQueueClient
        queued={queued}
        mine={mine}
        profile={profile}
        config={config}
        stockByItemId={stockByItemId}
        mode="browse"
        readOnly={!operational}
        timezone={timezone}
      />

      <CraftQueueAggregationCard breakdown={aggregateBreakdown} stockByItemId={stockByItemId} />
    </main>
  )
}
