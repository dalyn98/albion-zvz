import { getAdminClient } from '@/lib/supabase-admin'
import {
  mapEventTacticSnapshot,
  type EventTacticSnapshotRow,
  type EventTacticSnapshotStepRow,
} from '@/lib/event-operations'
import type { TacticBoardDocument } from '@/lib/tactics/queries'
import {
  aggregateCraftBuilds,
  resolveCraftInventoryDemand,
  type CraftInventoryDemand,
} from '@/lib/craft-aggregation'
import { normalizeCraftRegearSlots } from '@/lib/regear-craft-slots'
import type { BuildSnapshot } from '@/types'

const SNAPSHOT_COLUMNS =
  'id, source_board_id, source_board_updated_at, title, summary, terrain_type, visibility, tags, captured_by, captured_at'

const SNAPSHOT_STEP_COLUMNS =
  'source_step_id, step_order, title, callout, role_callouts, intent, next_step_links, board_state, duration_seconds, captured_at'

export interface EventTacticSnapshotSummary {
  id: string
  sourceBoardId: string
  sourceBoardUpdatedAt: string
  title: string
  capturedBy: string
  capturedAt: string
}

export interface EventTacticSnapshotDocument extends EventTacticSnapshotSummary {
  document: TacticBoardDocument
}

export interface EventCraftDemand extends CraftInventoryDemand {
  queuedCount: number
  claimedCount: number
  deliveredCount: number
}

export async function getEventTacticSnapshotSummary(
  guildId: string,
  eventId: string,
): Promise<EventTacticSnapshotSummary | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_tactic_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id as string,
    sourceBoardId: data.source_board_id as string,
    sourceBoardUpdatedAt: data.source_board_updated_at as string,
    title: data.title as string,
    capturedBy: data.captured_by as string,
    capturedAt: data.captured_at as string,
  }
}

export async function loadEventTacticSnapshot(
  guildId: string,
  eventId: string,
): Promise<EventTacticSnapshotDocument | null> {
  const db = getAdminClient()
  const { data: snapshotData, error: snapshotError } = await db
    .from('event_tactic_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (snapshotError) throw new Error(snapshotError.message)
  if (!snapshotData) return null

  const snapshot = snapshotData as unknown as EventTacticSnapshotRow & {
    source_board_id: string
  }
  const { data: stepData, error: stepError } = await db
    .from('event_tactic_snapshot_steps')
    .select(SNAPSHOT_STEP_COLUMNS)
    .eq('guild_id', guildId)
    .eq('snapshot_id', snapshot.id)
    .order('step_order', { ascending: true })
  if (stepError) throw new Error(stepError.message)

  return {
    id: snapshot.id,
    sourceBoardId: snapshot.source_board_id,
    sourceBoardUpdatedAt: snapshot.source_board_updated_at,
    title: snapshot.title,
    capturedBy: snapshot.captured_by,
    capturedAt: snapshot.captured_at,
    document: mapEventTacticSnapshot(
      snapshot,
      (stepData ?? []) as unknown as EventTacticSnapshotStepRow[],
    ),
  }
}

export async function loadEventCraftDemand(
  guildId: string,
  eventId: string,
): Promise<EventCraftDemand> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'status, regear_requests!inner(guild_id, event_id, build_snapshot, craft_included_slots)',
    )
    .eq('guild_id', guildId)
    .eq('regear_requests.guild_id', guildId)
    .eq('regear_requests.event_id', eventId)
    .in('status', ['queued', 'claimed', 'delivered'])
  if (error) throw new Error(error.message)

  type CraftDemandJoin = {
    guild_id: string
    event_id: string | null
    build_snapshot: unknown
    craft_included_slots: unknown
  }
  type CraftDemandTask = {
    status: string
    regear_requests: CraftDemandJoin | CraftDemandJoin[] | null
  }
  const rows = (data ?? []) as unknown as CraftDemandTask[]
  const joinedRequest = (row: CraftDemandTask): CraftDemandJoin | null => {
    if (!row.regear_requests) return null
    return Array.isArray(row.regear_requests)
      ? row.regear_requests[0] ?? null
      : row.regear_requests
  }
  const queuedBuilds = rows.flatMap((row) => {
    if (row.status !== 'queued') return []
    const request = joinedRequest(row)
    if (!request || request.guild_id !== guildId || request.event_id !== eventId) return []
    return [{
      snapshot: (request.build_snapshot as BuildSnapshot | null) ?? null,
      includedSlots: normalizeCraftRegearSlots(request.craft_included_slots, false),
    }]
  })
  const breakdown = aggregateCraftBuilds(queuedBuilds)
  const stockByItemId: Record<string, number> = Object.fromEntries(
    breakdown.items.map((item) => [item.itemId, 0]),
  )
  if (breakdown.items.length > 0) {
    const { data: stock, error: stockError } = await db
      .from('guild_inventory_gear')
      .select('item_id, quantity')
      .eq('guild_id', guildId)
      .in('item_id', breakdown.items.map((item) => item.itemId))
    if (stockError) throw new Error(stockError.message)
    for (const row of stock ?? []) {
      stockByItemId[row.item_id as string] = Number(row.quantity ?? 0)
    }
  }

  return {
    ...resolveCraftInventoryDemand(breakdown, stockByItemId),
    queuedCount: rows.filter((row) => row.status === 'queued').length,
    claimedCount: rows.filter((row) => row.status === 'claimed').length,
    deliveredCount: rows.filter((row) => row.status === 'delivered').length,
  }
}
