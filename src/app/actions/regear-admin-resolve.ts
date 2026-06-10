'use server'

// 리기어 신청 mutation — approve(silver/stocked/crafted) / reject / recheck /
// bulkApprove. 조회 (list*) 는 `./regear-admin-list` 에 분리. 공통 type/const/
// helper 는 `./regear-admin-types`.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { formatSilver } from '@/lib/silver'
import {
  resolveRegearApprovalPayout,
  resolveRegearPayoutRatePercent,
} from '@/lib/regear-payout'
import { formatKillboardVerificationReason, verifyDeathInWindow } from '@/lib/killboard'
import { estimateSilverFromEquipment } from '@/lib/regear-estimate'
import { checkBuildSnapshotStock } from '@/lib/inventory'
import {
  craftRegearSlots,
  normalizeCraftRegearSlots,
  type CraftRegearSlot,
} from '@/lib/regear-craft-slots'
import { isRegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import { logAdminAction } from '@/lib/admin-audit'
import type { BuildSnapshot } from '@/types'
import {
  loadPayoutRatePercent,
  loadVideoPayoutRatePercent,
  type BulkRegearActionResult,
  type RecheckKillboardResult,
} from './regear-admin-types'

const REGEAR_REVIEW_CAPS = [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION] as const
const REGEAR_BULK_CAPS = [CAP.REGEAR_BULK_ACTION, CAP.REGEAR_APPROVE] as const

async function loadEffectivePayoutRatePercent(
  guildId: string,
  videoProofUrl: string | null | undefined,
): Promise<number> {
  const [baseRatePercent, videoRatePercent] = await Promise.all([
    loadPayoutRatePercent(guildId),
    loadVideoPayoutRatePercent(guildId),
  ])
  return resolveRegearPayoutRatePercent({
    baseRatePercent,
    videoRatePercent,
    hasVideoProof: Boolean(videoProofUrl),
  })
}

function resolveCraftIncludedSlots(
  requestedSlots: unknown,
  includeCape?: boolean,
): CraftRegearSlot[] {
  return typeof includeCape === 'boolean'
    ? craftRegearSlots(includeCape)
    : normalizeCraftRegearSlots(requestedSlots, false)
}

export async function approveRegearRequest(
  id: string,
  overrideSilver?: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    // Compute the actual credit using the current rate. If the admin typed an
    // explicit override, treat it as the adjusted claim basis, then apply the
    // guild payout rate before passing the final payout into the RPC.
    const { data: pending } = await db
      .from('regear_requests')
      .select('claimed_silver, video_proof_url')
      .eq('guild_id', guildId)
      .eq('id', id)
      .eq('status', 'pending')
      .maybeSingle()
    const claimed = pending?.claimed_silver ?? 0
    const ratePercent = await loadEffectivePayoutRatePercent(guildId, pending?.video_proof_url)
    const payoutResult = resolveRegearApprovalPayout({
      claimedSilver: claimed,
      ratePercent,
      overrideSilver,
    })
    if ('error' in payoutResult) {
      if (payoutResult.error === 'nonNegativeInteger') return { error: tErr('nonNegativeInteger') }
      return { error: tErr('payoutExceedsClaim', { claimed: claimed.toLocaleString() }) }
    }
    const payout = payoutResult.payoutSilver
    const { error } = await db.rpc('approve_regear_request', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
      p_payout_silver: payout,
    })
    if (error) {
      if (error.message.includes('REGEAR_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    // 마이그 116 이후 RPC 가 한 트랜잭션 안에서: 승인 + fulfillment_mode='silver'
    // + ledger credit + 잔존 craft_task cancel 까지 모두 처리. TS 후속 호출 불요.
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/craft/my-tasks')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    // 승인 직후 요청자에게 Discord DM. 실패해도 승인은 성공한 상태이므로 무시.
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot, payout_silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendLocalizedDiscordDmToUser(row.discord_id, guildId, (tDm) => ({
        title: tDm('regearApprovedTitle'),
        body: tDm('regearApprovedBody', {
          event: row.event_title_snapshot ?? '',
          silver: formatSilver(row.payout_silver ?? payout),
        }),
        url: '/me',
      }))
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'regear.approve',
      targetId: id,
      targetKind: 'regear',
      targetDiscordId: row?.discord_id ?? null,
      details: { mode: 'silver', claimedSilver: claimed, payoutSilver: payout, eventTitle: row?.event_title_snapshot ?? null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 재고 직출고 승인 — crafted 모드 리기어를 craft_task 큐잉 없이 바로 길드
// 재고에서 출고. RPC 가 모든 itemId 의 재고를 잠그면서 검증 → 부족 시 전체 롤백.
export async function approveRegearFromStock(
  id: string,
  overrideSilver?: number,
  includeCape?: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: pending } = await db
      .from('regear_requests')
      .select('claimed_silver, video_proof_url, build_snapshot, craft_requested_slots, fulfillment_mode, status')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (!pending || pending.status !== 'pending') {
      return { error: tErr('alreadyHandled') }
    }
    if (pending.fulfillment_mode !== 'crafted') {
      return { error: tErr('regearNotCraftedMode') }
    }
    const buildSnapshot = (pending.build_snapshot as BuildSnapshot | null) ?? null
    if (!buildSnapshot) {
      return { error: tErr('regearMissingBuildSnapshot') }
    }

    // 사전 충분 여부 체크 — 어차피 RPC 가 또 한 번 검증하지만 명확한 에러를 내려고.
    const includedSlots = resolveCraftIncludedSlots(pending.craft_requested_slots, includeCape)
    const stockCheck = await checkBuildSnapshotStock(guildId, buildSnapshot, {
      includedSlots,
    })
    if (!stockCheck.allSufficient) {
      const missing = stockCheck.perItem.filter((p) => !p.sufficient).map((p) => p.itemId)
      return { error: tErr('regearInsufficientStock', { items: missing.join(', ') }) }
    }

    const claimed = pending.claimed_silver ?? 0
    const ratePercent = await loadEffectivePayoutRatePercent(guildId, pending.video_proof_url)
    const payoutResult = resolveRegearApprovalPayout({
      claimedSilver: claimed,
      ratePercent,
      overrideSilver,
    })
    if ('error' in payoutResult) {
      if (payoutResult.error === 'nonNegativeInteger') return { error: tErr('nonNegativeInteger') }
      return { error: tErr('payoutExceedsClaim', { claimed: claimed.toLocaleString() }) }
    }
    const payout = payoutResult.payoutSilver

    const { error } = await db.rpc('approve_regear_from_stock', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
      p_payout_silver: payout,
      p_item_ids: stockCheck.itemIdsForRpc,
      p_included_slots: includedSlots,
    })
    if (error) {
      const msg = error.message
      if (msg.includes('REGEAR_NOT_PENDING')) return { error: tErr('alreadyHandled') }
      if (msg.includes('REGEAR_NOT_CRAFTED_MODE')) return { error: tErr('regearNotCraftedMode') }
      if (msg.includes('INSUFFICIENT_STOCK')) {
        const itemId = msg.split('INSUFFICIENT_STOCK:')[1]?.trim() ?? ''
        return { error: tErr('regearInsufficientStock', { items: itemId }) }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/inventory')
    revalidatePath('/me')
    revalidatePath('/', 'layout')

    // 승인 DM — 재고 출고 사실을 본문에 명시.
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendLocalizedDiscordDmToUser(row.discord_id, guildId, (tDm) => ({
        title: tDm('regearStockedTitle'),
        body: tDm('regearStockedBody', {
          event: row.event_title_snapshot ?? '',
        }),
        url: '/me',
      }))
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'regear.approve',
      targetId: id,
      targetKind: 'regear',
      targetDiscordId: row?.discord_id ?? null,
      details: { mode: 'stock', claimedSilver: claimed, payoutSilver: payout, includedSlots, eventTitle: row?.event_title_snapshot ?? null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 제작 의뢰로 보내기 — crafted 모드 리기어를 craft_tasks 큐에 명시적으로
// 진입시킨다. 마이그 116 의 approve_regear_request 가 항상 silver 로 flip
// 하기 때문에, 어드민이 "제작 큐로 보내기" 의도를 분리해서 누를 수 있게 별도
// RPC + 액션으로 갈렸다 (마이그 127).
export async function approveRegearAsCrafted(
  id: string,
  overrideSilver?: number,
  includeCape?: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: pending } = await db
      .from('regear_requests')
      .select('claimed_silver, video_proof_url, build_snapshot, craft_requested_slots, fulfillment_mode, status')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (!pending || pending.status !== 'pending') {
      return { error: tErr('alreadyHandled') }
    }
    if (pending.fulfillment_mode !== 'crafted') {
      return { error: tErr('regearNotCraftedMode') }
    }
    const buildSnapshot = (pending.build_snapshot as BuildSnapshot | null) ?? null
    if (!buildSnapshot) {
      return { error: tErr('regearMissingBuildSnapshot') }
    }

    const claimed = pending.claimed_silver ?? 0
    const ratePercent = await loadEffectivePayoutRatePercent(guildId, pending.video_proof_url)
    const payoutResult = resolveRegearApprovalPayout({
      claimedSilver: claimed,
      ratePercent,
      overrideSilver,
    })
    if ('error' in payoutResult) {
      if (payoutResult.error === 'nonNegativeInteger') return { error: tErr('nonNegativeInteger') }
      return { error: tErr('payoutExceedsClaim', { claimed: claimed.toLocaleString() }) }
    }
    const payout = payoutResult.payoutSilver
    const includedSlots = resolveCraftIncludedSlots(pending.craft_requested_slots, includeCape)

    const { error } = await db.rpc('approve_regear_as_crafted', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
      p_payout_silver: payout,
      p_included_slots: includedSlots,
    })
    if (error) {
      const msg = error.message
      if (msg.includes('REGEAR_NOT_PENDING')) return { error: tErr('alreadyHandled') }
      if (msg.includes('REGEAR_NOT_CRAFTED_MODE')) return { error: tErr('regearNotCraftedMode') }
      if (msg.includes('REGEAR_NO_BUILD_SNAPSHOT')) {
        return { error: tErr('regearMissingBuildSnapshot') }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/me')
    revalidatePath('/', 'layout')

    // DM 은 보내지 않는다 — 청구자 입장에서는 큐 진입 자체가 의미 있는
    // 상태 변화가 아니라, 제작자가 박스에 장비를 채운 시점 (delivery) 에만
    // 알림이 가치 있다.
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'regear.approve',
      targetId: id,
      targetKind: 'regear',
      targetDiscordId: row?.discord_id ?? null,
      details: { mode: 'crafted', claimedSilver: claimed, payoutSilver: payout, includedSlots, eventTitle: row?.event_title_snapshot ?? null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 제출 시점엔 Albion API 가 아직 사망을 인덱싱하지 않아 killboard_verified 가
// false 로 굳는 경우가 흔하다 (API 지연 ~30분). 관리자가 시간 지난 뒤 이 액션을
// 눌러 최신 결과로 다시 채워넣을 수 있게 한다. pending 상태만 재확인 허용 —
// 이미 처리된 행은 감사 로그처럼 당시 상태를 보존.
export async function recheckKillboardVerification(
  id: string,
): Promise<RecheckKillboardResult> {
  const tErr = await getTranslations('adminActionError')
  const tKillboard = await getTranslations('killboardVerify')
  const empty: RecheckKillboardResult = {
    killboard_verified: false,
    killboard_event_id: null,
    admin_notes: null,
    estimated_silver: null,
  }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: tErr('unauthorized') }
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select('username, status, event_id, events(battle_started_at)')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (fetchError) return { ...empty, error: fetchError.message }
    if (!row) return { ...empty, error: tErr('requestNotFound') }
    if (row.status !== 'pending') return { ...empty, error: tErr('alreadyHandled') }

    const event = row.events as
      | { battle_started_at: string | null }
      | { battle_started_at: string | null }[]
      | null
    const battleStartedAt = Array.isArray(event)
      ? event[0]?.battle_started_at ?? null
      : event?.battle_started_at ?? null
    if (!battleStartedAt) return { ...empty, error: tErr('battleNotStarted') }

    const result = await verifyDeathInWindow(
      row.username as string,
      battleStartedAt,
      new Date().toISOString(),
      { guildId },
    )
    const adminNotes = formatKillboardVerificationReason(result, tKillboard)

    // 재확인이 성공하고 equipment 가 있으면 AODP 시세로 추산액을 계산.
    // 실패 케이스(equipment 없음, AODP 전부 null 등) 는 조용히 null 로 둔다 —
    // 기존 검증 로직을 막아선 안 되므로.
    let estimatedSilver: number | null = null
    let breakdown: Record<string, unknown> | null = null
    if (result.verified && result.matchedEquipment) {
      try {
        const estimate = await estimateSilverFromEquipment(result.matchedEquipment, guildId)
        if (estimate.marketSilver > 0) {
          estimatedSilver = estimate.marketSilver
        }
        breakdown = estimate.breakdown as unknown as Record<string, unknown>
      } catch {
        // AODP 실패는 재확인 전체를 실패시키지 않는다.
      }
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        killboard_verified: result.verified,
        killboard_event_id: result.matchedEventId,
        admin_notes: adminNotes,
        gear_breakdown: breakdown,
      })
      .eq('guild_id', guildId)
      .eq('id', id)
      .eq('status', 'pending')
    if (updateError) return { ...empty, error: updateError.message }

    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return {
      killboard_verified: result.verified,
      killboard_event_id: result.matchedEventId,
      admin_notes: adminNotes,
      estimated_silver: estimatedSilver,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 같은 이벤트·같은 청구자 묶음을 한 번에 승인하기 위한 일괄 액션. 한 청구자가
// 한 전투에서 2회 이상 죽었을 때 RegearReviewList 가 (event_id, discord_id)
// 단위로 카드를 묶어 보여주고, 묶인 행들을 한 번에 승인한다. 각 행은
// approve_regear_request RPC 한 번씩 — 트랜잭션은 행 단위 그대로 (실패 시 한
// 행만 롤백). 네트워크 round-trip 비용 (N개) 은 그룹당 보통 2-5건이라 체감
// 안 된다. 항상 silver 모드로 승인 — crafted 모드 행도 RPC 가 silver 로 flip.
// 부분 실패 (race 등) 는 errors[] 로 돌려서 UI 가 토스트에 알림.
const BULK_REGEAR_LIMIT = 50

export async function bulkApproveRegear(
  ids: string[],
): Promise<BulkRegearActionResult> {
  const tErr = await getTranslations('adminActionError')
  const result: BulkRegearActionResult = {
    succeeded: 0,
    failed: 0,
    total: ids.length,
    errors: [],
  }
  if (ids.length === 0) return result
  if (ids.length > BULK_REGEAR_LIMIT) {
    return {
      ...result,
      fatalError: tErr('bulkRegearTooMany', { max: BULK_REGEAR_LIMIT }),
    }
  }
  try {
    await requireAnyCapability(REGEAR_BULK_CAPS)
    const session = await getSession()
    if (!session) return { ...result, fatalError: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    for (const id of ids) {
      const sub = await approveRegearRequest(id)
      if (sub.error) {
        result.failed += 1
        result.errors.push({ id, error: sub.error })
      } else {
        result.succeeded += 1
      }
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'regear.bulk_approve',
      targetKind: 'regear',
      details: { total: result.total, succeeded: result.succeeded, failed: result.failed, ids },
    })
    return result
  } catch (e) {
    return {
      ...result,
      fatalError: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

export async function rejectRegearRequest(
  id: string,
  reasonCode: string,
  notes: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  if (!isRegearRejectReasonCode(reasonCode)) {
    return { error: tErr('invalidRejectReason') }
  }
  try {
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('reject_regear_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_reason_code: reasonCode,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('REGEAR_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      if (error.message.includes('INVALID_REJECT_REASON_CODE')) {
        return { error: tErr('invalidRejectReason') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      // DM 본문에 사유 라벨까지 넣어 멤버가 사이트를 안 열어도 어떤 사유로
      // 거절됐는지 한 줄로 안다. 자유메모(notes) 가 있으면 괄호로 부연.
      const notesTrimmed = notes.trim()
      void sendLocalizedDiscordDmToUser(row.discord_id, guildId, async (tDm, locale) => {
        const tReason = await getTranslations({ locale, namespace: 'regearRejectReason' })
        const reasonLabel = tReason(reasonCode)
        const bodyText = notesTrimmed
          ? tDm('regearRejectedBodyWithReason', {
              event: row.event_title_snapshot ?? '',
              reason: reasonLabel,
              notes: notesTrimmed,
            })
          : tDm('regearRejectedBodyReasonOnly', {
              event: row.event_title_snapshot ?? '',
              reason: reasonLabel,
            })
        return {
          title: tDm('regearRejectedTitle'),
          body: bodyText,
          url: '/me',
        }
      })
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'regear.reject',
      targetId: id,
      targetKind: 'regear',
      targetDiscordId: row?.discord_id ?? null,
      details: { reasonCode, notes: notes.trim() || null, eventTitle: row?.event_title_snapshot ?? null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
