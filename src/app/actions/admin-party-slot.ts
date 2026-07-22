'use server'

// 파티/슬롯 관련 어드민 액션. 슬롯 정렬·삽입·삭제, 할당 해제, 단일 슬롯 빌드
// 업데이트. 입력 sanitizer 와 slotToRow 는 `./admin-slot-sanitizers` 에서
// import — 순수 모듈이라 'use server' 경계와 무관.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  requireEventCreatorForSlot,
  requireEventCreatorOrPartyCaller,
} from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { log } from '@/lib/log'
import type { EventCategory } from '@/types'
import { CATEGORY_PARTY_LIMITS } from '@/types'
import {
  HARD_MAX_PARTIES,
  MAX_SLOTS_PER_PARTY,
  sanitizePartyMeta,
  slotToRow,
  type PartyMetaPayload,
  type SlotPayload,
  type SlotRow,
} from './admin-slot-sanitizers'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CLEAR_ASSIGNED_SLOT_FIELDS = {
  assigned_discord_id: null,
  assigned_username: null,
  assigned_weapon_name: null,
  assigned_weapon_id: null,
  assigned_head_name: null,
  assigned_head_id: null,
  assigned_armor_name: null,
  assigned_armor_id: null,
  assigned_shoes_name: null,
  assigned_shoes_id: null,
  assigned_offhand_name: null,
  assigned_offhand_id: null,
  assigned_potion_name: null,
  assigned_potion_id: null,
  assigned_food_name: null,
  assigned_food_id: null,
  assigned_cape_name: null,
  assigned_cape_id: null,
  assigned_mount_name: null,
  assigned_mount_id: null,
} as const

function addSlotDiscordIds(
  target: Set<string>,
  row: Record<string, unknown> | undefined,
): void {
  if (typeof row?.assigned_discord_id === 'string' && row.assigned_discord_id) {
    target.add(row.assigned_discord_id)
  }
  if (typeof row?.requested_discord_id === 'string' && row.requested_discord_id) {
    target.add(row.requested_discord_id)
  }
}

interface SavePartySlotsRpcResult {
  party_id: string
  slots_version: number
  slot_ids: string[]
  affected_discord_ids: string[]
}

export interface SavePartySlotsResult {
  error?: string
  stale?: true
  partyId?: string
  slotsVersion?: number
  slotIds?: string[]
}

function toAtomicSlotPayload(slot: SlotPayload & { id: string }): Record<string, unknown> {
  const row = slotToRow('', slot)
  return {
    id: slot.id,
    ...Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== 'party_id' && key !== 'guild_id'),
    ),
  } as Omit<SlotRow, 'party_id' | 'guild_id'> & { id: string }
}

function parseSavePartySlotsRpcResult(value: unknown): SavePartySlotsRpcResult | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const slotsVersion = Number(raw.slots_version)
  if (
    typeof raw.party_id !== 'string' ||
    !UUID_PATTERN.test(raw.party_id) ||
    !Number.isSafeInteger(slotsVersion) ||
    slotsVersion < 0 ||
    !Array.isArray(raw.slot_ids) ||
    !raw.slot_ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) ||
    !Array.isArray(raw.affected_discord_ids) ||
    !raw.affected_discord_ids.every((id) => typeof id === 'string')
  ) {
    return null
  }
  return {
    party_id: raw.party_id,
    slots_version: slotsVersion,
    slot_ids: raw.slot_ids as string[],
    affected_discord_ids: raw.affected_discord_ids as string[],
  }
}

