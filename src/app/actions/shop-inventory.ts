'use server'

// 재고/가격 관리자 액션.
// - syncShopPrices: AODP 최저가 조회 후 auto_price_silver 갱신
// - updateInventoryStock: 재고 수동 보정
// - setManualPrice / clearManualPrice: 포인트 가격 수동 고정 / 자동으로 복귀
// - resetShopInventory: 현재 길드의 상점 아이템 전체 삭제 + 원본 로그 삭제 + baseline 비활성화 + pending 주문 취소
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
import { revalidatePublicShopCache } from '@/lib/shop/cache'

export interface PriceSyncSummary {
  requested: number
  updated: number
  missing: number
  error?: string
}

const INVENTORY_MANAGE_CAPS = [CAP.INVENTORY_MANAGE, CAP.SHOP_PRICING] as const
const SHOP_PRICING_CAPS = [CAP.SHOP_PRICING, CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

function revalidateShopSurfaces(guildId: string): void {
  revalidatePublicShopCache(guildId)
  revalidatePath('/shop')
}

interface StockAdjustmentRpcResult {
  inventoryId: string
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string
  beforeStock: number
  afterStock: number
}

function parseStockAdjustmentResult(
  raw: unknown,
  fallbackId: string,
  fallbackStock: number,
): StockAdjustmentRpcResult {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    inventoryId: String(obj.inventory_id ?? fallbackId),
    uniqueName: String(obj.unique_name ?? ''),
    enchant: Number(obj.enchant ?? 0),
    quality: Number(obj.quality ?? 1),
    nameKo: String(obj.name_ko ?? ''),
    beforeStock: Number(obj.before_stock ?? fallbackStock),
    afterStock: Number(obj.after_stock ?? fallbackStock),
  }
}

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
    revalidateShopSurfaces(guildId)
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
    const { data, error } = await db.rpc('set_shop_inventory_stock', {
      p_guild_id: guildId,
      p_inventory_id: id,
      p_admin_id: session.discordId,
      p_stock: stock,
    })
    if (error) {
      if (error.message.includes('INVENTORY_NOT_FOUND')) {
        return { error: tErr('inventoryNotFound') }
      }
      if (error.message.includes('INVALID_STOCK')) {
        return { error: tErr('nonNegativeInteger') }
      }
      return { error: error.message }
    }
    const adjustment = parseStockAdjustmentResult(data, id, stock)
    revalidatePath('/admin/dashboard/shop')
    revalidateShopSurfaces(guildId)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetId: id,
      targetKind: 'shop_item',
      details: {
        kind: 'manual_stock_edit',
        stock,
        beforeStock: adjustment.beforeStock,
        afterStock: adjustment.afterStock,
        uniqueName: adjustment.uniqueName,
        enchant: adjustment.enchant,
        quality: adjustment.quality,
        nameKo: adjustment.nameKo,
      },
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
    revalidateShopSurfaces(guildId)
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
    revalidateShopSurfaces(guildId)
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
  inventoryRowsDeleted: number
  logsDeleted: number
  ordersCancelled: number
  baselinesSuperseded: number
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

function countFromRpc(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

function parseResetInventoryResult(raw: unknown): Omit<ResetInventoryResult, 'error'> {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    inventoryRowsDeleted: countFromRpc(obj.inventory_rows_deleted),
    logsDeleted: countFromRpc(obj.logs_deleted),
    ordersCancelled: countFromRpc(obj.orders_cancelled),
    baselinesSuperseded: countFromRpc(obj.baselines_superseded),
  }
}

// 현재 길드의 상점 아이템 행 전체와 shop_chest_logs 원본을 삭제하고 pending 주문을 취소한다.
// 가격 메타데이터까지 함께 지워 "상점 아이템 없음" 상태로 되돌린다.
// confirmed baseline 은 superseded 로 바꿔 이후 재빌드가 이전 스냅샷을 되살리지 않게 한다.
// 로그를 같이 지워야 동일 로그 재임포트가 dedupe 에 막히지 않는다.
// approved/rejected/cancelled 주문, shop_blacklist, shop_name_overrides 는 건드리지 않음.
export async function resetShopInventory(): Promise<ResetInventoryResult> {
  const t = await getTranslations('adminShopInventory')
  const empty: ResetInventoryResult = {
    inventoryRowsDeleted: 0,
    logsDeleted: 0,
    ordersCancelled: 0,
    baselinesSuperseded: 0,
  }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])

    const { data, error } = await db.rpc('reset_shop_inventory_all', {
      p_guild_id: guildId,
      p_admin_id: session.discordId,
      p_cancel_note: t('resetAutoCancelNote'),
    })
    if (error) return { ...empty, error: error.message }

    const result = parseResetInventoryResult(data)
    revalidatePath('/admin/dashboard/shop')
    revalidateShopSurfaces(guildId)
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.remove',
      targetKind: 'shop_item',
      details: {
        kind: 'inventory.reset_all',
        inventoryRowsDeleted: result.inventoryRowsDeleted,
        logsDeleted: result.logsDeleted,
        ordersCancelled: result.ordersCancelled,
        baselinesSuperseded: result.baselinesSuperseded,
      },
    })
    return result
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
    revalidateShopSurfaces(guildId)
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
    revalidateShopSurfaces(guildId)
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
