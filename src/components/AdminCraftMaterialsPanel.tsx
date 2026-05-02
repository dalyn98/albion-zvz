import { getTranslations } from 'next-intl/server'
import { Boxes, AlertTriangle, Sparkles } from 'lucide-react'
import {
  loadCraftActiveMaterialStatsAdmin,
  type CraftActiveMaterialRow,
} from '@/app/actions/craft'
import { getLocale } from '@/lib/locale'
import { getLocalizedItemName } from '@/lib/item-names'

// 어드민 제작 대시보드 — 진행 중인 작업이 요구하는 재료 BoM 패널. 수요 통계가
// "어떤 장비가 청구됐나" 면 이 패널은 "지금 제작자가 무엇을 사야/빼야 하나" 에
// 답한다. queued + claimed 만 포함 — delivered 는 박스에 들어갔으니 재료가 이미
// 소비된 상태. 수치는 return-rate 적용 전 gross 라 길드 창고 출고량 기준이다.

export default async function AdminCraftMaterialsPanel() {
  const [{ result, error }, t, locale] = await Promise.all([
    loadCraftActiveMaterialStatsAdmin(),
    getTranslations('adminCraft'),
    getLocale(),
  ])

  if (error || !result) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-rose-300">{error ?? t('materialsError')}</p>
      </section>
    )
  }

  const isEmpty = result.materials.length === 0
  const grouped = groupByTier(result.materials)

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('materialsHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Pill tone="neutral">
          {t('materialsTaskCount', { count: result.taskCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsQueued', { count: result.queuedCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsClaimed', { count: result.claimedCount })}
        </Pill>
        {result.artifactCount > 0 && (
          <Pill tone="warn">
            <Sparkles size={11} className="text-amber-300" />
            {t('materialsArtifactWarn', { count: result.artifactCount })}
          </Pill>
        )}
        {result.unknownItemCount > 0 && (
          <Pill tone="warn">
            <AlertTriangle size={11} className="text-amber-300" />
            {t('materialsUnknownWarn', { count: result.unknownItemCount })}
          </Pill>
        )}
      </div>

      {isEmpty ? (
        <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
          {t('materialsEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div
              key={group.tier}
              className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2"
            >
              <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                {tierLabel(t, group.tier)}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {group.rows.map((row) => (
                  <li
                    key={row.uniqueName}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-gray-100">
                      {getLocalizedItemName(row.uniqueName, locale, null) ??
                        row.uniqueName}
                    </span>
                    <span className="tabular-nums text-amber-200 whitespace-nowrap">
                      {row.count.toLocaleString('en-US')}
                      <span className="text-gray-500 ml-1">
                        {t('materialsUnit')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface PillProps {
  tone: 'neutral' | 'dim' | 'warn'
  children: React.ReactNode
}

function Pill({ tone, children }: PillProps) {
  const cls =
    tone === 'warn'
      ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
      : tone === 'dim'
        ? 'bg-gray-950 text-gray-400 border-gray-800'
        : 'bg-gray-800 text-gray-100 border-gray-700'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border tabular-nums ${cls}`}
    >
      {children}
    </span>
  )
}

interface MaterialGroup {
  tier: number
  rows: CraftActiveMaterialRow[]
}

function groupByTier(rows: readonly CraftActiveMaterialRow[]): MaterialGroup[] {
  const map = new Map<number, CraftActiveMaterialRow[]>()
  for (const row of rows) {
    const arr = map.get(row.tier) ?? []
    arr.push(row)
    map.set(row.tier, arr)
  }
  return Array.from(map.entries())
    .map(([tier, rows]) => ({ tier, rows }))
    .sort((a, b) => b.tier - a.tier)
}

function tierLabel(
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>,
  tier: number,
): string {
  if (tier <= 0) return t('materialsTierUnknown')
  return t('materialsTierLabel', { tier })
}
