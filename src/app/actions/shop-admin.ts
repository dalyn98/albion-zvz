'use server'

// 길드 상점 관리자 액션.
// - importChestLog: 붙여넣은 상자 로그 파싱 → 원본 보존 + 재고 반영 + 시세 sync
// - addBlacklist / removeBlacklist: 잡템 필터

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'
import { aggregateStock, type AggregateRow } from '@/lib/shop/aggregate-stock'
import {
  buildOrderedStockReplayDeltas,
  stockReplayKey,
  summarizeStockReplayChanges,
  type StockReplayDelta,
} from '@/lib/shop/stock-replay'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { summarizeLogContinuity } from '@/lib/log-continuity'
import { selectOfficialLogEntries } from '@/lib/log-import-official'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { getPointBalancesByMember } from '@/lib/point-ledger'
import { syncShopPrices, type PriceSyncSummary } from './shop-inventory'

export interface ImportSummary {
  parsed: number
  parseErrors: Array<{ line: number; text: string; reason: string }>
  inserted: number
  duplicatesSkipped: number
  skippedBeforeStart: number
  blacklistedRows: number
  unresolvedRows: number
  unresolvedNames: string[]
  stockChanges: Array<{
    uniqueName: string
    nameKo: string
    enchant: number
    quality: number
    delta: number
    newStock: number
  }>
  // DB 전체에서 가장 최신 logged_at 행 — 사용자에게 "어디까지 이어졌는지" 보여주기 위함.
  lastKnownLoggedAt: string | null
  lastKnownLabel: string | null
  // 붙여넣은 배치 안에 DB 최신 행과 일치하는 entry 가 있는가. true 면 배치가 이어진다는 근거.
  lastKnownInBatch: boolean
  // 이번 배치에서 DB 최신 행 이후로 발생한 신규 entry 개수. 0 이면 저장할 게 없음.
  newEntriesAfterLast: number
  // DB 최신 logged_at 과 이 배치의 "DB 이후 첫 entry" 사이의 시간 차 (ms).
  // lastKnownInBatch=false 이고 배치에 DB 이후 entry 가 있을 때만 계산 — 그 외엔 null.
  // 이 값이 크면 인게임 로그가 잘리기 전에 중간 구간을 놓쳤을 가능성이 큼.
  gapFromLastKnownMs: number | null
  priceSync?: PriceSyncSummary
  error?: string
}

const IMPORT_ROW_LIMIT = 5000
// 승인/거절 시 admin 메모 최대 길이. 컬럼 자체에는 길이 제약이 없지만 UI 와
// DB 양쪽에서 비정상적으로 큰 입력을 막아 두면 페이지 렌더가 깨지지 않는다.
const ADMIN_NOTE_MAX_LENGTH = 1000
const SHOP_IMPORT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const
const SHOP_REVIEW_CAPS = [CAP.INVENTORY_MANAGE, CAP.INVENTORY_DELIVER] as const

export interface ImportOptions {
  // true 면 DB insert / 재고 RPC / 시세 동기화 / revalidate 모두 스킵하고
  // 예측 결과만 반환 — 붙여넣기 미리보기용.
  dryRun?: boolean
}

function dedupeKey(e: {
  loggedAt: Date
  player: string
  itemName: string
  enchant: number
  quality: number
  quantity: number
}): string {
  return [
    e.loggedAt.toISOString(),
    e.player,
    e.itemName,
    e.enchant,
    e.quality,
    e.quantity,
  ].join('|')
}

function chestLogLabel(entry: { itemName: string; quantity: number }): string {
  const sign = entry.quantity > 0 ? '+' : ''
  return `${entry.itemName} ${sign}${entry.quantity}`
}

async function loadCurrentStockByKey(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  deltas: readonly StockReplayDelta[],
): Promise<Map<string, number>> {
  const uniqueNames = Array.from(new Set(deltas.map((d) => d.uniqueName)))
  const stockByKey = new Map<string, number>()
  if (uniqueNames.length === 0) return stockByKey
  const { data } = await db
    .from('shop_inventory')
    .select('unique_name, enchant, quality, stock')
    .eq('guild_id', guildId)
    .in('unique_name', uniqueNames)
  for (const row of data ?? []) {
    stockByKey.set(
      stockReplayKey({
        uniqueName: row.unique_name as string,
        enchant: row.enchant as number,
        quality: row.quality as number,
      }),
      row.stock as number,
    )
  }
  return stockByKey
}

