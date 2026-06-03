'use server'

// 길드 상점 관리자 액션.
// - importChestLog: 붙여넣은 상자 로그 파싱 → 원본 보존 + 재고 반영
// - addBlacklist / removeBlacklist: 잡템 필터

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'
import { aggregateStock, type AggregateRow } from '@/lib/shop/aggregate-stock'
import {
  applyTierEnchantSumFilter,
  parseTierEnchantSumFilter,
} from '@/lib/shop/import-tier-enchant-filter'
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

export interface ImportSummary {
  parsed: number
  parseErrors: Array<{ line: number; text: string; reason: string }>
  inserted: number
  duplicatesSkipped: number
  skippedBeforeStart: number
  blacklistedRows: number
  tierEnchantExcludedRows: number
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
  // 이번 배치에서 DB 최신 행 이후로 발생한 저장 대상 신규 entry 개수. 0 이면 저장할 게 없음.
  newEntriesAfterLast: number
  // DB 최신 logged_at 과 이 배치의 "DB 이후 첫 entry" 사이의 시간 차 (ms).
  // lastKnownInBatch=false 이고 배치에 DB 이후 entry 가 있을 때만 계산 — 그 외엔 null.
  // 이 값이 크면 인게임 로그가 잘리기 전에 중간 구간을 놓쳤을 가능성이 큼.
  gapFromLastKnownMs: number | null
  error?: string
}

const IMPORT_ROW_LIMIT = 5000
// 승인/거절 시 admin 메모 최대 길이. 컬럼 자체에는 길이 제약이 없지만 UI 와
// DB 양쪽에서 비정상적으로 큰 입력을 막아 두면 페이지 렌더가 깨지지 않는다.
const ADMIN_NOTE_MAX_LENGTH = 1000
const MAX_ORDER_TOTAL_POINTS = 2_147_483_647
const SHOP_IMPORT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const
const SHOP_REVIEW_CAPS = [CAP.INVENTORY_MANAGE, CAP.INVENTORY_DELIVER] as const
const EXISTING_DEDUPE_PAGE_SIZE = 1000
const INSERT_BATCH_SIZE = 500

type CapabilityDb = Awaited<ReturnType<typeof requireAnyCapability>>

