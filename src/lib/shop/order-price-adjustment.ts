export interface ShopOrderPriceAdjustment {
  requestedTotalPoints: number
  approvedTotalPoints: number
  adjustedAt: string
  adminDiscordId: string | null
}

export interface ShopOrderPriceAdjustmentAuditRow {
  target_id: string | null
  admin_discord_id: string | null
  details: unknown
  created_at: string
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}

export function parseShopOrderPriceAdjustment(
  row: ShopOrderPriceAdjustmentAuditRow,
): ShopOrderPriceAdjustment | null {
  if (!row.details || typeof row.details !== 'object') return null
  const details = row.details as Record<string, unknown>
  const requestedTotalPoints = positiveInteger(details.requestedTotalPoints)
  const approvedTotalPoints = positiveInteger(details.approvedTotalPoints)
  if (requestedTotalPoints === null || approvedTotalPoints === null) return null
  if (requestedTotalPoints === approvedTotalPoints) return null

  return {
    requestedTotalPoints,
    approvedTotalPoints,
    adjustedAt: row.created_at,
    adminDiscordId: row.admin_discord_id,
  }
}

export function buildShopOrderPriceAdjustmentMap(
  rows: readonly ShopOrderPriceAdjustmentAuditRow[],
): Map<string, ShopOrderPriceAdjustment> {
  const byOrder = new Map<string, ShopOrderPriceAdjustment>()
  for (const row of rows) {
    if (!row.target_id || byOrder.has(row.target_id)) continue
    const adjustment = parseShopOrderPriceAdjustment(row)
    if (adjustment) byOrder.set(row.target_id, adjustment)
  }
  return byOrder
}
