// Guild inventory data layer (Phase 1).
//
// Reads/writes the two inventory tables introduced in migration 110. All
// functions take an explicit guildId so they're safe to call from any tenant
// context (cron, server action, etc.).
//
// Phase 1 surface: list + adjust(+/-) + set(absolute). Phase 2 will add
// auto-update hooks driven by craft delivery / regear collection.

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
