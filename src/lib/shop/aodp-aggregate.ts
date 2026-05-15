// aodp.ts 의 pure aggregation / scoring 헬퍼. AODP HTTP 호출이나 app_settings
// 접근 없이 입력 데이터만으로 가격/신뢰도/품질 폴백을 계산한다. 단위 테스트와
// 알고리즘 변경의 격리를 위해 별도 파일로 분리.

import type { AodpConfidence, AodpFallbackTier, AodpPriceKey, AodpPriceMode } from './aodp'

// 통계적 견고화 상수.
// - MIN_HIGH_SAMPLES: confidence='high' 로 분류되는 history bucket item_count 합 최소치.
//   동아시아 서버 데이터 희소성 고려해 5 개 미만이면 'medium' 으로 강등.
// - SPOT_RECENT_HOURS: spot 모드에서 'high' 로 분류되는 sampledAt 최대 경과 시간.
//
// 집계 방식: avg_Nd 모드는 bucket 들의 item_count 가중 중앙값을 사용. 알비온
// 인게임 "Estimated Market Value" 가 royal cities 의 체결가 주간 중앙값을 쓴다는
// 커뮤니티 합의에 맞춤. 가중 평균 + outlier trim 보다 단발 이상치(fire-sale,
// 매크로) 에 더 둔감.
export const MIN_HIGH_SAMPLES = 5
export const SPOT_RECENT_HOURS = 48

// 7일 넘게 업데이트 안된 spot 데이터는 시세가 움직였을 가능성 크므로 무시.
export const STALE_HOURS = 24 * 7

export interface AodpHistoryBucket {
  item_count: number
  avg_price: number
  timestamp: string
}

export function itemId(key: AodpPriceKey): string {
  return key.enchant > 0 ? `${key.uniqueName}@${key.enchant}` : key.uniqueName
}

export function effectiveQuality(quality: number, minQuality: number): number {
  if (!Number.isFinite(quality) || quality < 1) return Math.max(1, minQuality)
  return Math.max(quality, minQuality)
}

// AODP 는 crowdsourced 라 특정 품질만 데이터가 비어 있는 경우가 잦다 (특히
// East 서버 quality 4 우수함). 요청 품질에서 데이터가 없을 때 낮은 품질로 폴백해
// 최소한 근사값이라도 보여줄 수 있게, 조회 쿼리에 minQuality..max(requested)
// 범위를 한꺼번에 담는다. 알비온의 품질 범위 1~5 안이라 payload 증가는 크지 않다.
export function qualityList(keys: AodpPriceKey[], minQuality: number): string {
  let maxQ = 0
  for (const k of keys) {
    const eq = effectiveQuality(k.quality, minQuality)
    if (eq > maxQ) maxQ = eq
  }
  const floor = Math.max(1, Math.min(5, minQuality))
  const ceiling = Math.max(floor, Math.min(5, maxQ || floor))
  const list: number[] = []
  for (let q = floor; q <= ceiling; q += 1) list.push(q)
  return list.join(',')
}

export function isStale(isoDate: string, now: Date): boolean {
  const ts = Date.parse(isoDate)
  if (!Number.isFinite(ts)) return true
  const hours = (now.getTime() - ts) / (1000 * 60 * 60)
  return hours > STALE_HOURS
}

export function modeToDays(mode: AodpPriceMode): number {
  switch (mode) {
    case 'avg_1d':
      return 1
    case 'avg_3d':
      return 3
    case 'avg_7d':
      return 7
    case 'avg_14d':
      return 14
    default:
      return 0
  }
}

// 가중 중앙값 (item_count 가중). bucket 을 가격 오름차순 정렬한 뒤, 누적
// item_count 가 전체의 절반에 도달하는 가격을 채택. 평균이나 trim-mean 보다
// 단발 fire-sale/매크로 매물에 둔감해 알비온 인게임 추정 시장 가치(royal city
// 주간 중앙값) 동작에 더 가깝다.
//
// 짝수개 동률 가격으로 절반 경계가 갈라지면 두 값을 평균. 단일 bucket 이면
// 그 가격 그대로.
export function weightedMedian(
  buckets: AodpHistoryBucket[],
): { price: number; sampledAt: string; sampleCount: number } | null {
  const valid = buckets.filter(
    (b) =>
      Number.isFinite(b.avg_price) &&
      b.avg_price > 0 &&
      Number.isFinite(b.item_count) &&
      b.item_count > 0,
  )
  if (valid.length === 0) return null

  const sorted = [...valid].sort((a, b) => a.avg_price - b.avg_price)
  const totalCount = sorted.reduce((acc, b) => acc + b.item_count, 0)
  if (totalCount === 0) return null

  // 누적 weight 가 totalCount/2 를 처음 넘는 bucket. 정확히 절반에서 떨어지면
  // 다음 bucket 과 평균.
  const half = totalCount / 2
  let cumulative = 0
  let medianPrice = sorted[0].avg_price
  for (let i = 0; i < sorted.length; i += 1) {
    const next = cumulative + sorted[i].item_count
    if (next > half) {
      medianPrice = sorted[i].avg_price
      break
    }
    if (next === half && i + 1 < sorted.length) {
      medianPrice = (sorted[i].avg_price + sorted[i + 1].avg_price) / 2
      break
    }
    cumulative = next
    medianPrice = sorted[i].avg_price
  }

  let latest = ''
  for (const b of valid) {
    if (b.timestamp > latest) latest = b.timestamp
  }

  return {
    price: Math.round(medianPrice),
    sampledAt: latest,
    sampleCount: totalCount,
  }
}

