import {
  EQUIPMENT_SLOTS,
  parseItemType,
  type EquipmentItem,
} from '@/lib/auto-regear-equipment'
import {
  fetchAodpPrices,
  inventoryKey,
  loadAodpOptions,
  type AodpConfidence,
  type AodpFallbackTier,
  type AodpPriceKey,
} from '@/lib/shop/aodp'
import type { AlbionKillbotEvent } from '@/lib/killbot'

export type KillbotVictimValueSource = 'gear' | 'inventory'

export interface KillbotVictimValueLineItem {
  source: KillbotVictimValueSource
  slot: string
  uniqueName: string
  enchant: number
  quality: number
  count: number
  unitSilver: number | null
  totalSilver: number
  fallbackTier: AodpFallbackTier
  confidence: AodpConfidence
}

export interface KillbotVictimValueEstimate {
  totalSilver: number
  gearSilver: number
  inventorySilver: number
  totalItems: number
  pricedItems: number
  missingItems: number
  isPartial: boolean
  lineItems?: readonly KillbotVictimValueLineItem[]
}

interface VictimValueEntry {
  source: KillbotVictimValueSource
  slot: string
  key: AodpPriceKey
  count: number
}

const EMPTY_VALUE_ESTIMATE: KillbotVictimValueEstimate = {
  totalSilver: 0,
  gearSilver: 0,
  inventorySilver: 0,
  totalItems: 0,
  pricedItems: 0,
  missingItems: 0,
  isPartial: false,
  lineItems: [],
}

function positiveInteger(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.trunc(n)
}

function valueEntry(
  source: KillbotVictimValueSource,
  slot: string,
  item: EquipmentItem | null | undefined,
): VictimValueEntry | null {
  const type = typeof item?.Type === 'string' ? item.Type.trim() : ''
  if (!type) return null
  const parsed = parseItemType(type)
  if (!parsed) return null
  return {
    source,
    slot,
    key: {
      uniqueName: parsed.uniqueName,
      enchant: parsed.enchant,
      quality: positiveInteger(item?.Quality, 1),
    },
    count: positiveInteger(item?.Count, 1),
  }
}

function extractVictimValueEntries(event: AlbionKillbotEvent): VictimValueEntry[] {
  const equipment = event.Victim?.Equipment
  const gearEntries = equipment
    ? EQUIPMENT_SLOTS.map((slot) => valueEntry('gear', slot, equipment[slot])).filter(
        (entry): entry is VictimValueEntry => entry !== null,
      )
    : []

  const inventory = Array.isArray(event.Victim?.Inventory) ? event.Victim.Inventory : []
  const inventoryEntries = inventory
    .map((item, index) => valueEntry('inventory', `Inventory ${index + 1}`, item))
    .filter((entry): entry is VictimValueEntry => entry !== null)

  return [...gearEntries, ...inventoryEntries]
}

export async function estimateKillbotVictimValue(
  event: AlbionKillbotEvent,
  guildId: string,
): Promise<KillbotVictimValueEstimate> {
  const entries = extractVictimValueEntries(event)
  if (entries.length === 0) return EMPTY_VALUE_ESTIMATE

  const aodpOptions = await loadAodpOptions(guildId)
  const priceMap = await fetchAodpPrices(
    entries.map((entry) => entry.key),
    aodpOptions,
  )

  let gearSilver = 0
  let inventorySilver = 0
  let pricedItems = 0
  const lineItems = entries.map<KillbotVictimValueLineItem>((entry) => {
    const lookupKey = inventoryKey(
      entry.key.uniqueName,
      entry.key.enchant,
      entry.key.quality,
    )
    const hit = priceMap.get(lookupKey)
    const unitSilver = hit?.price && hit.price > 0 ? hit.price : null
    const totalSilver = unitSilver ? unitSilver * entry.count : 0
    if (unitSilver) pricedItems += 1
    if (entry.source === 'gear') {
      gearSilver += totalSilver
    } else {
      inventorySilver += totalSilver
    }
    return {
      source: entry.source,
      slot: entry.slot,
      uniqueName: entry.key.uniqueName,
      enchant: entry.key.enchant,
      quality: entry.key.quality,
      count: entry.count,
      unitSilver,
      totalSilver,
      fallbackTier: hit?.fallbackTier ?? 'none',
      confidence: hit?.confidence ?? 'none',
    }
  })

  const totalItems = entries.length
  const missingItems = totalItems - pricedItems
  const totalSilver = gearSilver + inventorySilver
  return {
    totalSilver,
    gearSilver,
    inventorySilver,
    totalItems,
    pricedItems,
    missingItems,
    isPartial: missingItems > 0,
    lineItems,
  }
}
