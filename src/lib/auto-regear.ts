// Phase 3 자동 리기어 핵심 로직. cron 이 이 함수를 호출해 종료된 이벤트
// 각각에 대해 killboard victim 기록 → AODP 시세 → regear_requests 자동 생성.
//
// 멱등성: events.auto_regear_processed_at 로 이벤트 단위 게이트, 그리고 RPC
// 내부에서 (event_id, killboard_event_id) unique 로 killboard 단위 게이트.
// cron 이 재실행되거나 중복 호출되어도 안전.
//
// 제외 규칙:
//   - 이벤트에 auto_regear_processed_at 이 이미 있음 → 스킵
//   - killboard victim 의 discord_id 가 파티 슬롯에 배정되지 않음 → 스킵
//   - 배정된 슬롯의 auto_regear_excluded=true → 스킵
//
// 시세 0 / equipment 비어 있음 / AODP 전부 null 인 케이스도 RPC 는 호출한다
// (0 payout 행을 남겨 '처리됨' 을 기록). 이력 추적이 더 중요해서 선택한 절충.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAodpPrices, loadAodpOptions, type AodpPriceKey } from '@/lib/shop/aodp'

export interface AutoRegearResult {
  events_considered: number
  events_processed: number
  requests_created: number
  requests_skipped_excluded: number
  requests_skipped_no_slot: number
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

export async function processAutoRegear(db: SupabaseClient): Promise<AutoRegearResult> {
  const startedAt = Date.now()
  const errors: AutoRegearResult['errors'] = []

  // 전역 스위치: OFF 면 바로 반환. cron 이 돌아도 side effect 없음.
  const { data: settingRow } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'auto_regear_enabled')
    .maybeSingle()
  if ((settingRow?.value ?? 'false') !== 'true') {
    return {
      events_considered: 0,
      events_processed: 0,
      requests_created: 0,
      requests_skipped_excluded: 0,
      requests_skipped_no_slot: 0,
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  const { data: windowRow } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'regear_window_minutes')
    .maybeSingle()
  const regearWindowMinutes = Number(windowRow?.value ?? '60') || 60

  const { data: rateRow } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'regear_payout_rate_percent')
    .maybeSingle()
  const parsedRate = Number(rateRow?.value ?? '100')
  const payoutRatePercent =
    Number.isFinite(parsedRate) && parsedRate >= 1 && parsedRate <= 100 ? Math.trunc(parsedRate) : 100

  // 이벤트 종료(= battle_started_at + window 경과) 이고 아직 처리되지 않은 건만.
  const cutoffIso = new Date(Date.now() - regearWindowMinutes * 60 * 1000).toISOString()
  const { data: events, error: eventsErr } = await db
    .from('events')
    .select('id, title, battle_started_at, auto_regear_processed_at')
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
      errors,
      duration_ms: Date.now() - startedAt,
    }
  }

  const aodpOptions = await loadAodpOptions()

  let requestsCreated = 0
  let skippedExcluded = 0
  let skippedNoSlot = 0
  let processed = 0

  for (const event of eventRows) {
    try {
      // 파티/슬롯 조회. 배정된 discord_id 만 뽑아 빠르게 룩업.
      const { data: parties, error: partiesErr } = await db
        .from('parties')
        .select('id, slots:slots(assigned_discord_id, auto_regear_excluded, role_name)')
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
        await db.from('events').update({ auto_regear_processed_at: nowIso }).eq('id', event.id)
        processed += 1
        continue
      }

      // battle 창 안에서 victim 이벤트만 조회. occurred_at 이 일반적으로
      // battle_started_at ± window 범위에 들어온다.
      const battleStartMs = Date.parse(event.battle_started_at)
      const battleEndIso = new Date(battleStartMs + regearWindowMinutes * 60 * 1000).toISOString()
      const { data: victims, error: victimsErr } = await db
        .from('killboard_events')
        .select('event_id, discord_id, player_name, occurred_at, equipment')
        .eq('role', 'victim')
        .in('discord_id', Array.from(slotByDiscord.keys()))
        .gte('occurred_at', event.battle_started_at)
        .lte('occurred_at', battleEndIso)
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

        const gearEntries = extractGearKeys(v.equipment)
        const aodpKeys = gearEntries.map((g) => g.key)
        const priceMap =
          aodpKeys.length > 0 ? await fetchAodpPrices(aodpKeys, aodpOptions) : new Map()

        const lineItems: GearLineItem[] = []
        let totalSilver = 0
        for (const entry of gearEntries) {
          const lookupKey = `${entry.key.uniqueName}|${entry.key.enchant}|${entry.key.quality}`
          const hit = priceMap.get(lookupKey)
          const unit = hit?.price ?? null
          if (unit && unit > 0) {
            totalSilver += unit * entry.count
          }
          lineItems.push({
            slot: entry.slot,
            uniqueName: entry.key.uniqueName,
            enchant: entry.key.enchant,
            quality: entry.key.quality,
            count: entry.count,
            price: unit,
            city: hit?.city ?? null,
          })
        }

        const payoutSilver = Math.floor((totalSilver * payoutRatePercent) / 100)
        const breakdown = {
          mode: aodpOptions.mode,
          server: aodpOptions.server,
          cities: aodpOptions.cities,
          min_quality: aodpOptions.minQuality,
          payout_rate_percent: payoutRatePercent,
          items: lineItems,
        }

        const { error: rpcErr } = await db.rpc('create_auto_regear_request', {
          p_event_id: event.id,
          p_event_title: event.title,
          p_discord_id: v.discord_id,
          p_username: v.player_name,
          p_role_name: slot.role_name,
          p_silver: totalSilver,
          p_claimed_silver: totalSilver,
          p_payout_silver: payoutSilver,
          p_killboard_event_id: v.event_id,
          p_gear_breakdown: breakdown,
        })
        if (rpcErr) {
          errors.push({ event_id: event.id, step: 'rpc', message: rpcErr.message })
        } else {
          requestsCreated += 1
        }
      }

      const nowIso = new Date().toISOString()
      const { error: markErr } = await db
        .from('events')
        .update({ auto_regear_processed_at: nowIso })
        .eq('id', event.id)
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
    errors,
    duration_ms: Date.now() - startedAt,
  }
}
