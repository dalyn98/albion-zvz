'use server'

// 어드민 제작 통계 server actions. craft.ts 본체에서 분리 — 운영 KPI 가 아닌
// 인게임 수요 ("어떤 장비가 가장 많이 청구됐나" / "지금 진행 중인 작업이 어떤
// 장비를 필요로 하나") 만 집계한다. 둘 다 read-only 라 craft.ts 멤버 플로우와
// 코드 경로가 겹치지 않아 깔끔하게 떨어진다.

import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAnyCapability } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import {
  aggregateBuildSnapshots,
  type CraftItemAggregateRow,
} from '@/lib/craft-aggregation'
import { getCurrentWeekStartIso } from '@/lib/timezone'
import type { CraftTaskStatus } from '@/lib/craft-tasks'
import type { BuildSnapshot } from '@/types'

export interface CraftDemandTopItem {
  itemId: string
  itemName: string | null
  count: number
  // 같은 itemId 가 여러 슬롯에 등장한 경우 — 예: 한 손 단도가 weapon 과 offhand
  // 양쪽에 나오면 ['weapon','offhand']. UI 가 "주무기 외 보조무기로도 쓰임"
  // 같은 힌트를 표시할 때 활용.
  slots: string[]
}

export interface CraftDemandSlotBucket {
  // SLOT_KEYS 와 동일 (mount/food/potion 제외) — 표시 라벨은 i18n 측에서 매핑.
  slotKey: string
  count: number
}

export interface CraftDemandBucket {
  taskCount: number
  topItems: CraftDemandTopItem[]
  slotTotals: CraftDemandSlotBucket[]
}

export interface CraftDemandStatsResult {
  lifetime: CraftDemandBucket
  weekly: CraftDemandBucket
  weekSinceIso: string
  mode: CraftDemandStatsMode
}

// 'all' = 모든 청구 (예전 동작) — 거절/취소 포함, "그 시점 수요" 관점.
// 'delivered' = 실제로 제작 납품된 작업 (craft_tasks.status in ('delivered','collected'))
//   기준 — "운영자가 정말로 만들어 채운 분량" 관점. 기본값은 'delivered'.
export type CraftDemandStatsMode = 'all' | 'delivered'

const DEMAND_TOP_ITEM_LIMIT = 8
const CRAFT_STATS_CAPS = [CAP.CRAFT_TASK_CREATE, CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER] as const

type CraftStatsDb = Awaited<ReturnType<typeof requireAnyCapability>>

