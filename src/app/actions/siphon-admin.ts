'use server'

// 사이펀(Siphoned Energy) 관리자 액션.
//
// 알비온 인게임 길드 금고 로그를 텍스트로 붙여넣으면 siphon-ledger 에 적재.
// shop chest_log 와 같은 6필드 TSV/RTF 포맷이라 parseChestLog 를 재사용하되,
// siphon 화이트리스트 (isSiphonItemName) 를 통과한 행만 저장한다.
//
// 양수 quantity = 입금, 음수 = 출금. UI 는 보통 per-player 순 사용량을 본다 —
// getSiphonBalances 가 그 집계를 반환.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { isSiphonItemName } from '@/lib/siphon/siphon-items'
import { logAdminAction } from '@/lib/admin-audit'

// 한 번에 받을 수 있는 원본 entry 수. 5000 은 shop chest_log 와 동일 — 정상적인
// 인게임 한 번 export 가 이 한도를 넘지 않는다.
const IMPORT_ROW_LIMIT = 5000

export interface SiphonImportSummary {
  // 원본 텍스트에서 파싱된 총 entry 수 (siphon 외 다른 행도 포함).
  parsedTotal: number
  // 파싱 자체가 실패한 라인.
  parseErrors: Array<{ line: number; text: string; reason: string }>
  // siphon 화이트리스트 통과 후 남은 행.
  siphonRows: number
  // 그 중 실제로 새로 INSERT 된 행. dryRun 시 0.
  inserted: number
  // 같은 (시간/플레이어/수량) 키가 이미 DB 에 있어 skip 된 행.
  duplicatesSkipped: number
  // siphon 외 다른 아이템이라 무시한 행 수 — 사용자에게 "10건은 사이펀, 47건은
  // 다른 아이템이라 무시" 같은 피드백을 주기 위함.
  nonSiphonRows: number
  // 음수/양수 합계 (이번 batch 만). 양수 = 입금 합, 음수 = 출금 합.
  depositTotal: number
  withdrawTotal: number
  // 이 batch 안의 unique player.
  affectedPlayers: number
  error?: string
}

export interface SiphonImportOptions {
  dryRun?: boolean
}

const importInputSchema = z.object({
  raw: z.string().min(1).max(1_000_000),
})

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

function emptySummary(): SiphonImportSummary {
  return {
    parsedTotal: 0,
    parseErrors: [],
    siphonRows: 0,
    inserted: 0,
    duplicatesSkipped: 0,
    nonSiphonRows: 0,
    depositTotal: 0,
    withdrawTotal: 0,
    affectedPlayers: 0,
  }
}

