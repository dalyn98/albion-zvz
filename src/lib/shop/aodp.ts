// Albion Online Data Project 시세 조회.
// - spot 모드: /stats/prices (현재 최저 매도 호가)
// - avg_Nd 모드: /stats/history (최근 N 일 평균, 수량 가중)
//
// AODP 는 알비온 서버별로 별도 호스트를 운영하므로 `albion_server` 앱 설정을
// 따라 base URL 이 달라진다. 관리자가 도시/품질/모드를 admin settings 에서
// 조정할 수 있어야 하므로, 호출부는 먼저 `loadAodpOptions()` 로 옵션을 읽어
// 전달하는 패턴을 쓴다. 공용 유틸을 pure 하게 유지하려고 자동 로딩은 의도적으로
// 하지 않음(단위 테스트/Phase 3 auto-regear 가 모의 옵션을 주입하기 쉽게).

import type { AlbionServer } from '@/lib/killboard'
import { getAppSetting } from '@/lib/app-settings'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'

export { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'

const AODP_HOSTS: Record<AlbionServer, string> = {
  west: 'https://west.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
}

// 기본 후보 도시 — 관리자가 `aodp_cities` 를 비우면 이 목록으로 fallback.
const DEFAULT_CITIES = AODP_ALLOWED_CITIES

// 7일 넘게 업데이트 안된 spot 데이터는 시세가 움직였을 가능성 크므로 무시.
const STALE_HOURS = 24 * 7

// 평균 모드에서 일(day) 단위 bucket 사용. AODP history 는 1/6/24 허용.
const HISTORY_TIME_SCALE_HOURS = 24

export type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'

export interface AodpOptions {
  cities?: readonly string[]
  server?: AlbionServer
  mode?: AodpPriceMode
  // 실제 아이템 품질이 이 값보다 낮으면 이 값으로 끌어올려 조회.
  minQuality?: number
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
  const res = await fetch(url, {
    headers: { 'User-Agent': 'menhera-shop/1.0' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`AODP ${res.status}: ${url}`)
  return (await res.json()) as T
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

function weightedAverage(buckets: AodpHistoryBucket[]): { price: number; sampledAt: string } | null {
  let totalCount = 0
  let totalValue = 0
  let latest = ''
  for (const b of buckets) {
    if (!Number.isFinite(b.avg_price) || b.avg_price <= 0) continue
    if (!Number.isFinite(b.item_count) || b.item_count <= 0) continue
    totalCount += b.item_count
    totalValue += b.avg_price * b.item_count
    if (b.timestamp > latest) latest = b.timestamp
  }
  if (totalCount === 0) return null
  return { price: Math.round(totalValue / totalCount), sampledAt: latest }
}

// app_settings 에서 AODP 관련 옵션을 읽어 AodpOptions 로 조립.
// `albion_server` 를 함께 읽어 AODP 호스트도 맞춘다.
export async function loadAodpOptions(): Promise<Required<AodpOptions>> {
  const [serverRaw, citiesRaw, modeRaw, minQualityRaw] = await Promise.all([
    getAppSetting('albion_server', 'east'),
    getAppSetting('aodp_cities', ''),
    getAppSetting('aodp_price_mode', 'spot'),
    getAppSetting('aodp_min_quality', '1'),
  ])
  const server: AlbionServer =
    serverRaw === 'west' || serverRaw === 'east' || serverRaw === 'europe' ? serverRaw : 'east'

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

  return { cities, server, mode, minQuality }
}

// 결과 맵의 키는 `${uniqueName}|${enchant}|${quality}` — quality 는 호출부가
// 보낸 "원본" 품질이다 (minQuality floor 는 조회 내부에서만 쓴다).
export async function fetchAodpPrices(
  keys: AodpPriceKey[],
  options: AodpOptions = {},
): Promise<Map<string, AodpPriceResult>> {
  if (keys.length === 0) return new Map()
  const cities = options.cities && options.cities.length > 0 ? options.cities : DEFAULT_CITIES
  const server: AlbionServer = options.server ?? 'east'
  const mode: AodpPriceMode = options.mode ?? 'spot'
  const minQuality = options.minQuality && options.minQuality > 0 ? options.minQuality : 1
  const host = AODP_HOSTS[server]

  const uniqIds = Array.from(new Set(keys.map(itemId)))
  const qualities = qualityList(keys, minQuality)

  // URL 길이 제한(약 2KB) 감안 청크당 100개.
  const CHUNK = 100

  const result = new Map<string, AodpPriceResult>()

  if (mode === 'spot') {
    const spotMap = await fetchSpotBestByKey(host, uniqIds, qualities, cities, CHUNK)
    for (const k of keys) {
      const id = itemId(k)
      const effQ = effectiveQuality(k.quality, minQuality)
      const best = findBestByQuality(spotMap, id, effQ, minQuality)
      const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
      result.set(outKey, {
        uniqueName: k.uniqueName,
        enchant: k.enchant,
        quality: k.quality,
        price: best?.price ?? null,
        city: best?.city ?? null,
        sampledAt: best?.sampledAt ?? null,
        source: best ? 'spot' : null,
        usedQuality: best?.quality ?? null,
      })
    }
    return result
  }

  // avg_Nd 모드 — history 를 가져와 도시별로 수량 가중 평균 후 최저 도시 선택.
  // AODP 는 crowdsourced 라 동아시아 서버는 history 데이터가 비어 있는 경우가
  // 많다. 히스토리 미스 → spot 폴백으로 확장해 최소한 현재가는 보장.
  const days = modeToDays(mode)
  const all: AodpHistoryRow[] = []
  for (let i = 0; i < uniqIds.length; i += CHUNK) {
    const slice = uniqIds.slice(i, i + CHUNK)
    all.push(...(await fetchHistoryBatch(host, slice, qualities, cities, days)))
  }
  const historyBestByKey = new Map<string, { price: number; city: string; sampledAt: string }>()
  for (const row of all) {
    const avg = weightedAverage(row.data ?? [])
    if (!avg) continue
    const key = `${row.item_id}|${row.quality}`
    const prev = historyBestByKey.get(key)
    if (!prev || avg.price < prev.price) {
      historyBestByKey.set(key, { price: avg.price, city: row.location, sampledAt: avg.sampledAt })
    }
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

  let spotBestByKey = new Map<string, { price: number; city: string; sampledAt: string }>()
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
    result.set(outKey, {
      uniqueName: k.uniqueName,
      enchant: k.enchant,
      quality: k.quality,
      price: hit?.price ?? null,
      city: hit?.city ?? null,
      sampledAt: hit?.sampledAt ?? null,
      source: historyHit ? 'history' : spotHit ? 'spot' : null,
      usedQuality: hit?.quality ?? null,
    })
  }
  return result
}

// 맵 키는 `${itemId}|${quality}`. 요청 품질에서 데이터가 없으면 quality-1,
// quality-2 … minQuality 까지 내려가며 가장 높은 품질의 데이터를 반환한다.
// AODP 데이터가 일부 품질만 비는 경우 (East 서버 우수함 등) 실용적 근사치.
function findBestByQuality(
  map: Map<string, { price: number; city: string; sampledAt: string }>,
  id: string,
  requestedQuality: number,
  minQuality: number,
): { price: number; city: string; sampledAt: string; quality: number } | null {
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
): Promise<Map<string, { price: number; city: string; sampledAt: string }>> {
  const all: AodpSpotRow[] = []
  for (let i = 0; i < uniqIds.length; i += chunk) {
    const slice = uniqIds.slice(i, i + chunk)
    all.push(...(await fetchSpotBatch(host, slice, qualities, cities)))
  }
  const best = new Map<string, { price: number; city: string; sampledAt: string }>()
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
      })
    }
  }
  return best
}

export function inventoryKey(uniqueName: string, enchant: number, quality: number): string {
  return `${uniqueName}|${enchant}|${quality}`
}
