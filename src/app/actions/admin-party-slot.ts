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
    const kept = slots.filter((s) => s.id)
    const TEMP_OFFSET = 1000
    for (let i = 0; i < kept.length; i++) {
      const { error } = await db
        .from('slots')
        .update({ slot_number: TEMP_OFFSET + i + 1 })
        .eq('guild_id', guildId)
        .eq('id', kept[i].id!)
      if (error) return { error: error.message }
    }

    for (const slot of kept) {
      const { error } = await db
        .from('slots')
        .update(slotToRow(resolvedPartyId, slot, guildId))
        .eq('guild_id', guildId)
        .eq('id', slot.id!)
      if (error) return { error: error.message }
    }

    // Insert new slots last
    const newSlots = slots.filter((s) => !s.id)
    if (newSlots.length > 0) {
      const { error } = await db
        .from('slots')
        .insert(newSlots.map((s) => slotToRow(resolvedPartyId, s, guildId)))
      if (error) return { error: error.message }
    }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath(`/events/${eventId}/party/${partyNumber}`)
    revalidatePath('/')
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
    const { error } = await db
      .from('slots')
      .update({ assigned_discord_id: null, assigned_username: null })
      .eq('guild_id', guildId)
      .eq('id', slotId)
    if (error) return { error: error.message }
    revalidatePath('/')
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
      .select('party_id, slot_number, parties!inner(event_id, party_number)')
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

    revalidatePath(`/admin/dashboard/events/${party.event_id}`)
    revalidatePath(`/events/${party.event_id}`)
    revalidatePath(`/events/${party.event_id}/party/${party.party_number}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
