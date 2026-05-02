import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Hammer, TrendingUp } from 'lucide-react'
import {
  loadCraftDemandStatsAdmin,
  type CraftDemandBucket,
  type CraftDemandStatsMode,
  type CraftDemandTopItem,
} from '@/app/actions/craft'
import { getLocale } from '@/lib/locale'
import { getLocalizedItemName } from '@/lib/item-names'
import { SLOT_LABELS } from '@/types'
import type { SlotKey } from '@/types'

// 어드민 제작 대시보드 통계 패널. 운영 KPI (회수/만료/실버 합계) 가 아니라 인게임
// 수요 — "어떤 장비가 가장 많이 청구됐나" — 를 노출. mode='delivered' (기본) 면
// 실제 제작 납품된 작업 (craft_tasks delivered/collected), mode='all' 이면 모든
// 청구 — lifetime / 이번 주 (PT 월요일 00:00~) 두 윈도우로 집계.
//
// 슬롯은 craft-aggregation.ts 의 기본 제외 규칙으로 mount/food/potion 을 제거 —
// 제작자가 만들 수 없는 슬롯은 통계에 의미가 없다.

const SLOT_LABEL_KEYS: Record<string, string> = {
  weapon: 'slotWeapon',
  head: 'slotHead',
  armor: 'slotArmor',
  shoes: 'slotShoes',
  offhand: 'slotOffhand',
  cape: 'slotCape',
}

interface AdminCraftStatsPanelProps {
  mode: CraftDemandStatsMode
  // 다른 searchParams (bomLoc, bomFocus) 를 모드 토글 링크에서 유지하기 위함.
  preservedParams: Record<string, string>
}

export default async function AdminCraftStatsPanel({
  mode,
  preservedParams,
}: AdminCraftStatsPanelProps) {
  const [{ stats, error }, t, locale] = await Promise.all([
    loadCraftDemandStatsAdmin(mode),
    getTranslations('adminCraft'),
    getLocale(),
  ])

  if (error || !stats) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('demandTitle')}
        </h2>
        <p className="text-xs text-rose-300">{error ?? t('demandError')}</p>
      </section>
    )
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Hammer size={16} className="text-amber-400" />
            {t('demandTitle')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {mode === 'delivered' ? t('demandHintDelivered') : t('demandHintAll')}
          </p>
        </div>
        <ModeToggle mode={mode} preservedParams={preservedParams} t={t} />
      </div>

      <DemandBucket
        title={t('demandWeeklyTitle')}
        bucket={stats.weekly}
        emptyLabel={t('demandWeeklyEmpty')}
        countLabel={t('demandRequestCount', { count: stats.weekly.taskCount })}
        slotPrefix={t('demandSlotsLabel')}
        topPrefix={t('demandTopItemsLabel')}
        slotEmpty={t('demandSlotsEmpty')}
        slotTranslate={(slot) => slotLabel(t, slot)}
        nameTranslate={(item) =>
          getLocalizedItemName(item.itemId, locale, item.itemName) ??
          item.itemName ??
          item.itemId
        }
        unitLabel={t('demandUnit')}
      />

      <DemandBucket
        title={t('demandLifetimeTitle')}
        bucket={stats.lifetime}
        emptyLabel={t('demandLifetimeEmpty')}
        countLabel={t('demandRequestCount', { count: stats.lifetime.taskCount })}
        slotPrefix={t('demandSlotsLabel')}
        topPrefix={t('demandTopItemsLabel')}
        slotEmpty={t('demandSlotsEmpty')}
        slotTranslate={(slot) => slotLabel(t, slot)}
        nameTranslate={(item) =>
          getLocalizedItemName(item.itemId, locale, item.itemName) ??
          item.itemName ??
          item.itemId
        }
        unitLabel={t('demandUnit')}
      />
    </section>
  )
}

interface DemandBucketProps {
  title: string
  bucket: CraftDemandBucket
  emptyLabel: string
  countLabel: string
  slotPrefix: string
  topPrefix: string
  slotEmpty: string
  unitLabel: string
  slotTranslate: (slot: string) => string
  nameTranslate: (item: CraftDemandTopItem) => string
}