export async function importChestLog(
  raw: string,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const tErr = await getTranslations('adminActionError')
  const dryRun = options.dryRun === true
  const empty: ImportSummary = {
    parsed: 0,
    parseErrors: [],
    inserted: 0,
    duplicatesSkipped: 0,
    skippedBeforeStart: 0,
    blacklistedRows: 0,
    unresolvedRows: 0,
    unresolvedNames: [],
    stockChanges: [],
    lastKnownLoggedAt: null,
    lastKnownLabel: null,
    lastKnownInBatch: false,
    newEntriesAfterLast: 0,
    gapFromLastKnownMs: null,
  }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: 'Unauthorized' }
    const db = await requireAnyCapability(SHOP_IMPORT_CAPS)
    const guildId = await getSessionGuildId(session)
    const operatingStart = await getLogOperatingStart('shopChest', guildId)

    const { entries: parsedEntries, errors } = parseChestLog(raw)
    if (parsedEntries.length === 0) {
      return {
        ...empty,
        parseErrors: errors,
        error: errors.length
          ? tErr('importNoParseableRows')
          : tErr('importEmptyLog'),
      }
    }
    if (parsedEntries.length > IMPORT_ROW_LIMIT) {
      return {
        ...empty,
        parseErrors: errors,
        error: tErr('importRowLimit', { max: IMPORT_ROW_LIMIT, current: parsedEntries.length }),
      }
    }

    const official = selectOfficialLogEntries(
      parsedEntries,
      (entry) => entry.loggedAt,
      operatingStart,
    )
    const entries = official.entries
    if (entries.length === 0) {
      return {
        ...empty,
        parsed: parsedEntries.length,
        parseErrors: errors,
        skippedBeforeStart: official.skippedBeforeStart,
      }
    }

    // 블랙리스트 로드
    const { data: blacklistRows } = await db
      .from('shop_blacklist')
      .select('item_name_raw')
      .eq('guild_id', guildId)
    const blacklist = new Set((blacklistRows ?? []).map((r) => r.item_name_raw))

    // 중복 검출: 임포트 행들의 logged_at 범위를 잡아 기존 로그를 한 번에 조회 →
    // dedupe 키 세트로 비교. UNIQUE 제약이 있어 INSERT 중 레이스가 발생해도
    // 결국 DB 가 거절하지만, 사전 필터로 "실제로 새로 쓴 행" 만 재고에 반영한다.
    const loggedTimes = entries.map((e) => e.loggedAt.getTime())
    const minLogged = new Date(Math.min(...loggedTimes)).toISOString()
    const maxLogged = new Date(Math.max(...loggedTimes)).toISOString()
    const { data: existingRows, error: existingErr } = await db
      .from('shop_chest_logs')
      .select('logged_at, player, item_name_raw, enchant, quality, quantity')
      .eq('guild_id', guildId)
      .gte('logged_at', minLogged)
      .lte('logged_at', maxLogged)
    if (existingErr) return { ...empty, parseErrors: errors, error: existingErr.message }

    const existingKeys = new Set(
      (existingRows ?? []).map((r) =>
        dedupeKey({
          loggedAt: new Date(r.logged_at as string),
          player: r.player as string,
          itemName: r.item_name_raw as string,
          enchant: r.enchant as number,
          quality: r.quality as number,
          quantity: r.quantity as number,
        }),
      ),
    )

    const isNewEntry = (e: ChestLogEntry) =>
      !existingKeys.has(dedupeKey({ ...e, itemName: e.itemName }))

    const newEntries = entries.filter(isNewEntry)
    const duplicatesSkipped = entries.length - newEntries.length

    // 마지막 로그 감지 — DB 전체에서 가장 최신 timestamp 의 모든 행을 조회.
    // 사용자에게 "이 지점까지 저장돼있고, 그 이후 N건이 신규" 를 알려주기 위함.
    let latestQuery = db
      .from('shop_chest_logs')
      .select('logged_at, player, item_name_raw, enchant, quality, quantity')
      .eq('guild_id', guildId)
    if (operatingStart) {
      latestQuery = latestQuery.gte('logged_at', operatingStart.toISOString())
    }
    const { data: latestRow, error: latestErr } = await latestQuery
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestErr) return { ...empty, parseErrors: errors, error: latestErr.message }

    let latestStoredEntries: ChestLogEntry[] = []
    if (latestRow) {
      const { data: latestRows, error: latestRowsErr } = await db
        .from('shop_chest_logs')
        .select('logged_at, player, item_name_raw, enchant, quality, quantity')
        .eq('guild_id', guildId)
        .eq('logged_at', latestRow.logged_at as string)
        .order('player', { ascending: true })
        .order('item_name_raw', { ascending: true })
        .order('quantity', { ascending: true })
      if (latestRowsErr) return { ...empty, parseErrors: errors, error: latestRowsErr.message }
      latestStoredEntries = (latestRows ?? []).map((row) => ({
        loggedAt: new Date(row.logged_at as string),
        player: row.player as string,
        itemName: row.item_name_raw as string,
        enchant: row.enchant as number,
        quality: row.quality as number,
        quantity: row.quantity as number,
      }))
    }
    const {
      lastKnownLoggedAt,
      lastKnownLabel,
      lastKnownInBatch,
      newEntriesAfterLast,
      gapFromLastKnownMs,
    } = summarizeLogContinuity({
      allEntries: entries,
      newEntries,
      latestStoredEntries,
      getLoggedAt: (entry) => entry.loggedAt,
      getKey: dedupeKey,
      getLabel: chestLogLabel,
    })

    // 집계 (원본 보존 + 재고 델타)
    const rows: AggregateRow[] = newEntries.map((entry) => ({
      entry,
      resolved: resolveKoItem(entry.itemName),
      isBlacklisted: blacklist.has(entry.itemName),
    }))
    const { toInsert, unresolvedNames } = aggregateStock(rows)
    const stockDeltas = buildOrderedStockReplayDeltas(rows)

    const blacklistedRows = newEntries.filter((e) => blacklist.has(e.itemName)).length
    const unresolvedRows = newEntries.filter(
      (e) => !blacklist.has(e.itemName) && !resolveKoItem(e.itemName),
    ).length

    let stockChanges: ImportSummary['stockChanges'] = []

    if (dryRun) {
      // 미리보기: 현재 재고를 조회해 "적용 시 예상 재고" 를 계산한다. DB 는 건드리지 않음.
      const existingStockByKey = await loadCurrentStockByKey(db, guildId, stockDeltas)
      stockChanges = summarizeStockReplayChanges(existingStockByKey, stockDeltas)
      return {
        parsed: parsedEntries.length,
        parseErrors: errors,
        inserted: 0,
        duplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        blacklistedRows,
        unresolvedRows,
        unresolvedNames,
        stockChanges,
        lastKnownLoggedAt,
        lastKnownLabel,
        lastKnownInBatch,
        newEntriesAfterLast,
        gapFromLastKnownMs,
      }
    }

    // 원본 로그 INSERT. 배치 크기 500 으로 나눠 대용량도 안전하게.
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH).map((r) => ({
        guild_id: guildId,
        logged_at: r.loggedAt.toISOString(),
        import_sequence: r.importSequence,
        player: r.player,
        item_name_raw: r.itemNameRaw,
        enchant: r.enchant,
        quality: r.quality,
        quantity: r.quantity,
        unique_name: r.uniqueName,
        imported_by: session.discordId,
      }))
      const { error } = await db.from('shop_chest_logs').insert(slice)
      if (error) {
        // UNIQUE 제약 위반(동시 임포트)은 무시하고 통계만 조정.
        if (!error.message.includes('duplicate key')) {
          return { ...empty, parseErrors: errors, error: error.message }
        }
      } else {
        inserted += slice.length
      }
    }

    // 재고 RPC 호출 — 저장된 로그와 같은 시간 순서로 적용한다. 출고 로그가 먼저
    // 나오더라도 뒤따르는 입고를 잃지 않게 해야 rebuild/import 결과가 일치한다.
    const initialStockByKey = await loadCurrentStockByKey(db, guildId, stockDeltas)
    for (const d of stockDeltas) {
      const { error } = await db.rpc('apply_shop_stock_delta', {
        p_guild_id: guildId,
        p_unique_name: d.uniqueName,
        p_enchant: d.enchant,
        p_quality: d.quality,
        p_delta: d.delta,
        p_name_ko: d.nameKo,
        p_category: d.category,
        p_tier: d.tier,
      })
      if (error) {
        return {
          parsed: parsedEntries.length,
          parseErrors: errors,
          inserted,
          duplicatesSkipped,
          skippedBeforeStart: official.skippedBeforeStart,
          blacklistedRows,
          unresolvedRows,
          unresolvedNames,
          stockChanges,
          lastKnownLoggedAt,
          lastKnownLabel,
          lastKnownInBatch,
          newEntriesAfterLast,
          gapFromLastKnownMs,
          error: tErr('stockApplyFailed', { uniqueName: d.uniqueName, reason: error.message }),
        }
      }
    }
    stockChanges = summarizeStockReplayChanges(initialStockByKey, stockDeltas)

    // 재고가 갱신됐으므로 AODP 시세도 이어서 sync — 실패해도 import 결과는 그대로 반환.
    const priceSync = await syncShopPrices()

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'chest.import',
        inserted,
        duplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        stockChanges: stockChanges.length,
        unresolvedRows,
      },
    })

    return {
      parsed: parsedEntries.length,
      parseErrors: errors,
      inserted,
      duplicatesSkipped,
      skippedBeforeStart: official.skippedBeforeStart,
      blacklistedRows,
      unresolvedRows,
      unresolvedNames,
      stockChanges,
      lastKnownLoggedAt,
      lastKnownLabel,
      lastKnownInBatch,
      newEntriesAfterLast,
      gapFromLastKnownMs,
      priceSync,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

// 블랙리스트 관리
export async function addBlacklist(itemName: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const trimmed = itemName.trim()
    if (!trimmed) return { error: tErr('itemNameEmpty') }
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('shop_blacklist')
      .upsert({ guild_id: guildId, item_name_raw: trimmed, added_by: session.discordId })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.add',
      targetKind: 'shop_item',
      details: { kind: 'blacklist.add', itemName: trimmed },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function removeBlacklist(itemName: string): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const db = await requireAnyCapability([CAP.INVENTORY_MANAGE])
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('shop_blacklist')
      .delete()
      .eq('guild_id', guildId)
      .eq('item_name_raw', itemName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.remove',
      targetKind: 'shop_item',
      details: { kind: 'blacklist.remove', itemName },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

// ============ 주문 승인/거절 ============

export interface AdminShopOrder {
  id: string
  discordId: string
  username: string
  totalPoints: number
  balance: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  memberNote: string | null
  adminNote: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  items: Array<{
    nameKo: string
    uniqueName: string
    enchant: number
    quality: number
    quantity: number
    unitPoints: number
    subtotalPoints: number
    stockAvailable: number
  }>
}

export interface ListShopOrdersResult {
  orders: AdminShopOrder[]
  error?: string
}

export async function listShopOrders(
  scope: 'pending' | 'all' = 'pending',
): Promise<ListShopOrdersResult> {
  try {
    const session = await getSession()
    if (!session) return { orders: [], error: 'Unauthorized' }
    const db = await requireAnyCapability(SHOP_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const q = db
      .from('shop_orders')
      .select(
        'id, discord_id, username, total_points, status, member_note, admin_note, created_at, resolved_at, resolved_by',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(200)
    const { data: orders, error } =
      scope === 'pending' ? await q.eq('status', 'pending') : await q
    if (error) return { orders: [], error: error.message }
    if (!orders || orders.length === 0) return { orders: [] }

    const ids = orders.map((o) => o.id as string)
    const { data: items, error: itemsErr } = await db
      .from('shop_order_items')
      .select(
        'order_id, name_ko, unique_name, enchant, quality, quantity, unit_points, subtotal_points',
      )
      .eq('guild_id', guildId)
      .in('order_id', ids)
    if (itemsErr) return { orders: [], error: itemsErr.message }

    // 재고 확인 — 각 (unique_name, enchant, quality) 조합을 모아 한 번에 조회.
    const itemKeySet = new Set<string>()
    for (const it of items ?? []) {
      itemKeySet.add(`${it.unique_name}|${it.enchant}|${it.quality}`)
    }
    const uniqueNames = Array.from(new Set((items ?? []).map((i) => i.unique_name as string)))
    const { data: invRows } = await db
      .from('shop_inventory')
      .select('unique_name, enchant, quality, stock')
      .eq('guild_id', guildId)
      .in('unique_name', uniqueNames)
    const stockByKey = new Map<string, number>()
    for (const r of invRows ?? []) {
      stockByKey.set(
        `${r.unique_name}|${r.enchant}|${r.quality}`,
        r.stock as number,
      )
    }

    // 잔액 — 전부 한 번에.
    const discordIds = Array.from(new Set(orders.map((o) => o.discord_id as string)))
    const { balances: balanceByUser, error: balancesError } =
      await getPointBalancesByMember(db, guildId, discordIds)
    if (balancesError) return { orders: [], error: balancesError }

    const itemsByOrder = new Map<string, AdminShopOrder['items']>()
    for (const it of items ?? []) {
      const key = it.order_id as string
      const arr = itemsByOrder.get(key) ?? []
      arr.push({
        nameKo: it.name_ko as string,
        uniqueName: it.unique_name as string,
        enchant: it.enchant as number,
        quality: it.quality as number,
        quantity: it.quantity as number,
        unitPoints: it.unit_points as number,
        subtotalPoints: it.subtotal_points as number,
        stockAvailable:
          stockByKey.get(`${it.unique_name}|${it.enchant}|${it.quality}`) ?? 0,
      })
      itemsByOrder.set(key, arr)
    }

    return {
      orders: orders.map((o) => ({
        id: o.id as string,
        discordId: o.discord_id as string,
        username: o.username as string,
        totalPoints: o.total_points as number,
        balance: balanceByUser.get(o.discord_id as string) ?? 0,
        status: o.status as AdminShopOrder['status'],
        memberNote: (o.member_note as string | null) ?? null,
        adminNote: (o.admin_note as string | null) ?? null,
        createdAt: o.created_at as string,
        resolvedAt: (o.resolved_at as string | null) ?? null,
        resolvedBy: (o.resolved_by as string | null) ?? null,
        items: itemsByOrder.get(o.id as string) ?? [],
      })),
    }
  } catch (e) {
    return { orders: [], error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function approveShopOrder(
  orderId: string,
  adminNote?: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const trimmedNote = adminNote?.trim() || null
    if (trimmedNote && trimmedNote.length > ADMIN_NOTE_MAX_LENGTH) {
      return { error: tErr('adminNoteTooLong', { max: ADMIN_NOTE_MAX_LENGTH }) }
    }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_DELIVER])
    const { error } = await db.rpc('approve_shop_order', {
      p_id: orderId,
      p_admin_id: session.discordId,
      p_guild_id: guildId,
      p_admin_note: trimmedNote,
    })
    if (error) {
      // RPC raise exception 메시지를 사용자 친화 문구로.
      if (error.message.includes('INSUFFICIENT_BALANCE')) {
        return { error: tErr('insufficientPoints') }
      }
      if (error.message.includes('INSUFFICIENT_STOCK')) {
        return { error: tErr('orderInsufficientStock') }
      }
      if (error.message.includes('ORDER_NOT_PENDING')) {
        return { error: tErr('orderAlreadyProcessed') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.order.approve',
      targetId: orderId,
      targetKind: 'shop_order',
      details: { adminNote: trimmedNote },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function rejectShopOrder(
  orderId: string,
  adminNote?: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const trimmedNote = adminNote?.trim() || null
    if (trimmedNote && trimmedNote.length > ADMIN_NOTE_MAX_LENGTH) {
      return { error: tErr('adminNoteTooLong', { max: ADMIN_NOTE_MAX_LENGTH }) }
    }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_DELIVER])
    const { error } = await db.rpc('reject_shop_order', {
      p_id: orderId,
      p_admin_id: session.discordId,
      p_guild_id: guildId,
      p_admin_note: trimmedNote,
    })
    if (error) {
      if (error.message.includes('ORDER_NOT_PENDING')) {
        return { error: tErr('orderAlreadyProcessed') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.order.reject',
      targetId: orderId,
      targetKind: 'shop_order',
      details: { adminNote: trimmedNote },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