// 한 (item|quality) 에 대해 도시별 bucket 맵에서 대표 시세를 뽑는다.
//   - primaryCity 가 있고 그 도시 데이터가 있으면 그 도시의 weightedMedian.
//   - primaryCity 데이터가 없으면 fallbackPool 도시들의 bucket 을 합쳐 통합 weightedMedian
//     (city 태그는 'pooled') — 한 도시 표본이 비어 인게임 추정가 대비 너무 낮게 잡히는 문제 방지.
//   - primaryCity 미설정이면 도시별 weightedMedian 중 최저가 채택 (legacy multi-city min).
// qualityAgnostic 여부와 무관하게 같은 키 모양으로 호출 가능.
export function selectHistoryFromCities(
  byLoc: Map<string, AodpHistoryBucket[]>,
  primaryCity: string,
  fallbackPool: readonly string[],
): { price: number; city: string; sampledAt: string; sampleCount: number } | null {
  const hasPrimary = primaryCity.length > 0
  if (hasPrimary) {
    const primaryBuckets = byLoc.get(primaryCity)
    const primaryAggregate = primaryBuckets ? weightedMedian(primaryBuckets) : null
    if (primaryAggregate) {
      return {
        price: primaryAggregate.price,
        city: primaryCity,
        sampledAt: primaryAggregate.sampledAt,
        sampleCount: primaryAggregate.sampleCount,
      }
    }
    const pooled: AodpHistoryBucket[] = []
    for (const c of fallbackPool) {
      const bucketsForCity = byLoc.get(c)
      if (bucketsForCity) pooled.push(...bucketsForCity)
    }
    const pooledAggregate = pooled.length > 0 ? weightedMedian(pooled) : null
    if (!pooledAggregate) return null
    return {
      price: pooledAggregate.price,
      city: 'pooled',
      sampledAt: pooledAggregate.sampledAt,
      sampleCount: pooledAggregate.sampleCount,
    }
  }
  let best: { price: number; city: string; sampledAt: string; sampleCount: number } | null = null
  for (const [location, buckets] of byLoc) {
    const aggregate = weightedMedian(buckets)
    if (!aggregate) continue
    if (!best || aggregate.price < best.price) {
      best = {
        price: aggregate.price,
        city: location,
        sampledAt: aggregate.sampledAt,
        sampleCount: aggregate.sampleCount,
      }
    }
  }
  return best
}

// fallbackTier + sampleCount + recency 를 종합해 confidence 등급을 매긴다.
// hit === null 이면 'none'. 자세한 분기 규칙은 AodpConfidence 타입 docstring 참고.
export function computeConfidence(
  hit: { sampledAt: string; sampleCount: number | null } | null,
  tier: AodpFallbackTier,
  source: 'history' | 'spot' | null,
  now: Date,
): AodpConfidence {
  if (!hit || tier === 'none') return 'none'
  if (tier === 'redzone' || tier === 'bluezone') return 'low'

  // history 모드: sampleCount 부족하면 강등. 1 이하면 low, MIN_HIGH_SAMPLES 미만이면 medium.
  if (source === 'history') {
    const samples = hit.sampleCount ?? 0
    if (samples <= 1) return 'low'
    if (samples < MIN_HIGH_SAMPLES) return 'medium'
  }

  // spot 모드: 너무 오래된 가격이면 medium. STALE_HOURS 안이라 일단 가격은 채택했지만
  // SPOT_RECENT_HOURS (48h) 넘으면 변동 위험 있으니 high 까지 주진 않는다.
  if (source === 'spot' && hit.sampledAt) {
    const ts = Date.parse(hit.sampledAt)
    if (Number.isFinite(ts)) {
      const hours = (now.getTime() - ts) / (1000 * 60 * 60)
      if (hours > SPOT_RECENT_HOURS) return 'medium'
    }
  }

  if (tier === 'quality' || tier === 'window') return 'medium'
  return 'high'
}

// 맵 키는 `${itemId}|${quality}`. 요청 품질에서 데이터가 없으면 quality-1,
// quality-2 … minQuality 까지 내려가며 가장 높은 품질의 데이터를 반환한다.
// AODP 데이터가 일부 품질만 비는 경우 (East 서버 우수함 등) 실용적 근사치.
export function findBestByQuality<T extends { price: number; city: string; sampledAt: string }>(
  map: Map<string, T>,
  id: string,
  requestedQuality: number,
  minQuality: number,
): (T & { quality: number }) | null {
  const floor = Math.max(1, Math.min(5, minQuality))
  for (let q = requestedQuality; q >= floor; q -= 1) {
    const hit = map.get(`${id}|${q}`)
    if (hit) return { ...hit, quality: q }
  }
  return null
}

// 두 도시 리스트의 합집합. 순서 보존 — Set 으로 dedupe 후 배열 변환.
export function unionCities(a: readonly string[], b: readonly string[]): readonly string[] {
  return Array.from(new Set([...a, ...b]))
}

// 두 도시 리스트가 같은 set 인지. 순서 무관.
export function sameCities(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const aSet = new Set(a)
  for (const c of b) if (!aSet.has(c)) return false
  return true
}