export async function importSiphonLog(
  raw: string,
  options: SiphonImportOptions = {},
): Promise<SiphonImportSummary> {
  const tErr = await getTranslations('adminActionError')
  const dryRun = options.dryRun === true

  try {
    const parsed = importInputSchema.safeParse({ raw })
    if (!parsed.success) {
      return { ...emptySummary(), error: tErr('importEmptyLog') }
    }

    const session = await getSession()
    if (!session) return { ...emptySummary(), error: 'Unauthorized' }
    if (!sessionHas(session, CAP.SIPHON_MANAGE)) {
      return { ...emptySummary(), error: 'Unauthorized' }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const { entries, errors } = parseChestLog(parsed.data.raw)
    if (entries.length === 0) {
      return {
        ...emptySummary(),
        parseErrors: errors,
        error: errors.length
          ? tErr('importNoParseableRows')
          : tErr('importEmptyLog'),
      }
    }
    if (entries.length > IMPORT_ROW_LIMIT) {
      return {
        ...emptySummary(),
        parseErrors: errors,
        error: tErr('importRowLimit', { max: IMPORT_ROW_LIMIT, current: entries.length }),
      }
    }

    // siphon 화이트리스트 필터
    const siphonEntries = entries.filter((e) => isSiphonItemName(e.itemName))
    const nonSiphonRows = entries.length - siphonEntries.length

    if (siphonEntries.length === 0) {
      return {
        ...emptySummary(),
        parsedTotal: entries.length,
        parseErrors: errors,
        nonSiphonRows,
      }
    }

    // 0 수량 행은 마이그 CHECK 제약 (quantity <> 0) 에 걸리므로 미리 제거.
    // 인게임 로그에 0 은 안 나오지만 방어적으로.
    const validEntries = siphonEntries.filter((e) => e.quantity !== 0)

    // 중복 검출: import 범위의 logged_at 만 기존 DB 와 비교.
    const loggedTimes = validEntries.map((e) => e.loggedAt.getTime())
    const minLogged = new Date(Math.min(...loggedTimes)).toISOString()
    const maxLogged = new Date(Math.max(...loggedTimes)).toISOString()
    const { data: existingRows, error: existingErr } = await db
      .from('siphon_ledger')
      .select('logged_at, player, item_name_raw, enchant, quality, quantity')
      .eq('guild_id', guildId)
      .gte('logged_at', minLogged)
      .lte('logged_at', maxLogged)
    if (existingErr) {
      return { ...emptySummary(), parseErrors: errors, error: existingErr.message }
    }

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

    const newEntries = validEntries.filter(isNewEntry)
    const duplicatesSkipped = validEntries.length - newEntries.length

    let depositTotal = 0
    let withdrawTotal = 0
    const playersInBatch = new Set<string>()
    for (const e of newEntries) {
      if (e.quantity > 0) depositTotal += e.quantity
      else withdrawTotal += e.quantity
      playersInBatch.add(e.player)
    }

    if (dryRun) {
      return {
        parsedTotal: entries.length,
        parseErrors: errors,
        siphonRows: validEntries.length,
        inserted: 0,
        duplicatesSkipped,
        nonSiphonRows,
        depositTotal,
        withdrawTotal,
        affectedPlayers: playersInBatch.size,
      }
    }

    // INSERT — 500 batch 로 나눠 안전하게.
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < newEntries.length; i += BATCH) {
      const slice = newEntries.slice(i, i + BATCH).map((r) => ({
        guild_id: guildId,
        logged_at: r.loggedAt.toISOString(),
        player: r.player,
        item_name_raw: r.itemName,
        enchant: r.enchant,
        quality: r.quality,
        quantity: r.quantity,
        imported_by: session.discordId,
      }))
      const { error } = await db.from('siphon_ledger').insert(slice)
      if (error) {
        // UNIQUE 동시 import 충돌만 무시 — 나머지는 그대로 throw.
        if (!error.message.includes('duplicate key')) {
          return {
            ...emptySummary(),
            parsedTotal: entries.length,
            parseErrors: errors,
            siphonRows: validEntries.length,
            nonSiphonRows,
            error: error.message,
          }
        }
      } else {
        inserted += slice.length
      }
    }

    revalidatePath('/admin/dashboard/siphon')

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'siphon.log.import',
      targetKind: 'siphon_ledger',
      details: {
        inserted,
        duplicatesSkipped,
        nonSiphonRows,
        depositTotal,
        withdrawTotal,
        affectedPlayers: playersInBatch.size,
      },
    })

    return {
      parsedTotal: entries.length,
      parseErrors: errors,
      siphonRows: validEntries.length,
      inserted,
      duplicatesSkipped,
      nonSiphonRows,
      depositTotal,
      withdrawTotal,
      affectedPlayers: playersInBatch.size,
    }
  } catch (e) {
    return { ...emptySummary(), error: e instanceof Error ? e.message : 'Server error' }
  }
}

// ─── 조회 ────────────────────────────────────────────────────────

export interface SiphonLedgerRow {
  id: string
  loggedAt: string
  player: string
  itemNameRaw: string
  quantity: number
  importedAt: string
  importedBy: string | null
}

export interface SiphonLedgerPage {
  rows: SiphonLedgerRow[]
  total: number
  limit: number
  offset: number
}

const LEDGER_DEFAULT_LIMIT = 50
const LEDGER_MAX_LIMIT = 200

