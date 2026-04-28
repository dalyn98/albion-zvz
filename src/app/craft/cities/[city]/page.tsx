import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, MapPin } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  listCraftQueueForCrafter,
  getCraftConfig,
  getCraftLocationPresets,
} from '@/app/actions/craft'
import { aggregateBuildSnapshotsForCity } from '@/lib/craft-aggregation'
import {
  CRAFT_CITIES,
  CITY_BADGE_STYLE,
  type CraftCity,
} from '@/lib/crafting-cities'
import { listInventoryMaterials, buildMaterialInventoryMap } from '@/lib/inventory'
import CityMaterialsCard from '@/components/CityMaterialsCard'

export const dynamic = 'force-dynamic'

function isCraftCity(value: string): value is CraftCity {
  return (CRAFT_CITIES as readonly string[]).includes(value)
}

interface Params {
  city: string
}

// 도시별 재료 집계 페이지. 큐 안에서 해당 도시 보너스를 받는 슬롯들의 재료만
// 골라 합산해 보여준다. 길드 재고 토글로 부족분을 즉시 파악 가능.
export default async function CityMaterialsPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { city: cityParam } = await params
  if (!isCraftCity(cityParam)) notFound()

  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/craft/cities/${cityParam}`)
  }
  if (!session.isMember) redirect('/')

  const guildId = await getSessionGuildId(session)

  const [
    { queued, mine, isCrafter, error },
    config,
    locations,
    inventoryMaterials,
    t,
    tCity,
  ] = await Promise.all([
    listCraftQueueForCrafter(),
    getCraftConfig(),
    getCraftLocationPresets(),
    listInventoryMaterials(guildId).catch(() => []),
    getTranslations('craftQueue'),
    getTranslations('craftQueue.cityBonus'),
  ])

  if (!config.enabled) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
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
          <h1 className="text-base font-bold text-white">{t('notCrafterTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('notCrafterHint')}</p>
        </div>
      </main>
    )
  }

  // queued (대기) + 내가 claim 한 task 둘 다 포함. claimed 는 박스에 아직 안 넣었으니
  // 재료를 사야 하고, queued 는 곧 잡힐 task. 큐/내 작업 양쪽 어느 카드에서 들어와도
  // 같은 도시 자료를 보여주려면 합쳐서 집계해야 한다.
  const activeSnapshots = [
    ...queued.map((q) => q.buildSnapshot),
    ...mine.filter((m) => m.status === 'claimed').map((m) => m.buildSnapshot),
  ]
  const breakdown = aggregateBuildSnapshotsForCity(activeSnapshots, cityParam)

  const inventoryEntries = Array.from(
    buildMaterialInventoryMap(inventoryMaterials).entries(),
  )

  const locationPresets = locations.map((l) => ({
    id: l.id,
    i18nKey: l.i18nKey,
    defaultReturnRatePct: l.defaultReturnRatePct,
  }))

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <Link
        href="/craft/queue"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={12} />
        {t('cityMaterialsBack')}
      </Link>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded border ${CITY_BADGE_STYLE[cityParam]}`}
          >
            <MapPin size={12} />
            {tCity(cityParam)}
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          {t('cityMaterialsPageTitle')}
        </h1>
        <p className="text-gray-400 text-sm">
          {t('cityMaterialsPageDescription')}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <CityMaterialsCard
        breakdown={breakdown}
        focusBonusPct={config.focusBonusPct}
        locations={locationPresets}
        inventoryEntries={inventoryEntries}
      />
    </main>
  )
}
