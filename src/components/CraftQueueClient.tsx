'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Box, Hammer, X, Settings2, ChevronDown, MapPin } from 'lucide-react'
import {
  setMyCrafterDefaults,
  computeAutoAssignBox,
  type CraftQueueItem,
  type CraftBoxConfig,
  type CrafterProfile,
  type CraftCompensationMode,
  type AutoAssignReason,
} from '@/app/actions/craft'
import {
  claimCraftQueueItem,
  releaseCraftQueueItem,
  deliverCraftQueueItem,
  bulkClaimCraftQueueItems,
  bulkReleaseCraftQueueItems,
} from '@/app/actions/craft-queue'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  groupByEvent,
  formatGatherTime,
  type EventGroup,
} from '@/lib/craft-grouping'
import {
  CRAFT_CITIES,
  CITY_BADGE_STYLE,
  getTaskCities,
  type CraftCity,
} from '@/lib/crafting-cities'

const CITY_FILTER_STORAGE_KEY = 'albion-zvz:craft-city-filter'

interface Props {
  queued: CraftQueueItem[]
  mine: CraftQueueItem[]
  profile: CrafterProfile | null
  config: CraftBoxConfig
  // 길드 재고 (장비) — itemId → 수량. BuildPreview 의 부위별 재고 배지 노출용.
  // tracked 안 되는 부위 (가방 등) 는 키 자체가 없을 수 있고 그건 배지 미노출.
  stockByItemId: Record<string, number>
  // 'browse' = 큐 수주 화면(/craft/queue), 'mine' = 내 작업 관리(/craft/my-tasks).
  // 두 화면이 같은 컴포넌트를 공유하되 어떤 섹션을 렌더링할지만 다르다.
  mode?: 'browse' | 'mine'
}

