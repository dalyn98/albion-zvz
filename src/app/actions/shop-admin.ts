'use server'

// 길드 상점 관리자 액션.
// - importChestLog: 붙여넣은 상자 로그 파싱 → 원본 보존 + 재고 반영
// - addBlacklist / removeBlacklist: 잡템 필터
// - upsertNameOverride / removeNameOverride: 한글명 → UniqueName 수동 매핑

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'
import { aggregateStock, type AggregateRow } from '@/lib/shop/aggregate-stock'
import { getSession } from '@/lib/session'

export interface ImportSummary {
  parsed: number
  parseErrors: Array<{ line: number; text: string; reason: string }>
  inserted: number
  duplicatesSkipped: number
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
  error?: string
}

const IMPORT_ROW_LIMIT = 5000

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

export async function importChestLog(raw: string): Promise<ImportSummary> {
  const empty: ImportSummary = {
    parsed: 0,
    parseErrors: [],
    inserted: 0,
    duplicatesSkipped: 0,
    blacklistedRows: 0,
    unresolvedRows: 0,
    unresolvedNames: [],
    stockChanges: [],
  }
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { ...empty, error: 'Unauthorized' }
    const db = await requireAdmin()

    const { entries, errors } = parseChestLog(raw)
    if (entries.length === 0) {
      return {
        ...empty,
        parseErrors: errors,
        error: errors.length
          ? '파싱 가능한 행이 없습니다. 포맷(탭 구분, 6필드)을 확인하세요.'
          : '로그가 비어있습니다.',
      }
    }
    if (entries.length > IMPORT_ROW_LIMIT) {
      return {
        ...empty,
        parseErrors: errors,
        error: `한 번에 ${IMPORT_ROW_LIMIT}행까지만 임포트 가능합니다. (현재 ${entries.length}행)`,
      }
    }

    // 블랙리스트 / 오버라이드 로드
    const [{ data: blacklistRows }, { data: overrideRows }] = await Promise.all([
      db.from('shop_blacklist').select('item_name_raw'),
      db.from('shop_name_overrides').select('item_name_raw, unique_name'),
    ])
    const blacklist = new Set((blacklistRows ?? []).map((r) => r.item_name_raw))
    const overrides = new Map(
      (overrideRows ?? []).map((r) => [r.item_name_raw as string, r.unique_name as string]),
    )

    // 중복 검출: 임포트 행들의 logged_at 범위를 잡아 기존 로그를 한 번에 조회 →
    // dedupe 키 세트로 비교. UNIQUE 제약이 있어 INSERT 중 레이스가 발생해도
    // 결국 DB 가 거절하지만, 사전 필터로 "실제로 새로 쓴 행" 만 재고에 반영한다.
    const loggedTimes = entries.map((e) => e.loggedAt.getTime())
    const minLogged = new Date(Math.min(...loggedTimes)).toISOString()
    const maxLogged = new Date(Math.max(...loggedTimes)).toISOString()
    const { data: existingRows, error: existingErr } = await db
      .from('shop_chest_logs')
      .select('logged_at, player, item_name_raw, enchant, quality, quantity')
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

    // 집계 (원본 보존 + 재고 델타)
    const rows: AggregateRow[] = newEntries.map((entry) => ({
      entry,
      resolved: resolveKoItem(entry.itemName, overrides),
      isBlacklisted: blacklist.has(entry.itemName),
    }))
    const { toInsert, stockDeltas, unresolvedNames } = aggregateStock(rows)

    // 원본 로그 INSERT. 배치 크기 500 으로 나눠 대용량도 안전하게.
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH).map((r) => ({
        logged_at: r.loggedAt.toISOString(),
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

    const blacklistedRows = newEntries.filter((e) => blacklist.has(e.itemName)).length
    const unresolvedRows = newEntries.filter(
      (e) => !blacklist.has(e.itemName) && !resolveKoItem(e.itemName, overrides),
    ).length

    // 재고 RPC 호출 — 각 (item × enchant × quality) 단위로 원자 누적.
    const stockChanges: ImportSummary['stockChanges'] = []
    for (const d of stockDeltas) {
      const { data: newStock, error } = await db.rpc('apply_shop_stock_delta', {
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
          parsed: entries.length,
          parseErrors: errors,
          inserted,
          duplicatesSkipped,
          blacklistedRows,
          unresolvedRows,
          unresolvedNames,
          stockChanges,
          error: `재고 반영 실패(${d.uniqueName}): ${error.message}`,
        }
      }
      stockChanges.push({
        uniqueName: d.uniqueName,
        nameKo: d.nameKo,
        enchant: d.enchant,
        quality: d.quality,
        delta: d.delta,
        newStock: typeof newStock === 'number' ? newStock : Number(newStock ?? 0),
      })
    }

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/shop')

    return {
      parsed: entries.length,
      parseErrors: errors,
      inserted,
      duplicatesSkipped,
      blacklistedRows,
      unresolvedRows,
      unresolvedNames,
      stockChanges,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

// 블랙리스트 관리
export async function addBlacklist(itemName: string): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    const trimmed = itemName.trim()
    if (!trimmed) return { error: '아이템 이름이 비어있습니다.' }
    const db = await requireAdmin()
    const { error } = await db
      .from('shop_blacklist')
      .upsert({ item_name_raw: trimmed, added_by: session.discordId })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function removeBlacklist(itemName: string): Promise<{ error?: string }> {
  try {
    const db = await requireAdmin()
    const { error } = await db.from('shop_blacklist').delete().eq('item_name_raw', itemName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

// 한글명 → UniqueName 오버라이드
export async function upsertNameOverride(
  itemName: string,
  uniqueName: string,
): Promise<{ error?: string }> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { error: 'Unauthorized' }
    const raw = itemName.trim()
    const u = uniqueName.trim()
    if (!raw || !u) return { error: '이름이 비어있습니다.' }
    const db = await requireAdmin()
    const { error } = await db
      .from('shop_name_overrides')
      .upsert({ item_name_raw: raw, unique_name: u, added_by: session.discordId })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function removeNameOverride(itemName: string): Promise<{ error?: string }> {
  try {
    const db = await requireAdmin()
    const { error } = await db.from('shop_name_overrides').delete().eq('item_name_raw', itemName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/shop')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
