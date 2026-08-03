'use server'


import { publicActionError } from '@/lib/public-action-error'
// 멤버 본인의 pending 리기어 행 인라인 편집/취소 액션 모음. 신청/조회는 regear.ts,
// 어드민 측 작업은 regear-admin.ts. 모든 함수는 다음 공통 가드를 통과한다:
// - 현재 mutation 세션으로 로그인·Discord membership을 재확인
// - 길드 격리 (`guild_id = session.guildId`)
// - 본인 소유 확인 (안정 회원 UUID 우선, 미투영 legacy 행만 access subject fallback)
// - `status = 'pending'` 인 행만 편집/취소 허용
// 추가 가드는 자동/수동, crafted/silver 모드별로 함수마다 다르다.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireCurrentMutationSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { calcPayoutSilver, isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import {
  ALLOWED_MIME,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_BUCKET,
  computeMarketSilverFromItems,
  normalizeBreakdownItems,
  type RawBreakdown,
  type RegearLineItem,
} from '@/lib/regear-helpers'
import { validateImageUploadFile } from '@/lib/image-upload'
import {
  SLOT_KEYS,
  type BuildSnapshot,
  type SlotKey,
} from '@/types'
import { normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { fetchYoutubeVideoProofTitle } from '@/lib/regear-video-proof-metadata'
import {
  isAllianceContentRegearLinkInput,
  type AllianceContentRegearLinkInput,
  type AllianceContentRegearSubmitStatus,
} from '@/lib/alliance-content-regear-video'
import { submitRegearVideoForAllianceContent } from '@/lib/alliance-content-regear-submit'
import { resolveRegearClaimCeilingSilver } from '@/lib/regear-claim-ceiling'
import {
  parseRegearPolicySnapshot,
  resolveSnapshotClaimCeilingSilver,
} from '@/lib/regear-event-policy'
import { loadVideoClaimCeilingBonusSilver } from './regear-admin-types'
import { isRegearSupported } from '@/lib/regear-support-server'
import { getAppSetting } from '@/lib/app-settings'
import { isOverchargeVideoProofMissing } from '@/lib/regear-request-policy'
import {
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from '@/lib/stable-member-ownership'

// 단위 실버 상한 — int32 를 넘지 않으면서 시세 오입력 방지. 20M 실버/단위면
// 현재 게임 내 어떤 아이템보다도 훨씬 높아 실질적 상한은 유지된다.
const MAX_UNIT_SILVER = 20_000_000

function screenshotUploadErrorMessage(
  tErr: Awaited<ReturnType<typeof getTranslations>>,
  error: 'missing' | 'empty' | 'tooLarge' | 'wrongType',
): string {
  switch (error) {
    case 'missing':
    case 'empty':
      return tErr('screenshotMissing')
    case 'tooLarge':
      return tErr('screenshotTooLarge')
    case 'wrongType':
      return tErr('screenshotWrongType')
  }
}

export async function cancelMyRegearRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  if (!(await isRegearSupported(guildId))) {
    return { error: tErr('regearSupportDisabled') }
  }

  const db = getAdminClient()
  const ownership = session.isGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
  }
  const { data: row, error: fetchError } = await db
    .from('regear_requests')
    .select('id, status, discord_id, guild_member_id, event_id, screenshot_path, screenshot_path_2')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: await publicActionError(fetchError, 'actions/regear-edit') }
  if (!row) return { error: tErr('requestNotFound') }
  if (
    session.isGuest &&
    session.eventScope &&
    row.event_id !== session.eventScope
  ) {
    return { error: tErr('requestNotFound') }
  }
  if (!isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: session.discordId,
    rowGuildMemberId: row.guild_member_id,
    rowSubjectId: row.discord_id,
  })) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('regear_requests')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('discord_id', row.discord_id)
    .eq('status', 'pending')
  if (deleteError) return { error: await publicActionError(deleteError, 'actions/regear-edit') }

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
  revalidatePath('/', 'layout')
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

  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  if (!(await isRegearSupported(guildId))) {
    return { error: tErr('regearSupportDisabled') }
  }

  const db = getAdminClient()
  const ownership = session.isGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
  }
  const { data: row, error: fetchErr } = await db
    .from('regear_requests')
    .select('id, discord_id, guild_member_id, status, auto_generated, fulfillment_mode, build_snapshot, role_name')
    .eq('guild_id', guildId)
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) return { error: await publicActionError(fetchErr, 'actions/regear-edit') }
  if (!row) return { error: tErr('requestNotFound') }
  if (!isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: session.discordId,
    rowGuildMemberId: row.guild_member_id,
    rowSubjectId: row.discord_id,
  })) return { error: tErr('onlyOwnEdit') }
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
    .eq('discord_id', row.discord_id)
  if (updateErr) return { error: await publicActionError(updateErr, 'actions/regear-edit') }

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
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }

    const newPrimary = formData.get('screenshot')
    const newSecondary = formData.get('screenshot2')
    const removeSecondary = formData.get('removeSecondary') === 'true'

    const hasPrimary = newPrimary instanceof File && newPrimary.size > 0
    const hasSecondary = newSecondary instanceof File && newSecondary.size > 0
    const primaryImage = hasPrimary
      ? await validateImageUploadFile(newPrimary, {
          allowedTypes: ALLOWED_MIME,
          maxBytes: MAX_SCREENSHOT_BYTES,
        })
      : null
    const secondaryImage = hasSecondary
      ? await validateImageUploadFile(newSecondary, {
          allowedTypes: ALLOWED_MIME,
          maxBytes: MAX_SCREENSHOT_BYTES,
        })
      : null

    if (primaryImage && !primaryImage.ok) return { error: screenshotUploadErrorMessage(tErr, primaryImage.error) }
    if (secondaryImage && !secondaryImage.ok) return { error: screenshotUploadErrorMessage(tErr, secondaryImage.error) }
    if (!hasPrimary && !hasSecondary && !removeSecondary) {
      return { error: tErr('noChange') }
    }

    const db = getAdminClient()
    const ownership = session.isGuest
      ? { guildMemberId: null, error: undefined }
      : await resolveStableMemberOwnership(db, guildId, session.discordId)
    if (ownership.error) {
      return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
    }
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select(
        'id, status, auto_generated, discord_id, guild_member_id, event_id, screenshot_path, screenshot_path_2',
      )
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (fetchError) return { error: await publicActionError(fetchError, 'actions/regear-edit') }
    if (!row) return { error: tErr('requestNotFound') }
    if (!isSameStableMemberOwner({
      currentGuildMemberId: ownership.guildMemberId,
      currentSubjectId: session.discordId,
      rowGuildMemberId: row.guild_member_id,
      rowSubjectId: row.discord_id,
    })) return { error: tErr('onlyOwnEdit') }
    if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (row.auto_generated) return { error: tErr('manualOnlyEditable') }

    const eventId = row.event_id as string
    const oldPrimary = (row.screenshot_path as string | null) ?? null
    const oldSecondary = (row.screenshot_path_2 as string | null) ?? null

    let nextPrimary: string | null = oldPrimary
    let nextSecondary: string | null = oldSecondary
    const newlyUploaded: string[] = []
    const toRemove: string[] = []

    if (primaryImage?.ok) {
      const path = `${session.discordId}/${eventId}-${Date.now()}.${primaryImage.ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, primaryImage.file, { contentType: primaryImage.mime, upsert: false })
      if (upErr) {
        return { error: await publicActionError(upErr, 'actions/regear-edit') }
      }
      newlyUploaded.push(path)
      if (oldPrimary) toRemove.push(oldPrimary)
      nextPrimary = path
    }

    if (secondaryImage?.ok) {
      const path = `${session.discordId}/${eventId}-${Date.now()}-2.${secondaryImage.ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, secondaryImage.file, { contentType: secondaryImage.mime, upsert: false })
      if (upErr) {
        if (newlyUploaded.length > 0) {
          await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
        }
        return { error: await publicActionError(upErr, 'actions/regear-edit') }
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
      .eq('discord_id', row.discord_id)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) {
      if (newlyUploaded.length > 0) {
        await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
      }
      return { error: await publicActionError(updateError, 'actions/regear-edit') }
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
    return { error: await publicActionError(e, 'actions/regear-edit') }
  }
}

