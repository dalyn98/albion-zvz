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
import type { EventCategory } from '@/types'
import { CATEGORY_PARTY_LIMITS } from '@/types'
import {
  HARD_MAX_PARTIES,
  MAX_SLOTS_PER_PARTY,
  sanitizePartyMeta,
  slotToRow,
  type PartyMetaPayload,
  type SlotPayload,
} from './admin-slot-sanitizers'

const SLOT_DIFF_COLUMNS =
  'id, party_id, slot_number, assigned_discord_id, requested_discord_id, is_hidden, role_name, notes, spells, gear_specs, conditional_options, ' +
  'auto_regear_excluded, manual_regear_excluded, is_solo_bomb, ' +
  'weapon_name, weapon_id, weapon_options, ' +
  'head_name, head_id, head_options, ' +
  'armor_name, armor_id, armor_options, ' +
  'shoes_name, shoes_id, shoes_options, ' +
  'offhand_name, offhand_id, offhand_options, ' +
  'potion_name, potion_id, potion_options, ' +
  'food_name, food_id, food_options, ' +
  'cape_name, cape_id, cape_options, ' +
  'mount_name, mount_id, mount_options'

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

function stableCompareValue(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function slotRowMatches(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (key === 'guild_id') continue
    if (stableCompareValue(existing[key]) !== stableCompareValue(value)) return false
  }
  return true
}

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
  originalSlotIds: string[],
  partyMeta?: PartyMetaPayload,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (partyNumber < 1 || partyNumber > HARD_MAX_PARTIES) return { error: tErr('invalidPartyNumber') }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: tErr('tooManySlots', { max: MAX_SLOTS_PER_PARTY }) }

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
    if (eventCheckError) return { error: eventCheckError.message }
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

    let resolvedPartyId: string
    let recoveredSlotIds: string[] | null = null
    if (partyId) {
      resolvedPartyId = partyId
      // 콜러(= !isAdminOrOwner)는 is_bomb_squad / bomb_squad_kind / name /
      // caller_discord_id 같은 파티 메타를 건드릴 수 없다. UI 에서도 감추지만
      // 서버에서도 방어적으로 skip.
      if (isAdminOrOwner) {
        const { error: metaUpdErr } = await db
          .from('parties')
          .update(metaRow)
          .eq('guild_id', guildId)
          .eq('id', partyId)
        if (metaUpdErr) return { error: metaUpdErr.message }
      }
    } else {
      const { data, error } = await db
        .from('parties')
        .insert({ guild_id: guildId, event_id: eventId, party_number: partyNumber, ...metaRow })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23503') {
          return { error: tErr('eventMissingForParty') }
        }
        // 23505 = (event_id, party_number) 충돌. router.refresh 가 props 에
        // 새 partyId 를 전파하기 전 Save 가 다시 발화한 경우(Save 직후 Publish,
        // 빠른 더블 클릭 등). 기존 row 의 id 로 fallback 하고 prior 슬롯은
        // recoveredSlotIds 로 합쳐 아래 cleanup 단계에서 한 번에 정리한다.
        if (error.code !== '23505') {
          return { error: error.message }
        }
        const { data: existing, error: lookupErr } = await db
          .from('parties')
          .select('id')
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .eq('party_number', partyNumber)
          .maybeSingle()
        if (lookupErr) return { error: lookupErr.message }
        if (!existing) return { error: error.message }
        resolvedPartyId = existing.id
        if (isAdminOrOwner) {
          const { error: metaUpdErr } = await db
            .from('parties')
            .update(metaRow)
            .eq('guild_id', guildId)
            .eq('id', existing.id)
          if (metaUpdErr) return { error: metaUpdErr.message }
        }
        const { data: existingSlots, error: existingSlotErr } = await db
          .from('slots')
          .select('id')
          .eq('guild_id', guildId)
          .eq('party_id', existing.id)
        if (existingSlotErr) return { error: existingSlotErr.message }
        recoveredSlotIds = (existingSlots ?? []).map((s) => s.id as string)
      } else {
        resolvedPartyId = data.id
      }
    }

    const effectiveOriginalSlotIds = recoveredSlotIds
      ? Array.from(new Set([...originalSlotIds, ...recoveredSlotIds]))
      : originalSlotIds
    const keptIds = new Set(slots.map((s) => s.id).filter(Boolean) as string[])
    const removedIds = effectiveOriginalSlotIds.filter((id) => !keptIds.has(id))
    const { data: assignmentRows, error: assignmentRowsError } =
      effectiveOriginalSlotIds.length > 0
        ? await db
            .from('slots')
            .select('id, assigned_discord_id, requested_discord_id')
            .eq('guild_id', guildId)
            .in('id', effectiveOriginalSlotIds)
        : { data: [] as Record<string, unknown>[], error: null }
    if (assignmentRowsError) return { error: assignmentRowsError.message }
    const assignmentRowsById = new Map(
      ((assignmentRows ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]),
    )

    // Delete removed slots first so their slot_numbers free up before we renumber kept ones
    if (removedIds.length > 0) {
      const { error } = await db
        .from('slots')
        .delete()
        .eq('guild_id', guildId)
        .in('id', removedIds)
      if (error) return { error: error.message }
    }

    // A plain ascending-order UPDATE is not enough for arbitrary reorders
    // (swaps and permutations always collide on UNIQUE(party_id, slot_number)).
    // Park kept slots at temp numbers >20 first, then write the final values.
    // Migration 022 widens the slot_number CHECK to permit this transient range.
    //
    // 먼저 DB snapshot 과 원하는 row 를 비교해 실제로 바뀐 슬롯만 UPDATE 한다.
    // 순서 변경이 있을 때만 임시 번호 parking pass 를 실행하고, 내용만 바뀐
    // 경우에는 곧장 changed row 만 갱신해 저장 round-trip 과 write lock 을 줄인다.
    const kept = slots.filter((s) => s.id)
    const desiredRowsById = new Map(
      kept.map((slot, i) => [
        slot.id!,
        slotToRow(resolvedPartyId, { ...slot, slot_number: i + 1 }),
      ]),
    )
    const { data: existingRows, error: existingRowsError } = kept.length > 0
      ? await db
          .from('slots')
          .select(SLOT_DIFF_COLUMNS)
          .eq('guild_id', guildId)
          .in('id', kept.map((s) => s.id!))
      : { data: [] as Record<string, unknown>[], error: null }
    if (existingRowsError) return { error: existingRowsError.message }
    const existingRowsById = new Map(
      ((existingRows ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]),
    )
    const changedKept = kept.filter((slot) => {
      const desired = desiredRowsById.get(slot.id!)
      const existing = existingRowsById.get(slot.id!)
      if (!desired || !existing) return true
      return !slotRowMatches(existing, desired)
    })
    const hasOrderChanges = kept.some((slot) => {
      const desired = desiredRowsById.get(slot.id!)
      const existing = existingRowsById.get(slot.id!)
      return !!desired && !!existing && existing.slot_number !== desired.slot_number
    })
    const TEMP_OFFSET = 1000
    if (hasOrderChanges) {
      const renumberResults = await Promise.all(
        kept.map((slot, i) =>
          db
            .from('slots')
            .update({ slot_number: TEMP_OFFSET + i + 1 })
            .eq('guild_id', guildId)
            .eq('id', slot.id!),
        ),
      )
      const renumberError = renumberResults.find((r) => r.error)?.error
      if (renumberError) return { error: renumberError.message }
    }

    const slotsToFinalize = hasOrderChanges ? kept : changedKept
    const finalResults = await Promise.all(
      slotsToFinalize.map((slot) =>
        db
          .from('slots')
          .update(desiredRowsById.get(slot.id!)!)
          .eq('guild_id', guildId)
          .eq('id', slot.id!),
      ),
    )
    const finalError = finalResults.find((r) => r.error)?.error
    if (finalError) return { error: finalError.message }

    // Insert new slots last
    const newSlots = slots.filter((s) => !s.id)
    const newSlotRows = newSlots.map((s) => slotToRow(resolvedPartyId, s, guildId))
    if (newSlots.length > 0) {
      const { error } = await db.from('slots').insert(newSlotRows)
      if (error) return { error: error.message }
    }

    const affectedDiscordIds = new Set<string>()
    for (const id of removedIds) addSlotDiscordIds(affectedDiscordIds, assignmentRowsById.get(id))
    for (const slot of changedKept) {
      addSlotDiscordIds(affectedDiscordIds, assignmentRowsById.get(slot.id!))
      addSlotDiscordIds(affectedDiscordIds, desiredRowsById.get(slot.id!))
    }
    for (const row of newSlotRows) addSlotDiscordIds(affectedDiscordIds, row)
    revalidateSlotEditorSurfaces(eventId, partyNumber, affectedDiscordIds)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
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
