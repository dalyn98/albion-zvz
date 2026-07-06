'use server'

// 이벤트 외 트래킹 사망 직접 신청 (예외 흐름).
//
// 이벤트가 만들어지지 않은 일반 트래킹 전투에서 죽은 길드원이 직접
// 본인의 사망 기록을 보고 리기어를 신청할 수 있게 한다. 자동 리기어 cron 은
// 이벤트 종료를 트리거로 동작하므로 이 흐름은 자동 처리에 닿지 않은 사망에 대한
// 안전 그물.
//
// 적격 사망 = 우리 집계 규칙 통과한 tenant_battle_records 의 victim 행. 추가로
// 이미 같은 killboard_event_id 로 만들어진 (auto/manual/window) regear_request 가
// 있으면 중복 신청 차단.
//
// 신청 시 insert 되는 행:
//   - event_id NULL, regear_window_id NULL, killboard_event_id 채움
//   - killboard_verified=true (트래킹 전투의 victim 으로 직접 매칭한 행이라 신뢰)
//   - auto_generated=false (멤버 직접 신청)
//   - build_snapshot 은 killboard equipment 에서 변환
//   - claimed_silver 는 멤버가 입력 (role 천장 안에서)

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { fetchTrackedBattleWindows } from '@/lib/tracked-kills'
import { equipmentToBuildSnapshot, type EquipmentItem } from '@/lib/auto-regear'
import { getRegearEligibilityDays } from '@/app/actions/regear'
import { requireManualRegearAllowed } from '@/lib/albion-identity'
import type { AlbionIdentityRelation } from '@/lib/account-albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import type { BuildSnapshot } from '@/types'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { validateImageUploadFile } from '@/lib/image-upload'
import { parsePositiveSafeInt } from '@/lib/parse-bounded-int'
import {
  craftRegearSlots,
  parseCraftIncludeCapeFormValue,
} from '@/lib/regear-craft-slots'
import { normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { fetchYoutubeVideoProofTitle } from '@/lib/regear-video-proof-metadata'
import { resolveEventRegearPolicy } from '@/lib/regear-event-policy'
import {
  loadPayoutRatePercent,
  loadVideoClaimCeilingBonusSilver,
  loadVideoPayoutRatePercent,
} from './regear-admin-types'

// 스크린샷은 옵션 — killboard_verified=true 가 이미 검증 소스라 필수가 아니지만,
// 청구자가 갱크 상황·잔여 인원·아이템 등 추가 컨텍스트를 첨부할 수 있게 한다.
// 윈도우 신청 흐름과 동일한 버킷을 공유.
const SCREENSHOT_BUCKET = 'regear-screenshots'
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

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

export interface TrackedDeath {
  killboardEventId: number
  battleId: number | null
  occurredAt: string
  opponentName: string | null
  opponentGuild: string | null
  opponentAlliance: string | null
  fame: number
  itemPower: number | null
  buildSnapshot: BuildSnapshot
}

interface KillboardVictimRow {
  event_id: number | string
  battle_id: number | string | null
  occurred_at: string
  opponent_name: string | null
  opponent_guild: string | null
  opponent_alliance: string | null
  fame: number | null
  item_power: number | null
  equipment: Record<string, EquipmentItem | null> | null
}

function normalizeBigInt(raw: number | string | null): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// 본인 트래킹 사망 중 아직 regear_request 에 연결되지 않은 것만 반환.
// 최근 occurred_at 순.
export async function listMyTrackedAdHocDeaths(): Promise<{
  deaths: TrackedDeath[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { deaths: [], error: tErr('loginRequired') }
  if (!session.isMember) return { deaths: [], error: tErr('memberOnly') }

  const guildId = await getSessionGuildId(session)
  const requireVerification =
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    if (gate.error) {
      return { deaths: [], error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
    }
  }
  const db = getAdminClient()

  const eligibilityDays = await getRegearEligibilityDays(guildId)
  const sinceMs = Date.now() - eligibilityDays * 24 * 60 * 60 * 1000
  const sinceIso = new Date(sinceMs).toISOString()

  const tracked = await fetchTrackedBattleWindows(db, guildId, sinceIso)
  if (tracked.byBattleId.size === 0) return { deaths: [] }

  const trackedBattleIds = Array.from(tracked.byBattleId.keys())

  const { data: rows, error } = await db
    .from('killboard_events')
    .select(
      'event_id, battle_id, occurred_at, opponent_name, opponent_guild, opponent_alliance, fame, item_power, equipment',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .eq('role', 'victim')
    .gte('occurred_at', sinceIso)
    .in('battle_id', trackedBattleIds)
    .order('occurred_at', { ascending: false })
    .limit(100)
  if (error) return { deaths: [], error: error.message }

  const candidates = (rows ?? []) as unknown as KillboardVictimRow[]
  if (candidates.length === 0) return { deaths: [] }

  const candidateIds = candidates
    .map((r) => normalizeBigInt(r.event_id))
    .filter((n): n is number => n != null)

  // 이미 regear_request (status != rejected) 에 연결된 killboard_event_id 는 제외.
  // rejected 는 재신청 가능하게 둔다 (regear migration 026 의 partial unique 정책과 일관).
  const { data: existing } = await db
    .from('regear_requests')
    .select('killboard_event_id, status')
    .eq('guild_id', guildId)
    .in('killboard_event_id', candidateIds)
  const blocked = new Set<number>()
  for (const row of existing ?? []) {
    const kbId = normalizeBigInt(
      (row as { killboard_event_id: number | string | null }).killboard_event_id,
    )
    const status = (row as { status: string }).status
    if (kbId != null && status !== 'rejected') blocked.add(kbId)
  }

  const deaths: TrackedDeath[] = []
  for (const r of candidates) {
    const kbId = normalizeBigInt(r.event_id)
    if (kbId == null) continue
    if (blocked.has(kbId)) continue
    deaths.push({
      killboardEventId: kbId,
      battleId: normalizeBigInt(r.battle_id),
      occurredAt: r.occurred_at,
      opponentName: r.opponent_name,
      opponentGuild: r.opponent_guild,
      opponentAlliance: r.opponent_alliance,
      fame: r.fame ?? 0,
      itemPower: r.item_power,
      buildSnapshot: equipmentToBuildSnapshot(r.equipment, null),
    })
  }
  return { deaths }
}

// 이벤트 외 트래킹 사망 직접 신청.
// 동일 killboard_event_id 의 non-rejected regear_request 가 이미 있으면 거부.
// role_rewards.silver=0 또는 미등록 역할이면 거부 (다른 신청 흐름과 동일 게이트).
//
// FormData 필드:
//   - killboardEventId (string, number)
//   - roleName (string)
//   - claimedSilver (string, integer)
//   - screenshot (File, optional) — 첨부 시에만 storage 업로드
export async function submitTrackedAdHocRegear(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }

  const guildId = await getSessionGuildId(session)
  const craftEnabled =
    (await getAppSetting('craft_regear_enabled', 'false', guildId)) === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftEnabled ? 'crafted' : 'silver'
  const craftRequestedSlots = craftEnabled
    ? craftRegearSlots(parseCraftIncludeCapeFormValue(formData.get('craftIncludeCape')))
    : null
  const requireVerification =
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  let requesterRelation: AlbionIdentityRelation = 'unknown'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    requesterRelation = gate.relation
    if (gate.error) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
  }
  const db = getAdminClient()

  const killboardEventIdRaw = formData.get('killboardEventId')
  const kbId = parsePositiveSafeInt(
    typeof killboardEventIdRaw === 'string' ? killboardEventIdRaw : null,
  )
  if (kbId == null) return { error: tErr('invalidInput') }

  const roleName = String(formData.get('roleName') ?? '').trim()
  if (!roleName) return { error: tErr('invalidInput') }

  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  const claimedSilver = parsePositiveSafeInt(claimedSilverRaw.replace(/,/g, ''))
  if (claimedSilver == null) return { error: tErr('invalidClaimAmount') }
  const videoProofRaw = String(formData.get('videoProofUrl') ?? '').trim()
  const videoProofUrl = videoProofRaw ? normalizeYoutubeVideoProofUrl(videoProofRaw) : null
  if (videoProofRaw && !videoProofUrl) return { error: tErr('invalidVideoProofUrl') }

  const file = formData.get('screenshot')
  const hasFile = file instanceof File && file.size > 0
  const image = hasFile
    ? await validateImageUploadFile(file, {
        allowedTypes: ALLOWED_MIME,
        maxBytes: MAX_SCREENSHOT_BYTES,
      })
    : null
  if (hasFile) {
    if (!image?.ok) return { error: screenshotUploadErrorMessage(tErr, image?.error ?? 'wrongType') }
  }

  // 1) killboard_events 에 victim 으로 존재하는지, 본인 사망인지, 트래킹 전투인지 확인.
  const { data: kb, error: kbError } = await db
    .from('killboard_events')
    .select('event_id, battle_id, occurred_at, equipment')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .eq('role', 'victim')
    .eq('event_id', kbId)
    .maybeSingle()
  if (kbError) return { error: kbError.message }
  if (!kb) return { error: tErr('trackedDeathNotFound') }

  const battleId = normalizeBigInt(
    (kb as { battle_id: number | string | null }).battle_id,
  )
  if (battleId == null) return { error: tErr('trackedDeathNotFound') }

  const eligibilityDays = await getRegearEligibilityDays(guildId)
  const sinceIso = new Date(
    Date.now() - eligibilityDays * 24 * 60 * 60 * 1000,
  ).toISOString()
  const tracked = await fetchTrackedBattleWindows(db, guildId, sinceIso)
  if (!tracked.byBattleId.has(battleId)) {
    return { error: tErr('trackedDeathNotEligible') }
  }

  // 2) 역할 천장 검증.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver, payout_rate_percent')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const baseCeiling = (reward?.silver as number | null) ?? 0
  if (baseCeiling <= 0) return { error: tErr('ceilingNotSetForRole') }
  const [guildBasePayoutRatePercent, guildVideoPayoutRatePercent, guildVideoClaimCeilingBonusSilver] =
    await Promise.all([
      loadPayoutRatePercent(guildId),
      loadVideoPayoutRatePercent(guildId),
      loadVideoClaimCeilingBonusSilver(guildId),
    ])
  const resolvedPolicy = resolveEventRegearPolicy({
    category: '전투',
    eventPolicy: 'role',
    eventSilverCap: null,
    eventMaxDeathsPerMember: 1,
    eventVideoPolicy: 'inherit',
    eventVideoPayoutRatePercent: null,
    eventVideoClaimCeilingBonusSilver: null,
    eventAutoPolicy: 'inherit',
    roleSilver: baseCeiling,
    rolePayoutRatePercent:
      typeof reward?.payout_rate_percent === 'number' ? reward.payout_rate_percent : null,
    guildBasePayoutRatePercent,
    guildVideoPayoutRatePercent,
    guildVideoClaimCeilingBonusSilver,
    globalMaxDeaths: 1,
    hasVideoProof: Boolean(videoProofUrl),
    flow: 'manual',
  })
  const ceiling = resolvedPolicy.silverCap
  if (claimedSilver > ceiling) {
    return { error: tErr('claimOverCeiling', { ceiling: ceiling.toLocaleString() }) }
  }

  // 3) 동일 killboard_event_id 로 이미 살아있는 regear_request 없는지 재검증
  //    (listMy- 에서 보여준 시점과 submit 사이 race 방지).
  const { data: dup } = await db
    .from('regear_requests')
    .select('id, status')
    .eq('guild_id', guildId)
    .eq('killboard_event_id', kbId)
    .neq('status', 'rejected')
    .limit(1)
  if (dup && dup.length > 0) {
    return { error: tErr('trackedDeathAlreadyClaimed') }
  }
  const videoProofTitle = await fetchYoutubeVideoProofTitle(videoProofUrl)

  // 4) 스크린샷이 있으면 storage 업로드 (DB insert 실패 시 롤백).
  let screenshotPath: string | null = null
  if (image?.ok) {
    screenshotPath = `${session.discordId}/adhoc-${kbId}-${Date.now()}.${image.ext}`
    const { error: uploadError } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .upload(screenshotPath, image.file, { contentType: image.mime, upsert: false })
    if (uploadError) {
      return { error: tErr('screenshotUploadFailed', { reason: uploadError.message }) }
    }
  }

  // 5) Insert. event_id/regear_window_id 모두 NULL, killboard_verified=true.
  const occurred = new Date(kb.occurred_at as string)
  const tTitle = await getTranslations('regearTrackedDeaths')
  const titleSnapshot = tTitle('snapshotTitle', { date: formatTrackedDate(occurred) })
  const buildSnapshot = equipmentToBuildSnapshot(
    kb.equipment as Record<string, EquipmentItem | null> | null,
    roleName,
  )

  const { data: inserted, error: insertError } = await db
    .from('regear_requests')
    .insert({
      guild_id: guildId,
      event_id: null,
      regear_window_id: null,
      event_title_snapshot: titleSnapshot,
      discord_id: session.discordId,
      username: session.username,
      role_name: roleName,
      base_silver: baseCeiling,
      silver: ceiling,
      claimed_silver: claimedSilver,
      video_proof_url: videoProofUrl,
      video_proof_title: videoProofTitle,
      screenshot_path: screenshotPath,
      screenshot_path_2: null,
      killboard_verified: true,
      killboard_event_id: kbId,
      admin_notes: null,
      build_snapshot: buildSnapshot,
      auto_generated: false,
      fulfillment_mode: fulfillmentMode,
      craft_requested_slots: craftRequestedSlots,
      requester_relation: requesterRelation,
      regear_policy_snapshot: resolvedPolicy.snapshot,
    })
    .select('id')
    .single()
  if (insertError) {
    if (screenshotPath) {
      await db.storage.from(SCREENSHOT_BUCKET).remove([screenshotPath])
    }
    return { error: insertError.message }
  }

  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId,
    topic: 'regear',
    sourceTable: 'regear_requests',
    sourceId: inserted.id as string,
    title: tAdminNotify('trackedRegearTitle'),
    body: tAdminNotify('trackedRegearBody', {
      user: session.username,
      silver: claimedSilver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals',
  })
  return { id: inserted.id as string }
}

// "MM/DD HH:mm" 형태. regearTrackedDeaths.snapshotTitle 의 {date} 인자로 들어가
// 신청자 locale 의 prefix 가 붙는다 (event_title_snapshot 으로 DB 에 저장 — 다른
// 멤버 view 에는 신청자 locale 의 문자열이 그대로 노출).
function formatTrackedDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}