export async function updateMyManualRegearVideoProof(
  requestId: string,
  rawVideoUrl: string,
  allianceContentLink: AllianceContentRegearLinkInput | null = null,
): Promise<{
  error?: string
  videoProofUrl?: string | null
  videoProofTitle?: string | null
  allianceContentVideoStatus?: AllianceContentRegearSubmitStatus
}> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }

    const trimmed = rawVideoUrl.trim()
    const videoProofUrl = trimmed ? normalizeYoutubeVideoProofUrl(trimmed) : null
    if (trimmed && !videoProofUrl) return { error: tErr('invalidVideoProofUrl') }

    const db = getAdminClient()
    const ownership = session.isGuest
      ? { guildMemberId: null, error: undefined }
      : await resolveStableMemberOwnership(db, guildId, session.discordId)
    if (ownership.error) {
      return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
    }
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, guild_member_id, claimed_silver, silver, base_silver, video_proof_url, regear_policy_snapshot, request_type')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (fetchError) return { error: await publicActionError(fetchError, 'actions/regear-edit') }
    if (!row) return { error: tErr('requestNotFound') }
    if (!isSameStableMemberOwner({
      currentGuildMemberId: ownership.guildMemberId,
      currentSubjectId: session.discordId,
      rowGuildMemberId: row.guild_member_id,
      rowSubjectId: row.discord_id,
    })) return { error: tErr('onlyOwnEdit') }
    if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (row.auto_generated) return { error: tErr('manualOnlyEditable') }
    if (row.request_type === 'overcharge') {
      const videoRequired =
        (await getAppSetting('regear_overcharge_video_required', 'false', guildId)) === 'true'
      if (
        isOverchargeVideoProofMissing({
          entries: [{ requestType: 'overcharge' }],
          videoRequired,
          hasVideoProof: Boolean(videoProofUrl),
        })
      ) {
        return { error: tErr('overchargeVideoRequired') }
      }
    }

    const { data: activeAllianceSubmission, error: activeSubmissionError } = await db
      .from('alliance_content_video_submissions')
      .select('id')
      .eq('guild_id', guildId)
      .eq('source_regear_request_id', requestId)
      .in('status', ['pending', 'approved'])
      .limit(1)
      .maybeSingle()
    if (activeSubmissionError) return { error: await publicActionError(activeSubmissionError, 'actions/regear-edit') }
    if (activeAllianceSubmission && videoProofUrl !== row.video_proof_url) {
      return { error: tErr('allianceContentVideoLocked') }
    }

    const baseCeiling = (row.base_silver as number | null) ?? ((row.silver as number | null) ?? 0)
    const videoClaimCeilingBonusSilver = await loadVideoClaimCeilingBonusSilver(guildId)
    const fallbackCeiling = resolveRegearClaimCeilingSilver({
      baseCeilingSilver: baseCeiling,
      videoCeilingBonusSilver: videoClaimCeilingBonusSilver,
      hasVideoProof: Boolean(videoProofUrl),
    })
    const snapshot = parseRegearPolicySnapshot(row.regear_policy_snapshot)
    const effectiveCeiling = resolveSnapshotClaimCeilingSilver(
      snapshot,
      Boolean(videoProofUrl),
      fallbackCeiling,
    )
    const claimedSilver = (row.claimed_silver as number | null) ?? 0
    if (claimedSilver > effectiveCeiling) {
      return { error: tErr('claimOverCeiling', { ceiling: effectiveCeiling.toLocaleString() }) }
    }
    const videoProofTitle = await fetchYoutubeVideoProofTitle(videoProofUrl)

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        video_proof_url: videoProofUrl,
        video_proof_title: videoProofTitle,
        silver: effectiveCeiling,
        base_silver: baseCeiling,
      })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', row.discord_id)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) return { error: await publicActionError(updateError, 'actions/regear-edit') }

    revalidatePath(`/me/regear/${requestId}`)
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    const allianceContentVideoStatus = await submitRegearVideoForAllianceContent({
      guildId,
      discordId: row.discord_id,
      regearRequestId: requestId,
      link: videoProofUrl && isAllianceContentRegearLinkInput(allianceContentLink)
        ? allianceContentLink
        : null,
    })
    return {
      videoProofUrl,
      videoProofTitle,
      ...(allianceContentVideoStatus ? { allianceContentVideoStatus } : {}),
    }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/regear-edit') }
  }
}

