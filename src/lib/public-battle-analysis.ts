import 'server-only'

import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  buildPublicBattleGroupAnalysis,
  PUBLIC_BATTLE_EVENT_MAX_GROUP_PAGES,
  PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE,
  PUBLIC_BATTLE_EVENT_PAGE_SIZE,
  type PublicBattleGroupAnalysis,
  type PublicBattleRawEventBatch,
} from '@/lib/public-battle-analysis-model'
import type { PublicBattleGroupReport } from '@/lib/public-battle-report-model'
import { fetchJsonWithRetry } from '@/lib/http-retry'

const EVENT_FETCH_CONCURRENCY = 6
const EVENT_REVALIDATE_SECONDS = 60 * 60

interface EventPageTask {
  battleId: number
  offset: number
}

interface EventPageResult extends EventPageTask {
  events: unknown[]
  failed: boolean
}

function plannedEventPages(report: PublicBattleGroupReport): {
  tasks: EventPageTask[]
  allocatedPages: Map<number, number>
  desiredPages: Map<number, number>
} {
  const desiredPages = new Map<number, number>()
  for (const battle of report.battles) {
    desiredPages.set(
      battle.albionBattleId,
      Math.min(
        PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE,
        Math.ceil(Math.max(0, battle.totalKills) / PUBLIC_BATTLE_EVENT_PAGE_SIZE),
      ),
    )
  }

  // Round-robin allocation lets every source battle receive at least its first
  // page before a large battle consumes the group-wide safety budget.
  const tasks: EventPageTask[] = []
  const allocatedPages = new Map<number, number>()
  for (let page = 0; page < PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE; page += 1) {
    for (const battle of report.battles) {
      const desired = desiredPages.get(battle.albionBattleId) ?? 0
      if (page >= desired) continue
      if (tasks.length >= PUBLIC_BATTLE_EVENT_MAX_GROUP_PAGES) {
        return { tasks, allocatedPages, desiredPages }
      }
      tasks.push({
        battleId: battle.albionBattleId,
        offset: page * PUBLIC_BATTLE_EVENT_PAGE_SIZE,
      })
      allocatedPages.set(battle.albionBattleId, page + 1)
    }
  }
  return { tasks, allocatedPages, desiredPages }
}

async function fetchEventPage(
  server: AlbionServer,
  task: EventPageTask,
): Promise<EventPageResult> {
  const base = ALBION_GAMEINFO_ENDPOINTS[server]
  const url = `${base}/events/battle/${task.battleId}?limit=${PUBLIC_BATTLE_EVENT_PAGE_SIZE}&offset=${task.offset}`
  try {
    const payload = await fetchJsonWithRetry<unknown>(url, {
      label: `events/battle/${task.battleId}`,
      userAgent: 'albion-zvz-public-battle-report/1.0',
      timeoutMs: 12_000,
      maxAttempts: 2,
      fetchInit: { next: { revalidate: EVENT_REVALIDATE_SECONDS } },
    })
    return {
      ...task,
      events: Array.isArray(payload) ? payload.slice(0, PUBLIC_BATTLE_EVENT_PAGE_SIZE) : [],
      failed: !Array.isArray(payload),
    }
  } catch (error) {
    console.warn(
      `[public-battle-analysis] event page failed battle=${task.battleId} offset=${task.offset}`,
      error,
    )
    return { ...task, events: [], failed: true }
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let nextIndex = 0

  async function run(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      output[index] = await worker(values[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  )
  return output
}

export async function loadPublicBattleGroupAnalysis(
  report: PublicBattleGroupReport,
): Promise<PublicBattleGroupAnalysis> {
  const plan = plannedEventPages(report)
  const pageResults = await mapWithConcurrency(
    plan.tasks,
    EVENT_FETCH_CONCURRENCY,
    (task) => fetchEventPage(report.server, task),
  )
  const resultsByBattleId = new Map<number, EventPageResult[]>()
  for (const result of pageResults) {
    const current = resultsByBattleId.get(result.battleId) ?? []
    current.push(result)
    resultsByBattleId.set(result.battleId, current)
  }

  const batches: PublicBattleRawEventBatch[] = report.battles.map((battle) => {
    const results = resultsByBattleId.get(battle.albionBattleId) ?? []
    const desired = plan.desiredPages.get(battle.albionBattleId) ?? 0
    const allocated = plan.allocatedPages.get(battle.albionBattleId) ?? 0
    const exceedsPerBattleCap =
      Math.ceil(battle.totalKills / PUBLIC_BATTLE_EVENT_PAGE_SIZE) >
      PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE
    return {
      battleId: battle.albionBattleId,
      events: results.flatMap((result) => result.events),
      failedPageOffsets: results
        .filter((result) => result.failed)
        .map((result) => result.offset),
      truncated: allocated < desired || exceedsPerBattleCap,
    }
  })

  return buildPublicBattleGroupAnalysis({ report, batches })
}

export async function loadPublicBattleRawEventBatch(input: {
  server: AlbionServer
  battleId: number
  totalKills: number
}): Promise<PublicBattleRawEventBatch> {
  const desiredPages = Math.ceil(
    Math.max(0, input.totalKills) / PUBLIC_BATTLE_EVENT_PAGE_SIZE,
  )
  const allocatedPages = Math.min(
    desiredPages,
    PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE,
  )
  const tasks = Array.from({ length: allocatedPages }, (_, page) => ({
    battleId: input.battleId,
    offset: page * PUBLIC_BATTLE_EVENT_PAGE_SIZE,
  }))
  const results = await mapWithConcurrency(
    tasks,
    EVENT_FETCH_CONCURRENCY,
    (task) => fetchEventPage(input.server, task),
  )
  return {
    battleId: input.battleId,
    events: results.flatMap((result) => result.events),
    failedPageOffsets: results
      .filter((result) => result.failed)
      .map((result) => result.offset),
    truncated: desiredPages > PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE,
  }
}
