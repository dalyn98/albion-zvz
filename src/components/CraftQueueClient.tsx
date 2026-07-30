'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Box, Hammer } from 'lucide-react'
import {
  type CraftBoxConfig,
  type CraftCompensationMode,
  type CraftQueueItem,
  type CrafterProfile,
} from '@/app/actions/craft'
import {
  bulkClaimCraftQueueItems,
  bulkReleaseCraftQueueItems,
} from '@/app/actions/craft-queue'
import { formatSilver } from '@/lib/silver'
import { useToast } from './ToastProvider'
import { groupByEvent } from '@/lib/craft-grouping'
import { reconcileSelectionWithVisible } from '@/lib/workflow-state'
import {
  CRAFT_CITIES,
  getTaskCities,
  type CraftCity,
} from '@/lib/crafting-cities'
import {
  BulkActionBar,
  BuildPreview,
  CityFilterBar,
  ClaimedActions,
  CrafterDefaultsCard,
  EventGroupHeader,
  TaskHeader,
} from './CraftQueueParts'
import { ClaimDialog, DeliverDialog } from './CraftQueueDialogs'

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
  readOnly?: boolean
}

export default function CraftQueueClient({
  queued,
  mine,
  profile,
  config,
  stockByItemId,
  mode = 'browse',
  readOnly = false,
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
      const cities = getTaskCities(item.buildSnapshot, item.craftIncludedSlots)
      for (const c of cities) if (cityFilter.has(c)) return true
      return false
    })
  }, [queued, cityFilter])

  const filteredMine = useMemo(() => {
    if (cityFilter.size === 0) return mine
    return mine.filter((item) => {
      const cities = getTaskCities(item.buildSnapshot, item.craftIncludedSlots)
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
  const visibleSelectedQueued = useMemo(
    () => reconcileSelectionWithVisible(selectedQueued, queuedIds),
    [selectedQueued, queuedIds],
  )
  const visibleSelectedMine = useMemo(
    () => reconcileSelectionWithVisible(selectedMine, claimedIds),
    [selectedMine, claimedIds],
  )

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
    if (visibleSelectedQueued.size === 0) return
    const mode: CraftCompensationMode = profile?.compensationMode ?? 'volunteer'
    const premium = profile?.premiumPct ?? 0
    startBulk(async () => {
      const r = await bulkClaimCraftQueueItems([...visibleSelectedQueued], mode, premium)
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
    if (visibleSelectedMine.size === 0) return
    startBulk(async () => {
      const r = await bulkReleaseCraftQueueItems([...visibleSelectedMine])
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
      {!readOnly && (
        <CrafterDefaultsCard
          profile={profile}
          onUpdated={() => router.refresh()}
        />
      )}

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
            {!readOnly && <BulkActionBar
              selectedCount={visibleSelectedQueued.size}
              totalCount={filteredQueued.length}
              onToggleAll={() => setAllSelected(selectedQueued, setSelectedQueued, queuedIds)}
              onClear={() => setSelectedQueued(new Set())}
              actionLabel={t('bulkClaimButton', { count: visibleSelectedQueued.size })}
              onAction={handleBulkClaim}
              actionTone="amber"
              pending={bulkPending}
              t={t}
            />}
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
                      allChecked={readOnly ? undefined : allChecked}
                      onToggleAll={readOnly ? undefined : () =>
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
                                {!readOnly && <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleSelected(selectedQueued, setSelectedQueued, item.taskId)
                                  }
                                  disabled={bulkPending}
                                  className="mt-1 rounded border-gray-700 bg-gray-950 flex-shrink-0"
                                  aria-label={t('selectTask')}
                                />}
                                <div className="flex-1 min-w-0 space-y-3">
                                  <TaskHeader item={item} tRole={tRole} />
                                  <BuildPreview
                                    snapshot={item.buildSnapshot}
                                    includedSlots={item.craftIncludedSlots}
                                    stockByItemId={stockByItemId}
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <Link
                                      href={`/craft/queue/${item.taskId}`}
                                      className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
                                    >
                                      {t('detailButton')}
                                    </Link>
                                    {!readOnly && <button
                                      type="button"
                                      onClick={() => setClaimTarget(item)}
                                      disabled={bulkPending}
                                      className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-3 py-2"
                                    >
                                      {t('claimButton')}
                                    </button>}
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
            {!readOnly && claimedTasks.length > 0 && (
              <BulkActionBar
                selectedCount={visibleSelectedMine.size}
                totalCount={claimedTasks.length}
                onToggleAll={() => setAllSelected(selectedMine, setSelectedMine, claimedIds)}
                onClear={() => setSelectedMine(new Set())}
                actionLabel={t('bulkReleaseButton', { count: visibleSelectedMine.size })}
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
                    allChecked={readOnly ? undefined : allChecked}
                    onToggleAll={readOnly ? undefined : () =>
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
                              {!readOnly && <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleSelected(selectedMine, setSelectedMine, item.taskId)
                                }
                                disabled={bulkPending}
                                className="mt-1 rounded border-gray-700 bg-gray-950 flex-shrink-0"
                                aria-label={t('selectTask')}
                              />}
                              <div className="flex-1 min-w-0 space-y-3">
                                <TaskHeader item={item} tRole={tRole} />
                                <BuildPreview
                                  snapshot={item.buildSnapshot}
                                  includedSlots={item.craftIncludedSlots}
                                  stockByItemId={stockByItemId}
                                />
                                {readOnly ? (
                                  <div className="flex justify-end">
                                    <Link
                                      href={`/craft/queue/${item.taskId}`}
                                      className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
                                    >
                                      {t('detailButton')}
                                    </Link>
                                  </div>
                                ) : (
                                  <ClaimedActions
                                    item={item}
                                    onDeliver={() => setDeliverTarget(item)}
                                    onAfter={() => router.refresh()}
                                  />
                                )}
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
                            includedSlots={item.craftIncludedSlots}
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
                            {(item.reimbursementSilver ?? 0) > 0 && (
                              <span
                                className={
                                  item.reimbursementStatus === 'approved'
                                    ? 'text-emerald-300 font-mono'
                                    : item.reimbursementStatus === 'rejected'
                                      ? 'text-rose-300 font-mono'
                                    : 'text-amber-300 font-mono'
                                }
                              >
                                · {item.reimbursementStatus === 'approved'
                                  ? t('reimbursementApproved', { silver: formatSilver(item.reimbursementSilver ?? 0) })
                                  : item.reimbursementStatus === 'rejected'
                                    ? t('reimbursementRejected', { silver: formatSilver(item.reimbursementSilver ?? 0) })
                                    : t('reimbursementPending', { silver: formatSilver(item.reimbursementSilver ?? 0) })}
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

      {!readOnly && claimTarget && (
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

      {!readOnly && deliverTarget && (
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
