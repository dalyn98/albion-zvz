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
// AODP 호출 비용: fetchAodpPrices 가 100 개 chunk 로 나눠 요청한다.
// shop_inventory 는 1000 행 단위로 전부 페이지 조회하고, DB 갱신은 batch RPC 로
// 묶어 per-row round trip 을 피한다.

import {
  fetchAodpPrices,
  inventoryKey,
  loadAodpOptions,
  type AodpPriceKey,
  type AodpOptions,
} from '@/lib/shop/aodp'
import { loadShopInventoryPriceKeyRows } from '@/lib/shop/inventory-queries'
import { canonicalShopQuality } from '@/lib/shop/quality'
import { isMissingRpcError } from '@/lib/supabase-rpc-errors'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceSyncTenantResult {
  requested: number
  updated: number
  missing: number
  error?: string
}

const PRICE_UPDATE_BATCH_SIZE = 500
const SHOP_PRICE_QUALITY = canonicalShopQuality()

interface PriceUpdatePayload {
  unique_name: string
  enchant: number
  quality: number
  auto_price_silver: number
  price_source: string
  price_warning_level: string | null
  price_updated_at: string
  updated_at: string
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function applyPriceUpdatesIndividually(
  db: SupabaseClient,
  guildId: string,
  updates: readonly PriceUpdatePayload[],
): Promise<{ updated: number; error?: string }> {
  let updated = 0
  for (const update of updates) {
    const { error } = await db
      .from('shop_inventory')
      .update({
        auto_price_silver: update.auto_price_silver,
        price_source: update.price_source,
        price_warning_level: update.price_warning_level,
        price_updated_at: update.price_updated_at,
        updated_at: update.updated_at,
      })
      .eq('guild_id', guildId)
      .eq('unique_name', update.unique_name)
      .eq('enchant', update.enchant)
    if (error) return { updated, error: error.message }
    updated += 1
  }
  return { updated }
}

export async function syncTenantShopPrices(
  db: SupabaseClient,
  guildId: string,
): Promise<PriceSyncTenantResult> {
  const inventory = await loadShopInventoryPriceKeyRows(db, guildId)
  if (inventory.error) {
    return { requested: 0, updated: 0, missing: 0, error: inventory.error }
  }

  const keys: AodpPriceKey[] = inventory.rows.map((r) => ({
    uniqueName: r.unique_name,
    enchant: r.enchant,
    quality: r.quality,
  }))
  if (keys.length === 0) return { requested: 0, updated: 0, missing: 0 }

  const aodpOptions = await loadAodpOptions(guildId)
  const shopPriceOptions: AodpOptions = {
    ...aodpOptions,
    minQuality: SHOP_PRICE_QUALITY,
    qualityAgnostic: false,
  }
  const priceMap = await fetchAodpPrices(keys, shopPriceOptions)

  let updated = 0
  let missing = 0
  const now = new Date().toISOString()
  const updates: PriceUpdatePayload[] = []

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
    updates.push({
      unique_name: k.uniqueName,
      enchant: k.enchant,
      quality: k.quality,
      auto_price_silver: hit.price,
      price_source: sourceTag,
      price_warning_level: warningLevel,
      price_updated_at: now,
      updated_at: now,
    })
  }

  for (const batch of chunk(updates, PRICE_UPDATE_BATCH_SIZE)) {
    const { data, error } = await db.rpc('apply_shop_inventory_price_updates', {
      p_guild_id: guildId,
      p_updates: batch,
    })
    if (error) {
      if (isMissingRpcError(error, 'apply_shop_inventory_price_updates')) {
        const fallback = await applyPriceUpdatesIndividually(db, guildId, updates)
        const result: PriceSyncTenantResult = {
          requested: keys.length,
          updated: fallback.updated,
          missing,
        }
        if (fallback.error) result.error = fallback.error
        return result
      }
      return {
        requested: keys.length,
        updated,
        missing,
        error: error.message,
      }
    }
    const applied = Number(data ?? batch.length)
    updated += Number.isFinite(applied) ? applied : batch.length
  }

  return { requested: keys.length, updated, missing }
}
