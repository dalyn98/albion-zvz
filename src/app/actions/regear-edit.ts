'use server'

// 멤버 본인의 pending 리기어 행 인라인 편집/취소 액션 모음. 신청/조회는 regear.ts,
// 어드민 측 작업은 regear-admin.ts. 모든 함수는 다음 공통 가드를 통과한다:
// - getSession() 로 로그인 확인
// - 길드 격리 (`guild_id = session.guildId`)
// - 본인 소유 확인 (`discord_id = session.discordId`)
// - `status = 'pending'` 인 행만 편집/취소 허용
// 추가 가드는 자동/수동, crafted/silver 모드별로 함수마다 다르다.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { calcPayoutSilver } from '@/lib/regear-payout'
import {
  ALLOWED_MIME,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_BUCKET,
  computeMarketSilverFromItems,
  normalizeBreakdownItems,
  type RawBreakdown,
  type RegearLineItem,
} from '@/lib/regear-helpers'
import {
  SLOT_KEYS,
  type BuildSnapshot,
  type SlotKey,
} from '@/types'

// 단위 실버 상한 — int32 를 넘지 않으면서 시세 오입력 방지. 20M 실버/단위면
// 현재 게임 내 어떤 아이템보다도 훨씬 높아 실질적 상한은 유지된다.
const MAX_UNIT_SILVER = 20_000_000

export async function cancelMyRegearRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('regear_requests')
    .select('id, status, discord_id, event_id, screenshot_path, screenshot_path_2')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('regear_requests')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('status', 'pending')
  if (deleteError) return { error: deleteError.message }

  // Best-effort screenshot cleanup. If this fails we continue — the nightly
  // cron already has a separate sweep for orphaned files.
  const toRemove: string[] = []
  if (row.screenshot_path) toRemove.push(row.screenshot_path)
  if (row.screenshot_path_2) toRemove.push(row.screenshot_path_2)
  if (toRemove.length > 0) {
    await db.storage.from(SCREENSHOT_BUCKET).remove(toRemove)
  }

  if (row.event_id) revalidatePath(`/events/${row.event_id}`)
  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  return {}
}

export interface UpdateLineItemResult {
  error?: string
  marketSilver?: number
  claimedSilver?: number
  payoutSilver?: number
}

// 제작 모드 자동 리기어 본인 빌드 한 슬롯 갱신. tier+enchant 만 다르고 base 가
// 같은 아이템(예: T5_2H_ARCANESTAFF → T7_2H_ARCANESTAFF@2) 으로 바꿔달라는 케이스가
// 대부분이지만, killboard sync 지연으로 슬롯이 비어있던 경우 새로 채우는 호출도
// 같은 액션을 재사용한다 — 차이는 입력 값(name/id) 의 채워짐 여부일 뿐.
//
// 빈 슬롯으로 되돌리는 케이스는 명시적으로 name=id=null 호출. 클라이언트에서 슬롯
// "비우기" 버튼을 누른 경우 UI 가 그렇게 부른다.
export async function updateMyRegearBuildSnapshotSlot(
  requestId: string,
  slotKey: SlotKey,
  name: string | null,
  id: string | null,
): Promise<{ error?: string; buildSnapshot?: BuildSnapshot }> {
  const tErr = await getTranslations('memberActionError')
  if (!SLOT_KEYS.includes(slotKey)) {
    return { error: tErr('slotNotFound') }
  }
  const trimmedId = typeof id === 'string' ? id.trim() : null
  const trimmedName = typeof name === 'string' ? name.trim() : null
  // (id null, name 채워짐) 같은 일관성 없는 입력은 막는다 — 둘 다 null 이거나 둘 다 truthy.
  if ((trimmedId && !trimmedName) || (!trimmedId && trimmedName)) {
    return { error: tErr('invalidInput') }
  }

  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchErr } = await db
    .from('regear_requests')
    .select('id, discord_id, status, auto_generated, fulfillment_mode, build_snapshot, role_name')
    .eq('guild_id', guildId)
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) return { error: fetchErr.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
  if (!row.auto_generated) return { error: tErr('autoOnlyEditable') }
  if (row.fulfillment_mode !== 'crafted') return { error: tErr('craftedOnlyEditable') }

  // 비어 있던 snapshot 도 한 슬롯만 들고 들어와도 일관된 BuildSnapshot 으로
  // 정규화 — UI 가 9개 슬롯을 항상 보여주기 위해 누락된 슬롯에 null 들을 박아둔다.
  const current = (row.build_snapshot as BuildSnapshot | null) ?? null
  const next: BuildSnapshot = {
    role_name: current?.role_name ?? ((row.role_name as string | null) ?? null),
    weapon: current?.weapon ?? { name: null, id: null },
    head: current?.head ?? { name: null, id: null },
    armor: current?.armor ?? { name: null, id: null },
    shoes: current?.shoes ?? { name: null, id: null },
    offhand: current?.offhand ?? { name: null, id: null },
    potion: current?.potion ?? { name: null, id: null },
    food: current?.food ?? { name: null, id: null },
    cape: current?.cape ?? { name: null, id: null },
    mount: current?.mount ?? { name: null, id: null },
  }
  next[slotKey] = { name: trimmedName, id: trimmedId }

  const { error: updateErr } = await db
    .from('regear_requests')
    .update({ build_snapshot: next })
    .eq('guild_id', guildId)
    .eq('id', requestId)
  if (updateErr) return { error: updateErr.message }

  revalidatePath(`/me/regear/${requestId}`)
  return { buildSnapshot: next }
}

