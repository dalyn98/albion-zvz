'use server'

// 재고/가격 관리자 액션.
// - syncShopPrices: AODP 최저가 조회 후 auto_price_silver 갱신
// - updateInventoryStock: 재고 수동 보정
// - setManualPrice / clearManualPrice: 포인트 가격 수동 고정 / 자동으로 복귀
// - deleteInventoryRow: 재고=0 && 수동 가격 없음인 행 제거 (정리용)

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { syncTenantShopPrices } from '@/lib/shop/price-sync'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'

export interface PriceSyncSummary {
  requested: number
  updated: number
  missing: number
  error?: string
}

const INVENTORY_MANAGE_CAPS = [CAP.INVENTORY_MANAGE, CAP.SHOP_PRICING] as const
const SHOP_PRICING_CAPS = [CAP.SHOP_PRICING, CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

export async function syncShopPrices(): Promise<PriceSyncSummary> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) {
      return { requested: 0, updated: 0, missing: 0, error: 'Unauthorized' }
    }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability(SHOP_PRICING_CAPS)

    const result = await syncTenantShopPrices(db, guildId)
    if (result.error) {
      return {
        ...result,
        error: tErr('priceUpdateFailed', { uniqueName: '', reason: result.error }),
      }
    }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    return result
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
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    if (!Number.isInteger(stock) || stock < 0) return { error: tErr('nonNegativeInteger') }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability(INVENTORY_MANAGE_CAPS)
    const { error } = await db
      .from('shop_inventory')
      .update({ stock, updated_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetId: id,
      targetKind: 'shop_item',
      details: { kind: 'manual_stock_edit', stock },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function setManualPrice(
  id: string,
  pointPrice: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    if (!Number.isInteger(pointPrice) || pointPrice < 0) return { error: tErr('nonNegativeInteger') }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.SHOP_PRICING])
    const { error } = await db
      .from('shop_inventory')
      .update({
        manual_price: pointPrice,
        price_source: 'manual',
        // 수동 가격은 AODP 경고와 무관 — 배지를 지우고 관리자가 정한 값 그대로 노출.
        price_warning_level: null,
        price_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.price.update',
      targetId: id,
      targetKind: 'shop_item',
      details: { kind: 'manual_set', pointPrice },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function clearManualPrice(id: string): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.SHOP_PRICING])
    const { error } = await db
      .from('shop_inventory')
      .update({
        manual_price: null,
        // price_source/price_updated_at 은 auto 값이 마지막으로 채워졌을 때 갱신됨 — 여기서는 건드리지 않음.
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.price.update',
      targetId: id,
      targetKind: 'shop_item',
      details: { kind: 'manual_clear' },
    })
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

export interface RebuildInventoryResult {
  beforeTotal: number
  afterTotal: number
  changedItems: number
  restored: number
  cleared: number
  increased: number
  decreased: number
  error?: string
}

// 전 재고의 stock 을 0 으로 초기화하고 shop_chest_logs 원본도 삭제한다.
// DB 트리거가 stock<=0 행을 정리하므로 재고 행에 묶인 가격 메타는 사라질 수 있다.
// 로그를 같이 지워야 동일 로그 재임포트가 dedupe 에 막히지 않는다.
// shop_orders, shop_blacklist, shop_name_overrides 는 건드리지 않음.
export async function resetShopInventory(): Promise<ResetInventoryResult> {
  const tErr = await getTranslations('adminActionError')
  const empty: ResetInventoryResult = { stockRowsZeroed: 0, logsDeleted: 0 }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])

    const { data: zeroed, error: zeroErr } = await db
      .from('shop_inventory')
      .update({ stock: 0, updated_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .gt('stock', 0)
      .select('id')
    if (zeroErr) return { ...empty, error: zeroErr.message }

    const { data: deleted, error: delErr } = await db
      .from('shop_chest_logs')
      .delete()
      .eq('guild_id', guildId)
      .not('id', 'is', null)
      .select('id')
    if (delErr) {
      return {
        stockRowsZeroed: zeroed?.length ?? 0,
        logsDeleted: 0,
        error: tErr('logDeleteFailed', { reason: delErr.message }),
      }
    }

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'inventory.reset',
        stockRowsZeroed: zeroed?.length ?? 0,
        logsDeleted: deleted?.length ?? 0,
      },
    })
    return {
      stockRowsZeroed: zeroed?.length ?? 0,
      logsDeleted: deleted?.length ?? 0,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

function parseRebuildResult(raw: unknown): RebuildInventoryResult {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    beforeTotal: Number(obj.before_total ?? 0),
    afterTotal: Number(obj.after_total ?? 0),
    changedItems: Number(obj.changed_items ?? 0),
    restored: Number(obj.restored ?? 0),
    cleared: Number(obj.cleared ?? 0),
    increased: Number(obj.increased ?? 0),
    decreased: Number(obj.decreased ?? 0),
  }
}

export async function rebuildShopInventoryFromOperatingStart(): Promise<RebuildInventoryResult> {
  const empty: RebuildInventoryResult = {
    beforeTotal: 0,
    afterTotal: 0,
    changedItems: 0,
    restored: 0,
    cleared: 0,
    increased: 0,
    decreased: 0,
  }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])
    const operatingStart = await getLogOperatingStart('shopChest', guildId)

    const { data, error } = await db.rpc('rebuild_shop_inventory_from_chest_logs', {
      p_guild_id: guildId,
      p_start_at: operatingStart?.toISOString() ?? null,
    })
    if (error) return { ...empty, error: error.message }

    const result = parseRebuildResult(data)
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'inventory.rebuild_from_operating_start',
        operatingStartAt: operatingStart?.toISOString() ?? null,
        beforeTotal: result.beforeTotal,
        afterTotal: result.afterTotal,
        changedItems: result.changedItems,
      },
    })
    return result
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function deleteInventoryRow(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])
    // 안전장치: 재고 > 0 인 행은 실수로 지우지 않게 거부.
    const { data: row, error: readErr } = await db
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (readErr) return { error: readErr.message }
    if (!row) return { error: tErr('inventoryNotFound') }
    if ((row.stock as number) > 0) {
      return { error: tErr('cannotDeleteNonEmptyInventory') }
    }
    const { error } = await db.from('shop_inventory').delete().eq('guild_id', guildId).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.remove',
      targetId: id,
      targetKind: 'shop_item',
      details: { kind: 'row.delete' },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
