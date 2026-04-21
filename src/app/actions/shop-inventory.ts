'use server'

// 재고/가격 관리자 액션.
// - syncShopPrices: AODP 최저가 조회 후 auto_price_silver 갱신
// - updateInventoryStock: 재고 수동 보정
// - setManualPrice / clearManualPrice: 포인트 가격 수동 고정 / 자동으로 복귀
// - deleteInventoryRow: 재고=0 && 수동 가격 없음인 행 제거 (정리용)

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { fetchAodpPrices, inventoryKey, type AodpPriceKey } from '@/lib/shop/aodp'

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

    const priceMap = await fetchAodpPrices(keys)

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
      const { error } = await db
        .from('shop_inventory')
        .update({
          auto_price_silver: hit.price,
          price_source: `aodp:${hit.city}`,
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