export default function CraftQueueClient({
  queued,
  mine,
  profile,
  config,
  stockByItemId,
  mode = 'browse',
}: Props) {
  const t = useTranslations('craftQueue')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const toast = useToast()

  const [claimTarget, setClaimTarget] = useState<CraftQueueItem | null>(null)
  const [deliverTarget, setDeliverTarget] = useState<CraftQueueItem | null>(null)
  const [selectedQueued, setSelectedQueued] = useState<Set<string>>(new Set())
  const [selectedMine, setSelectedMine] = useState<Set<string>>(new Set())
  const [bulkPending, startBulk] = useTransition()
  // 도시 필터 — 비어 있으면 전체 표시. localStorage 에 저장해서 새로고침/재방문에도
  // 유지. SSR hydration mismatch 방지를 위해 빈 Set 으로 시작 후 useEffect 로 로드.
  const [cityFilter, setCityFilter] = useState<Set<CraftCity>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CITY_FILTER_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      const valid = parsed.filter(
        (c): c is CraftCity =>
          typeof c === 'string' && (CRAFT_CITIES as readonly string[]).includes(c),
      )
      // mount-only localStorage hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (valid.length > 0) setCityFilter(new Set(valid))
    } catch {
      // 망가진 JSON 은 무시 — 기본값(전체) 으로 가는 게 안전.
    }
  }, [])

  const updateCityFilter = (next: Set<CraftCity>) => {
    setCityFilter(next)
    try {
      localStorage.setItem(CITY_FILTER_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // localStorage 가 막혀 있어도 페이지 작동은 계속.
    }
  }

  const toggleCityFilter = (city: CraftCity) => {
    const next = new Set(cityFilter)
    if (next.has(city)) next.delete(city)
    else next.add(city)
    updateCityFilter(next)
  }

  const clearCityFilter = () => updateCityFilter(new Set())

  const filteredQueued = useMemo(() => {
    if (cityFilter.size === 0) return queued
    return queued.filter((item) => {
      const cities = getTaskCities(item.buildSnapshot)
      for (const c of cities) if (cityFilter.has(c)) return true
      return false
    })
  }, [queued, cityFilter])

  const filteredMine = useMemo(() => {
    if (cityFilter.size === 0) return mine
    return mine.filter((item) => {
      const cities = getTaskCities(item.buildSnapshot)
      for (const c of cities) if (cityFilter.has(c)) return true
      return false
    })
  }, [mine, cityFilter])

  const claimedTasks = useMemo(
    () => filteredMine.filter((m) => m.status === 'claimed'),
    [filteredMine],
  )
  const deliveredTasks = useMemo(
    () => filteredMine.filter((m) => m.status === 'delivered'),
    [filteredMine],
  )

  const queuedIds = useMemo(() => filteredQueued.map((q) => q.taskId), [filteredQueued])
  const claimedIds = useMemo(() => claimedTasks.map((m) => m.taskId), [claimedTasks])

  const queuedGroups = useMemo(() => groupByEvent(filteredQueued), [filteredQueued])
  const claimedGroups = useMemo(() => groupByEvent(claimedTasks), [claimedTasks])
  const deliveredGroups = useMemo(() => groupByEvent(deliveredTasks), [deliveredTasks])

  // 사용자가 명시적으로 접은 그룹 키만 저장 (기본값은 펼침).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 체크 / 해제 토글. 새 Set 으로 만들어 상태 변경.
  const toggleSelected = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSet(next)
  }

  const setAllSelected = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    ids: string[],
  ) => {
    if (set.size === ids.length && ids.every((id) => set.has(id))) {
      setSet(new Set())
    } else {
      setSet(new Set(ids))
    }
  }

  // 그룹 헤더의 select-all 토글: 그룹 안의 모든 task 선택/해제.
  const toggleGroupSelected = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    groupItemIds: string[],
  ) => {
    const allChecked =
      groupItemIds.length > 0 && groupItemIds.every((id) => set.has(id))
    const next = new Set(set)
    if (allChecked) {
      groupItemIds.forEach((id) => next.delete(id))
    } else {
      groupItemIds.forEach((id) => next.add(id))
    }
    setSet(next)
  }

  const handleBulkClaim = () => {
    if (selectedQueued.size === 0) return
    const mode: CraftCompensationMode = profile?.compensationMode ?? 'volunteer'
    const premium = profile?.premiumPct ?? 0
    startBulk(async () => {
      const r = await bulkClaimCraftQueueItems(Array.from(selectedQueued), mode, premium)
      if (r.error) {
        toast.error(r.error)
        return
      }
      if (r.failed > 0) {
        toast.error(t('bulkClaimPartial', { ok: r.ok, failed: r.failed }))
      } else {
        toast.success(t('bulkClaimDone', { ok: r.ok }))
      }
      setSelectedQueued(new Set())
      router.refresh()
    })
  }

  const handleBulkRelease = () => {
    if (selectedMine.size === 0) return
    startBulk(async () => {
      const r = await bulkReleaseCraftQueueItems(Array.from(selectedMine))
      if (r.error) {
        toast.error(r.error)
        return
      }
      if (r.failed > 0) {
        toast.error(t('bulkReleasePartial', { ok: r.ok, failed: r.failed }))
      } else {
        toast.success(t('bulkReleaseDone', { ok: r.ok }))
      }
      setSelectedMine(new Set())
      router.refresh()
    })
  }

  // 필터링 전 원본 카운트 — "x / y" 표시 및 "필터 적용 중" 헤더 노출에 사용.
  const totalRaw = mode === 'browse' ? queued.length : mine.length
  const totalFiltered = mode === 'browse' ? filteredQueued.length : filteredMine.length

  return (
    <div className="space-y-6">
      <CrafterDefaultsCard
        profile={profile}
        onUpdated={() => router.refresh()}
      />

      <CityFilterBar
        selected={cityFilter}
        onToggle={toggleCityFilter}
        onClear={clearCityFilter}
        totalRaw={totalRaw}
        totalFiltered={totalFiltered}
      />

      {mode === 'browse' && (
      <section className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('queueTitle')}
          <span className="text-xs text-gray-500">({filteredQueued.length})</span>
        </h2>
        {filteredQueued.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-2xl px-4 py-6 text-center">
            {cityFilter.size > 0 && queued.length > 0
              ? t('queueEmptyFiltered')
              : t('queueEmpty')}
          </p>
        ) : (
          <>
            <BulkActionBar
              selectedCount={selectedQueued.size}
              totalCount={filteredQueued.length}
              onToggleAll={() => setAllSelected(selectedQueued, setSelectedQueued, queuedIds)}
              onClear={() => setSelectedQueued(new Set())}
              actionLabel={t('bulkClaimButton', { count: selectedQueued.size })}
              onAction={handleBulkClaim}
              actionTone="amber"
              pending={bulkPending}
              t={t}
            />
            <div className="space-y-4">
              {queuedGroups.map((group) => {
                const groupItemIds = group.items.map((i) => i.taskId)
                const isCollapsed = collapsedGroups.has(group.key)
                const allChecked =
                  groupItemIds.length > 0 &&
                  groupItemIds.every((id) => selectedQueued.has(id))
                return (
                  <div key={group.key} className="space-y-2">
                    <EventGroupHeader
                      group={group}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={() => toggleGroupCollapsed(group.key)}
                      allChecked={allChecked}
                      onToggleAll={() =>
                        toggleGroupSelected(
                          selectedQueued,
                          setSelectedQueued,
                          groupItemIds,
                        )
                      }
                      disabled={bulkPending}
                    />
                    {!isCollapsed && (
                      <ul className="space-y-3">
                        {group.items.map((item) => {
                          const checked = selectedQueued.has(item.taskId)
                          return (
                            <li
                              key={item.taskId}
                              className={`bg-gray-900 border rounded-2xl p-4 space-y-3 ${
                                checked ? 'border-amber-400/60' : 'border-gray-700'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleSelected(selectedQueued, setSelectedQueued, item.taskId)
                                  }
                                  disabled={bulkPending}
                                  className="mt-1 rounded border-gray-700 bg-gray-950 flex-shrink-0"
                                  aria-label={t('selectTask')}
                                />
                                <div className="flex-1 min-w-0 space-y-3">
                                  <TaskHeader item={item} tRole={tRole} />
                                  <BuildPreview
                                    snapshot={item.buildSnapshot}
                                    stockByItemId={stockByItemId}
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <Link
                                      href={`/craft/queue/${item.taskId}`}
                                      className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
                                    >
                                      {t('detailButton')}
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => setClaimTarget(item)}
                                      disabled={bulkPending}
                                      className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-3 py-2"
                                    >
                                      {t('claimButton')}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
      )}

      {mode === 'mine' && (
      <section className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Box size={16} className="text-emerald-400" />
          {t('mineTitle')}
          <span className="text-xs text-gray-500">({filteredMine.length})</span>
        </h2>
        {filteredMine.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-2xl px-4 py-6 text-center">
            {cityFilter.size > 0 && mine.length > 0
              ? t('mineEmptyFiltered')
              : t('mineEmpty')}
          </p>
        ) : (
          <div className="space-y-4">
            {claimedTasks.length > 0 && (
              <BulkActionBar
                selectedCount={selectedMine.size}
                totalCount={claimedTasks.length}
                onToggleAll={() => setAllSelected(selectedMine, setSelectedMine, claimedIds)}
                onClear={() => setSelectedMine(new Set())}
                actionLabel={t('bulkReleaseButton', { count: selectedMine.size })}
                onAction={handleBulkRelease}
                actionTone="rose"
                pending={bulkPending}
                t={t}
              />
            )}
            {claimedGroups.map((group) => {
              const groupItemIds = group.items.map((i) => i.taskId)
              const isCollapsed = collapsedGroups.has(`mine:${group.key}`)
              const allChecked =
                groupItemIds.length > 0 &&
                groupItemIds.every((id) => selectedMine.has(id))
              return (
                <div key={`mine:${group.key}`} className="space-y-2">
                  <EventGroupHeader
                    group={group}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleGroupCollapsed(`mine:${group.key}`)}
                    allChecked={allChecked}
                    onToggleAll={() =>
                      toggleGroupSelected(selectedMine, setSelectedMine, groupItemIds)
                    }
                    disabled={bulkPending}
                  />
                  {!isCollapsed && (
                    <ul className="space-y-3">
                      {group.items.map((item) => {
                        const checked = selectedMine.has(item.taskId)
                        return (
                          <li
                            key={item.taskId}
                            className={`bg-gray-900 border rounded-2xl p-4 space-y-3 ${
                              checked ? 'border-rose-400/60' : 'border-amber-500/30'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleSelected(selectedMine, setSelectedMine, item.taskId)
                                }
                                disabled={bulkPending}
                                className="mt-1 rounded border-gray-700 bg-gray-950 flex-shrink-0"
                                aria-label={t('selectTask')}
                              />
                              <div className="flex-1 min-w-0 space-y-3">
                                <TaskHeader item={item} tRole={tRole} />
                                <BuildPreview
                                  snapshot={item.buildSnapshot}
                                  stockByItemId={stockByItemId}
                                />
                                <ClaimedActions
                                  item={item}
                                  onDeliver={() => setDeliverTarget(item)}
                                  onAfter={() => router.refresh()}
                                />
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
            {deliveredGroups.map((group) => {
              const isCollapsed = collapsedGroups.has(`delivered:${group.key}`)
              return (
                <div key={`delivered:${group.key}`} className="space-y-2">
                  <EventGroupHeader
                    group={group}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleGroupCollapsed(`delivered:${group.key}`)}
                    disabled={bulkPending}
                  />
                  {!isCollapsed && (
                    <ul className="space-y-3">
                      {group.items.map((item) => (
                        <li
                          key={item.taskId}
                          className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3"
                        >
                          <TaskHeader item={item} tRole={tRole} />
                          <BuildPreview
                            snapshot={item.buildSnapshot}
                            stockByItemId={stockByItemId}
                          />
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                            <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-0.5 font-mono">
                              {t('boxLabel', { n: item.boxNumber ?? 0 })}
                            </span>
                            {item.craftCity && <span className="text-gray-500">· {item.craftCity}</span>}
                            {item.materialSilverCost != null && (
                              <span className="text-gray-500">
                                · {t('materialSpent', { silver: formatSilver(item.materialSilverCost) })}
                              </span>
                            )}
                            <Link
                              href={`/craft/queue/${item.taskId}`}
                              className="ml-auto text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-2 py-1"
                            >
                              {t('detailButton')}
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
      )}

      {claimTarget && (
        <ClaimDialog
          item={claimTarget}
          defaultMode={profile?.compensationMode ?? 'volunteer'}
          defaultPremiumPct={profile?.premiumPct ?? 0}
          onClose={() => setClaimTarget(null)}
          onSuccess={() => {
            setClaimTarget(null)
            toast.success(t('toastClaimed'))
            router.refresh()
          }}
        />
      )}

      {deliverTarget && (
        <DeliverDialog
          item={deliverTarget}
          config={config}
          onClose={() => setDeliverTarget(null)}
          onSuccess={() => {
            setDeliverTarget(null)
            toast.success(t('toastDelivered'))
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

interface EventGroupHeaderProps {
  group: EventGroup
  isCollapsed: boolean
  onToggleCollapse: () => void
  // 선택 토글이 의미 없는 그룹(deliveredGroups 등)에서는 모두 생략 가능.
  allChecked?: boolean
  onToggleAll?: () => void
  disabled?: boolean
}

function EventGroupHeader({
  group,
  isCollapsed,
  onToggleCollapse,
  allChecked,
  onToggleAll,
  disabled,
}: EventGroupHeaderProps) {
  const t = useTranslations('craftQueue')
  const showSelectAll = onToggleAll != null
  const isNoEvent = !group.eventId
  const title = isNoEvent ? t('groupNoEvent') : group.eventTitle
  const gatherLabel = isNoEvent
    ? null
    : group.gatherAt
      ? t('groupGatherAt', { time: formatGatherTime(group.gatherAt) })
      : t('groupGatherAtUnset')
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? t('groupExpand') : t('groupCollapse')}
        className="text-gray-500 hover:text-white flex-shrink-0"
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {showSelectAll && (
        <input
          type="checkbox"
          checked={allChecked ?? false}
          onChange={onToggleAll}
          disabled={disabled}
          className="rounded border-gray-700 bg-gray-950 flex-shrink-0"
          aria-label={t('selectAllLabel')}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
          {gatherLabel && <span>{gatherLabel}</span>}
          <span className={gatherLabel ? 'text-gray-500' : ''}>
            {gatherLabel ? '· ' : ''}{t('groupCount', { count: group.items.length })}
          </span>
          {group.totalClaimedSilver > 0 && (
            <span className="text-amber-300 font-mono">
              · {t('groupSilverTotal', { silver: formatSilver(group.totalClaimedSilver) })}
            </span>
          )}
        </p>
        {isNoEvent && (
          <p className="text-[10px] text-amber-300/70 mt-0.5">{t('groupNoEventHint')}</p>
        )}
      </div>
    </div>
  )
}

interface TaskHeaderProps {
  item: CraftQueueItem
  tRole: ReturnType<typeof useTranslations>
}

function TaskHeader({ item, tRole }: TaskHeaderProps) {
  const t = useTranslations('craftQueue')
  const cities = useMemo(() => getTaskCities(item.buildSnapshot), [item.buildSnapshot])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold truncate">{item.eventTitle}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {t('requesterLine', { name: item.requesterUsername })}
            <span className="ml-2 text-gray-500">· {translateSlotRole(item.roleName, tRole)}</span>
            {item.claimedSilver != null && (
              <span className="ml-2 text-amber-300 font-mono">{formatSilver(item.claimedSilver)}</span>
            )}
          </p>
        </div>
      </div>
      {cities.size > 0 && <TaskCityBadges cities={cities} />}
    </div>
  )
}

function TaskCityBadges({ cities }: { cities: Set<CraftCity> }) {
  const t = useTranslations('craftQueue')
  // 표시 순서를 CRAFT_CITIES 의 정의 순으로 고정 → 카드 간 일관된 정렬.
  const ordered = CRAFT_CITIES.filter((c) => cities.has(c))
  return (
    <div className="flex flex-wrap items-center gap-1">
      <MapPin size={10} className="text-gray-500 mr-0.5 flex-shrink-0" />
      {ordered.map((city) => (
        <span
          key={city}
          className={`text-[10px] font-bold border rounded px-1.5 py-0.5 ${CITY_BADGE_STYLE[city]}`}
        >
          {t(`cityBonus.${city}`)}
        </span>
      ))}
    </div>
  )
}

interface CityFilterBarProps {
  selected: Set<CraftCity>
  onToggle: (city: CraftCity) => void
  onClear: () => void
  totalRaw: number
  totalFiltered: number
}

function CityFilterBar({
  selected,
  onToggle,
  onClear,
  totalRaw,
  totalFiltered,
}: CityFilterBarProps) {
  const t = useTranslations('craftQueue')
  const isFiltering = selected.size > 0
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin size={12} className="text-amber-400" />
          {t('cityFilter.title')}
        </p>
        {isFiltering && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-2 py-1"
          >
            {t('cityFilter.clear')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_CITIES.map((city) => {
          const active = selected.has(city)
          return (
            <button
              key={city}
              type="button"
              onClick={() => onToggle(city)}
              className={`text-[11px] font-bold border rounded-lg px-2.5 py-1 transition ${
                active
                  ? CITY_BADGE_STYLE[city]
                  : 'border-gray-700 bg-gray-950 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {t(`cityBonus.${city}`)}
            </button>
          )
        })}
      </div>
      {isFiltering && (
        <p className="text-[10px] text-gray-500">
          {t('cityFilter.matchCount', { matched: totalFiltered, total: totalRaw })}
        </p>
      )}
    </section>
  )
}

interface BuildPreviewProps {
  snapshot: BuildSnapshot | null
  stockByItemId: Record<string, number>
}

function BuildPreview({ snapshot, stockByItemId }: BuildPreviewProps) {
  const tGear = useTranslations('gear')
  const t = useTranslations('craftQueue')
  if (!snapshot) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2.5">
      {SLOT_KEYS.map((key: SlotKey) => {
        const item = snapshot[key]
        if (!item) return null
        // 재고 키 자체가 없으면 tracked 안 되는 부위 (가방 등) — 배지 미노출.
        // 0 이상이면 항상 표시 (색은 stock 0 이면 회색, > 0 이면 emerald).
        // item.id 가 null 인 경우 (자유 선택 슬롯) 도 배지 미노출.
        const stock = item.id ? stockByItemId[item.id] : undefined
        const tracked = stock != null
        const inStock = tracked && stock > 0
        return (
          <div key={key} className="flex flex-col items-center" title={tGear(key)}>
            <ItemImage itemId={item.id} itemName={item.name} size={36} hoverPreview />
            {tracked && (
              <span
                className={`text-[10px] font-mono mt-0.5 px-1 rounded leading-none py-0.5 ${
                  inStock
                    ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/30'
                    : 'text-gray-500 bg-gray-950 border border-gray-800'
                }`}
                aria-label={t('stockBadgeAria', { count: stock })}
              >
                {t('stockBadge', { count: stock })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ClaimedActionsProps {
  item: CraftQueueItem
  onDeliver: () => void
  onAfter: () => void
}

function ClaimedActions({ item, onDeliver, onAfter }: ClaimedActionsProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const handleRelease = () => {
    startTransition(async () => {
      const r = await releaseCraftQueueItem(item.taskId)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.info(t('toastReleased'))
      onAfter()
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/craft/queue/${item.taskId}`}
        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
      >
        {t('detailButton')}
      </Link>
      <button
        type="button"
        onClick={handleRelease}
        disabled={pending}
        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {pending ? t('releasing') : t('releaseButton')}
      </button>
      <button
        type="button"
        onClick={onDeliver}
        className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2"
      >
        {t('deliverButton')}
      </button>
    </div>
  )
}

interface CrafterDefaultsCardProps {
  profile: CrafterProfile | null
  onUpdated: () => void
}

function CrafterDefaultsCard({ profile, onUpdated }: CrafterDefaultsCardProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CraftCompensationMode>(profile?.compensationMode ?? 'volunteer')
  const [premiumPct, setPremiumPct] = useState(String(profile?.premiumPct ?? 0))
  const [pending, startTransition] = useTransition()

  if (!profile) return null

  const save = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await setMyCrafterDefaults(mode, parsed)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastDefaultsSaved'))
      setOpen(false)
      onUpdated()
    })
  }

  const hasRange = profile.boxRangeStart != null && profile.boxRangeEnd != null

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings2 size={14} className="text-amber-400" />
            {t('defaultsTitle')}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {t('defaultsCurrent', {
              mode: profile.compensationMode === 'paid' ? t('modePaid') : t('modeVolunteer'),
              premium: profile.premiumPct,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
        >
          {open ? t('cancel') : t('edit')}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
        <Box size={12} className="text-emerald-400" />
        {hasRange ? (
          <span>
            {t('boxRangeAssigned', {
              start: profile.boxRangeStart!,
              end: profile.boxRangeEnd!,
            })}
          </span>
        ) : (
          <span className="text-amber-300/80">{t('boxRangeUnassigned')}</span>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(['volunteer', 'paid'] as const).map((m) => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-left rounded-lg border px-3 py-2 ${
                    active
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <p className="text-xs font-bold">
                    {m === 'paid' ? t('modePaid') : t('modeVolunteer')}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {m === 'paid' ? t('modePaidHint') : t('modeVolunteerHint')}
                  </p>
                </button>
              )
            })}
          </div>
          {mode === 'paid' && (
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{t('premiumLabel')}</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={premiumPct}
                onChange={(e) => setPremiumPct(e.target.value)}
                disabled={pending}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">{t('premiumHint')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-3 py-2"
          >
            {pending ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </section>
  )
}

interface ClaimDialogProps {
  item: CraftQueueItem
  defaultMode: CraftCompensationMode
  defaultPremiumPct: number
  onClose: () => void
  onSuccess: () => void
}

function ClaimDialog({ item, defaultMode, defaultPremiumPct, onClose, onSuccess }: ClaimDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [mode, setMode] = useState<CraftCompensationMode>(defaultMode)
  const [premiumPct, setPremiumPct] = useState(String(defaultPremiumPct))
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  const submit = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await claimCraftQueueItem({
        taskId: item.taskId,
        compensationMode: mode,
        premiumPct: parsed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('claimDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('claimDialogHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['volunteer', 'paid'] as const).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={pending}
              className={`text-left rounded-lg border px-3 py-2 ${
                active
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
              } disabled:opacity-50`}
            >
              <p className="text-xs font-bold">
                {m === 'paid' ? t('modePaid') : t('modeVolunteer')}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {m === 'paid' ? t('modePaidHint') : t('modeVolunteerHint')}
              </p>
            </button>
          )
        })}
      </div>
      {mode === 'paid' && (
        <div>
          <label className="block text-[11px] text-gray-400 mb-1">{t('premiumLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            value={premiumPct}
            onChange={(e) => setPremiumPct(e.target.value)}
            disabled={pending}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {pending ? t('claiming') : t('confirmClaim')}
        </button>
      </div>
    </ModalShell>
  )
}

interface DeliverDialogProps {
  item: CraftQueueItem
  config: CraftBoxConfig
  onClose: () => void
  onSuccess: () => void
}

function DeliverDialog({ item, config, onClose, onSuccess }: DeliverDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [boxNumber, setBoxNumber] = useState('')
  const [autoAssignReason, setAutoAssignReason] = useState<AutoAssignReason | null>(null)
  const [materialCost, setMaterialCost] = useState<string>('')
  const [submitting, startSubmit] = useTransition()

  // 모달이 열리면 서버에서 자동 박스 배정을 시도한다 — 같은 요청자가 이미 점유한
  // 박스가 있으면 재사용, 없으면 크래프터 범위 안 빈 번호. 실패해도 수동 입력은
  // 항상 가능하다.
  useEffect(() => {
    let cancelled = false
    void computeAutoAssignBox(item.taskId).then((res) => {
      if (cancelled) return
      setAutoAssignReason(res.reason)
      if (res.boxNumber != null) setBoxNumber(String(res.boxNumber))
    })
    return () => {
      cancelled = true
    }
  }, [item.taskId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const submit = () => {
    const box = Number(boxNumber)
    if (!Number.isFinite(box) || !Number.isInteger(box) || box < 1) {
      toast.error(t('boxInvalid'))
      return
    }
    if (box < config.rangeMin || box > config.rangeMax) {
      toast.error(t('boxOutOfRange', { min: config.rangeMin, max: config.rangeMax }))
      return
    }
    const material = Number(materialCost)
    if (!Number.isFinite(material) || !Number.isInteger(material) || material < 0) {
      toast.error(t('materialInvalid'))
      return
    }
    startSubmit(async () => {
      const r = await deliverCraftQueueItem({
        taskId: item.taskId,
        boxNumber: box,
        materialSilverCost: material,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  const pending = submitting
  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('deliverDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('deliverDialogHint')}</p>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">
          {t('boxLabelInput', { min: config.rangeMin, max: config.rangeMax })}
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={config.rangeMin}
          max={config.rangeMax}
          value={boxNumber}
          onChange={(e) => setBoxNumber(e.target.value)}
          disabled={pending}
          placeholder={t('boxPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
        {autoAssignReason && (
          <p
            className={`text-[10px] mt-1 ${
              autoAssignReason === 'rangeFull' || autoAssignReason === 'noRange'
                ? 'text-amber-300/80'
                : 'text-emerald-300/80'
            }`}
          >
            {t(`autoAssignReason.${autoAssignReason}`)}
          </p>
        )}
      </div>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('materialLabel')}</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={materialCost}
          onChange={(e) => setMaterialCost(e.target.value)}
          disabled={pending}
          placeholder={t('materialPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
        <p className="text-[10px] text-gray-500 mt-1">{t('materialHint')}</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {submitting ? t('delivering') : t('confirmDeliver')}
        </button>
      </div>
    </ModalShell>
  )
}

interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  onToggleAll: () => void
  onClear: () => void
  actionLabel: string
  onAction: () => void
  actionTone: 'amber' | 'rose'
  pending: boolean
  t: ReturnType<typeof useTranslations>
}

function BulkActionBar({
  selectedCount,
  totalCount,
  onToggleAll,
  onClear,
  actionLabel,
  onAction,
  actionTone,
  pending,
  t,
}: BulkActionBarProps) {
  const allChecked = selectedCount > 0 && selectedCount === totalCount
  const actionClass =
    actionTone === 'amber'
      ? 'bg-amber-500 hover:bg-amber-400 text-black'
      : 'bg-rose-500 hover:bg-rose-400 text-white'
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={onToggleAll}
          disabled={pending || totalCount === 0}
          className="rounded border-gray-700 bg-gray-950"
          aria-label={t('selectAllLabel')}
        />
        {t('selectAllLabel')}
      </label>
      <span className="text-[11px] text-gray-500">
        {t('selectedCount', { count: selectedCount })}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="text-[11px] text-gray-400 hover:text-white px-2 py-1 disabled:opacity-50"
          >
            {t('clearSelectionLabel')}
          </button>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={pending || selectedCount === 0}
          className={`text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50 ${actionClass}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

interface ModalShellProps {
  onClose: () => void
  title: string
  children: React.ReactNode
}

function ModalShell({ onClose, title, children }: ModalShellProps) {
  // body scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">{children}</div>
      </div>
    </div>
  )
}
