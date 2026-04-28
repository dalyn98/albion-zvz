// Guild equipment inventory data layer.
//
// 정련 재료 (materials) 트래킹은 인게임 자동 연동이 없어 ROI 가 마이너스라
// 폐기됐고 (마이그 112), 이 모듈은 완제품 장비 (guild_inventory_gear / 마이그
// 110) 만 다룬다. 모든 함수는 guildId 를 명시적으로 받아 cron / 서버 액션
// 어디서든 호출 가능.
//
// 흐름:
//   - 수동 +/- 또는 절대값 설정: AdminInventoryGearPanel → adjustGearAction /
//     setGearAction → adjustInventoryGear / setInventoryGear (RPC).
//   - 제작 deliver 시 자동 -1: deliverCraftQueueItem →
//     decrementBuildForDelivery. 재고가 0 인 itemId 가 있으면 inventory_warned
//     플래그용 정보를 반환하지만 실제 차감은 RPC floor=0 에 맡겨 0 에서 멈춘다.

import type { BuildSnapshot, SlotKey } from '@/types'
import { getAdminClient } from './supabase-admin'

export interface InventoryGearRow {
  itemId: string
  quantity: number
  updatedAt: string
  updatedByDiscordId: string | null
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

export async function listInventoryGear(
  guildId: string,
): Promise<InventoryGearRow[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_inventory_gear')
    .select('item_id, quantity, updated_at, updated_by_discord_id')
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    itemId: r.item_id as string,
    quantity: Number(r.quantity ?? 0),
    updatedAt: r.updated_at as string,
    updatedByDiscordId: (r.updated_by_discord_id as string | null) ?? null,
  }))
}

// ────────────────────────────────────────────────────────────
// Writes (RPC wrappers)
// ────────────────────────────────────────────────────────────

