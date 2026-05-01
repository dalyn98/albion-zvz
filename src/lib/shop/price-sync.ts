// 상점 시세 동기화 코어 로직.
//
// 두 호출자가 공유:
//   - admin action `syncShopPrices` (관리자 수동 동기화 버튼)
//   - cron `/api/cron/shop-price-sync` (1시간 주기 자동 갱신)
//
// 둘 다 같은 함수를 호출해 결과 차이를 0 으로 만든다 — 사용자가 본 staleness
// 이슈의 본질은 "수동 동기화 버튼을 눌러야만 갱신" 이었으므로, cron 으로
// 반복 호출하면 별다른 코드 변경 없이 자동 리기어와 시세 정합성이 맞는다.
//
// 멀티테넌트 안전성: 모든 쿼리가 `guildId` 필터를 명시. 호출자는 admin client
// 와 명시적 guildId 를 넘긴다 (cron 은 listActiveTenants 루프, action 은
// getSessionGuildId).
//
// AODP 호출 비용: tenant 당 키 ≤ MAX_SYNC_ROWS 개. fetchAodpPrices 가 100 개
// chunk 로 나눠 요청하므로 무거운 tenant 도 5 회 이내 HTTP 호출.

import {
  fetchAodpPrices,
  inventoryKey,
  loadAodpOptions,
  type AodpPriceKey,
} from '@/lib/shop/aodp'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceSyncTenantResult {
  requested: number
  updated: number
  missing: number
  error?: string
}

const MAX_SYNC_ROWS = 500

export async function syncTenantShopPrices(
  db: SupabaseClient,
  guildId: string,
): Promise<PriceSyncTenantResult> {
  const { data: rows, error: rowErr } = await db
    .from('shop_inventory')
    .select('unique_name, enchant, quality')
    .eq('guild_id', guildId)
    .limit(MAX_SYNC_ROWS)
  if (rowErr) {
    return { requested: 0, updated: 0, missing: 0, error: rowErr.message }
  }

  const keys: AodpPriceKey[] = (rows ?? []).map((r) => ({
    uniqueName: r.unique_name as string,
    enchant: r.enchant as number,
    quality: r.quality as number,
  }))
  if (keys.length === 0) return { requested: 0, updated: 0, missing: 0 }

  const aodpOptions = await loadAodpOptions(guildId)
  const priceMap = await fetchAodpPrices(keys, aodpOptions)

  let updated = 0
  let missing = 0
  const now = new Date().toISOString()

  for (const k of keys) {
    const mk = inventoryKey(k.uniqueName, k.enchant, k.quality)
    const hit = priceMap.get(mk)
    if (!hit || hit.price === null) {
      missing += 1
      continue
    }
    // source 가 'spot' 이면 평균 모드에서 폴백된 현재가. 관리자가 원본 설정 (avg_7d)
    // 과 실제 반영된 값이 다르다는 걸 알 수 있게 접미사로 덧붙인다.
    // usedQuality 가 원래 요청 품질보다 낮으면 AODP 에 해당 품질 데이터가 없어
    // 낮은 품질로 fallback 했다는 뜻이라 `:q{usedQuality}` 도 덧붙인다.
    const parts = [`aodp:${hit.city}`]
    if (hit.source === 'spot') parts.push('spot')
    if (hit.usedQuality !== null && hit.usedQuality !== k.quality) {
      parts.push(`q${hit.usedQuality}`)
    }
    const sourceTag = parts.join(':')
    const warningLevel = hit.fallbackTier === 'exact' ? null : hit.fallbackTier
    const { error } = await db
      .from('shop_inventory')
      .update({
        auto_price_silver: hit.price,
        price_source: sourceTag,
        price_warning_level: warningLevel,
        price_updated_at: now,
        updated_at: now,
      })
      .eq('guild_id', guildId)
      .eq('unique_name', k.uniqueName)
      .eq('enchant', k.enchant)
      .eq('quality', k.quality)
    if (error) {
      return {
        requested: keys.length,
        updated,
        missing,
        error: error.message,
      }
    }
    updated += 1
  }

  return { requested: keys.length, updated, missing }
}