function DemandBucket({
  title,
  bucket,
  emptyLabel,
  countLabel,
  slotPrefix,
  topPrefix,
  slotEmpty,
  unitLabel,
  slotTranslate,
  nameTranslate,
}: DemandBucketProps) {
  const isEmpty = bucket.topItems.length === 0
  const topMaxCount = isEmpty ? 0 : bucket.topItems[0].count

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {title}
        </p>
        <p className="text-[11px] text-gray-500 tabular-nums">{countLabel}</p>
      </div>

      {isEmpty ? (
        <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          {/* 좌측: 아이템 Top N */}
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <TrendingUp size={11} className="text-amber-300" />
              {topPrefix}
            </p>
            <ul className="space-y-1.5">
              {bucket.topItems.map((item) => {
                const widthPct =
                  topMaxCount === 0 ? 0 : Math.round((item.count / topMaxCount) * 100)
                const slots = item.slots
                  .filter((s) => s in SLOT_LABEL_KEYS)
                  .map((s) => slotTranslate(s))
                return (
                  <li key={item.itemId} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-100">
                        {nameTranslate(item)}
                      </span>
                      <span className="tabular-nums text-amber-200 whitespace-nowrap">
                        {item.count.toLocaleString('en-US')}
                        <span className="text-gray-500 ml-1">{unitLabel}</span>
                      </span>
                    </div>
                    {/* 막대로 상대 비율 시각화 — top 1 기준 정규화 */}
                    <div className="relative h-1.5 bg-gray-900 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-amber-500/70"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    {slots.length > 0 && (
                      <p className="text-[10px] text-gray-500">{slots.join(' · ')}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* 우측: 슬롯별 합계 */}
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-gray-500">{slotPrefix}</p>
            {bucket.slotTotals.length === 0 ? (
              <p className="text-xs text-gray-600">{slotEmpty}</p>
            ) : (
              <ul className="space-y-1.5">
                {bucket.slotTotals.map((s) => (
                  <li
                    key={s.slotKey}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-gray-300">{slotTranslate(s.slotKey)}</span>
                    <span className="tabular-nums text-gray-100">
                      {s.count.toLocaleString('en-US')}
                      <span className="text-gray-500 ml-1">{unitLabel}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function slotLabel(
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>,
  slot: string,
): string {
  const i18nKey = SLOT_LABEL_KEYS[slot]
  if (i18nKey) {
    try {
      return t(i18nKey as Parameters<typeof t>[0])
    } catch {
      // fallthrough to korean default below
    }
  }
  return SLOT_LABELS[slot as SlotKey] ?? slot
}

interface ModeToggleProps {
  mode: CraftDemandStatsMode
  preservedParams: Record<string, string>
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>
}

// scroll={false} 로 패널 위치를 유지한 채 토글. 두 모드만 있어 라디오 한 쌍.
function ModeToggle({ mode, preservedParams, t }: ModeToggleProps) {
  const options: { id: CraftDemandStatsMode; label: string }[] = [
    { id: 'delivered', label: t('demandModeDelivered') },
    { id: 'all', label: t('demandModeAll') },
  ]
  return (
    <div
      role="tablist"
      aria-label={t('demandModeLabel')}
      className="inline-flex rounded-lg border border-gray-800 bg-gray-950 p-0.5 text-[11px]"
    >
      {options.map((opt) => {
        const active = opt.id === mode
        return (
          <Link
            key={opt.id}
            role="tab"
            aria-selected={active}
            href={buildStatsHref(preservedParams, opt.id)}
            scroll={false}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              active
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                : 'text-gray-400 border border-transparent hover:text-gray-200'
            }`}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}

function buildStatsHref(
  preservedParams: Record<string, string>,
  targetMode: CraftDemandStatsMode,
): string {
  const params = new URLSearchParams(preservedParams)
  if (targetMode === 'all') params.set('statsMode', 'all')
  else params.delete('statsMode')
  const qs = params.toString()
  return qs ? `/admin/dashboard/craft?${qs}` : '/admin/dashboard/craft'
}