export async function updateMyRegearLineItemPrice(
  requestId: string,
  slot: string,
  newUnitSilver: number,
): Promise<UpdateLineItemResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }

    if (!Number.isInteger(newUnitSilver) || newUnitSilver < 0) {
      return { error: tErr('priceMustBeNonNegativeInt') }
    }
    if (newUnitSilver > MAX_UNIT_SILVER) {
      return { error: tErr('priceTooLarge', { max: MAX_UNIT_SILVER.toLocaleString() }) }
    }
    const slotTrimmed = slot.trim()
    if (!slotTrimmed) return { error: tErr('slotEmpty') }

    const db = getAdminClient()
    const ownership = session.isGuest
      ? { guildMemberId: null, error: undefined }
      : await resolveStableMemberOwnership(db, guildId, session.discordId)
    if (ownership.error) {
      return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
    }
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, guild_member_id, gear_breakdown')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (error) return { error: await publicActionError(error, 'actions/regear-edit') }
    if (!data) return { error: tErr('requestNotFound') }
    if (!isSameStableMemberOwner({
      currentGuildMemberId: ownership.guildMemberId,
      currentSubjectId: session.discordId,
      rowGuildMemberId: data.guild_member_id,
      rowSubjectId: data.discord_id,
    })) return { error: tErr('onlyOwnEdit') }
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
    const payoutRatePercent = isValidRoleRegearPayoutRate(breakdown.payout_rate_percent)
      ? breakdown.payout_rate_percent
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
      .eq('discord_id', data.discord_id)
      .eq('status', 'pending')
      .eq('auto_generated', true)
    if (updateError) return { error: await publicActionError(updateError, 'actions/regear-edit') }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return {
      marketSilver: newMarketSilver,
      claimedSilver: newClaimedSilver,
      payoutSilver: newPayoutSilver,
    }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/regear-edit') }
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
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }

    if (!Number.isInteger(newClaimedSilver) || newClaimedSilver <= 0) {
      return { error: tErr('invalidClaimAmount') }
    }

    const db = getAdminClient()
    const ownership = session.isGuest
      ? { guildMemberId: null, error: undefined }
      : await resolveStableMemberOwnership(db, guildId, session.discordId)
    if (ownership.error) {
      return { error: await publicActionError(new Error(ownership.error), 'actions/regear-edit') }
    }
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, guild_member_id, silver, base_silver, video_proof_url, regear_policy_snapshot')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (error) return { error: await publicActionError(error, 'actions/regear-edit') }
    if (!data) return { error: tErr('requestNotFound') }
    if (!isSameStableMemberOwner({
      currentGuildMemberId: ownership.guildMemberId,
      currentSubjectId: session.discordId,
      rowGuildMemberId: data.guild_member_id,
      rowSubjectId: data.discord_id,
    })) return { error: tErr('onlyOwnEdit') }
    if (data.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (data.auto_generated) return { error: tErr('manualOnlyEditable') }

    const baseCeiling = (data.base_silver as number | null) ?? ((data.silver as number | null) ?? 0)
    const videoClaimCeilingBonusSilver = await loadVideoClaimCeilingBonusSilver(guildId)
    const fallbackCeiling = resolveRegearClaimCeilingSilver({
      baseCeilingSilver: baseCeiling,
      videoCeilingBonusSilver: videoClaimCeilingBonusSilver,
      hasVideoProof: Boolean(data.video_proof_url),
    })
    const snapshot = parseRegearPolicySnapshot(data.regear_policy_snapshot)
    const ceiling = resolveSnapshotClaimCeilingSilver(
      snapshot,
      Boolean(data.video_proof_url),
      fallbackCeiling,
    )
    if (newClaimedSilver > ceiling) {
      return { error: tErr('claimOverCeiling', { ceiling: ceiling.toLocaleString() }) }
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({ claimed_silver: newClaimedSilver })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', data.discord_id)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) return { error: await publicActionError(updateError, 'actions/regear-edit') }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return { claimedSilver: newClaimedSilver }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/regear-edit') }
  }
}