function revalidateSlotEditorSurfaces(
  eventId: string,
  partyNumber: number,
  discordIds: Iterable<string> = [],
): void {
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/events/${eventId}/party/${partyNumber}`)
  revalidatePath('/')
  const ids = Array.from(new Set(discordIds))
  if (ids.length === 0) return
  revalidatePath('/me')
  revalidatePath('/members')
  revalidatePath('/admin/dashboard/stats')
  for (const discordId of ids) {
    revalidatePath(`/members/${discordId}`)
  }
}

export async function savePartySlots(
  eventId: string,
  partyNumber: number,
  partyId: string | null,
  slots: SlotPayload[],
  expectedVersion: number,
  partyMeta?: PartyMetaPayload,
): Promise<SavePartySlotsResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (partyNumber < 1 || partyNumber > HARD_MAX_PARTIES) return { error: tErr('invalidPartyNumber') }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: tErr('tooManySlots', { max: MAX_SLOTS_PER_PARTY }) }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return { error: tErr('serverError') }
    }
    const normalizedSlots = slots.map((slot, index) => ({
      ...slot,
      id: slot.id || crypto.randomUUID(),
      slot_number: index + 1,
    }))
    if (normalizedSlots.some((slot) => !UUID_PATTERN.test(slot.id))) {
      return { error: tErr('serverError') }
    }

    const metaResult = sanitizePartyMeta(partyMeta, tErr)
    if ('error' in metaResult) return { error: metaResult.error }
    const metaRow = metaResult.row

    const { db, isAdminOrOwner } = await requireEventCreatorOrPartyCaller(eventId, partyId)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // Validate event exists + category-aware party cap. FF/갱킹 이벤트에서 UI
    // 를 우회해 5번째 파티를 저장하려는 요청을 서버에서도 거부.
    const { data: eventRow, error: eventCheckError } = await db
      .from('events')
      .select('id, category')
      .eq('guild_id', guildId)
      .eq('id', eventId)
      .maybeSingle()
    if (eventCheckError) {
      log.error('[party-slots/save] event lookup failed', eventCheckError, {
        guildId,
        eventId,
        partyNumber,
      })
      return { error: tErr('partySaveFailed') }
    }
    if (!eventRow) {
      return { error: tErr('eventMissing') }
    }
    const eventCategory = (eventRow.category ?? '전투') as EventCategory
    const categoryMax = CATEGORY_PARTY_LIMITS[eventCategory]?.max ?? HARD_MAX_PARTIES
    if (partyNumber > categoryMax) return { error: tErr('invalidPartyNumber') }

    // Saving a never-created party with zero slots should be a no-op — otherwise
    // a single click on an empty panel creates a phantom party row that blocks
    // template loading and can't be removed via the UI.
    // 예외: 밤스쿼드 파티는 admin/owner 가 먼저 메타(콜러 지정 등) 만 설정해두고
    // 콜러가 나중에 슬롯/빌드를 채우는 플로우가 유효하므로 슬롯 0 개여도 생성 허용.
    if (!partyId && slots.length === 0 && !metaRow.is_bomb_squad) {
      revalidatePath(`/admin/dashboard/events/${eventId}`)
      return {}
    }

    const slotPayload = normalizedSlots.map(toAtomicSlotPayload)
    const { data, error } = await db.rpc('save_party_slots_atomic', {
      p_guild_id: guildId,
      p_event_id: eventId,
      p_party_number: partyNumber,
      p_party_id: partyId,
      p_expected_version: expectedVersion,
      p_party_meta: isAdminOrOwner ? metaRow : null,
      p_slots: slotPayload,
    })
    if (error) {
      log.error('[party-slots/save] atomic RPC failed', error, {
        guildId,
        eventId,
        partyId,
        partyNumber,
        expectedVersion,
      })
      if (error.message.includes('PARTY_SLOTS_STALE') || error.message.includes('PARTY_NOT_FOUND')) {
        return { error: tErr('partySlotsStale'), stale: true }
      }
      if (error.message.includes('EVENT_NOT_FOUND')) return { error: tErr('eventMissing') }
      return { error: tErr('partySaveFailed') }
    }

    const saved = parseSavePartySlotsRpcResult(data)
    if (!saved || saved.slot_ids.length !== normalizedSlots.length) {
      log.error('[party-slots/save] invalid atomic RPC result', data, {
        guildId,
        eventId,
        partyId,
        partyNumber,
      })
      return { error: tErr('partySaveFailed') }
    }

    revalidateSlotEditorSurfaces(eventId, partyNumber, saved.affected_discord_ids)
    return {
      partyId: saved.party_id,
      slotsVersion: saved.slots_version,
      slotIds: saved.slot_ids,
    }
  } catch (e) {
    log.error('[party-slots/save] unexpected failure', e, { eventId, partyId, partyNumber })
    return { error: tErr('partySaveFailed') }
  }
}

export async function clearSlotAssignment(slotId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForSlot(slotId)
    const guildId = await getSessionGuildId(session)
    const { data: slotRow, error: slotError } = await db
      .from('slots')
      .select('assigned_discord_id, parties!inner(event_id, party_number)')
      .eq('guild_id', guildId)
      .eq('id', slotId)
      .maybeSingle()
    if (slotError) return { error: slotError.message }
    if (!slotRow) return { error: tErr('slotNotFound') }
    const party = Array.isArray(slotRow.parties) ? slotRow.parties[0] : slotRow.parties
    if (!party) return { error: tErr('serverError') }

    const { error } = await db
      .from('slots')
      .update(CLEAR_ASSIGNED_SLOT_FIELDS)
      .eq('guild_id', guildId)
      .eq('id', slotId)
    if (error) return { error: error.message }
    const affectedDiscordIds = new Set<string>()
    addSlotDiscordIds(affectedDiscordIds, slotRow)
    revalidateSlotEditorSurfaces(party.event_id, party.party_number, affectedDiscordIds)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 단일 슬롯 빌드(아이템/옵션/주문/스펙/역할명/메모 등) 만 업데이트. slot_number
// 와 party_id 는 DB 값으로 고정 — 재배치/이동은 파티 편집 화면의 전용 플로우.
// 할당 정보(assigned_*) 도 건드리지 않는다 — 그쪽은 clearSlotAssignment /
// assignSelfToSlot 이 담당.
export async function updateSingleSlot(
  slotId: string,
  slot: Omit<SlotPayload, 'id' | 'slot_number'>,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForSlot(slotId)
    const guildId = await getSessionGuildId(session)

    const { data: slotRow, error: slotErr } = await db
      .from('slots')
      .select('party_id, slot_number, assigned_discord_id, requested_discord_id, parties!inner(event_id, party_number)')
      .eq('guild_id', guildId)
      .eq('id', slotId)
      .maybeSingle()
    if (slotErr) return { error: slotErr.message }
    if (!slotRow) return { error: tErr('serverError') }

    const party = Array.isArray(slotRow.parties) ? slotRow.parties[0] : slotRow.parties
    if (!party) return { error: tErr('serverError') }

    const row = slotToRow(slotRow.party_id, {
      ...slot,
      slot_number: slotRow.slot_number,
    })

    const { error: updErr } = await db
      .from('slots')
      .update(row)
      .eq('guild_id', guildId)
      .eq('id', slotId)
    if (updErr) return { error: updErr.message }

    const affectedDiscordIds = new Set<string>()
    addSlotDiscordIds(affectedDiscordIds, slotRow)
    revalidateSlotEditorSurfaces(party.event_id, party.party_number, affectedDiscordIds)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
