// Guild inventory data layer.
//
// Reads/writes the two inventory tables introduced in migration 110. All
// functions take an explicit guildId so they're safe to call from any tenant
// context (cron, server action, etc.).
//
// Phase 1 surface: list + adjust(+/-) + set(absolute) + categorization.
// Phase 2 surface: applyBuildSnapshotToInventory — best-effort hook fed from
// craft delivery (+1) and craft pickup (-1). RPC floor=0, so re-firing a
// pickup hook on stock=0 is a no-op, not an error.

import type { BuildSnapshot, SlotKey } from '@/types'
import { getAdminClient } from './supabase-admin'

export const INVENTORY_MATERIAL_TYPES = [
  'METALBAR',
  'PLANKS',
  'LEATHER',
  'CLOTH',
  'STONEBLOCK',
] as const

export type InventoryMaterialType = (typeof INVENTORY_MATERIAL_TYPES)[number]

// ZvZ 범위에서 의미 있는 티어. T1-T3 은 채취 단계라 길드 재고로 잡지 않는다.
export const INVENTORY_TIERS = [4, 5, 6, 7, 8] as const
export type InventoryTier = (typeof INVENTORY_TIERS)[number]

// 정련 재료의 인챈트는 0..3 까지가 일반적. 추가 변종이 등장해도 4 까지 허용.
export const INVENTORY_ENCHANTMENTS = [0, 1, 2, 3, 4] as const
export type InventoryEnchantment = (typeof INVENTORY_ENCHANTMENTS)[number]

export interface InventoryMaterialRow {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
  quantity: number
  updatedAt: string
  updatedByDiscordId: string | null
}

export interface InventoryGearRow {
  itemId: string
  quantity: number
  updatedAt: string
  updatedByDiscordId: string | null
}

export function isInventoryMaterialType(v: unknown): v is InventoryMaterialType {
  return typeof v === 'string' && (INVENTORY_MATERIAL_TYPES as readonly string[]).includes(v)
}

export function isInventoryTier(v: unknown): v is InventoryTier {
  return typeof v === 'number' && (INVENTORY_TIERS as readonly number[]).includes(v)
}

export function isInventoryEnchantment(v: unknown): v is InventoryEnchantment {
  return typeof v === 'number' && (INVENTORY_ENCHANTMENTS as readonly number[]).includes(v)
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

export async function listInventoryMaterials(
  guildId: string,
): Promise<InventoryMaterialRow[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_inventory_materials')
    .select('material_type, tier, enchantment, quantity, updated_at, updated_by_discord_id')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((r) => isInventoryMaterialType(r.material_type)
      && isInventoryTier(r.tier)
      && isInventoryEnchantment(r.enchantment))
    .map((r) => ({
      materialType: r.material_type as InventoryMaterialType,
      tier: r.tier as InventoryTier,
      enchantment: r.enchantment as InventoryEnchantment,
      quantity: Number(r.quantity ?? 0),
      updatedAt: r.updated_at as string,
      updatedByDiscordId: (r.updated_by_discord_id as string | null) ?? null,
    }))
}

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

export interface MaterialKey {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
}

export async function adjustInventoryMaterial(
  guildId: string,
  key: MaterialKey,
  delta: number,
  actorDiscordId: string,
): Promise<number> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('adjust_inventory_material', {
    p_guild_id: guildId,
    p_material_type: key.materialType,
    p_tier: key.tier,
    p_enchantment: key.enchantment,
    p_delta: delta,
    p_actor_discord_id: actorDiscordId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function setInventoryMaterial(
  guildId: string,
  key: MaterialKey,
  quantity: number,
  actorDiscordId: string,
): Promise<number> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('set_inventory_material', {
    p_guild_id: guildId,
    p_material_type: key.materialType,
    p_tier: key.tier,
    p_enchantment: key.enchantment,
    p_quantity: quantity,
    p_actor_discord_id: actorDiscordId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

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
// Material id parsing
// ────────────────────────────────────────────────────────────

// craft-aggregation 이 산출하는 재료 itemId 를 inventory 키 (type, tier, enchant)
// 로 파싱. T8_PLANKS / T7_METALBAR@2 / T6_LEATHER@1 같은 정련 재료만 매칭.
// T?_ARTEFACT_* 같은 비정련 재료는 inventory 추적 대상이 아니므로 null.
const MATERIAL_ID_RE =
  /^T(\d+)_(METALBAR|PLANKS|LEATHER|CLOTH|STONEBLOCK)(?:@(\d+))?$/

export function parseMaterialId(id: string): MaterialKey | null {
  const m = MATERIAL_ID_RE.exec(id)
  if (!m) return null
  const tier = Number(m[1])
  const enchantment = m[3] ? Number(m[3]) : 0
  if (!isInventoryTier(tier)) return null
  if (!isInventoryEnchantment(enchantment)) return null
  return {
    materialType: m[2] as InventoryMaterialType,
    tier,
    enchantment,
  }
}

// 동일 (type, tier, enchant) 조합을 빠르게 lookup 하기 위한 키 문자열.
export function materialKeyString(key: MaterialKey): string {
  return `${key.materialType}_T${key.tier}_E${key.enchantment}`
}

// inventory 행 리스트 → quantity lookup 맵.
export function buildMaterialInventoryMap(
  rows: readonly InventoryMaterialRow[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    out.set(materialKeyString(r), r.quantity)
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Gear slot / material categorization
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

// 크래프트 납품/픽업 자동 훅이 추적할 슬롯. potion/food/mount 는 장비 재고가 아니다.
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

/**
 * 베스트 에포트 훅. 스냅샷 안의 장비 itemId 들에 대해 +1 또는 -1 을 적용.
 * 한 슬롯 갱신이 실패해도 다음 슬롯은 계속 시도하고, 호출자에게 throw 하지 않는다.
 * (이미 craft 트랜지션은 성공한 상태라 재고 측 실패가 도메인 상태를 깰 수 없도록.)
 */
export async function applyBuildSnapshotToInventory(
  guildId: string,
  snapshot: BuildSnapshot,
  deltaSign: 1 | -1,
  actorDiscordId: string,
): Promise<void> {
  const itemIds = extractGearItemIdsFromBuild(snapshot)
  for (const itemId of itemIds) {
    try {
      await adjustInventoryGear(guildId, itemId, deltaSign, actorDiscordId)
    } catch (e) {
      // 베스트 에포트: 한 줄 로그만 남기고 다음으로. 실패가 craft 흐름을 막지 않는다.
      console.error('[inventory hook] adjustInventoryGear failed', {
        guildId,
        itemId,
        delta: deltaSign,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

// ────────────────────────────────────────────────────────────
// Stock availability check (Phase 3)
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
