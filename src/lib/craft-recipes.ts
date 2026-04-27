// Recipe lookup + material cost calculator for crafting-based regear.
// Recipes are bundled at build time (scripts/build-recipes.mjs writes
// src/data/albion-recipes.json) — at runtime we just index into the dict.

import recipesData from '@/data/albion-recipes.json'
import {
  fetchAodpPrices,
  loadAodpOptions,
  type AodpPriceKey,
} from '@/lib/shop/aodp'
import {
  clampReturnRate,
  effectiveReturnRate,
  DEFAULT_FOCUS_BONUS_PCT,
} from '@/lib/albion-return-rates'
import type { BuildSnapshot, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'

interface RawMaterial {
  id: string
  count: number
}

interface RawRecipe {
  silver: number
  focus: number
  materials: RawMaterial[]
  isArtifact: boolean
}

const RECIPES = recipesData as unknown as Record<string, RawRecipe>

export interface RecipeMaterial {
  uniqueName: string
  count: number
  // AODP unit price (per single material) — null if AODP has no quote.
  unitSilver: number | null
  // count × unitSilver. 0 when unitSilver is null.
  lineSilver: number
}

export interface RecipeCost {
  // Item ID looked up (full id including @ enchant suffix).
  itemId: string
  // True if any material id contains "ARTEFACT" — caller should fall back
  // to silver mode automatically since the guild can't craft this in standard
  // crafting stations (artifact stations are limited).
  isArtifact: boolean
  materials: RecipeMaterial[]
  // Σ(lineSilver). Pre-return-rate.
  grossSilver: number
  // grossSilver × (1 − effectiveReturnRate / 100), floored.
  netSilver: number
  // The rate actually used (after clamping).
  effectiveReturnPct: number
  // True if any material had no AODP quote — caller should warn the crafter
  // before they commit to the cost.
  hasMissingPrice: boolean
}

export function lookupRecipe(itemId: string): RawRecipe | null {
  return RECIPES[itemId] ?? null
}

export function isItemCraftable(itemId: string): boolean {
  const r = RECIPES[itemId]
  return r != null && !r.isArtifact
}

export interface ComputeRecipeCostOptions {
  itemId: string
  guildId: string
  locationReturnPct: number
  focusUsed: boolean
  focusBonusPct?: number
}

// Resolve a recipe + AODP material prices into a single net silver cost.
// Caller passes guildId so the AODP request honors the tenant's configured
// cities/mode/min-quality (matches existing regear-estimate semantics).
export async function computeRecipeCost(
  opts: ComputeRecipeCostOptions,
): Promise<RecipeCost | null> {
  const recipe = lookupRecipe(opts.itemId)
  if (!recipe) return null

  // Materials are typically refined (e.g. T4_METALBAR), and AODP quotes
  // them as enchant=0/quality=1. Materials with `_LEVEL{n}` suffix carry
  // their enchant in the id itself — AODP keys those with enchant=0 too,
  // since the suffix encodes the variant.
  const aodpOptions = await loadAodpOptions(opts.guildId)
  const keys: AodpPriceKey[] = recipe.materials.map((m) => ({
    uniqueName: m.id,
    enchant: 0,
    quality: 1,
  }))
  const priceMap = keys.length > 0 ? await fetchAodpPrices(keys, aodpOptions) : new Map()

  const materials: RecipeMaterial[] = []
  let grossSilver = 0
  let hasMissingPrice = false
  for (const m of recipe.materials) {
    const lookupKey = `${m.id}|0|1`
    const hit = priceMap.get(lookupKey)
    const unit = hit?.price ?? null
    if (unit == null) hasMissingPrice = true
    const line = unit ? unit * m.count : 0
    grossSilver += line
    materials.push({
      uniqueName: m.id,
      count: m.count,
      unitSilver: unit,
      lineSilver: line,
    })
  }

  const focusBonus = opts.focusBonusPct ?? DEFAULT_FOCUS_BONUS_PCT
  const rate = effectiveReturnRate(
    clampReturnRate(opts.locationReturnPct),
    opts.focusUsed,
    focusBonus,
  )
  const netSilver = Math.floor(grossSilver * (1 - rate / 100))

  return {
    itemId: opts.itemId,
    isArtifact: recipe.isArtifact,
    materials,
    grossSilver,
    netSilver,
    effectiveReturnPct: rate,
    hasMissingPrice,
  }
}

export interface BuildCostSlot {
  slot: SlotKey
  itemId: string | null
  itemName: string | null
  // null = no recipe in our bundled set (food/potion/mount, free-text slots,
  // or items we deliberately skipped). Caller renders these as "skip" rows.
  recipeStatus: 'craftable' | 'artifact' | 'no_recipe' | 'empty'
  grossSilver: number
  netSilver: number
  hasMissingPrice: boolean
}

export interface BuildCostBreakdown {
  effectiveReturnPct: number
  totalGrossSilver: number
  totalNetSilver: number
  slots: BuildCostSlot[]
  // Aggregated flags so the UI can show one-line warnings without rescanning.
  hasArtifact: boolean
  hasMissingPrice: boolean
  hasUnknownItem: boolean
}

export interface ComputeBuildCostOptions {
  buildSnapshot: BuildSnapshot
  guildId: string
  locationReturnPct: number
  focusUsed: boolean
  focusBonusPct?: number
}

// Batched version of computeRecipeCost. Iterates the build snapshot once to
// collect every material key, fetches AODP in a single call, then assembles
// the per-slot rows. Skips slots with no recipe (food / potion / mount /
// free-text) — the caller can decide whether to warn on artifacts or not.
export async function computeBuildCraftCost(
  opts: ComputeBuildCostOptions,
): Promise<BuildCostBreakdown> {
  const { buildSnapshot, guildId, locationReturnPct, focusUsed } = opts
  const focusBonus = opts.focusBonusPct ?? DEFAULT_FOCUS_BONUS_PCT
  const rate = effectiveReturnRate(
    clampReturnRate(locationReturnPct),
    focusUsed,
    focusBonus,
  )

  interface PreparedSlot {
    slot: SlotKey
    itemId: string | null
    itemName: string | null
    recipe: RawRecipe | null
    status: BuildCostSlot['recipeStatus']
  }

  const prepared: PreparedSlot[] = SLOT_KEYS.map((slot) => {
    const item = buildSnapshot[slot]
    const itemId = item?.id ?? null
    const itemName = item?.name ?? null
    if (!itemId) {
      return { slot, itemId: null, itemName, recipe: null, status: 'empty' }
    }
    const recipe = lookupRecipe(itemId)
    if (!recipe) {
      return { slot, itemId, itemName, recipe: null, status: 'no_recipe' }
    }
    if (recipe.isArtifact) {
      return { slot, itemId, itemName, recipe, status: 'artifact' }
    }
    return { slot, itemId, itemName, recipe, status: 'craftable' }
  })

  const keysWithDup: AodpPriceKey[] = []
  for (const p of prepared) {
    if (!p.recipe) continue
    for (const m of p.recipe.materials) {
      keysWithDup.push({ uniqueName: m.id, enchant: 0, quality: 1 })
    }
  }
  // De-dupe — multiple slots often share the same material (e.g. T7 cloth bar).
  const seen = new Set<string>()
  const uniqueKeys: AodpPriceKey[] = []
  for (const k of keysWithDup) {
    const lk = `${k.uniqueName}|${k.enchant}|${k.quality}`
    if (!seen.has(lk)) {
      seen.add(lk)
      uniqueKeys.push(k)
    }
  }
  const aodpOptions = await loadAodpOptions(guildId)
  const priceMap =
    uniqueKeys.length > 0 ? await fetchAodpPrices(uniqueKeys, aodpOptions) : new Map()

  let totalGross = 0
  let totalNet = 0
  let hasArtifact = false
  let hasMissingPrice = false
  let hasUnknownItem = false

  const slots: BuildCostSlot[] = prepared.map((p) => {
    if (p.status === 'no_recipe' && p.itemId) hasUnknownItem = true
    if (p.status === 'artifact') hasArtifact = true
    if (!p.recipe || p.status !== 'craftable') {
      return {
        slot: p.slot,
        itemId: p.itemId,
        itemName: p.itemName,
        recipeStatus: p.status,
        grossSilver: 0,
        netSilver: 0,
        hasMissingPrice: false,
      }
    }
    let gross = 0
    let missing = false
    for (const m of p.recipe.materials) {
      const lk = `${m.id}|0|1`
      const hit = priceMap.get(lk)
      const unit = hit?.price ?? null
      if (unit == null) {
        missing = true
      } else {
        gross += unit * m.count
      }
    }
    if (missing) hasMissingPrice = true
    const net = Math.floor(gross * (1 - rate / 100))
    totalGross += gross
    totalNet += net
    return {
      slot: p.slot,
      itemId: p.itemId,
      itemName: p.itemName,
      recipeStatus: p.status,
      grossSilver: gross,
      netSilver: net,
      hasMissingPrice: missing,
    }
  })

  return {
    effectiveReturnPct: rate,
    totalGrossSilver: totalGross,
    totalNetSilver: totalNet,
    slots,
    hasArtifact,
    hasMissingPrice,
    hasUnknownItem,
  }
}