export interface ImportOptions {
  // true 면 DB insert / 재고 RPC / revalidate 모두 스킵하고
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

function isDuplicateKeyError(error: { code?: string; message: string }): boolean {
  return error.code === '23505' || error.message.includes('duplicate key')
}

interface ExistingChestLogRow {
  id: string
  logged_at: string
  player: string
  item_name_raw: string
  enchant: number
  quality: number
  quantity: number
}

async function loadExistingChestDedupeKeys(
  db: CapabilityDb,
  guildId: string,
  minLogged: string,
  maxLogged: string,
): Promise<{ keys: Set<string>; error?: string }> {
  const keys = new Set<string>()
  let from = 0

  while (true) {
    const { data, error } = await db
      .from('shop_chest_logs')
      .select('id, logged_at, player, item_name_raw, enchant, quality, quantity')
      .eq('guild_id', guildId)
      .gte('logged_at', minLogged)
      .lte('logged_at', maxLogged)
      .order('logged_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + EXISTING_DEDUPE_PAGE_SIZE - 1)
    if (error) return { keys, error: error.message }

    const rows = (data ?? []) as ExistingChestLogRow[]
    for (const row of rows) {
      keys.add(
        dedupeKey({
          loggedAt: new Date(row.logged_at),
          player: row.player,
          itemName: row.item_name_raw,
          enchant: row.enchant,
          quality: row.quality,
          quantity: row.quantity,
        }),
      )
    }

    if (rows.length < EXISTING_DEDUPE_PAGE_SIZE) break
    from += EXISTING_DEDUPE_PAGE_SIZE
  }

  return { keys }
}

function filterNewChestLogEntries(
  entries: readonly ChestLogEntry[],
  existingKeys: ReadonlySet<string>,
): { entries: ChestLogEntry[]; duplicatesSkipped: number } {
  const seen = new Set(existingKeys)
  const newEntries: ChestLogEntry[] = []
  let duplicatesSkipped = 0

  for (const entry of entries) {
    const key = dedupeKey({ ...entry, itemName: entry.itemName })
    if (seen.has(key)) {
      duplicatesSkipped += 1
      continue
    }
    seen.add(key)
    newEntries.push(entry)
  }

  return { entries: newEntries, duplicatesSkipped }
}

interface StockApplyError {
  uniqueName: string
  message: string
}

function isMissingBatchStockDeltaRpcError(error: { code?: string; message: string }): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true
  return (
    error.message.includes('apply_shop_stock_deltas') &&
    /could not find|does not exist|schema cache/i.test(error.message)
  )
}

function toStockDeltaRpcPayload(delta: StockReplayDelta) {
  return {
    unique_name: delta.uniqueName,
    enchant: delta.enchant,
    quality: delta.quality,
    delta: delta.delta,
    name_ko: delta.nameKo,
    category: delta.category,
    tier: delta.tier,
  }
}

async function applyShopStockDeltas(
  db: CapabilityDb,
  guildId: string,
  deltas: readonly StockReplayDelta[],
): Promise<StockApplyError | null> {
  if (deltas.length === 0) return null

  const { error: batchError } = await db.rpc('apply_shop_stock_deltas', {
    p_guild_id: guildId,
    p_deltas: deltas.map(toStockDeltaRpcPayload),
  })
  if (!batchError) return null
  if (!isMissingBatchStockDeltaRpcError(batchError)) {
    return { uniqueName: 'batch', message: batchError.message }
  }

  // 배포 순서 보호: 마이그레이션이 아직 적용되지 않은 환경에서는 기존 단건 RPC 로 처리한다.
  for (const d of deltas) {
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
    if (error) return { uniqueName: d.uniqueName, message: error.message }
  }

  return null
}

async function loadCurrentStockByKey(
  db: CapabilityDb,
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

function toChestLogInsertRow(
  guildId: string,
  importedBy: string,
  row: AggregateRow,
  importSequence: number,
) {
  return {
    guild_id: guildId,
    logged_at: row.entry.loggedAt.toISOString(),
    import_sequence: importSequence,
    player: row.entry.player,
    item_name_raw: row.entry.itemName,
    enchant: row.entry.enchant,
    quality: row.entry.quality,
    quantity: row.entry.quantity,
    unique_name: row.resolved?.uniqueName ?? null,
    imported_by: importedBy,
  }
}

async function insertShopChestRows(
  db: CapabilityDb,
  guildId: string,
  importedBy: string,
  rows: readonly AggregateRow[],
): Promise<{
  insertedRows: AggregateRow[]
  duplicatesSkipped: number
  error?: string
}> {
  const insertedRows: AggregateRow[] = []
  let duplicatesSkipped = 0

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const slice = rows.slice(i, i + INSERT_BATCH_SIZE)
    const { error } = await db
      .from('shop_chest_logs')
      .insert(slice.map((row, offset) => toChestLogInsertRow(guildId, importedBy, row, i + offset)))
    if (!error) {
      insertedRows.push(...slice)
      continue
    }
    if (!isDuplicateKeyError(error)) {
      return { insertedRows, duplicatesSkipped, error: error.message }
    }

    for (let offset = 0; offset < slice.length; offset += 1) {
      const row = slice[offset]
      const { error: rowError } = await db
        .from('shop_chest_logs')
        .insert([toChestLogInsertRow(guildId, importedBy, row, i + offset)])
      if (!rowError) {
        insertedRows.push(row)
      } else if (isDuplicateKeyError(rowError)) {
        duplicatesSkipped += 1
      } else {
        return { insertedRows, duplicatesSkipped, error: rowError.message }
      }
    }
  }

  return { insertedRows, duplicatesSkipped }
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
    tierEnchantExcludedRows: 0,
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

    // 블랙리스트와 import 필터 설정은 길드 단위로 읽는다.
    const [
      { data: blacklistRows, error: blacklistErr },
      excludeAtOrBelowRaw,
      excludeAtOrAboveRaw,
    ] = await Promise.all([
      db
        .from('shop_blacklist')
        .select('item_name_raw')
        .eq('guild_id', guildId),
      getAppSetting('shop_import_exclude_tier_enchant_sum_lte', '', guildId),
      getAppSetting('shop_import_exclude_tier_enchant_sum_gte', '', guildId),
    ])
    if (blacklistErr) return { ...empty, parseErrors: errors, error: blacklistErr.message }
    const blacklist = new Set((blacklistRows ?? []).map((r) => r.item_name_raw))
    const tierEnchantFilter = parseTierEnchantSumFilter({
      excludeAtOrBelow: excludeAtOrBelowRaw,
      excludeAtOrAbove: excludeAtOrAboveRaw,
    })

    // 중복 검출: 임포트 행들의 logged_at 범위를 잡아 기존 로그를 한 번에 조회 →
    // dedupe 키 세트로 비교. UNIQUE 제약이 있어 INSERT 중 레이스가 발생해도
    // 결국 DB 가 거절하지만, 사전 필터로 "실제로 새로 쓴 행" 만 재고에 반영한다.
    const loggedTimes = entries.map((e) => e.loggedAt.getTime())
    const minLogged = new Date(Math.min(...loggedTimes)).toISOString()
    const maxLogged = new Date(Math.max(...loggedTimes)).toISOString()
    const { keys: existingKeys, error: existingErr } = await loadExistingChestDedupeKeys(
      db,
      guildId,
      minLogged,
      maxLogged,
    )
    if (existingErr) return { ...empty, parseErrors: errors, error: existingErr }

    const {
      entries: newEntries,
      duplicatesSkipped: precheckedDuplicatesSkipped,
    } = filterNewChestLogEntries(entries, existingKeys)

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
    // 집계 (원본 보존 + 재고 델타)
    const candidateRows: AggregateRow[] = newEntries.map((entry) => ({
      entry,
      resolved: resolveKoItem(entry.itemName),
      isBlacklisted: blacklist.has(entry.itemName),
    }))
    const { rows, excludedRows: tierEnchantExcludedRows } =
      applyTierEnchantSumFilter(candidateRows, tierEnchantFilter)
    const importableEntries = rows.map((row) => row.entry)
    const {
      lastKnownLoggedAt,
      lastKnownLabel,
      lastKnownInBatch,
      newEntriesAfterLast,
      gapFromLastKnownMs,
    } = summarizeLogContinuity({
      allEntries: entries,
      newEntries: importableEntries,
      latestStoredEntries,
      getLoggedAt: (entry) => entry.loggedAt,
      getKey: dedupeKey,
      getLabel: chestLogLabel,
    })
    const { unresolvedNames } = aggregateStock(rows)
    const stockDeltas = buildOrderedStockReplayDeltas(rows)

    const blacklistedRows = rows.filter((row) => row.isBlacklisted).length
    const unresolvedRows = rows.filter((row) => !row.isBlacklisted && !row.resolved).length

    let stockChanges: ImportSummary['stockChanges'] = []

    if (dryRun) {
      // 미리보기: 현재 재고를 조회해 "적용 시 예상 재고" 를 계산한다. DB 는 건드리지 않음.
      const existingStockByKey = await loadCurrentStockByKey(db, guildId, stockDeltas)
      stockChanges = summarizeStockReplayChanges(existingStockByKey, stockDeltas)
      return {
        parsed: parsedEntries.length,
        parseErrors: errors,
        inserted: 0,
        duplicatesSkipped: precheckedDuplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        blacklistedRows,
        tierEnchantExcludedRows,
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

    const insertResult = await insertShopChestRows(db, guildId, session.discordId, rows)
    const inserted = insertResult.insertedRows.length
    const duplicatesSkipped = precheckedDuplicatesSkipped + insertResult.duplicatesSkipped
    const committedRows = insertResult.insertedRows
    const committedAggregate = aggregateStock(committedRows)
    const committedStockDeltas = buildOrderedStockReplayDeltas(committedRows)
    const committedBlacklistedRows = committedRows.filter((row) => row.isBlacklisted).length
    const committedUnresolvedRows = committedRows.filter(
      (row) => !row.isBlacklisted && !row.resolved,
    ).length

    // 재고 RPC 호출 — 저장된 로그와 같은 시간 순서로 적용한다. 출고 로그가 먼저
    // 나오더라도 뒤따르는 입고를 잃지 않게 해야 rebuild/import 결과가 일치한다.
    const initialStockByKey = await loadCurrentStockByKey(db, guildId, committedStockDeltas)
    const stockApplyError = await applyShopStockDeltas(db, guildId, committedStockDeltas)
    stockChanges = summarizeStockReplayChanges(initialStockByKey, committedStockDeltas)
    if (insertResult.error) {
      return {
        parsed: parsedEntries.length,
        parseErrors: errors,
        inserted,
        duplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        blacklistedRows: committedBlacklistedRows,
        tierEnchantExcludedRows,
        unresolvedRows: committedUnresolvedRows,
        unresolvedNames: committedAggregate.unresolvedNames,
        stockChanges,
        lastKnownLoggedAt,
        lastKnownLabel,
        lastKnownInBatch,
        newEntriesAfterLast,
        gapFromLastKnownMs,
        error: insertResult.error,
      }
    }
    if (stockApplyError) {
      return {
        parsed: parsedEntries.length,
        parseErrors: errors,
        inserted,
        duplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        blacklistedRows: committedBlacklistedRows,
        tierEnchantExcludedRows,
        unresolvedRows: committedUnresolvedRows,
        unresolvedNames: committedAggregate.unresolvedNames,
        stockChanges,
        lastKnownLoggedAt,
        lastKnownLabel,
        lastKnownInBatch,
        newEntriesAfterLast,
        gapFromLastKnownMs,
        error: tErr('stockApplyFailed', {
          uniqueName: stockApplyError.uniqueName,
          reason: stockApplyError.message,
        }),
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
        kind: 'chest.import',
        inserted,
        duplicatesSkipped,
        skippedBeforeStart: official.skippedBeforeStart,
        stockChanges: stockChanges.length,
        tierEnchantExcludedRows,
        unresolvedRows: committedUnresolvedRows,
      },
    })

    return {
      parsed: parsedEntries.length,
      parseErrors: errors,
      inserted,
      duplicatesSkipped,
      skippedBeforeStart: official.skippedBeforeStart,
      blacklistedRows: committedBlacklistedRows,
      tierEnchantExcludedRows,
      unresolvedRows: committedUnresolvedRows,
      unresolvedNames: committedAggregate.unresolvedNames,
      stockChanges,
      lastKnownLoggedAt,
      lastKnownLabel,
      lastKnownInBatch,
      newEntriesAfterLast,
      gapFromLastKnownMs,
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
  suggestedTotalPoints: number | null
  priceReviewRequired: boolean
  balance: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  memberNote: string | null
  adminNote: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  items: Array<{
    inventoryId: string | null
    nameKo: string
    uniqueName: string
    enchant: number
    quality: number
    quantity: number
    unitPoints: number
    subtotalPoints: number
    stockAvailable: number
    pricingSource: 'catalog' | 'member_quote'
    catalogUnitSilverSnapshot: number | null
    memberQuoteUnitSilver: number | null
    memberQuoteUnitPoints: number | null
    memberQuoteCity: string | null
    memberQuoteNote: string | null
    memberQuoteEvidenceUrl: string | null
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
        'id, discord_id, username, total_points, price_review_required, status, member_note, admin_note, created_at, resolved_at, resolved_by',
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
        'order_id, name_ko, unique_name, enchant, quality, quantity, unit_points, subtotal_points, pricing_source, catalog_unit_silver_snapshot, member_quote_unit_silver, member_quote_unit_points, member_quote_city, member_quote_note, member_quote_evidence_url',
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
      .select('id, unique_name, enchant, quality, stock')
      .eq('guild_id', guildId)
      .in('unique_name', uniqueNames)
    const inventoryByKey = new Map<string, { id: string; stock: number }>()
    for (const r of invRows ?? []) {
      inventoryByKey.set(
        `${r.unique_name}|${r.enchant}|${r.quality}`,
        { id: r.id as string, stock: r.stock as number },
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
      const inventory = inventoryByKey.get(`${it.unique_name}|${it.enchant}|${it.quality}`) ?? null
      arr.push({
        inventoryId: inventory?.id ?? null,
        nameKo: it.name_ko as string,
        uniqueName: it.unique_name as string,
        enchant: it.enchant as number,
        quality: it.quality as number,
        quantity: it.quantity as number,
        unitPoints: it.unit_points as number,
        subtotalPoints: it.subtotal_points as number,
        stockAvailable: inventory?.stock ?? 0,
        pricingSource:
          it.pricing_source === 'member_quote' ? 'member_quote' : 'catalog',
        catalogUnitSilverSnapshot:
          (it.catalog_unit_silver_snapshot as number | null | undefined) ?? null,
        memberQuoteUnitSilver:
          (it.member_quote_unit_silver as number | null | undefined) ?? null,
        memberQuoteUnitPoints:
          (it.member_quote_unit_points as number | null | undefined) ?? null,
        memberQuoteCity: (it.member_quote_city as string | null | undefined) ?? null,
        memberQuoteNote: (it.member_quote_note as string | null | undefined) ?? null,
        memberQuoteEvidenceUrl:
          (it.member_quote_evidence_url as string | null | undefined) ?? null,
      })
      itemsByOrder.set(key, arr)
    }

    return {
      orders: orders.map((o) => {
        const orderItems = itemsByOrder.get(o.id as string) ?? []
        const quoteTotal = orderItems.some((it) => it.memberQuoteUnitPoints !== null)
          ? orderItems.reduce(
              (sum, it) =>
                sum +
                (it.memberQuoteUnitPoints ?? it.unitPoints) * it.quantity,
              0,
            )
          : null
        return {
          id: o.id as string,
          discordId: o.discord_id as string,
          username: o.username as string,
          totalPoints: o.total_points as number,
          suggestedTotalPoints: quoteTotal,
          priceReviewRequired: Boolean(o.price_review_required),
          balance: balanceByUser.get(o.discord_id as string) ?? 0,
          status: o.status as AdminShopOrder['status'],
          memberNote: (o.member_note as string | null) ?? null,
          adminNote: (o.admin_note as string | null) ?? null,
          createdAt: o.created_at as string,
          resolvedAt: (o.resolved_at as string | null) ?? null,
          resolvedBy: (o.resolved_by as string | null) ?? null,
          items: orderItems,
        }
      }),
    }
  } catch (e) {
    return { orders: [], error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function approveShopOrder(
  orderId: string,
  adminNote?: string,
  totalPointsOverride?: number | null,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const trimmedNote = adminNote?.trim() || null
    if (trimmedNote && trimmedNote.length > ADMIN_NOTE_MAX_LENGTH) {
      return { error: tErr('adminNoteTooLong', { max: ADMIN_NOTE_MAX_LENGTH }) }
    }
    let normalizedTotalOverride: number | null = null
    if (totalPointsOverride !== undefined && totalPointsOverride !== null) {
      const parsed = Number(totalPointsOverride)
      if (
        !Number.isInteger(parsed) ||
        parsed <= 0 ||
        parsed > MAX_ORDER_TOTAL_POINTS
      ) {
        return { error: tErr('shopOrderTotalInvalid') }
      }
      normalizedTotalOverride = parsed
    }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability([CAP.INVENTORY_DELIVER])
    let requestedTotalPoints: number | null = null
    if (normalizedTotalOverride !== null) {
      const { data: orderRow, error: orderErr } = await db
        .from('shop_orders')
        .select('total_points')
        .eq('guild_id', guildId)
        .eq('id', orderId)
        .eq('status', 'pending')
        .maybeSingle()
      if (orderErr) return { error: orderErr.message }
      requestedTotalPoints = (orderRow?.total_points as number | null | undefined) ?? null
    }
    const { error } = await db.rpc('approve_shop_order', {
      p_id: orderId,
      p_admin_id: session.discordId,
      p_guild_id: guildId,
      p_admin_note: trimmedNote,
      p_total_points_override: normalizedTotalOverride,
    })
    if (error) {
      // RPC raise exception 메시지를 사용자 친화 문구로.
      if (error.message.includes('INVALID_TOTAL_POINTS')) {
        return { error: tErr('shopOrderTotalInvalid') }
      }
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
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.order.approve',
      targetId: orderId,
      targetKind: 'shop_order',
      details: {
        adminNote: trimmedNote,
        ...(normalizedTotalOverride !== null
          ? {
              requestedTotalPoints,
              approvedTotalPoints: normalizedTotalOverride,
            }
          : {}),
      },
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
