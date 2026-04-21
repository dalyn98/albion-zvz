// Albion Online Data Project (east 서버) 시세 조회.
// 엔드포인트: https://east.albion-online-data.com/api/v2/stats/prices/{items}?locations=...&qualities=...
// items 는 "UniqueName@enchant" 콤마 구분. 결과는 (item_id, city, quality, sell_price_min, sell_price_min_date) 배열.
//
// 너무 많은 아이템을 한 번에 요청하면 URL 길이 제한(대략 2KB)을 넘어 502 가 뜨므로,
// batchFetchPrices 가 자동 청크로 나눠 보낸다.

const AODP_BASE = 'https://east.albion-online-data.com/api/v2/stats/prices'

// 제외 대상: 블랙마켓은 보통 매수 호가(buy) 가 주라 sell 로는 의미 적고
// 흑시 가격이 너무 튀어 평균을 왜곡함.
const DEFAULT_CITIES = [
  'Brecilien',
  'Caerleon',
  'Martlock',
  'Bridgewatch',
  'Lymhurst',
  'Thetford',
  'Fort Sterling',
] as const

// 데이터가 너무 오래됐으면 무시. 7일 이상이면 시세가 움직여있을 가능성이 크다.
const STALE_HOURS = 24 * 7

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
}

interface AodpRow {
  item_id: string
  city: string
  quality: number
  sell_price_min: number
  sell_price_min_date: string
}

function itemId(key: AodpPriceKey): string {
  return key.enchant > 0 ? `${key.uniqueName}@${key.enchant}` : key.uniqueName
}

function qualityList(keys: AodpPriceKey[]): string {
  const set = new Set(keys.map((k) => k.quality))
  return Array.from(set).sort((a, b) => a - b).join(',')
}

function isStale(isoDate: string, now: Date): boolean {
  const ts = Date.parse(isoDate)
  if (!Number.isFinite(ts)) return true
  const hours = (now.getTime() - ts) / (1000 * 60 * 60)
  return hours > STALE_HOURS
}

async function fetchBatch(
  ids: string[],
  qualities: string,
  cities: readonly string[],
): Promise<AodpRow[]> {
  if (ids.length === 0) return []
  const url = new URL(`${AODP_BASE}/${ids.join(',')}.json`)
  url.searchParams.set('locations', cities.join(','))
  url.searchParams.set('qualities', qualities)
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'menhera-shop/1.0' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`AODP ${res.status}: ${url.pathname}`)
  }
  const body = (await res.json()) as AodpRow[]
  return body
}

// 결과 맵의 키는 `${uniqueName}|${enchant}|${quality}`.
export async function fetchAodpPrices(
  keys: AodpPriceKey[],
  cities: readonly string[] = DEFAULT_CITIES,
): Promise<Map<string, AodpPriceResult>> {
  const uniqIds = Array.from(new Set(keys.map(itemId)))
  const qualities = qualityList(keys)

  // URL 길이 제한을 감안해 청크당 100개씩.
  const CHUNK = 100
  const all: AodpRow[] = []
  for (let i = 0; i < uniqIds.length; i += CHUNK) {
    const slice = uniqIds.slice(i, i + CHUNK)
    const rows = await fetchBatch(slice, qualities, cities)
    all.push(...rows)
  }

  // 각 (item_id, quality) 조합에 대해 최저가 도시 선택.
  const bestByKey = new Map<string, { price: number; city: string; sampledAt: string }>()
  const now = new Date()
  for (const row of all) {
    if (!row.sell_price_min || row.sell_price_min <= 0) continue
    if (isStale(row.sell_price_min_date, now)) continue
    const key = `${row.item_id}|${row.quality}`
    const prev = bestByKey.get(key)
    if (!prev || row.sell_price_min < prev.price) {
      bestByKey.set(key, {
        price: row.sell_price_min,
        city: row.city,
        sampledAt: row.sell_price_min_date,
      })
    }
  }

  // 요청한 key 순서대로 결과 작성.
  const result = new Map<string, AodpPriceResult>()
  for (const k of keys) {
    const id = itemId(k)
    const bk = `${id}|${k.quality}`
    const hit = bestByKey.get(bk)
    const outKey = `${k.uniqueName}|${k.enchant}|${k.quality}`
    result.set(outKey, {
      uniqueName: k.uniqueName,
      enchant: k.enchant,
      quality: k.quality,
      price: hit?.price ?? null,
      city: hit?.city ?? null,
      sampledAt: hit?.sampledAt ?? null,
    })
  }
  return result
}

export function inventoryKey(uniqueName: string, enchant: number, quality: number): string {
  return `${uniqueName}|${enchant}|${quality}`
}
