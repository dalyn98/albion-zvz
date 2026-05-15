// Albion Online Data Project 시세 조회.
// - spot 모드: /stats/prices (현재 최저 매도 호가)
// - avg_Nd 모드: /stats/history (최근 N 일 평균, 수량 가중)
//
// AODP 는 알비온 서버별로 별도 호스트를 운영하므로 `albion_server` 앱 설정을
// 따라 base URL 이 달라진다. 관리자가 도시/품질/모드를 admin settings 에서
// 조정할 수 있어야 하므로, 호출부는 먼저 `loadAodpOptions()` 로 옵션을 읽어
// 전달하는 패턴을 쓴다. 공용 유틸을 pure 하게 유지하려고 자동 로딩은 의도적으로
// 하지 않음(단위 테스트/Phase 3 auto-regear 가 모의 옵션을 주입하기 쉽게).

import { type AlbionServer, isAlbionServer } from '@/lib/albion-gameinfo'
import { getAppSetting } from '@/lib/app-settings'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { fetchJsonWithRetry } from '@/lib/http-retry'

export { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'

const AODP_HOSTS: Record<AlbionServer, string> = {
  west: 'https://west.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
}

// 알비온 온라인 로열 시티(블루존). PvP 위험 없이 거래 가능.
// DEFAULT_CITIES 가 참조하므로 파일 위쪽에 선언.
export const BLUE_ZONE_CITIES = [
  'Lymhurst',
  'Martlock',
  'Thetford',
  'Bridgewatch',
  'Fort Sterling',
] as const

// 레드존 도시. 거래량 많지만 레드존 안으로 가야 해서 아이템 분실 리스크.
// 폴백 최후 단계로만 사용.
export const RED_ZONE_CITIES = ['Caerleon', 'Brecilien'] as const

// 기본 후보 도시 — 관리자가 `aodp_cities` 를 비우면 이 목록으로 fallback.
// 5개 royal corner (블루존) 만 사용. red zone (Caerleon, Brecilien) 은 거래량
// 많지만 가격 변동성 커서 'high' confidence 풀에서 제외. red zone 가격이
// 필요한 경우 fetchAodpPrices 의 redzone fallback tier 가 'low' confidence 로
// 별도 추가 — auto_regear_skip_low_confidence 게이트가 자동 청구에서 걸러낸다.
const DEFAULT_CITIES: readonly string[] = BLUE_ZONE_CITIES

// 7일 넘게 업데이트 안된 spot 데이터는 시세가 움직였을 가능성 크므로 무시.
const STALE_HOURS = 24 * 7

// 평균 모드에서 일(day) 단위 bucket 사용. AODP history 는 1/6/24 허용.
const HISTORY_TIME_SCALE_HOURS = 24

// 통계적 견고화 상수.
// - MIN_HIGH_SAMPLES: confidence='high' 로 분류되는 history bucket item_count 합 최소치.
//   동아시아 서버 데이터 희소성 고려해 5 개 미만이면 'medium' 으로 강등.
// - SPOT_RECENT_HOURS: spot 모드에서 'high' 로 분류되는 sampledAt 최대 경과 시간.
//
// 집계 방식: avg_Nd 모드는 bucket 들의 item_count 가중 중앙값을 사용. 알비온
// 인게임 "Estimated Market Value" 가 royal cities 의 체결가 주간 중앙값을 쓴다는
// 커뮤니티 합의에 맞춤. 가중 평균 + outlier trim 보다 단발 이상치(fire-sale,
// 매크로) 에 더 둔감.
const MIN_HIGH_SAMPLES = 5
const SPOT_RECENT_HOURS = 48

export type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'

// AODP 폴백 단계. 사용자 설정으로 못 찾을 때 점진적으로 범위를 넓힌다.
//   exact    — 사용자 설정 그대로 hit (품질 일치)
//   quality  — 품질을 낮춰서 hit (quality fallback within exact query)
//   window   — 평균 기간을 14일로 늘려서 hit
//   bluezone — 검색 도시를 블루존(로열 시티 5개)까지 확장해 hit
//   redzone  — 검색 도시를 레드존(Caerleon, Brecilien)까지 확장해 hit
//   none     — 모든 단계 실패. price === null.
// UI 는 quality/window 를 노란 경고, bluezone 을 주황, redzone 을 빨간 경고로
// 표시하고, 자동 리기어는 redzone tier 면 자동 승인하지 않고 관리자 검토 대기열로 보낸다.
export type AodpFallbackTier =
  | 'exact'
  | 'quality'
  | 'window'
  | 'bluezone'
  | 'redzone'
  | 'none'

// 시세 신뢰도 등급. 자동 리기어가 'low' 슬롯을 자동 청구에서 제외하는 게이트로 사용한다.
//   high   — exact 폴백 + (history 모드면 sampleCount >= MIN_HIGH_SAMPLES, spot 이면 < SPOT_RECENT_HOURS).
//   medium — quality/window 폴백, 또는 sample/시간 부족.
//   low    — bluezone/redzone 폴백, 또는 history 모드인데 sampleCount 가 1 이하.
//   none   — 시세 자체 없음.
export type AodpConfidence = 'high' | 'medium' | 'low' | 'none'

export interface AodpOptions {
  cities?: readonly string[]
  // 단일 "기준 도시" 모드. 빈 문자열이 아니면 해당 도시 시세를 1순위로 채택,
  // 그 도시에 데이터 없을 때만 5개 royal city bucket 을 pool 한 가중 중앙값으로
  // 폴백한다 (인게임 추정가에 가장 근접). cities 가 단일 원소면 자동 추론.
  // 명시 폴백 chain (window/bluezone/redzone) 단계에서 cities 가 확장돼도
  // primaryCity 는 보존되어 1순위 유지.
  primaryCity?: string
  server?: AlbionServer
  mode?: AodpPriceMode
  // 실제 아이템 품질이 이 값보다 낮으면 이 값으로 끌어올려 조회.
  minQuality?: number
  // true 면 결과 집계에서 품질 축을 제거. 같은 (uniqueName, enchant) 의 모든
  // 품질 변종이 동일 가격을 공유한다 (item|location 단위 가중 중앙값). AODP
  // 호출은 여전히 모든 품질 데이터를 가져오지만 응답에서 품질을 무시하고 통합.
  // 길드 운영 맥락에서 품질이 가격 의사결정에 거의 영향 없다는 도메인 가정.
  qualityAgnostic?: boolean
}

export interface AodpPriceKey {
  uniqueName: string
  enchant: number
  quality: number
}

export interface AodpPriceResult {
  uniqueName: string
  enchant: number
  quality: number
  price: number | null
  city: string | null
  sampledAt: string | null
  // 'history' = 평균 모드 (avg_Nd) 결과, 'spot' = 현재 호가.
  // 평균 모드에서 히스토리 데이터가 비어 있으면 spot 으로 폴백하므로
  // 호출자가 원본 소스를 구분할 수 있게 둔다. null = 시세 없음.
  source: 'history' | 'spot' | null
  // 실제 사용된 품질. 요청 품질에 데이터가 없으면 낮은 품질로 fallback 하므로
  // 호출자가 `quality !== usedQuality` 로 fallback 여부를 판단할 수 있게 한다.
  // null = 시세 없음.
  usedQuality: number | null
  // 어느 폴백 단계에서 시세가 나왔는지. UI 경고 색·자동 리기어 게이트 결정에 사용.
  fallbackTier: AodpFallbackTier
  // 종합 신뢰도. fallbackTier + sampleCount + recency 를 묶은 단일 등급.
  // 자동 리기어는 'low' 슬롯을 marketSilver 에서 제외(opt-in 토글)할 수 있다.
  confidence: AodpConfidence
  // 평균 모드에서 가중 평균에 사용된 item_count 합. spot 모드는 null.
  sampleCount: number | null
}

interface AodpSpotRow {
  item_id: string
  city: string
  quality: number
  sell_price_min: number
  sell_price_min_date: string
}

interface AodpHistoryBucket {
  item_count: number
  avg_price: number
  timestamp: string
}

interface AodpHistoryRow {
  location: string
  item_id: string
  quality: number
  data: AodpHistoryBucket[]
}

function itemId(key: AodpPriceKey): string {
  return key.enchant > 0 ? `${key.uniqueName}@${key.enchant}` : key.uniqueName
}

function effectiveQuality(quality: number, minQuality: number): number {
  if (!Number.isFinite(quality) || quality < 1) return Math.max(1, minQuality)
  return Math.max(quality, minQuality)
}

// AODP 는 crowdsourced 라 특정 품질만 데이터가 비어 있는 경우가 잦다 (특히
// East 서버 quality 4 우수함). 요청 품질에서 데이터가 없을 때 낮은 품질로 폴백해
// 최소한 근사값이라도 보여줄 수 있게, 조회 쿼리에 minQuality..max(requested)
// 범위를 한꺼번에 담는다. 알비온의 품질 범위 1~5 안이라 payload 증가는 크지 않다.
function qualityList(keys: AodpPriceKey[], minQuality: number): string {
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

function isStale(isoDate: string, now: Date): boolean {
  const ts = Date.parse(isoDate)
  if (!Number.isFinite(ts)) return true
  const hours = (now.getTime() - ts) / (1000 * 60 * 60)
  return hours > STALE_HOURS
}

function modeToDays(mode: AodpPriceMode): number {
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

async function fetchJson<T>(url: string): Promise<T> {
  return fetchJsonWithRetry<T>(url, {
    label: 'AODP',
    userAgent: 'albion-guildmanager/1.0',
    fetchInit: { cache: 'no-store' },
  })
}

async function fetchSpotBatch(
  host: string,
  ids: string[],
  qualities: string,
  cities: readonly string[],
): Promise<AodpSpotRow[]> {
  if (ids.length === 0) return []
  const url = new URL(`${host}/api/v2/stats/prices/${ids.join(',')}.json`)
  url.searchParams.set('locations', cities.join(','))
  url.searchParams.set('qualities', qualities)
  return fetchJson<AodpSpotRow[]>(url.toString())
}

async function fetchHistoryBatch(
  host: string,
  ids: string[],
  qualities: string,
  cities: readonly string[],
  days: number,
): Promise<AodpHistoryRow[]> {
  if (ids.length === 0) return []
  // AODP 는 `date` 파라미터부터 현재까지 반환. YYYY-MM-DD 형식.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const yyyy = since.getUTCFullYear()
  const mm = String(since.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(since.getUTCDate()).padStart(2, '0')
  const date = `${yyyy}-${mm}-${dd}`
  const url = new URL(`${host}/api/v2/stats/history/${ids.join(',')}.json`)
  url.searchParams.set('locations', cities.join(','))
  url.searchParams.set('qualities', qualities)
  url.searchParams.set('date', date)
  url.searchParams.set('time-scale', String(HISTORY_TIME_SCALE_HOURS))
  return fetchJson<AodpHistoryRow[]>(url.toString())
}

// 가중 중앙값 (item_count 가중). bucket 을 가격 오름차순 정렬한 뒤, 누적
// item_count 가 전체의 절반에 도달하는 가격을 채택. 평균이나 trim-mean 보다
// 단발 fire-sale/매크로 매물에 둔감해 알비온 인게임 추정 시장 가치(royal city
// 주간 중앙값) 동작에 더 가깝다.
//
// 짝수개 동률 가격으로 절반 경계가 갈라지면 두 값을 평균. 단일 bucket 이면
// 그 가격 그대로.
function weightedMedian(
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
function selectHistoryFromCities(
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
function computeConfidence(
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

// app_settings 에서 AODP 관련 옵션을 읽어 AodpOptions 로 조립.
// `albion_server` 를 함께 읽어 AODP 호스트도 맞춘다.
// guildId 는 필수 — 호출자가 항상 명시해 cross-tenant 누설을 막는다.
export async function loadAodpOptions(guildId: string): Promise<Required<AodpOptions>> {
  const [serverRaw, citiesRaw, modeRaw, minQualityRaw, qualityAgnosticRaw] = await Promise.all([
    getAppSetting('albion_server', '', guildId),
    getAppSetting('aodp_cities', '', guildId),
    getAppSetting('aodp_price_mode', 'spot', guildId),
    getAppSetting('aodp_min_quality', '1', guildId),
    getAppSetting('aodp_quality_agnostic', 'false', guildId),
  ])
  // 'east' silent 폴백 금지 — west/eu tenant 가 동부 AODP 시세로 잘못 청구되는 사고를 막는다.
  // 호출자(cron/admin action)가 errors 로 받아 tenant skip 또는 사용자 안내로 처리.
  if (!isAlbionServer(serverRaw)) {
    throw new Error(`albion_server not configured for guild: ${guildId}`)
  }
  const server: AlbionServer = serverRaw

  let cities: readonly string[] = DEFAULT_CITIES
  if (citiesRaw) {
    try {
      const parsed = JSON.parse(citiesRaw)
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (v) => typeof v === 'string' && (AODP_ALLOWED_CITIES as readonly string[]).includes(v),
        )
      ) {
        cities = parsed
      }
    } catch {
      // 손상된 값 — DEFAULT_CITIES 로 degrade.
    }
  }

  const mode: AodpPriceMode =
    modeRaw === 'spot' ||
    modeRaw === 'avg_1d' ||
    modeRaw === 'avg_3d' ||
    modeRaw === 'avg_7d' ||
    modeRaw === 'avg_14d'
      ? modeRaw
      : 'spot'

  const minQualityParsed = Number(minQualityRaw)
  const minQuality =
    Number.isInteger(minQualityParsed) && minQualityParsed >= 1 && minQualityParsed <= 5
      ? minQualityParsed
      : 1

  const qualityAgnostic = qualityAgnosticRaw === 'true'

  // cities 배열의 첫 도시를 자동으로 "기준 도시" 로 인식. AodpSettingsForm 은
  // 항상 [city] 한 개로 저장하고, 다중 도시 시드(mig 137 등) 도 첫 도시가
  // 자연스러운 1순위가 된다 — 나머지 도시는 fallbackPool 로 재사용.
  const primaryCity = cities[0] ?? ''

  return { cities, primaryCity, server, mode, minQuality, qualityAgnostic }
}

// AODP 폴백 체인의 한 단계. 사용자 설정(또는 widen 된 설정) 으로 한 번
// 조회하고 결과를 그대로 반환한다. tier 는 wrapper 가 결정.
//
// 결과 맵의 키는 `${uniqueName}|${enchant}|${quality}` — quality 는 호출부가
// 보낸 "원본" 품질이다 (minQuality floor 는 조회 내부에서만 쓴다).
async function fetchAodpPricesExact(
  keys: AodpPriceKey[],
  options: Required<AodpOptions>,
): Promise<Map<string, AodpPriceResult>> {
  if (keys.length === 0) return new Map()
  const { cities, primaryCity, server, mode, minQuality, qualityAgnostic } = options
  const host = AODP_HOSTS[server]

  // 기준 도시 모드: cities 설정과 무관하게 항상 5 royal city + primary 를 함께
  // 조회해 폴백 pool 을 확보. wrapper 가 widen 한 cities (bluezone/redzone) 도
  // unionCities 로 흡수되므로 단계별 cities 변화에 따라 자연스럽게 pool 이 늘어난다.
  // primaryCity 가 빈 문자열이면 기존 multi-city min 동작 그대로.
  const hasPrimary = primaryCity.length > 0
  const effectiveCities = hasPrimary
    ? unionCities([primaryCity], unionCities(cities, BLUE_ZONE_CITIES))
    : cities
  const fallbackPool: readonly string[] = hasPrimary
    ? effectiveCities.filter((c) => c !== primaryCity)
    : []

  const uniqIds = Array.from(new Set(keys.map(itemId)))
  const qualities = qualityList(keys, minQuality)

  // URL 길이 제한(약 2KB) 감안 청크당 100개.
  const CHUNK = 100

  const now = new Date()
  const result = new Map<string, AodpPriceResult>()
  const buildResult = (
    k: AodpPriceKey,
    hit:
      | {
          price: number
          city: string
          sampledAt: string
          quality: number
          sampleCount: number | null
        }
      | null,
    source: 'history' | 'spot' | null,
  ): AodpPriceResult => {
    const tier: AodpFallbackTier = hit
      ? hit.quality === k.quality
        ? 'exact'
        : 'quality'
      : 'none'
    return {
      uniqueName: k.uniqueName,
      enchant: k.enchant,
      quality: k.quality,
      price: hit?.price ?? null,
      city: hit?.city ?? null,
      sampledAt: hit?.sampledAt ?? null,
      source: hit ? source : null,
      usedQuality: hit?.quality ?? null,
      // tier 는 hit 의 usedQuality 가 요청 품질과 다르면 'quality', 같으면 'exact'.
      // 호출 시점에 widen 된 mode/cities 였다면 wrapper 가 덮어쓴다.
      fallbackTier: tier,
      sampleCount: hit?.sampleCount ?? null,
      confidence: computeConfidence(hit, tier, hit ? source : null, now),
    }
  }

  // 품질 무관 모드용 결과 빌더 — 품질 폴백 차원이 없으므로 tier 는 exact|none
  // 만 가능. usedQuality 는 항상 요청 품질을 그대로 반환 (가격은 모든 품질
  // 변종이 공유하지만, 호출자가 요청한 품질 자체는 보존해야 후속 매핑에서
  // 같은 inventoryKey 로 잡히기 때문).
  const buildResultAgnostic = (
    k: AodpPriceKey,
    hit:
      | { price: number; city: string; sampledAt: string; sampleCount: number | null }
      | null,
    source: 'history' | 'spot' | null,
  ): AodpPriceResult => {
    const tier: AodpFallbackTier = hit ? 'exact' : 'none'
    return {
      uniqueName: k.uniqueName,
      enchant: k.enchant,
      quality: k.quality,
      price: hit?.price ?? null,
      city: hit?.city ?? null,
      sampledAt: hit?.sampledAt ?? null,
      source: hit ? source : null,
      usedQuality: hit ? k.quality : null,
      fallbackTier: tier,
      sampleCount: hit?.sampleCount ?? null,
      confidence: computeConfidence(hit, tier, hit ? source : null, now),
    }
  }

  if (qualityAgnostic) {
    // 품질을 결과 집계 축에서 제거. spot 은 (item, location, quality) 행을
    // item 으로 collapse 해 최저가 채택. history 는 (item, location) 단위로
    // 모든 품질의 bucket 을 합쳐 weightedMedian.
    if (mode === 'spot') {
      const spotMap = await fetchSpotBestByKey(
        host,
        uniqIds,
        qualities,
        effectiveCities,
        CHUNK,
      )
      // 행 (item, quality, city) → (item) 로 collapse. primary 모드면 기준 도시
      // 우선; 그렇지 않으면 최저 도시.
      const itemBest = new Map<
        string,
        { price: number; city: string; sampledAt: string; sampleCount: number | null }
      >()
      for (const [mk, v] of spotMap) {
        const id = mk.split('|')[0]
        const prev = itemBest.get(id)
        if (hasPrimary && v.city === primaryCity) {
          itemBest.set(id, v)
          continue
        }
        if (prev && hasPrimary && prev.city === primaryCity) continue
        if (!prev || v.price < prev.price) itemBest.set(id, v)
      }
      for (const k of keys) {
        const id = itemId(k)
        const best = itemBest.get(id) ?? null
        const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
        result.set(outKey, buildResultAgnostic(k, best, 'spot'))
      }
      return result
    }

    // history 모드 — bucket 들을 (item, location) 단위로 모은 뒤 weightedMedian.
    // primary 모드: 기준 도시의 중앙값을 1순위로, 데이터 미스 시 fallbackPool
    // (기준 도시를 제외한 나머지 royal cities) 의 bucket 을 합쳐 통합 weightedMedian
    // 으로 폴백 — 한 도시 데이터가 비어 인게임 추정가보다 너무 낮게 잡히는 문제 방지.
    // primary 미설정: 기존대로 도시 중 최저가 채택.
    const days = modeToDays(mode)
    const all: AodpHistoryRow[] = []
    for (let i = 0; i < uniqIds.length; i += CHUNK) {
      const slice = uniqIds.slice(i, i + CHUNK)
      all.push(...(await fetchHistoryBatch(host, slice, qualities, effectiveCities, days)))
    }
    const bucketsByItem = new Map<string, Map<string, AodpHistoryBucket[]>>()
    for (const row of all) {
      const byLoc = bucketsByItem.get(row.item_id) ?? new Map<string, AodpHistoryBucket[]>()
      const list = byLoc.get(row.location) ?? []
      list.push(...(row.data ?? []))
      byLoc.set(row.location, list)
      bucketsByItem.set(row.item_id, byLoc)
    }
    const historyBestByItem = new Map<
      string,
      { price: number; city: string; sampledAt: string; sampleCount: number }
    >()
    for (const [item_id, byLoc] of bucketsByItem) {
      const picked = selectHistoryFromCities(byLoc, primaryCity, fallbackPool)
      if (picked) historyBestByItem.set(item_id, picked)
    }

    // history 미스인 item 만 spot 폴백으로 보강.
    const missingItems = new Set<string>()
    for (const k of keys) {
      if (!historyBestByItem.has(itemId(k))) missingItems.add(itemId(k))
    }
    const spotBestByItem = new Map<
      string,
      { price: number; city: string; sampledAt: string; sampleCount: null }
    >()
    if (missingItems.size > 0) {
      const spotMap = await fetchSpotBestByKey(host, uniqIds, qualities, effectiveCities, CHUNK)
      for (const [mk, v] of spotMap) {
        const id = mk.split('|')[0]
        const prev = spotBestByItem.get(id)
        if (hasPrimary && v.city === primaryCity) {
          spotBestByItem.set(id, v)
          continue
        }
        if (prev && hasPrimary && prev.city === primaryCity) continue
        if (!prev || v.price < prev.price) spotBestByItem.set(id, v)
      }
    }

    for (const k of keys) {
      const id = itemId(k)
      const historyHit = historyBestByItem.get(id) ?? null
      const spotHit = historyHit ? null : (spotBestByItem.get(id) ?? null)
      const hit = historyHit ?? spotHit
      const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
      result.set(
        outKey,
        buildResultAgnostic(k, hit, historyHit ? 'history' : spotHit ? 'spot' : null),
      )
    }
    return result
  }

  if (mode === 'spot') {
    const spotMap = await fetchSpotBestByKey(host, uniqIds, qualities, cities, CHUNK)
    for (const k of keys) {
      const id = itemId(k)
      const effQ = effectiveQuality(k.quality, minQuality)
      const best = findBestByQuality(spotMap, id, effQ, minQuality)
      const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
      result.set(outKey, buildResult(k, best, 'spot'))
    }
    return result
  }

  // avg_Nd 모드 — history 를 가져와 (item, quality) 별로 selectHistoryFromCities
  // 를 통해 primary 모드 / multi-city min 모드를 분기. AODP 는 crowdsourced 라
  // 동아시아 서버는 history 데이터가 비어 있는 경우가 많다. 히스토리 미스 →
  // spot 폴백으로 확장해 최소한 현재가는 보장.
  const days = modeToDays(mode)
  const all: AodpHistoryRow[] = []
  for (let i = 0; i < uniqIds.length; i += CHUNK) {
    const slice = uniqIds.slice(i, i + CHUNK)
    all.push(...(await fetchHistoryBatch(host, slice, qualities, effectiveCities, days)))
  }
  const bucketsByKey = new Map<string, Map<string, AodpHistoryBucket[]>>()
  for (const row of all) {
    const key = `${row.item_id}|${row.quality}`
    const byLoc = bucketsByKey.get(key) ?? new Map<string, AodpHistoryBucket[]>()
    const list = byLoc.get(row.location) ?? []
    list.push(...(row.data ?? []))
    byLoc.set(row.location, list)
    bucketsByKey.set(key, byLoc)
  }
  const historyBestByKey = new Map<
    string,
    { price: number; city: string; sampledAt: string; sampleCount: number }
  >()
  for (const [key, byLoc] of bucketsByKey) {
    const picked = selectHistoryFromCities(byLoc, primaryCity, fallbackPool)
    if (picked) historyBestByKey.set(key, picked)
  }

  // 히스토리에서 못 찾은 key (요청 품질 + 낮은 품질 어느 것도 없는 경우) → spot 폴백.
  const missingLookupKeys = new Set<string>()
  for (const k of keys) {
    const id = itemId(k)
    const effQ = effectiveQuality(k.quality, minQuality)
    if (!findBestByQuality(historyBestByKey, id, effQ, minQuality)) {
      missingLookupKeys.add(id)
    }
  }

  let spotBestByKey = new Map<
    string,
    { price: number; city: string; sampledAt: string; sampleCount: null }
  >()
  if (missingLookupKeys.size > 0) {
    // 폴백 spot 은 원본 keys 와 같은 도시/품질로만 조회. 사용자 설정을 벗어나진 않음.
    spotBestByKey = await fetchSpotBestByKey(host, uniqIds, qualities, cities, CHUNK)
  }

  for (const k of keys) {
    const id = itemId(k)
    const effQ = effectiveQuality(k.quality, minQuality)
    const historyHit = findBestByQuality(historyBestByKey, id, effQ, minQuality)
    const spotHit = historyHit ? null : findBestByQuality(spotBestByKey, id, effQ, minQuality)
    const hit = historyHit ?? spotHit
    const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
    result.set(outKey, buildResult(k, hit, historyHit ? 'history' : spotHit ? 'spot' : null))
  }
  return result
}

// 두 도시 리스트의 합집합. 순서 보존 — Set 으로 dedupe 후 배열 변환.
function unionCities(a: readonly string[], b: readonly string[]): readonly string[] {
  return Array.from(new Set([...a, ...b]))
}

// 두 도시 리스트가 같은 set 인지. 순서 무관.
function sameCities(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const aSet = new Set(a)
  for (const c of b) if (!aSet.has(c)) return false
  return true
}

// 공개 API. 폴백 체인을 돌려 가능한 한 시세를 찾아 반환한다.
// 각 결과의 fallbackTier 가 어느 단계에서 hit 했는지 알려준다.
//   1. exact      — 사용자 설정 그대로 (quality fallback 은 내장)
//   2. window     — mode='avg_14d' 로 풀어 재시도
//   3. bluezone   — cities 에 블루존 추가
//   4. redzone    — cities 에 레드존도 추가 (= 사실상 모든 시티)
//   5. none       — 끝까지 못 찾음. price === null.
//
// 단계는 누적: window 부터 minQuality=1, mode='avg_14d' 가 강제되며 그 위에
// 도시만 점진적으로 넓어진다. 사용자 설정에 이미 모든 도시가 포함돼 있으면
// 도시 확장 단계는 자동으로 skip — 추가 API 호출 없음.
export async function fetchAodpPrices(
  keys: AodpPriceKey[],
  options: AodpOptions = {},
): Promise<Map<string, AodpPriceResult>> {
  if (keys.length === 0) return new Map()
  const baseCities = options.cities && options.cities.length > 0 ? options.cities : DEFAULT_CITIES
  const userOpts: Required<AodpOptions> = {
    cities: baseCities,
    primaryCity:
      options.primaryCity && options.primaryCity.length > 0
        ? options.primaryCity
        : baseCities.length === 1
          ? baseCities[0]
          : '',
    server: options.server ?? (() => {
      // 'east' silent 폴백 금지 — 호출부는 loadAodpOptions(guildId) 로 옵션을
      // 풀어 server 를 반드시 채워서 넘긴다. 직접 호출이라 server 가 비어 있으면
      // 명시적 실패로 west/eu 테넌트의 동부 시세 잘못 적용을 차단.
      throw new Error('fetchAodpPrices requires options.server (no silent east fallback)')
    })(),
    mode: options.mode ?? 'spot',
    minQuality: options.minQuality && options.minQuality > 0 ? options.minQuality : 1,
    qualityAgnostic: options.qualityAgnostic === true,
  }

  // 1단계: exact (사용자 설정). buildResult 가 이미 'exact' 또는 'quality' 태그.
  const out = await fetchAodpPricesExact(keys, userOpts)

  const collectMisses = (): AodpPriceKey[] =>
    keys.filter((k) => {
      const mk = `${k.uniqueName}|${k.enchant}|${k.quality}`
      const r = out.get(mk)
      return !r || r.price === null
    })

  // 폴백 단계에서 tier 를 덮어쓸 때 confidence 도 함께 다시 산출.
  // bluezone/redzone 은 항상 'low' 로 떨어지고, window 는 sample/source 에 따라 medium/high.
  const now = new Date()
  const overrideTier = (
    misses: AodpPriceKey[],
    tier: AodpFallbackTier,
    fetchedOpts: Required<AodpOptions>,
  ) => {
    if (misses.length === 0) return Promise.resolve()
    return fetchAodpPricesExact(misses, fetchedOpts).then((m) => {
      for (const [mk, r] of m) {
        if (r.price === null) continue
        r.fallbackTier = tier
        r.confidence = computeConfidence(
          { sampledAt: r.sampledAt ?? '', sampleCount: r.sampleCount },
          tier,
          r.source,
          now,
        )
        out.set(mk, r)
      }
    })
  }

  // 2단계: window — avg_14d + minQuality=1. 이미 14d 면 skip.
  const widenedOpts: Required<AodpOptions> = {
    ...userOpts,
    mode: 'avg_14d',
    minQuality: 1,
  }
  if (userOpts.mode !== 'avg_14d' || userOpts.minQuality !== 1) {
    await overrideTier(collectMisses(), 'window', widenedOpts)
  }

  // 3단계: bluezone — cities 에 블루존 union. 이미 모든 블루존이 포함돼 있으면 skip.
  const bzCities = unionCities(userOpts.cities, BLUE_ZONE_CITIES)
  if (!sameCities(bzCities, userOpts.cities)) {
    await overrideTier(collectMisses(), 'bluezone', { ...widenedOpts, cities: bzCities })
  }

  // 4단계: redzone — cities 에 레드존도 union.
  const allCities = unionCities(bzCities, RED_ZONE_CITIES)
  if (!sameCities(allCities, bzCities)) {
    await overrideTier(collectMisses(), 'redzone', { ...widenedOpts, cities: allCities })
  }

  // 5단계: none — 마지막까지 못 찾은 key 는 null + tier='none'. 기존 result 에
  // 누락된 key 는 전혀 hit 되지 않은 것이고, 있는데 price=null 이면 1~4 단계가
  // 다 빈 결과를 돌려줬다는 뜻. 둘 다 동일하게 'none' 태그로 통일.
  for (const k of keys) {
    const mk = `${k.uniqueName}|${k.enchant}|${k.quality}`
    const r = out.get(mk)
    if (!r) {
      out.set(mk, {
        uniqueName: k.uniqueName,
        enchant: k.enchant,
        quality: k.quality,
        price: null,
        city: null,
        sampledAt: null,
        source: null,
        usedQuality: null,
        fallbackTier: 'none',
        sampleCount: null,
        confidence: 'none',
      })
    } else if (r.price === null) {
      r.fallbackTier = 'none'
      r.confidence = 'none'
    }
  }

  return out
}

// 맵 키는 `${itemId}|${quality}`. 요청 품질에서 데이터가 없으면 quality-1,
// quality-2 … minQuality 까지 내려가며 가장 높은 품질의 데이터를 반환한다.
// AODP 데이터가 일부 품질만 비는 경우 (East 서버 우수함 등) 실용적 근사치.
function findBestByQuality<T extends { price: number; city: string; sampledAt: string }>(
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

// spot 결과를 `${itemId}|${quality}` 로 인덱스한 맵으로 반환하는 공용 루틴.
// 같은 (item, quality) 에 대해 도시가 여러 개 내려오면 최저가를 선택한다.
// 7일 이상 스탬프가 오래된 행은 시세가 움직였을 가능성 커 제외 (STALE_HOURS 참고).
async function fetchSpotBestByKey(
  host: string,
  uniqIds: string[],
  qualities: string,
  cities: readonly string[],
  chunk: number,
): Promise<Map<string, { price: number; city: string; sampledAt: string; sampleCount: null }>> {
  const all: AodpSpotRow[] = []
  for (let i = 0; i < uniqIds.length; i += chunk) {
    const slice = uniqIds.slice(i, i + chunk)
    all.push(...(await fetchSpotBatch(host, slice, qualities, cities)))
  }
  const best = new Map<string, { price: number; city: string; sampledAt: string; sampleCount: null }>()
  const now = new Date()
  for (const row of all) {
    if (!row.sell_price_min || row.sell_price_min <= 0) continue
    if (isStale(row.sell_price_min_date, now)) continue
    const key = `${row.item_id}|${row.quality}`
    const prev = best.get(key)
    if (!prev || row.sell_price_min < prev.price) {
      best.set(key, {
        price: row.sell_price_min,
        city: row.city,
        sampledAt: row.sell_price_min_date,
        sampleCount: null,
      })
    }
  }
  return best
}

export function inventoryKey(uniqueName: string, enchant: number, quality: number): string {
  return `${uniqueName}|${enchant}|${quality}`
}
