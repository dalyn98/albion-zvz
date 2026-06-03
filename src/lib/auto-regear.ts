// Phase 3 자동 리기어 핵심 로직. cron 이 이 함수를 호출해 종료된 이벤트
// 각각에 대해 killboard victim 기록 → AODP 시세 → regear_requests 를
// status='pending' 으로 자동 생성한다. 포인트 지급은 하지 않고, 관리자가
// /approvals 에서 승인해야 ledger 적립이 일어난다 (migration 067).
//
// 멱등성: events.auto_regear_processed_at 로 이벤트 단위 게이트, 그리고 RPC
// 내부에서 (event_id, killboard_event_id) unique 로 killboard 단위 게이트.
// cron 이 재실행되거나 중복 호출되어도 안전.
//
// 제외 규칙:
//   - 이벤트에 auto_regear_processed_at 이 이미 있음 → 스킵
//   - killboard victim 의 discord_id 가 파티 슬롯에 배정되지 않음 → 스킵
//   - 배정된 슬롯의 auto_regear_excluded=true → 스킵
//   - role_rewards.silver = 0 또는 미등록 → 스킵 ("이 역할은 리기어 차단")
//
// 시세 0 / equipment 비어 있음 / AODP 전부 null 인 케이스도 pending 행을
// 남긴다 — 청구자가 부위별 가격을 수정할 수 있고(Phase B-3), 관리자는 그대로
// 반려할 수도 있다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import {
  fetchAodpPrices,
  loadAodpOptions,
  type AodpConfidence,
  type AodpFallbackTier,
  type AodpPriceKey,
} from '@/lib/shop/aodp'
import { worstWarningLevel } from '@/lib/regear-estimate'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { isLikelyRoyalCluster } from '@/lib/albion-zone'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import type { BuildSnapshot, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'
import {
  equipmentToBuildSnapshot,
  extractGearKeys,
  type EquipmentItem,
} from '@/lib/auto-regear-equipment'
import {
  canUseGuildResourceFeatures,
  type AlbionIdentityRelation,
  type AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import { sendAdminNotification } from '@/lib/admin-notifications'

// 외부 모듈(regear-tracked-deaths 등) 이 기존 import 경로를 유지하도록 re-export.
export { equipmentToBuildSnapshot, type EquipmentItem } from '@/lib/auto-regear-equipment'

export interface AutoRegearResult {
  events_considered: number
  events_processed: number
  requests_created: number
  requests_skipped_excluded: number
  requests_skipped_no_slot: number
  // RPC 가 NULL 을 반환한 케이스 = 같은 이벤트에 수동 non-rejected 행이 이미
  // 존재. 중복 지급 방지 가드(migration 051)에 의해 건너뜀.
  requests_skipped_manual_exists: number
  // role_rewards.silver 가 0 또는 미등록인 역할 (= "리기어 차단" 의도).
  // 수동 flow 와 동일하게 자동도 지급 없이 스킵.
  requests_skipped_no_role_cap: number
  // account identity 기준 홈 길드 trusted 가 아닌 대상. 연합원 리기어는 수동 신청만
  // 허용하므로 자동 리기어에서는 건너뛴다.
  requests_skipped_not_home_guild: number
  // 매칭된 블랙존 전투의 ended_at + 30분 이 아직 안 지났거나, 그 시각 이후로
  // killboard/battle-tracker sync 가 한 번도 안 돈 이벤트. 다음 cron 에 재시도
  // 하도록 mark-processed 하지 않고 연기.
  events_deferred_sync_lag: number
  // 매칭이 0건인데 battle_started_at + 6시간 timeout 이 아직 지나지 않은 이벤트.
  // 진짜 비전투인지 단순 sync 지연인지 아직 분간 못 함. mark 하지 않고 연기.
  events_deferred_battle_tracker_lag: number
  // 관리자가 retroactive 로 만든 이벤트 (created_at > battle_started_at).
  // 자동 처리 대신 park — admin 이 수동 검토했을 거라고 가정.
  events_skipped_retroactive: number
  // tenant_battle_records 매칭이 0건이고 battle_started_at + 6시간 timeout 이
  // 지난 (= sync 지연이 아닌 진짜 0건으로 확정된) 이벤트. 8명 갱크 같이
  // low-engagement 컷에 걸린 전투, 또는 비전투 이벤트. mark-processed.
  events_skipped_no_tracked_battle: number
  // tracked battle 의 cluster_name 이 Royal Continent 로 분류된 이벤트 (도시/외곽
  // /Brecilien/Crystal League). AGENTS.md hard rule #5 의 "블랙존 한정" 가드.
  events_skipped_royal_zone: number
  // FF/갱킹 등 비전투 카테고리. 자동 리기어는 정식 전투 이벤트만 처리한다.
  events_skipped_non_combat: number
  // 진단 breakdown: events_considered=0 일 때 왜 0 인지 분리. 최근 7일 events
  // 기준으로 각 필터 통과/탈락을 카운팅한다. 운영 디버그 전용 — 로직에는 영향 X.
  diag?: {
    events_recent_total: number
    events_with_null_battle_started: number
    events_already_processed: number
    events_too_fresh: number
    // 이미 처리된 이벤트 상세 (timeline + 자동 청구 생성 수). 청구 0개 = mark-and-skip
    // 경로(royal/no-tracked-battle/no-slot/retroactive). N개 = 정상 처리.
    processed_detail: Array<{
      id: string
      title: string
      battle_started_at: string | null
      auto_regear_processed_at: string | null
      created_at: string
      auto_requests_count: number
    }>
    // battle_started_at NULL 이벤트 상세 (호스트가 전투 시작 안 누른/매칭 실패).
    null_battle_started_detail: Array<{
      id: string
      title: string
      created_at: string
    }>
  }
  errors: Array<{ event_id: string; step: string; message: string }>
  duration_ms: number
}

// 매칭된 battle_records.ended_at 이후 몇 분 뒤에 자동 리기어를 처리할지.
// killboard sync 가 종료 시점을 indexing 할 때까지의 buffer. 실측상 모든
// 사망 이벤트가 indexing 되는데 30분쯤 걸려서 그만큼 여유를 둔다 — 너무 짧게
// 잡으면 일부 victim 이 누락된 상태로 mark-processed 되어 자동 청구가 빠진다.
export const AUTO_REGEAR_ENDED_BUFFER_MS = 30 * 60 * 1000

// 매칭된 tracked battle 이 0건일 때 진짜 0건인지 sync 지연인지 분간하는 timeout.
// battle_started_at + 6시간이 지나도 매칭이 0이고 battle-tracker sync 도 그
// 시점 이후로 한 번이라도 돌았으면 "진짜 비전투/솔로 갱크" 로 확정 → mark-processed.
// 그 전엔 mark 하지 않고 다음 cron 으로 연기 (sync 가 따라잡을 시간 부여).
export const AUTO_REGEAR_MATCH_TIMEOUT_MS = 6 * 60 * 60 * 1000

// 매우 신선한 이벤트(5분 미만) 는 어차피 ended_at 게이트를 통과할 수 없으므로
// 쿼리 단계에서 미리 컷. 정확한 ready 판정은 per-event 게이트가 한다.
export const AUTO_REGEAR_PRE_PICK_MS = 5 * 60 * 1000

interface SlotRow {
  assigned_discord_id: string | null
  auto_regear_excluded: boolean
  role_name: string | null
}

interface EventRow {
  id: string
  title: string
  battle_started_at: string
  category: string | null
  created_at: string
  auto_regear_processed_at: string | null
}

interface KillboardVictimRow {
  event_id: number
  discord_id: string
  player_name: string
  occurred_at: string
  equipment: Record<string, EquipmentItem | null> | null
}

interface GearLineItem {
  slot: string
  uniqueName: string
  enchant: number
  quality: number
  count: number
  price: number | null
  city: string | null
  fallbackTier: AodpFallbackTier
  // AODP 결과의 신뢰도. 'low' 면 청구자가 직접 입력하라고 UI 에 배지를 띄운다.
  // 길드 설정 auto_regear_skip_low_confidence='true' 면 'low' 슬롯은 price=null 로
  // 강제 — marketSilver 합산에서 제외되고 청구자 편집 대상이 된다.
  confidence: AodpConfidence
}

// JSON 배열 문자열 → SlotKey 집합. 잘못된 형식이면 빈 집합(=전부 포함)으로 graceful
// fallback. settings.ts 의 검증으로 정상 케이스에선 SlotKey 외 값이 안 들어오지만,
// 직접 SQL 로 손상된 데이터가 들어와도 자동 리기어가 멈추진 않게 한다.
function parseExcludedSlots(raw: string): ReadonlySet<SlotKey> {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const out = new Set<SlotKey>()
    for (const v of parsed) {
      if (typeof v === 'string' && (SLOT_KEYS as readonly string[]).includes(v)) {
        out.add(v as SlotKey)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

export async function processAutoRegear(
  db: SupabaseClient,
  guildId: string,
): Promise<AutoRegearResult> {
  const startedAt = Date.now()
  const errors: AutoRegearResult['errors'] = []

  // 7개 app_settings 를 1번의 round-trip 으로 읽는다.
  const SETTING_KEYS = [
    'auto_regear_enabled',
    'albion_home_guild_id',
    'albion_server',
    'regear_payout_rate_percent',
    'craft_regear_enabled',
    'auto_regear_excluded_slots',
    'auto_regear_skip_low_confidence',
  ] as const
  const { data: settingRows } = await db
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', SETTING_KEYS as unknown as string[])
  const settings = new Map<string, string>(
    (settingRows ?? []).map((r) => [r.key as string, r.value as string]),
  )

  // 전역 스위치: OFF 면 바로 반환. cron 이 돌아도 side effect 없음.
  if ((settings.get('auto_regear_enabled') ?? 'false') !== 'true') {
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      requests_skipped_manual_exists: 0,
      requests_skipped_no_role_cap: 0,
      requests_skipped_not_home_guild: 0,
      events_deferred_sync_lag: 0,
      events_deferred_battle_tracker_lag: 0,
      events_skipped_retroactive: 0,
      events_skipped_no_tracked_battle: 0,
      events_skipped_royal_zone: 0,
      events_skipped_non_combat: 0,
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  // home_guild 미설정이면 battle-tracker cron 이 이 테넌트를 아예 건너뛰므로
  // last_battle_tracker_sync_at 가 영원히 NULL → 아래 deferral 가드가 모든
  // 이벤트를 무한 연기한다. albion_server 도 마찬가지로 미설정이면 loadAodpOptions 가
  // throw 하므로 손익 없는 self-serve 함정. 여기서 단락한다.
  if (!settings.get('albion_home_guild_id') || !isAlbionServer(settings.get('albion_server'))) {
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      requests_skipped_manual_exists: 0,
      requests_skipped_no_role_cap: 0,
      requests_skipped_not_home_guild: 0,
      events_deferred_sync_lag: 0,
      events_deferred_battle_tracker_lag: 0,
      events_skipped_retroactive: 0,
      events_skipped_no_tracked_battle: 0,
      events_skipped_royal_zone: 0,
      events_skipped_non_combat: 0,
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  const parsedRate = Number(settings.get('regear_payout_rate_percent') ?? '100')
  const payoutRatePercent =
    Number.isFinite(parsedRate) && parsedRate >= 1 && parsedRate <= 100 ? Math.trunc(parsedRate) : 100

  // 길드 단위 리기어 모드. craft_regear_enabled='true' 면 자동 생성도 'crafted'
  // 모드로 들어가고 victim 의 killboard equipment 에서 build_snapshot 을 추출해
  // 박는다. 'false' 면 silver 모드(기존 동작).
  const craftMode = (settings.get('craft_regear_enabled') ?? 'false') === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftMode ? 'crafted' : 'silver'

  // 자동 리기어 제외 슬롯. 잘못된 JSON 은 무시(전부 포함 = 안전한 fallback).
  // 기본값은 음식·망토·탈것·포션 — 길드 표준 운영상 리기어 비대상 슬롯.
  const excludedSnapshotSlots = parseExcludedSlots(
    settings.get('auto_regear_excluded_slots') ?? '["food","cape","mount","potion"]',
  )

  // AODP 신뢰도가 'low' (redzone/bluezone 폴백, 또는 history 표본<=1) 인 슬롯을
  // marketSilver 합산에서 제외할지 여부. true 면 청구자가 직접 입력하도록 price=null
  // 로 떨어뜨린다 (gear_breakdown.items 에는 그대로 남아 UI 배지로 노출).
  const skipLowConfidence =
    (settings.get('auto_regear_skip_low_confidence') ?? 'false') === 'true'

  // 매우 신선한 이벤트(5분 미만) 는 미리 컷. 정확한 ready 판정은 per-event 의
  // ended_at + buffer + sync 게이트가 한다 (autoDelayMinutes 노브는 폐기됨).
  const cutoffIso = new Date(Date.now() - AUTO_REGEAR_PRE_PICK_MS).toISOString()
  const { data: events, error: eventsErr } = await db
    .from('events')
    .select('id, title, battle_started_at, category, created_at, auto_regear_processed_at')
    .eq('guild_id', guildId)
    .not('battle_started_at', 'is', null)
    .is('auto_regear_processed_at', null)
    .lte('battle_started_at', cutoffIso)
    .order('battle_started_at', { ascending: true })
    .limit(10)
  if (eventsErr) {
    throw new Error(`events query failed: ${eventsErr.message}`)
  }
  const eventRows = (events ?? []) as EventRow[]

  if (eventRows.length === 0) {
    // events_considered=0 일 때 왜 0 인지 분리. 최근 7일 events 를 각 필터별로
    // 분류 (mutually exclusive 가 아니라 누적 카운트). 운영자가 "자동 리기어가
    // 안 떠요" 신고 시 카운터 한 줄로 원인 좁힌다.
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentEvents } = await db
      .from('events')
      .select('id, title, battle_started_at, category, auto_regear_processed_at, created_at')
      .eq('guild_id', guildId)
      .gte('created_at', sevenDaysAgoIso)
      .order('created_at', { ascending: false })
    const recentRows = (recentEvents ?? []) as Array<{
      id: string
      title: string
      battle_started_at: string | null
      auto_regear_processed_at: string | null
      created_at: string
    }>
    const cutoffMs = Date.now() - AUTO_REGEAR_PRE_PICK_MS
    let nullBattleStarted = 0
    let alreadyProcessed = 0
    let tooFresh = 0
    const processedRows: typeof recentRows = []
    const nullStartedRows: typeof recentRows = []
    for (const r of recentRows) {
      if (!r.battle_started_at) {
        nullBattleStarted += 1
        nullStartedRows.push(r)
      }
      if (r.auto_regear_processed_at !== null) {
        alreadyProcessed += 1
        processedRows.push(r)
      }
      if (r.battle_started_at) {
        const ms = Date.parse(r.battle_started_at)
        if (Number.isFinite(ms) && ms > cutoffMs) tooFresh += 1
      }
    }
    // 처리된 이벤트들의 자동 청구 수 한 번에 조회. 청구 0 = mark-and-skip 경로.
    const requestCountById = new Map<string, number>()
    if (processedRows.length > 0) {
      const { data: autoReqs } = await db
        .from('regear_requests')
        .select('event_id')
        .eq('guild_id', guildId)
        .eq('auto_generated', true)
        .in(
          'event_id',
          processedRows.map((r) => r.id),
        )
      for (const row of (autoReqs ?? []) as Array<{ event_id: string }>) {
        requestCountById.set(row.event_id, (requestCountById.get(row.event_id) ?? 0) + 1)
      }
    }
    const processedDetail = processedRows.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title.slice(0, 40),
      battle_started_at: r.battle_started_at,
      auto_regear_processed_at: r.auto_regear_processed_at,
      created_at: r.created_at,
      auto_requests_count: requestCountById.get(r.id) ?? 0,
    }))
    const nullStartedDetail = nullStartedRows.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title.slice(0, 40),
      created_at: r.created_at,
    }))
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      requests_skipped_manual_exists: 0,
      requests_skipped_no_role_cap: 0,
      requests_skipped_not_home_guild: 0,
      events_deferred_sync_lag: 0,
      events_deferred_battle_tracker_lag: 0,
      events_skipped_retroactive: 0,
      events_skipped_no_tracked_battle: 0,
      events_skipped_royal_zone: 0,
      events_skipped_non_combat: 0,
      diag: {
        events_recent_total: recentRows.length,
        events_with_null_battle_started: nullBattleStarted,
        events_already_processed: alreadyProcessed,
        events_too_fresh: tooFresh,
        processed_detail: processedDetail,
        null_battle_started_detail: nullStartedDetail,
      },
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  const aodpOptions = await loadAodpOptions(guildId)

  // killboard sync 지연 체크용 전역 타임스탬프. sync 가 battle 종료 시점 이후로
  // 돌지 않았다면 victim 목록이 불완전할 수 있어 해당 이벤트는 다음 cron 으로 연기.
  const { data: syncRow } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'last_killboard_sync_at')
    .maybeSingle()
  const lastKillboardSyncMs = syncRow?.value ? Date.parse(syncRow.value) : NaN

  // battle-tracker sync 지연 체크. tracked battle 매칭(stage 1) 의 입력인
  // tenant_battle_records 가 battle 종료 후 한 번이라도 sync 됐는지 확인.
  // 안 됐으면 stage 1 이 항상 0건이라 mark-processed 위험 → 연기.
  const { data: btSyncRow } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'last_battle_tracker_sync_at')
    .maybeSingle()
  const lastBattleTrackerSyncMs = btSyncRow?.value ? Date.parse(btSyncRow.value) : NaN

  // 역할별 상한을 한 번에 로드. 수동 flow 와 동일한 cap 을 자동에도 적용.
  // 0 또는 미등록 = "리기어 차단" 의도이므로 해당 역할 victim 은 스킵.
  const { data: rewardRows, error: rewardsErr } = await db
    .from('role_rewards')
    .select('role_name, silver')
    .eq('guild_id', guildId)
  if (rewardsErr) {
    throw new Error(`role_rewards query failed: ${rewardsErr.message}`)
  }
  const roleCapByName = new Map<string, number>()
  for (const r of (rewardRows ?? []) as Array<{ role_name: string; silver: number }>) {
    roleCapByName.set(r.role_name, Number.isFinite(r.silver) ? r.silver : 0)
  }

  let requestsCreated = 0
  let skippedExcluded = 0
  let skippedNoSlot = 0
  let skippedManualExists = 0
  let skippedNoRoleCap = 0
  let skippedNotHomeGuild = 0
  let deferredSyncLag = 0
  let deferredBattleTrackerLag = 0
  let skippedRetroactive = 0
  let skippedNoTrackedBattle = 0
  let skippedRoyalZone = 0
  let skippedNonCombat = 0
  let processed = 0
  const tAdminNotify = await getTranslations({ locale: 'ko', namespace: 'adminNotificationMessages' })

  for (const event of eventRows) {
    try {
      let eventRequestsCreated = 0
      if (event.category !== '전투') {
        const nowIso = new Date().toISOString()
        await db
          .from('events')
          .update({ auto_regear_processed_at: nowIso })
          .eq('id', event.id)
          .eq('guild_id', guildId)
        skippedNonCombat += 1
        processed += 1
        continue
      }

      // retroactive 가드: 관리자가 battle 이후 이벤트를 만든 케이스.
      // 수동으로 이미 보상이 처리됐을 가능성이 높으므로 park 처리하고 skip.
      // 정상 flow(이벤트 생성 → 배틀) 는 created_at <= battle_started_at.
      const createdMs = Date.parse(event.created_at)
      const battleMs = Date.parse(event.battle_started_at)
      if (Number.isFinite(createdMs) && Number.isFinite(battleMs) && createdMs > battleMs) {
        const nowIso = new Date().toISOString()
        await db
          .from('events')
          .update({ auto_regear_processed_at: nowIso })
          .eq('id', event.id)
          .eq('guild_id', guildId)
        skippedRetroactive += 1
        processed += 1
        continue
      }

      // tracked battle 매칭. event 시간창 (battle_started_at ± tolerance) 안에
      // 들어오는 tenant_battle_records 의 albion_battle_id 집합. low-engagement
      // 컷 적용. 비싼 부분(슬롯/victim 조회) 은 ended_at 게이트 통과 후로 미룬다.
      const trackedBattles = await findTrackedBattleIdsForEvent(
        db,
        guildId,
        event.battle_started_at,
      )

      // 매칭 0건 처리: 진짜 비전투/솔로 갱크 vs 단순 sync 지연 분간.
      // - battle_started_at + 6시간 이 지났고
      // - battle-tracker sync 도 그 이후로 한 번이라도 돌았다면
      // → 진짜 0건 (mark-processed). 그 외에는 sync 가 따라잡을 시간을 부여하기
      //   위해 mark 하지 않고 다음 cron 으로 연기.
      if (trackedBattles.length === 0) {
        const matchTimeoutMs = battleMs + AUTO_REGEAR_MATCH_TIMEOUT_MS
        const nowMs = Date.now()
        const trackerCaughtUp =
          Number.isFinite(lastBattleTrackerSyncMs) && lastBattleTrackerSyncMs > matchTimeoutMs
        if (nowMs > matchTimeoutMs && trackerCaughtUp) {
          const nowIso = new Date().toISOString()
          await db
            .from('events')
            .update({ auto_regear_processed_at: nowIso })
            .eq('id', event.id)
            .eq('guild_id', guildId)
          skippedNoTrackedBattle += 1
          processed += 1
        } else {
          deferredBattleTrackerLag += 1
        }
        continue
      }

      // 블랙존 한정 가드 (AGENTS.md hard rule #5). 매칭된 모든 tracked battle 의
      // cluster_name 이 Royal Continent 식별자 (도시/외곽/Brecilien/Crystal League)
      // 면 자동 청구 0건 + 처리 완료 마킹. 부분적으로만 Royal 인 케이스(드물지만
      // event 창 안에 두 다른 zone 의 후속 전투가 섞인 경우) 는 Royal 매칭만 빼고
      // 나머지로 진행한다.
      const blackzoneBattles = trackedBattles.filter(
        (b) => !isLikelyRoyalCluster(b.clusterName),
      )
      if (blackzoneBattles.length === 0) {
        const nowIso = new Date().toISOString()
        await db
          .from('events')
          .update({ auto_regear_processed_at: nowIso })
          .eq('id', event.id)
          .eq('guild_id', guildId)
        skippedRoyalZone += 1
        processed += 1
        continue
      }
      const trackedBattleIds = blackzoneBattles.map((b) => b.albionBattleId)

      // ended_at + buffer + sync 게이트:
      //   - 매칭된 블랙존 전투 중 가장 늦게 끝난 시각 + 30분 이 지났고
      //   - 그 시각 이후로 killboard sync 와 battle-tracker sync 가 한 번이라도 돌았어야
      //   victim 목록과 매칭이 완전하다고 간주. 못 됐으면 mark 하지 않고 다음 cron 으로
      //   연기 — 호스트가 set 한 battle_started_at 의 부정확성과 무관하게 작동한다.
      const latestEndedMs = blackzoneBattles.reduce((acc, b) => {
        const ms = Date.parse(b.endedAtIso)
        return Number.isFinite(ms) && ms > acc ? ms : acc
      }, 0)
      const readyAtMs = latestEndedMs + AUTO_REGEAR_ENDED_BUFFER_MS
      const killboardCaughtUp =
        Number.isFinite(lastKillboardSyncMs) && lastKillboardSyncMs >= readyAtMs
      const trackerCaughtUpForReady =
        Number.isFinite(lastBattleTrackerSyncMs) && lastBattleTrackerSyncMs >= readyAtMs
      if (Date.now() < readyAtMs || !killboardCaughtUp || !trackerCaughtUpForReady) {
        deferredSyncLag += 1
        continue
      }

      // 파티/슬롯 조회. 배정된 discord_id 만 뽑아 빠르게 룩업.
      const { data: parties, error: partiesErr } = await db
        .from('parties')
        .select('id, slots:slots(assigned_discord_id, auto_regear_excluded, role_name)')
        .eq('guild_id', guildId)
        .eq('event_id', event.id)
      if (partiesErr) throw new Error(`parties: ${partiesErr.message}`)

      const slotByDiscord = new Map<string, SlotRow>()
      for (const p of parties ?? []) {
        const slots = (p.slots ?? []) as SlotRow[]
        for (const s of slots) {
          if (!s.assigned_discord_id) continue
          // 같은 멤버가 두 슬롯에 배정되는 일은 없다는 전제(= slots UNIQUE
          // constraint). 방어적으로 첫 매치만 보존.
          if (!slotByDiscord.has(s.assigned_discord_id)) {
            slotByDiscord.set(s.assigned_discord_id, s)
          }
        }
      }

      if (slotByDiscord.size === 0) {
        // 이벤트에 아무도 배정되지 않았다 — 자동 리기어 대상이 없으니 처리됨으로 마킹.
        const nowIso = new Date().toISOString()
        await db
          .from('events')
          .update({ auto_regear_processed_at: nowIso })
          .eq('id', event.id)
          .eq('guild_id', guildId)
        processed += 1
        continue
      }

      // 매칭된 albion_battle_id 의 victim 만 조회. 솔로 갱크/딴 전투 사망은
      // battle_id 가 다르므로 자동 제외. legacy NULL battle_id (마이그 096 이전
      // sync) 행도 .in('battle_id', ...) 매칭 실패로 자동 제외 — 안전 우선.
      const { data: victims, error: victimsErr } = await db
        .from('killboard_events')
        .select('event_id, discord_id, player_name, occurred_at, equipment')
        .eq('guild_id', guildId)
        .eq('role', 'victim')
        .in('discord_id', Array.from(slotByDiscord.keys()))
        .in('battle_id', trackedBattleIds)
      if (victimsErr) throw new Error(`killboard: ${victimsErr.message}`)
      const victimRows = (victims ?? []) as KillboardVictimRow[]

      const requesterGateByDiscord = new Map<
        string,
        { relation: AlbionIdentityRelation; trustStatus: AlbionIdentityTrustStatus }
      >()
      const victimDiscordIds = Array.from(new Set(victimRows.map((v) => v.discord_id)))
      if (victimDiscordIds.length > 0) {
        const { data: accountRows, error: accountErr } = await db
          .from('account_albion_tenant_links')
          .select('discord_id, relation, trust_status')
          .eq('guild_id', guildId)
          .in('discord_id', victimDiscordIds)
        if (accountErr && accountErr.code !== '42P01' && accountErr.code !== 'PGRST205') {
          throw new Error(`account-albion: ${accountErr.message}`)
        }
        for (const row of (accountRows ?? []) as Array<{
          discord_id: string
          relation: AlbionIdentityRelation
          trust_status: AlbionIdentityTrustStatus
        }>) {
          requesterGateByDiscord.set(row.discord_id, {
            relation: row.relation,
            trustStatus: row.trust_status,
          })
        }
      }

      // 같은 discord_id + 창 안에 여러 사망이 있어도 전부 별개의 killboard_event.
      // RPC 가 (event_id, killboard_event_id) 단위로 idempotent 하므로 그냥 순회.
      //
      // 1단계: 자격 필터링 + 모든 victim 의 gear key 합집합을 만들어 AODP 한 번 호출.
      // (이전에는 victim 별 호출 → zerg 패배 시 N×fallback chain 으로 cron 타임아웃 위험)
      type EligibleVictim = {
        victim: KillboardVictimRow
        slot: SlotRow
        roleCap: number
        gearEntries: ReturnType<typeof extractGearKeys>
      }
      const eligible: EligibleVictim[] = []
      const allKeys: AodpPriceKey[] = []
      const seenKeys = new Set<string>()
      for (const v of victimRows) {
        const requesterGate = requesterGateByDiscord.get(v.discord_id)
        if (
          requesterGate &&
          !canUseGuildResourceFeatures({
            relation: requesterGate.relation,
            trustStatus: requesterGate.trustStatus,
          })
        ) {
          skippedNotHomeGuild += 1
          continue
        }
        const slot = slotByDiscord.get(v.discord_id)
        if (!slot) {
          skippedNoSlot += 1
          continue
        }
        if (slot.auto_regear_excluded) {
          skippedExcluded += 1
          continue
        }
        // 역할 상한 적용. 수동 flow 와 동일 semantic — role_rewards.silver 가
        // 0 또는 미등록이면 "이 역할은 리기어 차단" 의미로 스킵.
        const roleCap = slot.role_name ? roleCapByName.get(slot.role_name) : undefined
        if (!roleCap || roleCap <= 0) {
          skippedNoRoleCap += 1
          continue
        }
        const gearEntries = extractGearKeys(v.equipment, excludedSnapshotSlots)
        // 슬롯 필터 후 남는 장비가 없으면 노이즈 신청(claimed=0/payout=0) 방지를
        // 위해 victim 스킵. 빈 장비(equipment 자체 없음) 케이스도 동일 경로.
        if (gearEntries.length === 0) {
          skippedNoSlot += 1
          continue
        }
        for (const entry of gearEntries) {
          const dedupe = `${entry.key.uniqueName}|${entry.key.enchant}|${entry.key.quality}`
          if (seenKeys.has(dedupe)) continue
          seenKeys.add(dedupe)
          allKeys.push(entry.key)
        }
        eligible.push({ victim: v, slot, roleCap, gearEntries })
      }

      // 2단계: 한 번의 AODP fetch 로 모든 victim 가격 해결. fetchAodpPrices 가
      // 내부에서 100건 단위 청킹 + fallback chain 을 처리하므로 호출자는 단일
      // await 만 신경쓰면 된다.
      const priceMap =
        allKeys.length > 0 ? await fetchAodpPrices(allKeys, aodpOptions) : new Map()

      // 3단계: victim 별 line item 조립 + RPC 호출.
      for (const { victim: v, slot, roleCap, gearEntries } of eligible) {
        const lineItems: GearLineItem[] = []
        let marketSilver = 0
        for (const entry of gearEntries) {
          const lookupKey = `${entry.key.uniqueName}|${entry.key.enchant}|${entry.key.quality}`
          const hit = priceMap.get(lookupKey)
          const confidence = hit?.confidence ?? 'none'
          // skipLowConfidence 가 true 면 confidence='low' 슬롯은 price 자체를 null
          // 로 떨어뜨려 marketSilver 합산에서 제외. 청구자가 편집기에서 직접 입력해야
          // 지급 대상이 된다 (claimed/payout 재계산은 update action 이 담당).
          const dropForLowConfidence = skipLowConfidence && confidence === 'low'
          const unit = dropForLowConfidence ? null : hit?.price ?? null
          if (unit && unit > 0) {
            marketSilver += unit * entry.count
          }
          lineItems.push({
            slot: entry.slot,
            uniqueName: entry.key.uniqueName,
            enchant: entry.key.enchant,
            quality: entry.key.quality,
            count: entry.count,
            price: unit,
            city: dropForLowConfidence ? null : hit?.city ?? null,
            fallbackTier: hit?.fallbackTier ?? 'none',
            confidence,
          })
        }

        // 경고 단계 요약 — UI 에서 배지 색상 결정용 메타데이터로만 쓰인다.
        // 모든 자동 건은 status='pending' 으로 생성되므로 warning_level 은
        // status 결정에 영향을 주지 않는다.
        const warningLevel = worstWarningLevel(lineItems.map((i) => i.fallbackTier))

        // 청구자가 즉시 편집해야 할 슬롯 목록. UI 가 강조 배지를 그릴 때 사용한다.
        // skipLowConfidence 와 무관하게 confidence='low' 슬롯을 모두 기록한다 —
        // 토글이 OFF 라도 청구자에게 "신뢰도 낮음" 시그널은 노출하는 게 안전.
        const lowConfidenceSlots = lineItems
          .filter((i) => i.confidence === 'low')
          .map((i) => i.slot)

        // 수동 flow 와 schema 대칭: silver = 역할상한, claimed = min(시장가, 상한),
        // payout = floor(claimed * rate%). gear_breakdown 에는 원본 시장가 유지(감사용).
        const claimedSilver = Math.min(marketSilver, roleCap)
        const payoutSilver = Math.floor((claimedSilver * payoutRatePercent) / 100)
        const breakdown = {
          mode: aodpOptions.mode,
          server: aodpOptions.server,
          cities: aodpOptions.cities,
          min_quality: aodpOptions.minQuality,
          payout_rate_percent: payoutRatePercent,
          role_cap: roleCap,
          market_silver: marketSilver,
          items: lineItems,
          warning_level: warningLevel,
          low_confidence_slots: lowConfidenceSlots,
          skip_low_confidence: skipLowConfidence,
        }

        // crafted 모드에서만 build_snapshot 을 만들어 넘긴다 — silver 모드에선
        // 어차피 사용되지 않고 NULL 이 의미상 더 명확.
        const buildSnapshot: BuildSnapshot | null = craftMode
          ? equipmentToBuildSnapshot(v.equipment, slot.role_name)
          : null

        const { data: rpcData, error: rpcErr } = await db.rpc('create_auto_regear_request', {
          p_guild_id: guildId,
          p_event_id: event.id,
          p_event_title: event.title,
          p_discord_id: v.discord_id,
          p_username: v.player_name,
          p_role_name: slot.role_name,
          p_silver: roleCap,
          p_claimed_silver: claimedSilver,
          p_payout_silver: payoutSilver,
          p_killboard_event_id: v.event_id,
          p_gear_breakdown: breakdown,
          p_price_warning_level: warningLevel,
          p_fulfillment_mode: fulfillmentMode,
          p_build_snapshot: buildSnapshot,
        })
        if (rpcErr) {
          errors.push({ event_id: event.id, step: 'rpc', message: rpcErr.message })
        } else if (rpcData === null) {
          // RPC 가 NULL 반환 = 이미 수동 승인/대기 행 존재 또는 role cap 0/미등록.
          skippedManualExists += 1
        } else {
          requestsCreated += 1
          eventRequestsCreated += 1
        }
      }

      const nowIso = new Date().toISOString()
      const { error: markErr } = await db
        .from('events')
        .update({ auto_regear_processed_at: nowIso })
        .eq('id', event.id)
        .eq('guild_id', guildId)
      if (markErr) {
        errors.push({ event_id: event.id, step: 'mark-processed', message: markErr.message })
      } else {
        processed += 1
      }
      if (eventRequestsCreated > 0) {
        void sendAdminNotification({
          guildId,
          topic: 'regear',
          sourceTable: 'events',
          sourceId: `${event.id}:auto-regear`,
          title: tAdminNotify('autoRegearTitle'),
          body: tAdminNotify('autoRegearBody', {
            event: event.title,
            count: eventRequestsCreated.toLocaleString('en-US'),
          }),
          url: '/admin/dashboard/approvals',
        })
      }
    } catch (e) {
      errors.push({
        event_id: event.id,
        step: 'process',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    events_considered: eventRows.length,
    events_processed: processed,
    requests_created: requestsCreated,
    requests_skipped_excluded: skippedExcluded,
    requests_skipped_no_slot: skippedNoSlot,
    requests_skipped_manual_exists: skippedManualExists,
    requests_skipped_no_role_cap: skippedNoRoleCap,
    requests_skipped_not_home_guild: skippedNotHomeGuild,
    events_deferred_sync_lag: deferredSyncLag,
    events_deferred_battle_tracker_lag: deferredBattleTrackerLag,
    events_skipped_retroactive: skippedRetroactive,
    events_skipped_no_tracked_battle: skippedNoTrackedBattle,
    events_skipped_royal_zone: skippedRoyalZone,
    events_skipped_non_combat: skippedNonCombat,
    errors,
    duration_ms: Date.now() - startedAt,
  }
}
