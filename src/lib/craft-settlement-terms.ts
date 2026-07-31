import { normalizeBreakdownItems } from '@/lib/regear-helpers'
import type { CraftMaterialSource, CraftFeeMode } from '@/lib/craft-tasks'
import type { CraftRegearSlot } from '@/lib/regear-craft-slots'

const POSTGRES_INT_MAX = 2_147_483_647

export interface CraftSettlementTerms {
  quotedMaterialValueSilver: number
  materialReimbursementSilver: number
  craftFeeSilver: number
  settlementTotalSilver: number
}

export function quoteCraftMaterialValue(
  rawBreakdown: unknown,
  includedSlots: readonly CraftRegearSlot[],
): number {
  if (!rawBreakdown || typeof rawBreakdown !== 'object' || Array.isArray(rawBreakdown)) {
    return 0
  }
  const included = new Set<string>(includedSlots)
  const items = normalizeBreakdownItems(
    (rawBreakdown as { items?: unknown }).items,
  )
  let total = 0
  for (const item of items) {
    if (!included.has(item.slot) || item.price == null) continue
    total += item.price * item.count
    if (total >= POSTGRES_INT_MAX) return POSTGRES_INT_MAX
  }
  return Math.max(0, Math.trunc(total))
}

export function calculateCraftSettlementTerms(input: {
  quotedMaterialValueSilver: number
  materialSource: CraftMaterialSource
  craftFeeMode: CraftFeeMode
  craftFeePct: number
}): CraftSettlementTerms {
  const quoted = Number.isInteger(input.quotedMaterialValueSilver)
    ? Math.max(0, Math.min(POSTGRES_INT_MAX, input.quotedMaterialValueSilver))
    : 0
  const feePct = Number.isInteger(input.craftFeePct)
    ? Math.max(0, Math.min(200, input.craftFeePct))
    : 0
  const material = input.materialSource === 'crafter_purchase' ? quoted : 0
  const fee = input.craftFeeMode === 'configured'
    ? Math.floor((quoted * feePct) / 100)
    : 0
  const total = Math.min(POSTGRES_INT_MAX, material + fee)
  return {
    quotedMaterialValueSilver: quoted,
    materialReimbursementSilver: material,
    craftFeeSilver: Math.max(0, total - material),
    settlementTotalSilver: total,
  }
}