const ledgerListSchema = z.object({
  player: z.string().trim().max(64).optional(),
  limit: z.number().int().min(1).max(LEDGER_MAX_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
})

export async function listSiphonLedger(
  options: { player?: string; limit?: number; offset?: number } = {},
): Promise<SiphonLedgerPage | { error: string }> {
  try {
    const parsed = ledgerListSchema.safeParse(options)
    if (!parsed.success) return { error: 'invalid-input' }

    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    if (!sessionHas(session, CAP.SIPHON_MANAGE)) return { error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const limit = parsed.data.limit ?? LEDGER_DEFAULT_LIMIT
    const offset = parsed.data.offset ?? 0
    const player = parsed.data.player?.trim()

    let q = db
      .from('siphon_ledger')
      .select('id, logged_at, player, item_name_raw, quantity, imported_at, imported_by', {
        count: 'exact',
      })
      .eq('guild_id', guildId)
    if (player) q = q.eq('player', player)
    q = q
      .order('logged_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, count, error } = await q
    if (error) return { error: error.message }

    const rows: SiphonLedgerRow[] = (data ?? []).map((r) => ({
      id: r.id as string,
      loggedAt: r.logged_at as string,
      player: r.player as string,
      itemNameRaw: r.item_name_raw as string,
      quantity: r.quantity as number,
      importedAt: r.imported_at as string,
      importedBy: (r.imported_by as string | null) ?? null,
    }))

    return { rows, total: count ?? 0, limit, offset }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export interface SiphonPlayerBalance {
  player: string
  deposited: number
  withdrawn: number
  net: number
  lastActivityAt: string | null
}

// per-player 입출금 집계. 음수 합계는 절대값으로 withdrawn 에 담는다.
// net = deposited - withdrawn. UI 정렬은 caller 자유 (이 액션은 player 알파벳순).
export async function getSiphonBalances(): Promise<
  { balances: SiphonPlayerBalance[] } | { error: string }
> {
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    if (!sessionHas(session, CAP.SIPHON_MANAGE)) return { error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    // 전체 ledger 를 끌어와 메모리에서 집계. siphon 은 한 길드당 수만 행 수준이라
    // RPC 없이도 OK. 행 수가 부담되면 추후 SQL view / materialized 로 옮긴다.
    const PAGE = 1000
    const accum = new Map<
      string,
      { deposited: number; withdrawn: number; lastActivityAt: string | null }
    >()
    let from = 0
    while (true) {
      const { data, error } = await db
        .from('siphon_ledger')
        .select('player, quantity, logged_at')
        .eq('guild_id', guildId)
        .order('logged_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) return { error: error.message }
      const rows = data ?? []
      if (rows.length === 0) break
      for (const r of rows) {
        const player = r.player as string
        const qty = r.quantity as number
        const loggedAt = r.logged_at as string
        const prev = accum.get(player) ?? {
          deposited: 0,
          withdrawn: 0,
          lastActivityAt: null,
        }
        if (qty > 0) prev.deposited += qty
        else prev.withdrawn += -qty
        if (!prev.lastActivityAt || loggedAt > prev.lastActivityAt) {
          prev.lastActivityAt = loggedAt
        }
        accum.set(player, prev)
      }
      if (rows.length < PAGE) break
      from += PAGE
    }

    const balances: SiphonPlayerBalance[] = Array.from(accum.entries())
      .map(([player, v]) => ({
        player,
        deposited: v.deposited,
        withdrawn: v.withdrawn,
        net: v.deposited - v.withdrawn,
        lastActivityAt: v.lastActivityAt,
      }))
      .sort((a, b) => a.player.localeCompare(b.player))

    return { balances }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

// ─── 단일 행 삭제 (운영자 실수 정정용) ───────────────────────────

const deleteInputSchema = z.object({
  id: z.string().uuid(),
})

export async function deleteSiphonRow(
  id: string,
): Promise<{ error?: string }> {
  try {
    const parsed = deleteInputSchema.safeParse({ id })
    if (!parsed.success) return { error: 'invalid-input' }

    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    if (!sessionHas(session, CAP.SIPHON_MANAGE)) return { error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const { data: deletedRows, error } = await db
      .from('siphon_ledger')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', parsed.data.id)
      .select('id, player, item_name_raw, quantity, logged_at')

    if (error) return { error: error.message }
    if (!deletedRows || deletedRows.length === 0) {
      return { error: 'not-found' }
    }

    revalidatePath('/admin/dashboard/siphon')

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'siphon.log.delete',
      targetId: parsed.data.id,
      targetKind: 'siphon_ledger',
      details: {
        player: deletedRows[0].player,
        quantity: deletedRows[0].quantity,
        loggedAt: deletedRows[0].logged_at,
      },
    })

    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
