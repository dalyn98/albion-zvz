// 킬보드 장비 JSONB 로부터 AODP 시세를 조회해 리기어 추산 금액과
// 슬롯별 breakdown 을 계산한다. 자동 리기어 cron 과 관리자 재확인에서
// 공통으로 사용한다 — 두 flow 에서 포맷을 맞춰 대시보드 UI 가 단일 로직
// 으로 표시할 수 있게 함.

import {
  fetchAodpPrices,
  loadAodpOptions,
  type AodpFallbackTier,
  type AodpPriceKey,
} from '@/lib/shop/aodp'

// 장비 전체의 가장 나쁜 경고 단계를 한 값으로 요약.
// 우선순위: redzone > bluezone > window > quality > null(exact / 시세 없음).
// 시세 없음('none') 은 marketSilver 자체가 낮아 이미 보수적이라 경고 단계에서 제외.
export type RegearWarningLevel = 'quality' | 'window' | 'bluezone' | 'redzone' | null

export function worstWarningLevel(
  tiers: readonly AodpFallbackTier[],
): RegearWarningLevel {
  const priority: RegearWarningLevel[] = ['redzone', 'bluezone', 'window', 'quality']
  for (const p of priority) {
    if (tiers.some((t) => t === p)) return p
  }
  return null
}

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
  Type?: unknown
  Count?: unknown
  Quality?: unknown
}

export interface RegearEstimateLineItem {
  slot: string
  uniqueName: string
  enchant: number
  quality: number
  count: number
  price: number | null
  city: string | null
  fallbackTier: AodpFallbackTier
}

export interface RegearEstimateBreakdown {
  mode: string
  server: string
  cities: readonly string[]
  min_quality: number
  market_silver: number
  items: RegearEstimateLineItem[]
  // 품목 전체를 요약한 가장 나쁜 경고 단계. null = 모두 exact hit 또는 경고 없음.
  warning_level: RegearWarningLevel
}

export interface RegearEstimate {
  marketSilver: number
  warningLevel: RegearWarningLevel
  breakdown: RegearEstimateBreakdown
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

function toEquipmentItem(raw: unknown): EquipmentItem | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as EquipmentItem
}

function extractGearKeys(
  equipment: Record<string, unknown> | null | undefined,
): Array<{ slot: string; key: AodpPriceKey; count: number }> {
  if (!equipment) return []
  const out: Array<{ slot: string; key: AodpPriceKey; count: number }> = []
  for (const slot of EQUIPMENT_SLOTS) {
    const item = toEquipmentItem(equipment[slot])
    if (!item || typeof item.Type !== 'string') continue
    const parsed = parseItemType(item.Type)
    if (!parsed) continue
    const countRaw = typeof item.Count === 'number' ? item.Count : 1
    const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.trunc(countRaw) : 1
    const qualityRaw = typeof item.Quality === 'number' ? item.Quality : 1
    const quality = Number.isFinite(qualityRaw) && qualityRaw >= 1 ? Math.trunc(qualityRaw) : 1
    out.push({
      slot,
      key: { uniqueName: parsed.uniqueName, enchant: parsed.enchant, quality },
      count,
    })
  }
  return out
}

// 장비 JSONB 가 비거나 AODP 가 모두 null 이면 `marketSilver = 0` 으로 반환한다
// (breakdown.items 는 각 슬롯의 null 시세 포함). 호출부는 0 케이스를 "추산 불가"
// 로 표시할지 "0 으로 추산" 으로 표시할지 자유롭게 판단.
export async function estimateSilverFromEquipment(
  equipment: Record<string, unknown> | null | undefined,
): Promise<RegearEstimate> {
  const aodpOptions = await loadAodpOptions()
  const gearEntries = extractGearKeys(equipment)
  const aodpKeys = gearEntries.map((g) => g.key)
  const priceMap =
    aodpKeys.length > 0 ? await fetchAodpPrices(aodpKeys, aodpOptions) : new Map()

  const lineItems: RegearEstimateLineItem[] = []
  let marketSilver = 0
  for (const entry of gearEntries) {
    const lookupKey = `${entry.key.uniqueName}|${entry.key.enchant}|${entry.key.quality}`
    const hit = priceMap.get(lookupKey)
    const unit = hit?.price ?? null
    if (unit && unit > 0) marketSilver += unit * entry.count
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

  const warningLevel = worstWarningLevel(lineItems.map((i) => i.fallbackTier))

  return {
    marketSilver,
    warningLevel,
    breakdown: {
      mode: aodpOptions.mode,
      server: aodpOptions.server,
      cities: aodpOptions.cities,
      min_quality: aodpOptions.minQuality,
      market_silver: marketSilver,
      items: lineItems,
      warning_level: warningLevel,
    },
  }
}