export async function adjustInventoryGear(
  guildId: string,
  itemId: string,
  delta: number,
  actorDiscordId: string,
): Promise<number> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('adjust_inventory_gear', {
    p_guild_id: guildId,
    p_item_id: itemId,
    p_delta: delta,
    p_actor_discord_id: actorDiscordId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function setInventoryGear(
  guildId: string,
  itemId: string,
  quantity: number,
  actorDiscordId: string,
): Promise<number> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('set_inventory_gear', {
    p_guild_id: guildId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_actor_discord_id: actorDiscordId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

// ────────────────────────────────────────────────────────────
// Gear slot categorization
// ────────────────────────────────────────────────────────────

export const GEAR_SLOTS = [
  'weapon',
  'head',
  'armor',
  'shoes',
  'offhand',
  'cape',
  'bag',
  'other',
] as const

export type GearSlot = (typeof GEAR_SLOTS)[number]

// 갑옷류 부위에서만 의미 있음. 무기·보조·망토·가방·기타는 null.
export type GearArmorMaterial = 'PLATE' | 'LEATHER' | 'CLOTH'

export interface GearCategorization {
  slot: GearSlot
  armorMaterial: GearArmorMaterial | null
  tier: number | null
}

const WEAPON_RE = /^T(\d+)_(?:2H|MAIN)_/
const OFFHAND_RE = /^T(\d+)_OFF_/
const ARMOR_PIECE_RE = /^T(\d+)_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)\b/
const CAPE_RE = /^T(\d+)_(?:CAPEITEM|CAPE)\b/
const BAG_RE = /^T(\d+)_BAG\b/

export function categorizeGearItem(itemId: string): GearCategorization {
  const id = itemId.split('@')[0]
  const armor = id.match(ARMOR_PIECE_RE)
  if (armor) {
    const slotMap: Record<string, GearSlot> = {
      HEAD: 'head',
      ARMOR: 'armor',
      SHOES: 'shoes',
    }
    return {
      slot: slotMap[armor[2]] ?? 'other',
      armorMaterial: armor[3] as GearArmorMaterial,
      tier: Number(armor[1]),
    }
  }
  const weapon = id.match(WEAPON_RE)
  if (weapon) {
    return { slot: 'weapon', armorMaterial: null, tier: Number(weapon[1]) }
  }
  const off = id.match(OFFHAND_RE)
  if (off) {
    return { slot: 'offhand', armorMaterial: null, tier: Number(off[1]) }
  }
  const cape = id.match(CAPE_RE)
  if (cape) {
    return { slot: 'cape', armorMaterial: null, tier: Number(cape[1]) }
  }
  const bag = id.match(BAG_RE)
  if (bag) {
    return { slot: 'bag', armorMaterial: null, tier: Number(bag[1]) }
  }
  // Fallback: pull tier if present, slot 'other'
  const tierMatch = id.match(/^T(\d+)_/)
  return {
    slot: 'other',
    armorMaterial: null,
    tier: tierMatch ? Number(tierMatch[1]) : null,
  }
}

// ────────────────────────────────────────────────────────────
// Build-snapshot → gear inventory hook
// ────────────────────────────────────────────────────────────

// 크래프트 deliver 자동 훅이 추적할 슬롯. potion/food/mount/bag 은 장비 재고가
// 아니다 (소모품 / 마운트 / 가방). 무기·머리·갑옷·신발·보조·망토 6개만 추적.
const INVENTORY_TRACKED_BUILD_SLOTS: readonly SlotKey[] = [
  'weapon', 'head', 'armor', 'shoes', 'offhand', 'cape',
] as const

/**
 * 빌드 스냅샷에서 장비로 인정되는 itemId 만 골라낸다. id 가 없거나(자유 슬롯)
 * 정련 재료/마운트 등 장비 패턴이 아닌 itemId 는 제외.
 */
export function extractGearItemIdsFromBuild(snapshot: BuildSnapshot): string[] {
  const out: string[] = []
  for (const slot of INVENTORY_TRACKED_BUILD_SLOTS) {
    const id = snapshot[slot]?.id?.trim()
    if (!id) continue
    if (categorizeGearItem(id).slot === 'other') continue
    out.push(id)
  }
  return out
}

export interface DeliveryDecrementResult {
  // 추적 대상 itemId 가 build_snapshot 에 하나도 없을 때 true. 호출자가
  // "이 deliver 는 재고에 영향을 주지 않는다" 를 빠르게 판별할 수 있게.
  empty: boolean
  // build_snapshot 의 itemId 중 사전 재고가 부족했던 (deliver 시 0 에서
  // 멈춘) 항목들. 비어 있지 않으면 craft_tasks.inventory_warned = true.
  warnedItemIds: string[]
}

/**
 * 제작 deliver 시 자동 재고 차감 + 경고 납품 감지.
 *
 * 1) build_snapshot 의 추적 슬롯 itemId 들을 모은다 (개수 = 1 슬롯당 1개).
 * 2) 한 번의 select 로 모든 itemId 의 현재 재고를 읽어 부족분을 식별.
 * 3) 부족 여부와 무관하게 모든 itemId 에 -1 RPC 호출. floor=0 RPC 라 0 에서
 *    멈추므로 음수가 되지 않는다.
 *
 * 베스트 에포트 — RPC 한 줄이 실패해도 다음 itemId 는 계속 시도하고, 호출자
 * 에게 throw 하지 않는다 (이미 deliver 트랜지션은 성공한 상태이므로 재고
 * 측 일시 실패가 도메인 상태를 깨선 안 됨).
 */
export async function decrementBuildForDelivery(
  guildId: string,
  snapshot: BuildSnapshot,
  actorDiscordId: string,
): Promise<DeliveryDecrementResult> {
  const itemIds = extractGearItemIdsFromBuild(snapshot)
  if (itemIds.length === 0) {
    return { empty: true, warnedItemIds: [] }
  }

  // 슬롯별로 1 개씩이라 보통 unique 지만, 만약 중복되면 합산 필요분으로 비교.
  const required = new Map<string, number>()
  for (const id of itemIds) {
    required.set(id, (required.get(id) ?? 0) + 1)
  }
  const uniqueIds = [...required.keys()]

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_inventory_gear')
    .select('item_id, quantity')
    .eq('guild_id', guildId)
    .in('item_id', uniqueIds)
  if (error) {
    // 사전 재고 조회 실패 → 경고 판정 불가. deliver 자체는 이미 성공한 상태
    // 이고 floor=0 RPC 에 맡겨도 0 에서 멈추므로 단순히 차감만 시도한다.
    console.error('[inventory hook] pre-check failed', {
      guildId,
      error: error.message,
    })
  }
  const stockMap = new Map<string, number>()
  for (const row of data ?? []) {
    stockMap.set(row.item_id as string, Number(row.quantity ?? 0))
  }

  const warnedItemIds: string[] = []
  for (const itemId of uniqueIds) {
    const req = required.get(itemId) ?? 0
    const have = stockMap.get(itemId) ?? 0
    if (have < req) warnedItemIds.push(itemId)
  }

  for (const itemId of itemIds) {
    try {
      await adjustInventoryGear(guildId, itemId, -1, actorDiscordId)
    } catch (e) {
      console.error('[inventory hook] adjustInventoryGear failed', {
        guildId,
        itemId,
        delta: -1,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { empty: false, warnedItemIds }
}

// ────────────────────────────────────────────────────────────
// Stock availability check
// ────────────────────────────────────────────────────────────

export interface StockAvailability {
  itemId: string
  required: number
  available: number
  sufficient: boolean
}

export interface StockCheckResult {
  perItem: StockAvailability[]
  allSufficient: boolean
  // 재고 출고 RPC 에 그대로 넘길 인자 — 부족 시에도 채워서 반환 (UI 가 미리보기용으로 쓸 수 있게).
  itemIdsForRpc: string[]
}

/**
 * build_snapshot 의 장비 itemId 들에 대해 길드 재고 충분 여부를 확인.
 * 동일 itemId 가 여러 슬롯에 (이론상) 등장하면 카운트를 합산해서 비교.
 */
export async function checkBuildSnapshotStock(
  guildId: string,
  snapshot: BuildSnapshot,
): Promise<StockCheckResult> {
  const itemIds = extractGearItemIdsFromBuild(snapshot)
  // itemId 별 필요 수량 집계 (현재 빌드 스냅샷 구조상 슬롯당 1개씩이라 보통 1)
  const required = new Map<string, number>()
  for (const id of itemIds) {
    required.set(id, (required.get(id) ?? 0) + 1)
  }
  const uniqueIds = [...required.keys()]
  if (uniqueIds.length === 0) {
    return { perItem: [], allSufficient: false, itemIdsForRpc: [] }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_inventory_gear')
    .select('item_id, quantity')
    .eq('guild_id', guildId)
    .in('item_id', uniqueIds)
  if (error) throw new Error(error.message)

  const stockMap = new Map<string, number>()
  for (const row of data ?? []) {
    stockMap.set(row.item_id as string, Number(row.quantity ?? 0))
  }

  const perItem: StockAvailability[] = uniqueIds.map((itemId) => {
    const req = required.get(itemId) ?? 0
    const have = stockMap.get(itemId) ?? 0
    return { itemId, required: req, available: have, sufficient: have >= req }
  })

  return {
    perItem,
    allSufficient: perItem.every((p) => p.sufficient),
    itemIdsForRpc: itemIds,
  }
}

/**
 * 여러 build_snapshot 의 재고 가용성을 한 번의 쿼리로 묶어서 확인.
 * 어드민 리기어 목록 페이지가 N+1 회피용으로 사용. 입력은
 * (regearId, snapshot) 쌍 — 동일 itemId 가 여러 regear 에 등장해도 길드
 * 재고 한 번 조회 후 로컬에서 매칭한다.
 */
export async function checkBuildSnapshotStockBatch(
  guildId: string,
  entries: ReadonlyArray<{ regearId: string; snapshot: BuildSnapshot }>,
): Promise<Record<string, StockCheckResult>> {
  if (entries.length === 0) return {}

  // 모든 itemId 수집
  const allItemIds = new Set<string>()
  const perRegear = new Map<string, string[]>()
  for (const { regearId, snapshot } of entries) {
    const ids = extractGearItemIdsFromBuild(snapshot)
    perRegear.set(regearId, ids)
    for (const id of ids) allItemIds.add(id)
  }
  if (allItemIds.size === 0) {
    return Object.fromEntries(
      entries.map(({ regearId }) => [
        regearId,
        { perItem: [], allSufficient: false, itemIdsForRpc: [] } satisfies StockCheckResult,
      ]),
    )
  }

  // 한 번에 조회
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_inventory_gear')
    .select('item_id, quantity')
    .eq('guild_id', guildId)
    .in('item_id', [...allItemIds])
  if (error) throw new Error(error.message)

  const stockMap = new Map<string, number>()
  for (const row of data ?? []) {
    stockMap.set(row.item_id as string, Number(row.quantity ?? 0))
  }

  const result: Record<string, StockCheckResult> = {}
  for (const { regearId } of entries) {
    const ids = perRegear.get(regearId) ?? []
    const required = new Map<string, number>()
    for (const id of ids) {
      required.set(id, (required.get(id) ?? 0) + 1)
    }
    const perItem: StockAvailability[] = [...required.keys()].map((itemId) => {
      const req = required.get(itemId) ?? 0
      const have = stockMap.get(itemId) ?? 0
      return { itemId, required: req, available: have, sufficient: have >= req }
    })
    result[regearId] = {
      perItem,
      allSufficient: perItem.length > 0 && perItem.every((p) => p.sufficient),
      itemIdsForRpc: ids,
    }
  }
  return result
}
