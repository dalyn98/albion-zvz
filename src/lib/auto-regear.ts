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
import {
  fetchAodpPrices,
  loadAodpOptions,
  type AodpFallbackTier,
  type AodpPriceKey,
} from '@/lib/shop/aodp'
import { worstWarningLevel } from '@/lib/regear-estimate'

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
  // killboard sync 가 battle 종료 시점을 따라잡지 못한 이벤트. 다음 cron 에
  // 재시도하도록 mark-processed 하지 않고 연기.
  events_deferred_sync_lag: number
  // 관리자가 retroactive 로 만든 이벤트 (created_at > battle_started_at).
  // 자동 처리 대신 park — admin 이 수동 검토했을 거라고 가정.
  events_skipped_retroactive: number
  errors: Array<{ event_id: string; step: string; message: string }>
  duration_ms: number
}

// Albion 킬보드 Equipment JSONB 는 이 키들 중 일부를 갖는다. 빈/null 값은 장비
// 없음(예: 물약을 안 먹고 죽음) 이므로 정상 케이스.
const EQUIPMENT_SLOTS = [
  'MainHand',
  'OffHand',
  'Head',
  'Armor',
  'Shoes',
  'Bag',
  'Cape',
  'Mount',
  'Potion',
  'Food',
] as const

interface EquipmentItem {
  Type?: string
  Count?: number
  Quality?: number
}

interface SlotRow {
  assigned_discord_id: string | null
  auto_regear_excluded: boolean
  role_name: string | null
}

interface EventRow {
  id: string
  title: string
  battle_started_at: string
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
}

// Type 문자열은 `T5_ARMOR_CLOTH_SET2@1` 같은 포맷. @N 접미는 있을 수도 없을 수도.
function parseItemType(type: string): { uniqueName: string; enchant: number } | null {
  const trimmed = type.trim()
  if (!trimmed) return null
  const at = trimmed.indexOf('@')
  if (at === -1) return { uniqueName: trimmed, enchant: 0 }
  const base = trimmed.slice(0, at)
  const suffix = trimmed.slice(at + 1)
  const enchant = Number(suffix)
  if (!Number.isFinite(enchant) || enchant < 0) return { uniqueName: base, enchant: 0 }
  return { uniqueName: base, enchant: Math.trunc(enchant) }
}

// 장비 JSONB 에서 AODP 조회에 필요한 키 목록을 뽑는다. 동일 item 이 여러 슬롯에
// 걸칠 수 있지만 AODP 는 키 기준으로 결과를 반환하므로 uniq 처리는 fetchAodpPrices
// 내부에 맡기고 여기선 슬롯 단위로 중복 포함.
function extractGearKeys(
  equipment: Record<string, EquipmentItem | null> | null,
): Array<{ slot: string; key: AodpPriceKey; count: number }> {
  if (!equipment) return []
  const out: Array<{ slot: string; key: AodpPriceKey; count: number }> = []
  for (const slot of EQUIPMENT_SLOTS) {
    const raw = equipment[slot]
    if (!raw || typeof raw !== 'object' || typeof raw.Type !== 'string') continue
    const parsed = parseItemType(raw.Type)
    if (!parsed) continue
    const count = Number.isFinite(raw.Count) && raw.Count! > 0 ? Math.trunc(raw.Count!) : 1
    const quality = Number.isFinite(raw.Quality) && raw.Quality! >= 1 ? Math.trunc(raw.Quality!) : 1
    out.push({
      slot,
      key: { uniqueName: parsed.uniqueName, enchant: parsed.enchant, quality },
      count,
    })
  }
  return out
}

