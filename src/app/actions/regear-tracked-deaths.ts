'use server'

// 이벤트 외 트래킹 사망 직접 신청 (예외 흐름).
//
// 길드 정모(이벤트) 가 만들어지지 않은 일반 트래킹 전투에서 죽은 길드원이 직접
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
import { fetchTrackedBattleWindows } from '@/lib/tracked-kills'
import { equipmentToBuildSnapshot, type EquipmentItem } from '@/lib/auto-regear'
import type { BuildSnapshot } from '@/types'

// 적격 사망 조회 윈도: 14일. 너무 길면 UI 가 시끄러워지고, 너무 짧으면 점심에
// 한 번 죽고 며칠 잊어버리는 케이스를 못 잡는다.
const ELIGIBILITY_DAYS = 14

export interface TrackedDeath {
  killboardEventId: number
  battleId: number | null
  occurredAt: string
  opponentName: string | null
  opponentGuild: string | null
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
  const db = getAdminClient()

  const sinceMs = Date.now() - ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000
  const sinceIso = new Date(sinceMs).toISOString()

  const tracked = await fetchTrackedBattleWindows(db, guildId, sinceIso)
  if (tracked.byBattleId.size === 0) return { deaths: [] }

  const trackedBattleIds = Array.from(tracked.byBattleId.keys())

  const { data: rows, error } = await db
    .from('killboard_events')
    .select(
      'event_id, battle_id, occurred_at, opponent_name, opponent_guild, fame, item_power, equipment',
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
      fame: r.fame ?? 0,
      itemPower: r.item_power,
      buildSnapshot: equipmentToBuildSnapshot(r.equipment, null),
    })
  }
  return { deaths }
}

export interface SubmitTrackedAdHocInput {
  killboardEventId: number
  roleName: string
  claimedSilver: number
}

// 이벤트 외 트래킹 사망 직접 신청.
// 동일 killboard_event_id 의 non-rejected regear_request 가 이미 있으면 거부.
// role_rewards.silver=0 또는 미등록 역할이면 거부 (다른 신청 흐름과 동일 게이트).
export async function submitTrackedAdHocRegear(
  input: SubmitTrackedAdHocInput,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }

  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const kbId = Math.trunc(input.killboardEventId)
  if (!Number.isFinite(kbId) || kbId <= 0) return { error: tErr('invalidInput') }

  const roleName = input.roleName.trim()
  if (!roleName) return { error: tErr('invalidInput') }

  const claimedSilver = Math.trunc(input.claimedSilver)
  if (!Number.isFinite(claimedSilver) || claimedSilver <= 0) {
    return { error: tErr('invalidClaimAmount') }
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

  const sinceIso = new Date(
    Date.now() - ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const tracked = await fetchTrackedBattleWindows(db, guildId, sinceIso)
  if (!tracked.byBattleId.has(battleId)) {
    return { error: tErr('trackedDeathNotEligible') }
  }

  // 2) 역할 천장 검증.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const ceiling = (reward?.silver as number | null) ?? 0
  if (ceiling <= 0) return { error: tErr('ceilingNotSetForRole') }
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

  // 4) Insert. event_id/regear_window_id 모두 NULL, killboard_verified=true.
  const occurred = new Date(kb.occurred_at as string)
  const titleSnapshot = formatTrackedTitle(occurred)
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
      silver: ceiling,
      claimed_silver: claimedSilver,
      screenshot_path: null,
      screenshot_path_2: null,
      killboard_verified: true,
      killboard_event_id: kbId,
      admin_notes: null,
      build_snapshot: buildSnapshot,
      auto_generated: false,
      fulfillment_mode: 'silver',
    })
    .select('id')
    .single()
  if (insertError) return { error: insertError.message }

  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  return { id: inserted.id as string }
}

// "트래킹 전투 사망 — MM/DD HH:mm" 형태. UI 의 event_title_snapshot 자리에
// 들어가 admin/member 모두 한눈에 자유 신청 출처임을 알 수 있게 한다.
function formatTrackedTitle(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `[트래킹 전투] ${m}/${day} ${hh}:${mm}`
}