export async function loadCraftDemandStatsAdmin(
  mode: CraftDemandStatsMode = 'delivered',
): Promise<{
  stats: CraftDemandStatsResult | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_STATS_CAPS)
    const session = await getSession()
    if (!session) return { stats: null, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const weekSinceIso = getCurrentWeekStartIso()

    const { lifetimeSnapshots, weeklySnapshots, error: queryError } =
      mode === 'delivered'
        ? await fetchDeliveredDemandSnapshots(db, guildId, weekSinceIso)
        : await fetchAllDemandSnapshots(db, guildId, weekSinceIso)
    if (queryError) return { stats: null, error: queryError }

    return {
      stats: {
        lifetime: bucketFromSnapshots(lifetimeSnapshots),
        weekly: bucketFromSnapshots(weeklySnapshots),
        weekSinceIso,
        mode,
      },
    }
  } catch (e) {
    return {
      stats: null,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

interface DemandSnapshotResult {
  lifetimeSnapshots: (BuildSnapshot | null)[]
  weeklySnapshots: (BuildSnapshot | null)[]
  error?: string
}

async function fetchAllDemandSnapshots(
  db: CraftStatsDb,
  guildId: string,
  weekSinceIso: string,
): Promise<DemandSnapshotResult> {
  // 자동 리기어 (auto_generated=true) 도 포함해야 사망 트래킹 흐름의 수요까지
  // 한 그래프로 보인다. 어드민이 거절·취소한 건도 "그 시점 수요" 로는 유효 —
  // status 필터를 걸지 않는다.
  const { data, error } = await db
    .from('regear_requests')
    .select('build_snapshot, created_at')
    .eq('guild_id', guildId)
  if (error) {
    return { lifetimeSnapshots: [], weeklySnapshots: [], error: error.message }
  }

  const rows = (data ?? []) as Array<{
    build_snapshot: unknown
    created_at: string
  }>

  const lifetimeSnapshots: (BuildSnapshot | null)[] = []
  const weeklySnapshots: (BuildSnapshot | null)[] = []
  for (const row of rows) {
    const snap = (row.build_snapshot as BuildSnapshot | null) ?? null
    lifetimeSnapshots.push(snap)
    if (row.created_at >= weekSinceIso) weeklySnapshots.push(snap)
  }

  return { lifetimeSnapshots, weeklySnapshots }
}

async function fetchDeliveredDemandSnapshots(
  db: CraftStatsDb,
  guildId: string,
  weekSinceIso: string,
): Promise<DemandSnapshotResult> {
  // 'delivered' 모드: 제작자가 실제로 박스에 납품한 작업 (status delivered/collected)
  // 만 집계. 시간 기준은 craft_tasks.delivered_at — "이번 주에 만들어진 분량"
  // 의미를 살리기 위해 regear_requests.created_at 대신 사용.
  const { data, error } = await db
    .from('craft_tasks')
    .select('delivered_at, regear_requests!inner(build_snapshot)')
    .eq('guild_id', guildId)
    .in('status', ['delivered', 'collected'])
    .not('delivered_at', 'is', null)
  if (error) {
    return { lifetimeSnapshots: [], weeklySnapshots: [], error: error.message }
  }

  const rows = (data ?? []) as Array<{
    delivered_at: string | null
    regear_requests:
      | { build_snapshot: unknown }
      | { build_snapshot: unknown }[]
      | null
  }>

  const lifetimeSnapshots: (BuildSnapshot | null)[] = []
  const weeklySnapshots: (BuildSnapshot | null)[] = []
  for (const row of rows) {
    const r = Array.isArray(row.regear_requests)
      ? row.regear_requests[0]
      : row.regear_requests
    const snap = (r?.build_snapshot as BuildSnapshot | null) ?? null
    lifetimeSnapshots.push(snap)
    if (row.delivered_at && row.delivered_at >= weekSinceIso) {
      weeklySnapshots.push(snap)
    }
  }

  return { lifetimeSnapshots, weeklySnapshots }
}

function bucketFromSnapshots(snapshots: (BuildSnapshot | null)[]): CraftDemandBucket {
  const breakdown = aggregateBuildSnapshots(snapshots)
  const slotTotalsMap = new Map<string, number>()
  for (const item of breakdown.items) {
    for (const slot of item.slots) {
      slotTotalsMap.set(slot, (slotTotalsMap.get(slot) ?? 0) + item.count)
    }
  }
  const slotTotals = [...slotTotalsMap.entries()]
    .map(([slotKey, count]) => ({ slotKey, count }))
    .sort((a, b) => b.count - a.count)

  const topItems = breakdown.items.slice(0, DEMAND_TOP_ITEM_LIMIT).map((item) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    count: item.count,
    slots: [...item.slots],
  }))

  return {
    taskCount: breakdown.taskCount,
    topItems,
    slotTotals,
  }
}

// 진행 중인 제작 작업 (queued + claimed) 의 itemId 별 합산. delivered 는 이미
// 박스에 들어갔으니 작업 끝난 상태라 제외한다. 운영자가 "지금 길드 창고에서 어떤
// 장비를 미리 빼두면 제작자들이 일을 멈추지 않을까" 를 보기 위한 집계.
//
// 정련 재료 분해는 폐기 (마이그 112 + 2026-05-02 recipe 데이터 폐기). 완제품
// itemId 단위만 카운트한다.
export interface CraftActiveItemRow {
  itemId: string
  itemName: string | null
  count: number
}

export interface CraftActiveMaterialStatsResult {
  // queued + claimed 합계.
  taskCount: number
  queuedCount: number
  claimedCount: number
  items: CraftActiveItemRow[]
}

export async function loadCraftActiveMaterialStatsAdmin(): Promise<{
  result: CraftActiveMaterialStatsResult | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAnyCapability(CRAFT_STATS_CAPS)
    const session = await getSession()
    if (!session) return { result: null, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const db = getAdminClient()
    const { data, error } = await db
      .from('craft_tasks')
      .select('status, regear_requests!inner(build_snapshot)')
      .eq('guild_id', guildId)
      .in('status', ['queued', 'claimed'])
    if (error) return { result: null, error: error.message }

    const snapshots: (BuildSnapshot | null)[] = []
    let queuedCount = 0
    let claimedCount = 0
    for (const row of (data ?? []) as Array<{
      status: CraftTaskStatus
      regear_requests:
        | { build_snapshot: unknown }
        | { build_snapshot: unknown }[]
        | null
    }>) {
      const r = Array.isArray(row.regear_requests)
        ? row.regear_requests[0]
        : row.regear_requests
      snapshots.push((r?.build_snapshot as BuildSnapshot | null) ?? null)
      if (row.status === 'queued') queuedCount++
      else if (row.status === 'claimed') claimedCount++
    }

    const breakdown = aggregateBuildSnapshots(snapshots)
    const items: CraftActiveItemRow[] = breakdown.items.map(
      (it: CraftItemAggregateRow) => ({
        itemId: it.itemId,
        itemName: it.itemName,
        count: it.count,
      }),
    )

    return {
      result: {
        taskCount: breakdown.taskCount,
        queuedCount,
        claimedCount,
        items,
      },
    }
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}