// 수동 제출 리기어의 스크린샷 교체 (pending 한정). 새 파일 업로드 → DB 갱신
// → 옛 파일 best-effort 정리. 두 슬롯 중 일부만 교체할 수도 있고, 두 번째는
// 삭제도 가능(removeSecondary). 새 업로드가 실패하면 이미 올린 파일은 롤백.
export async function updateMyManualRegearScreenshots(
  requestId: string,
  formData: FormData,
): Promise<{
  error?: string
  primaryPath?: string | null
  secondaryPath?: string | null
}> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    const newPrimary = formData.get('screenshot')
    const newSecondary = formData.get('screenshot2')
    const removeSecondary = formData.get('removeSecondary') === 'true'

    const hasPrimary = newPrimary instanceof File && newPrimary.size > 0
    const hasSecondary = newSecondary instanceof File && newSecondary.size > 0

    if (hasPrimary) {
      if (newPrimary.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
      if (!ALLOWED_MIME.has(newPrimary.type)) return { error: tErr('screenshotWrongType') }
    }
    if (hasSecondary) {
      if (newSecondary.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
      if (!ALLOWED_MIME.has(newSecondary.type)) return { error: tErr('screenshotWrongType') }
    }
    if (!hasPrimary && !hasSecondary && !removeSecondary) {
      return { error: tErr('noChange') }
    }

    const db = getAdminClient()
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select(
        'id, status, auto_generated, discord_id, event_id, screenshot_path, screenshot_path_2',
      )
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!row) return { error: tErr('requestNotFound') }
    if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }
    if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (row.auto_generated) return { error: tErr('manualOnlyEditable') }

    const eventId = row.event_id as string
    const oldPrimary = (row.screenshot_path as string | null) ?? null
    const oldSecondary = (row.screenshot_path_2 as string | null) ?? null

    let nextPrimary: string | null = oldPrimary
    let nextSecondary: string | null = oldSecondary
    const newlyUploaded: string[] = []
    const toRemove: string[] = []

    if (hasPrimary) {
      const ext =
        newPrimary.type === 'image/png'
          ? 'png'
          : newPrimary.type === 'image/webp'
            ? 'webp'
            : 'jpg'
      const path = `${session.discordId}/${eventId}-${Date.now()}.${ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, newPrimary, { contentType: newPrimary.type, upsert: false })
      if (upErr) {
        return { error: tErr('screenshotUploadFailed', { reason: upErr.message }) }
      }
      newlyUploaded.push(path)
      if (oldPrimary) toRemove.push(oldPrimary)
      nextPrimary = path
    }

    if (hasSecondary) {
      const ext =
        newSecondary.type === 'image/png'
          ? 'png'
          : newSecondary.type === 'image/webp'
            ? 'webp'
            : 'jpg'
      const path = `${session.discordId}/${eventId}-${Date.now()}-2.${ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, newSecondary, { contentType: newSecondary.type, upsert: false })
      if (upErr) {
        if (newlyUploaded.length > 0) {
          await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
        }
        return { error: tErr('screenshotUploadFailed', { reason: upErr.message }) }
      }
      newlyUploaded.push(path)
      if (oldSecondary) toRemove.push(oldSecondary)
      nextSecondary = path
    } else if (removeSecondary && oldSecondary) {
      toRemove.push(oldSecondary)
      nextSecondary = null
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        screenshot_path: nextPrimary,
        screenshot_path_2: nextSecondary,
      })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) {
      if (newlyUploaded.length > 0) {
        await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
      }
      return { error: updateError.message }
    }

    if (toRemove.length > 0) {
      await db.storage.from(SCREENSHOT_BUCKET).remove(toRemove)
    }

    revalidatePath(`/me/regear/${requestId}`)
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me')

    return { primaryPath: nextPrimary, secondaryPath: nextSecondary }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateMyRegearLineItemPrice(
  requestId: string,
  slot: string,
  newUnitSilver: number,
): Promise<UpdateLineItemResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    if (!Number.isInteger(newUnitSilver) || newUnitSilver < 0) {
      return { error: tErr('priceMustBeNonNegativeInt') }
    }
    if (newUnitSilver > MAX_UNIT_SILVER) {
      return { error: tErr('priceTooLarge', { max: MAX_UNIT_SILVER.toLocaleString() }) }
    }
    const slotTrimmed = slot.trim()
    if (!slotTrimmed) return { error: tErr('slotEmpty') }

    const db = getAdminClient()
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, gear_breakdown')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('requestNotFound') }
    if (data.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (!data.auto_generated) return { error: tErr('autoOnlyEditable') }

    const breakdown = (data.gear_breakdown as RawBreakdown | null) ?? {}
    const items = normalizeBreakdownItems(breakdown.items)
    const idx = items.findIndex((it) => it.slot === slotTrimmed)
    if (idx === -1) return { error: tErr('slotNotFound') }

    // Immutable update — items 배열을 재구성해 해당 슬롯만 교체.
    const updatedItems: RegearLineItem[] = items.map((it, i) =>
      i === idx ? { ...it, price: newUnitSilver, userEdited: true } : it,
    )

    const newMarketSilver = computeMarketSilverFromItems(updatedItems)
    const roleCap =
      typeof breakdown.role_cap === 'number' && Number.isFinite(breakdown.role_cap) && breakdown.role_cap > 0
        ? Math.trunc(breakdown.role_cap)
        : newMarketSilver
    const payoutRatePercent =
      typeof breakdown.payout_rate_percent === 'number' &&
      Number.isFinite(breakdown.payout_rate_percent) &&
      breakdown.payout_rate_percent >= 1 &&
      breakdown.payout_rate_percent <= 100
        ? Math.trunc(breakdown.payout_rate_percent)
        : 100
    const newClaimedSilver = Math.min(newMarketSilver, roleCap)
    const newPayoutSilver = calcPayoutSilver(newClaimedSilver, payoutRatePercent)

    const newBreakdown = {
      ...breakdown,
      items: updatedItems,
      market_silver: newMarketSilver,
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        gear_breakdown: newBreakdown,
        claimed_silver: newClaimedSilver,
        payout_silver: newPayoutSilver,
      })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', true)
    if (updateError) return { error: updateError.message }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return {
      marketSilver: newMarketSilver,
      claimedSilver: newClaimedSilver,
      payoutSilver: newPayoutSilver,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 수동 제출 리기어의 청구 실버 수정 (pending 한정).
// 자동 리기어는 슬롯별로 단가를 수정해 market/claimed/payout 을 재계산하지만,
// 수동은 청구자가 직접 적은 단일 금액 (claimed_silver) 만 갱신하면 된다.
// payout_silver 는 승인 시점에 RPC 가 채우므로 여기서는 건드리지 않는다.
export async function updateMyManualRegearClaim(
  requestId: string,
  newClaimedSilver: number,
): Promise<{ error?: string; claimedSilver?: number }> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    if (!Number.isInteger(newClaimedSilver) || newClaimedSilver <= 0) {
      return { error: tErr('invalidClaimAmount') }
    }

    const db = getAdminClient()
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('requestNotFound') }
    if (data.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (data.auto_generated) return { error: tErr('manualOnlyEditable') }

    const ceiling = (data.silver as number | null) ?? 0
    if (newClaimedSilver > ceiling) {
      return { error: tErr('claimOverCeiling', { ceiling: ceiling.toLocaleString() }) }
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({ claimed_silver: newClaimedSilver })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) return { error: updateError.message }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return { claimedSilver: newClaimedSilver }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
