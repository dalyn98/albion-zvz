// craft.ts / craft-queue.ts / craft-admin.ts 가 공유하는 순수 매핑 헬퍼.
// 'use server' 모듈에서 동기 함수를 export 할 수 없어 별도 lib 으로 분리.
// DB row → CraftQueueItem 변환, regear_requests 의 array|object 정규화,
// guild_avatars 박스 범위 컬럼 파싱 등 작은 유틸 모음.

import { getAdminClient } from '@/lib/supabase-admin'
import type { CraftTaskRow } from '@/lib/craft-tasks'
import type { BuildSnapshot } from '@/types'
import type {
  CraftCompensationMode,
  CraftQueueItem,
} from '@/app/actions/craft'
import {
  craftRegearSlots,
  normalizeCraftRegearSlots,
  type CraftRegearSlot,
} from './regear-craft-slots'
import { quoteCraftMaterialValue } from './craft-settlement-terms'

export interface RegearRequestJoin {
  id: string
  discord_id: string
  username: string
  role_name: string
  event_id: string | null
  event_title_snapshot: string | null
  claimed_silver: number | null
  build_snapshot: unknown
  craft_included_slots?: unknown
  gear_breakdown?: unknown
}

export interface SupplyFulfillmentProjection {
  id: string
  status: CraftQueueItem['supplyStatus']
  material_source: string
  quoted_material_value_silver: number
  material_reimbursement_silver: number
  craft_fee_silver: number
  settlement_total_silver: number
}

export interface SupplySettlementProjection {
  status: 'payable' | 'paid' | 'void'
}

export async function loadSupplyProjectionMaps(
  guildId: string,
  taskIds: readonly string[],
  db: ReturnType<typeof getAdminClient> = getAdminClient(),
): Promise<{
  supplyByTaskId: Map<string, SupplyFulfillmentProjection>
  settlementByFulfillmentId: Map<string, SupplySettlementProjection>
}> {
  const supplyByTaskId = new Map<string, SupplyFulfillmentProjection>()
  const settlementByFulfillmentId = new Map<string, SupplySettlementProjection>()
  if (taskIds.length === 0) return { supplyByTaskId, settlementByFulfillmentId }

  const { data: supplyRows, error: supplyError } = await db
    .from('supply_fulfillments')
    .select(
      'id, craft_task_id, status, material_source, quoted_material_value_silver, material_reimbursement_silver, craft_fee_silver, settlement_total_silver',
    )
    .eq('guild_id', guildId)
    .in('craft_task_id', [...taskIds])
  if (supplyError) {
    throw new Error(`supply fulfillment projection failed: ${supplyError.message}`)
  }

  const fulfillmentIds: string[] = []
  for (const raw of supplyRows ?? []) {
    if (!raw.craft_task_id || !raw.id) continue
    const row = raw as unknown as SupplyFulfillmentProjection & { craft_task_id: string }
    supplyByTaskId.set(row.craft_task_id, row)
    fulfillmentIds.push(row.id)
  }

  if (fulfillmentIds.length > 0) {
    const { data: settlementRows, error: settlementError } = await db
      .from('supply_settlement_items')
      .select('fulfillment_id, status')
      .eq('guild_id', guildId)
      .in('fulfillment_id', fulfillmentIds)
    if (settlementError) {
      throw new Error(`supply settlement projection failed: ${settlementError.message}`)
    }
    for (const row of settlementRows ?? []) {
      if (
        row.fulfillment_id &&
        (row.status === 'payable' || row.status === 'paid' || row.status === 'void')
      ) {
        settlementByFulfillmentId.set(row.fulfillment_id, { status: row.status })
      }
    }
  }

  return { supplyByTaskId, settlementByFulfillmentId }
}

export interface CraftTaskJoinedRow extends CraftTaskRow {
  regear_requests: RegearRequestJoin | RegearRequestJoin[] | null
}

export function pickRegearJoin(
  row: CraftTaskJoinedRow,
): RegearRequestJoin | null {
  const j = row.regear_requests
  if (!j) return null
  return Array.isArray(j) ? j[0] ?? null : j
}

export function toQueueItem(
  row: CraftTaskJoinedRow,
  fallbackEventTitle: string,
  gatherAtByEventId?: Map<string, string | null>,
  supply?: SupplyFulfillmentProjection | null,
  settlement?: SupplySettlementProjection | null,
): CraftQueueItem {
  const r = pickRegearJoin(row)
  const eventId = r?.event_id ?? null
  const includedSlots = normalizeCraftRegearSlots(r?.craft_included_slots, false)
  const quotedMaterialValueSilver = supply?.quoted_material_value_silver ??
    quoteCraftMaterialValue(r?.gear_breakdown, includedSlots)
  return {
    taskId: row.id,
    status: row.status,
    regearRequestId: row.regear_request_id,
    requesterDiscordId: r?.discord_id ?? '',
    requesterUsername: r?.username ?? '',
    eventId,
    eventTitle: r?.event_title_snapshot ?? fallbackEventTitle,
    gatherAt: eventId ? gatherAtByEventId?.get(eventId) ?? null : null,
    roleName: r?.role_name ?? '',
    buildSnapshot: (r?.build_snapshot as BuildSnapshot | null) ?? null,
    craftIncludedSlots: includedSlots,
    claimedSilver: r?.claimed_silver ?? null,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    deliveredAt: row.delivered_at,
    expiresAt: row.expires_at,
    crafterDiscordId: row.crafter_discord_id,
    crafterUsername: row.crafter_username,
    boxNumber: row.box_number,
    craftCity: row.craft_city,
    materialSilverCost: row.material_silver_cost,
    premiumSilver: row.premium_silver,
    reimbursementSilver: row.reimbursement_silver,
    reimbursementStatus:
      row.reimbursement_status === 'pending' ||
      row.reimbursement_status === 'approved' ||
      row.reimbursement_status === 'rejected'
        ? row.reimbursement_status
        : 'not_required',
    reimbursementApprovedAt: row.reimbursement_approved_at,
    reimbursementApprovedBy: row.reimbursement_approved_by,
    reimbursementApprovedByUsername: row.reimbursement_approved_by_username,
    reimbursementRejectedAt: row.reimbursement_rejected_at,
    reimbursementRejectedBy: row.reimbursement_rejected_by,
    reimbursementRejectedByUsername: row.reimbursement_rejected_by_username,
    reimbursementRejectReason: row.reimbursement_reject_reason,
    compensationMode: row.compensation_mode as CraftCompensationMode | null,
    supplyStatus: supply?.status ?? null,
    materialSource:
      supply?.material_source === 'crafter_purchase'
        ? 'crafter_purchase'
        : supply?.material_source === 'guild_stock'
          ? 'guild_stock'
          : null,
    quotedMaterialValueSilver,
    materialReimbursementSilver: Number(supply?.material_reimbursement_silver ?? 0),
    craftFeeSilver: Number(supply?.craft_fee_silver ?? 0),
    settlementTotalSilver: Number(supply?.settlement_total_silver ?? 0),
    settlementStatus: settlement?.status ?? null,
  }
}

export function defaultCraftIncludedSlots(includeCape: boolean): CraftRegearSlot[] {
  return craftRegearSlots(includeCape)
}

export async function loadIsCrafter(
  guildId: string,
  discordId: string,
): Promise<boolean> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('is_crafter')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  return (data?.is_crafter as boolean | undefined) === true
}

export function parseRangeBoundary(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? raw : null
}
