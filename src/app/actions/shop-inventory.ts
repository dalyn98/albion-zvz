'use server'

// 재고/가격 관리자 액션.
// - syncShopPrices: AODP 최저가 조회 후 auto_price_silver 갱신
// - updateInventoryStock: 재고 수동 보정
// - setManualPrice / clearManualPrice: 포인트 가격 수동 고정 / 자동으로 복귀
// - deleteInventoryRow: 재고=0 && 수동 가격 없음인 행 제거 (정리용)

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import {
  fetchAodpPrices,
  inventoryKey,
  loadAodpOptions,
  type AodpPriceKey,
} from '@/lib/shop/aodp'

export interface PriceSyncSummary {
  requested: number
  updated: number
  missing: number
  error?: string
}

const MAX_SYNC_ROWS = 500

export async function syncShopPrices(): Promise<PriceSyncSummary> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return { requested: 0, updated: 0, missing: 0, error: 'Unauthorized' }
    }
    const db = await requireAdmin()

    const { data: rows, error: rowErr } = await db
      .from('shop_inventory')
      .select('unique_name, enchant, quality')
      .limit(MAX_SYNC_ROWS)
    if (rowErr) return { requested: 0, updated: 0, missing: 0, error: rowErr.message }

    const keys: AodpPriceKey[] = (rows ?? []).map((r) => ({
      uniqueName: r.unique_name as string,
      enchant: r.enchant as number,
      quality: r.quality as number,
    }))
    if (keys.length === 0) return { requested: 0, updated: 0, missing: 0 }

    const aodpOptions = await loadAodpOptions()
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
      const { error } = await db
        .from('shop_inventory')
        .update({
          auto_price_silver: hit.price,
          price_source: sourceTag,
          price_updated_at: now,
          updated_at: now,
        })
        .eq('unique_name', k.uniqueName)
        .eq('enchant', k.enchant)
        .eq('quality', k.quality)
      if (error) {
        return {
          requested: keys.length,
          updated,
          missing,
          error: `${k.uniqueName} 업데이트 실패: ${error.message}`,
        }
      }
      updated += 1
    }

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return { requested: keys.length, updated, missing }
  } catch (e) {
    return {
      requested: 0,
      updated: 0,
      missing: 0,
      error: e instanceof Error ? e.message : 'Server error',
    }
  }
}

export async function updateInventoryStock(
  id: string,
  stock: number,
): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    if (!Number.isInteger(stock) || stock < 0) return { error: '재고는 0 이상 정수.' }
    const db = await requireAdmin()
    const { error } = await db
      .from('shop_inventory')
      .update({ stock, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function setManualPrice(
  id: string,
  pointPrice: number,
): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    if (!Number.isInteger(pointPrice) || pointPrice < 0) return { error: '가격은 0 이상 정수.' }
    const db = await requireAdmin()
    const { error } = await db
      .from('shop_inventory')
      .update({
        manual_price: pointPrice,
        price_source: 'manual',
        price_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function clearManualPrice(id: string): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    const db = await requireAdmin()
    const { error } = await db
      .from('shop_inventory')
      .update({
        manual_price: null,
        // price_source/price_updated_at 은 auto 값이 마지막으로 채워졌을 때 갱신됨 — 여기서는 건드리지 않음.
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export interface ResetInventoryResult {
  stockRowsZeroed: number
  logsDeleted: number
  error?: string
}

// 전 재고의 stock 을 0 으로 초기화하고 shop_chest_logs 원본도 삭제한다.
// manual_price, auto_price, 카테고리 등 행 자체는 보존 — 다음 임포트 때
// pricing config 가 재사용되게 둔다. 로그를 같이 지워야 동일 로그 재임포트가
// dedupe 에 막히지 않는다. shop_orders, shop_blacklist, shop_name_overrides 는
// 건드리지 않음.
export async function resetShopInventory(): Promise<ResetInventoryResult> {
  const empty: ResetInventoryResult = { stockRowsZeroed: 0, logsDeleted: 0 }
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { ...empty, error: 'Unauthorized' }
    const db = await requireAdmin()

    const { data: zeroed, error: zeroErr } = await db
      .from('shop_inventory')
      .update({ stock: 0, updated_at: new Date().toISOString() })
      .gt('stock', 0)
      .select('id')
    if (zeroErr) return { ...empty, error: zeroErr.message }

    const { data: deleted, error: delErr } = await db
      .from('shop_chest_logs')
      .delete()
      .not('id', 'is', null)
      .select('id')
    if (delErr) {
      return {
        stockRowsZeroed: zeroed?.length ?? 0,
        logsDeleted: 0,
        error: `로그 삭제 실패: ${delErr.message}`,
      }
    }

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return {
      stockRowsZeroed: zeroed?.length ?? 0,
      logsDeleted: deleted?.length ?? 0,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function deleteInventoryRow(id: string): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    const db = await requireAdmin()
    // 안전장치: 재고 > 0 인 행은 실수로 지우지 않게 거부.
    const { data: row, error: readErr } = await db
      .from('shop_inventory')
      .select('stock')
      .eq('id', id)
      .maybeSingle()
    if (readErr) return { error: readErr.message }
    if (!row) return { error: '존재하지 않는 재고.' }
    if ((row.stock as number) > 0) {
      return { error: '재고가 남아있는 행은 지울 수 없습니다. 먼저 0 으로 조정하세요.' }
    }
    const { error } = await db.from('shop_inventory').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
