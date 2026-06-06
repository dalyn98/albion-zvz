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
): CraftQueueItem {
  const r = pickRegearJoin(row)
  const eventId = r?.event_id ?? null
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
    craftIncludedSlots: normalizeCraftRegearSlots(r?.craft_included_slots, false),
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
      row.reimbursement_status === 'pending' || row.reimbursement_status === 'approved'
        ? row.reimbursement_status
        : 'not_required',
    reimbursementApprovedAt: row.reimbursement_approved_at,
    reimbursementApprovedBy: row.reimbursement_approved_by,
    reimbursementApprovedByUsername: row.reimbursement_approved_by_username,
    compensationMode: row.compensation_mode as CraftCompensationMode | null,
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