export async function processAutoRegear(
  db: SupabaseClient,
  guildId: string,
): Promise<AutoRegearResult> {
  const startedAt = Date.now()
  const errors: AutoRegearResult['errors'] = []

  // 전역 스위치: OFF 면 바로 반환. cron 이 돌아도 side effect 없음.
  const { data: settingRow } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'auto_regear_enabled')
    .maybeSingle()
  if ((settingRow?.value ?? 'false') !== 'true') {
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      requests_skipped_manual_exists: 0,
      requests_skipped_no_role_cap: 0,
      events_deferred_sync_lag: 0,
      events_skipped_retroactive: 0,
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  // auto_regear_delay_minutes(기본 15) = 배틀 시작 후 몇 분 뒤에 자동 리기어가
  // 이벤트를 처리할지. regear_window_minutes(수동 신청 오픈 시각, 기본 60) 와
  // 분리돼 있어 자동이 수동보다 먼저 pending 행을 만들 수 있다.
  const { data: delayRow } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'auto_regear_delay_minutes')
    .maybeSingle()
  const parsedDelay = Number(delayRow?.value ?? '15')
  const autoDelayMinutes =
    Number.isFinite(parsedDelay) && parsedDelay >= 5 && parsedDelay <= 120
      ? Math.trunc(parsedDelay)
      : 15

  const { data: rateRow } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'regear_payout_rate_percent')
    .maybeSingle()
  const parsedRate = Number(rateRow?.value ?? '100')
  const payoutRatePercent =
    Number.isFinite(parsedRate) && parsedRate >= 1 && parsedRate <= 100 ? Math.trunc(parsedRate) : 100

  // battle_started_at + autoDelay 경과한 이벤트 중 아직 처리되지 않은 것.
  const cutoffIso = new Date(Date.now() - autoDelayMinutes * 60 * 1000).toISOString()
  const { data: events, error: eventsErr } = await db
    .from('events')
    .select('id, title, battle_started_at, created_at, auto_regear_processed_at')
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
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      requests_skipped_manual_exists: 0,
      requests_skipped_no_role_cap: 0,
      events_deferred_sync_lag: 0,
      events_skipped_retroactive: 0,
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
  let deferredSyncLag = 0
  let skippedRetroactive = 0
  let processed = 0

  for (const event of eventRows) {
    try {
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

      // killboard sync 지연 가드: 배틀 시작 + autoDelay 이후로 sync 가 한 번이라도
      // 돌았어야 victim 목록이 충분히 indexed 됐다고 간주. 못 돌았으면 다음 cron
      // 에서 재시도 (mark-processed 하지 않음).
      const autoCutoffMs = battleMs + autoDelayMinutes * 60 * 1000
      if (!Number.isFinite(lastKillboardSyncMs) || lastKillboardSyncMs < autoCutoffMs) {
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

      // battle_started_at 부터 현재까지 victim 이벤트를 조회. 배틀이 autoDelay
      // 를 초과해 이어질 수 있으므로 창 상한을 "지금" 까지 열어둔다 — 재실행
      // idempotent(RPC 의 killboard_event_id 단위 dedup) 로 중복 생성 방지.
      const { data: victims, error: victimsErr } = await db
        .from('killboard_events')
        .select('event_id, discord_id, player_name, occurred_at, equipment')
        .eq('guild_id', guildId)
        .eq('role', 'victim')
        .in('discord_id', Array.from(slotByDiscord.keys()))
        .gte('occurred_at', event.battle_started_at)
      if (victimsErr) throw new Error(`killboard: ${victimsErr.message}`)
      const victimRows = (victims ?? []) as KillboardVictimRow[]

      // 같은 discord_id + 창 안에 여러 사망이 있어도 전부 별개의 killboard_event.
      // RPC 가 (event_id, killboard_event_id) 단위로 idempotent 하므로 그냥 순회.
      for (const v of victimRows) {
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

        const gearEntries = extractGearKeys(v.equipment)
        const aodpKeys = gearEntries.map((g) => g.key)
        const priceMap =
          aodpKeys.length > 0 ? await fetchAodpPrices(aodpKeys, aodpOptions) : new Map()

        const lineItems: GearLineItem[] = []
        let marketSilver = 0
        for (const entry of gearEntries) {
          const lookupKey = `${entry.key.uniqueName}|${entry.key.enchant}|${entry.key.quality}`
          const hit = priceMap.get(lookupKey)
          const unit = hit?.price ?? null
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
            city: hit?.city ?? null,
            fallbackTier: hit?.fallbackTier ?? 'none',
          })
        }

        // 경고 단계 요약 — UI 에서 배지 색상 결정용 메타데이터로만 쓰인다.
        // 모든 자동 건은 status='pending' 으로 생성되므로 warning_level 은
        // status 결정에 영향을 주지 않는다.
        const warningLevel = worstWarningLevel(lineItems.map((i) => i.fallbackTier))

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
        }

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
        })
        if (rpcErr) {
          errors.push({ event_id: event.id, step: 'rpc', message: rpcErr.message })
        } else if (rpcData === null) {
          // RPC 가 NULL 반환 = 이미 수동 승인/대기 행 존재 또는 role cap 0/미등록.
          skippedManualExists += 1
        } else {
          requestsCreated += 1
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
    events_deferred_sync_lag: deferredSyncLag,
    events_skipped_retroactive: skippedRetroactive,
    errors,
    duration_ms: Date.now() - startedAt,
  }
}
