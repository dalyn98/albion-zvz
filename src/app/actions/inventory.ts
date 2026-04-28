'use server'

// Guild inventory server actions (Phase 1).
//
// Surface area: list snapshot + manual adjust(+/-) + manual set(absolute) for
// both refined materials and finished gear. All endpoints require admin and
// are tenant-scoped via getSessionGuildId.
//
// Phase 2 will introduce auto-update hooks (craft delivery, regear collection)
// — those will live alongside these manual actions, not replace them.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAdmin } from '@/lib/auth'
import {
  listInventoryMaterials,
  listInventoryGear,
  adjustInventoryMaterial,
  setInventoryMaterial,
  adjustInventoryGear,
  setInventoryGear,
  isInventoryMaterialType,
  isInventoryTier,
  isInventoryEnchantment,
  type InventoryMaterialRow,
  type InventoryGearRow,
  type InventoryMaterialType,
  type InventoryTier,
  type InventoryEnchantment,
} from '@/lib/inventory'

const REVALIDATE_PATH = '/admin/dashboard/inventory'

export interface InventorySnapshot {
  materials: InventoryMaterialRow[]
  gear: InventoryGearRow[]
}

export async function loadInventorySnapshot(): Promise<{
  data?: InventorySnapshot
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const [materials, gear] = await Promise.all([
      listInventoryMaterials(guildId),
      listInventoryGear(guildId),
    ])
    return { data: { materials, gear } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

interface MaterialPayload {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
}

function validateMaterialKey(
  raw: { materialType: unknown; tier: unknown; enchantment: unknown },
): MaterialPayload | null {
  if (!isInventoryMaterialType(raw.materialType)) return null
  if (!isInventoryTier(raw.tier)) return null
  if (!isInventoryEnchantment(raw.enchantment)) return null
  return {
    materialType: raw.materialType,
    tier: raw.tier,
    enchantment: raw.enchantment,
  }
}

export async function adjustMaterialAction(input: {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
  delta: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const key = validateMaterialKey(input)
    if (!key) return { error: tErr('inventoryInvalidMaterialKey') }
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      return { error: tErr('inventoryInvalidDelta') }
    }

    const qty = await adjustInventoryMaterial(guildId, key, input.delta, session.discordId)
    revalidatePath(REVALIDATE_PATH)
    return { quantity: qty }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function setMaterialAction(input: {
  materialType: InventoryMaterialType
  tier: InventoryTier
  enchantment: InventoryEnchantment
  quantity: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const key = validateMaterialKey(input)
    if (!key) return { error: tErr('inventoryInvalidMaterialKey') }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      return { error: tErr('inventoryInvalidQuantity') }
    }

    const qty = await setInventoryMaterial(guildId, key, input.quantity, session.discordId)
    revalidatePath(REVALIDATE_PATH)
    return { quantity: qty }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function adjustGearAction(input: {
  itemId: string
  delta: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    if (!input.itemId || input.itemId.trim().length === 0) {
      return { error: tErr('inventoryItemEmpty') }
    }
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      return { error: tErr('inventoryInvalidDelta') }
    }

    const qty = await adjustInventoryGear(guildId, input.itemId.trim(), input.delta, session.discordId)
    revalidatePath(REVALIDATE_PATH)
    return { quantity: qty }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function setGearAction(input: {
  itemId: string
  quantity: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    if (!input.itemId || input.itemId.trim().length === 0) {
      return { error: tErr('inventoryItemEmpty') }
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      return { error: tErr('inventoryInvalidQuantity') }
    }

    const qty = await setInventoryGear(guildId, input.itemId.trim(), input.quantity, session.discordId)
    revalidatePath(REVALIDATE_PATH)
    return { quantity: qty }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
