import {
  parseChestLog,
  type ChestLogEntry,
  type ChestLogParseError,
} from '@/lib/shop/parse-chest-log'
import {
  isSiphonItemName,
  SIPHON_CANONICAL_DISPLAY_NAME,
} from './siphon-items'

export type SiphonLogEntry = ChestLogEntry

export type SiphonLogParseErrorCode =
  | 'ledger_format'
  | 'ledger_date'
  | 'ledger_player'
  | 'ledger_quantity_integer'
  | 'ledger_quantity_zero'
  | 'ledger_purpose'
  | 'legacy_chest_format'

export interface SiphonLogParseError extends Omit<ChestLogParseError, 'code'> {
  code?: SiphonLogParseErrorCode
}

export interface SiphonLogParseResult {
  entries: SiphonLogEntry[]
  errors: SiphonLogParseError[]
  parsedTotal: number
  nonSiphonRows: number
}

interface SiphonLedgerParseResult extends SiphonLogParseResult {
  detected: boolean
}

const DEPOSIT_PURPOSES: ReadonlySet<string> = new Set([
  '입금',
  '입고',
  'deposit',
  'deposits',
  'deposited',
  'in',
  '入金',
  '入庫',
  '預入',
  '預け入れ',
  '存入',
  '存款',
  '入库',
])

const WITHDRAW_PURPOSES: ReadonlySet<string> = new Set([
  '출금',
  '출고',
  'withdraw',
  'withdraws',
  'withdrawal',
  'withdrawals',
  'withdrawn',
  'out',
  '出金',
  '出庫',
  '引き出し',
  '取り出し',
  '取出',
  '提取',
  '提款',
  '出库',
])

export function parseSiphonLog(raw: string): SiphonLogParseResult {
  const ledgerResult = parseSiphonLedgerLog(raw)
  if (ledgerResult.detected) {
    return {
      entries: ledgerResult.entries,
      errors: ledgerResult.errors,
      parsedTotal: ledgerResult.entries.length,
      nonSiphonRows: 0,
    }
  }

  const chestResult = parseChestLog(raw)
  const entries = chestResult.entries.filter((entry) =>
    isSiphonItemName(entry.itemName),
  )

  return {
    entries,
    errors: withLegacySiphonErrorCodes(chestResult.errors),
    parsedTotal: chestResult.entries.length,
    nonSiphonRows: chestResult.entries.length - entries.length,
  }
}

function parseSiphonLedgerLog(raw: string): SiphonLedgerParseResult {
  const entries: SiphonLogEntry[] = []
  const errors: SiphonLogParseError[] = []
  let detected = false

  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = splitLogCells(line)
    if (isSiphonLedgerHeader(fields)) {
      detected = true
      continue
    }

    if (fields.length !== 4) {
      if (detected) {
        errors.push({
          line: i + 1,
          text: line,
          reason: '형식 불일치 (날짜/플레이어/목적/수량 4필드 필요)',
          code: 'ledger_format',
        })
      }
      continue
    }

    detected = true
    const parsed = parseSiphonLedgerLine(fields)
    if ('error' in parsed) {
      errors.push({ line: i + 1, text: line, ...parsed.error })
      continue
    }
    entries.push(parsed.entry)
  }

  return {
    detected,
    entries,
    errors,
    parsedTotal: entries.length,
    nonSiphonRows: 0,
  }
}

function parseSiphonLedgerLine(
  fields: readonly string[],
): { entry: SiphonLogEntry } | { error: Pick<SiphonLogParseError, 'reason' | 'code'> } {
  const [dateStr, player, purpose, quantityStr] = fields
  const loggedAt = parseSiphonDate(dateStr)
  if (!loggedAt) {
    return {
      error: {
        reason: '날짜 형식 불일치 (YYYY-MM-DD HH:mm:ss 필요)',
        code: 'ledger_date',
      },
    }
  }

  const playerName = player.trim()
  if (!playerName) {
    return { error: { reason: '플레이어 필요', code: 'ledger_player' } }
  }

  const quantity = parseIntegerQuantity(quantityStr)
  if (quantity == null) {
    return {
      error: { reason: '수량은 정수여야 함', code: 'ledger_quantity_integer' },
    }
  }
  if (quantity === 0) {
    return {
      error: { reason: '수량 0은 저장할 수 없음', code: 'ledger_quantity_zero' },
    }
  }

  const signedQuantity = signedQuantityForPurpose(purpose, quantity)
  if (signedQuantity == null) {
    return {
      error: { reason: '목적은 입금/출금이어야 함', code: 'ledger_purpose' },
    }
  }

  return {
    entry: {
      loggedAt,
      player: playerName,
      itemName: SIPHON_CANONICAL_DISPLAY_NAME,
      enchant: 0,
      quality: 1,
      quantity: signedQuantity,
    },
  }
}

function splitLogCells(line: string): string[] {
  const tabCells = line.split(/\t+/)
  if (tabCells.length > 1) return tabCells.map(cleanCell)

  const quotedCells = Array.from(line.matchAll(/"([^"]*)"/g), (match) =>
    match[1].trim(),
  )
  if (quotedCells.length > 1) return quotedCells

  return line.split(/\s{2,}/).map(cleanCell).filter(Boolean)
}

function cleanCell(cell: string): string {
  return cell.trim().replace(/^"(.*)"$/, '$1').trim()
}

function isSiphonLedgerHeader(fields: readonly string[]): boolean {
  if (fields.length < 4) return false
  const normalized = fields.map((field) => normalizePurpose(field))
  return (
    ['날짜', 'date', 'time', 'datetime', 'timestamp', '日時', '日付', '時間', '日期', '时间'].includes(normalized[0]) &&
    ['플레이어', 'player', 'プレイヤー', '玩家'].includes(normalized[1]) &&
    ['목적', 'purpose', 'type', 'action', '種別', '用途', '目的', '类型', '類型'].includes(normalized[2]) &&
    ['수량', 'quantity', 'qty', '数量', '數量'].includes(normalized[3])
  )
}

function parseSiphonDate(raw: string): Date | null {
  const s = raw.trim()
  const isoLike = s.match(
    /^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  )
  if (isoLike) {
    const [, yyyy, mm, dd, hh, min, ss] = isoLike
    return toUtcDate(yyyy, mm, dd, hh, min, ss)
  }

  const usLike = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  )
  if (usLike) {
    const [, mm, dd, yyyy, hh, min, ss] = usLike
    return toUtcDate(yyyy, mm, dd, hh, min, ss)
  }

  return null
}

function toUtcDate(
  yyyy: string,
  mm: string,
  dd: string,
  hh: string,
  min: string,
  ss: string,
): Date | null {
  const year = Number(yyyy)
  const month = Number(mm)
  const day = Number(dd)
  const hour = Number(hh)
  const minute = Number(min)
  const second = Number(ss)
  if (
    !isValidDateParts({
      year,
      month,
      day,
      hour,
      minute,
      second,
    })
  ) {
    return null
  }

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return Number.isNaN(d.getTime()) ? null : d
}

function isValidDateParts(parts: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}): boolean {
  if (!Number.isInteger(parts.year) || parts.year < 1970) return false
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    return false
  }
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > lastDay) {
    return false
  }
  if (!Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23) return false
  if (!Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59) {
    return false
  }
  if (!Number.isInteger(parts.second) || parts.second < 0 || parts.second > 59) {
    return false
  }
  return true
}

function parseIntegerQuantity(raw: string): number | null {
  const quantity = Number(raw.trim().replace(/,/g, ''))
  if (!Number.isInteger(quantity)) return null
  return quantity
}

function withLegacySiphonErrorCodes(
  errors: readonly ChestLogParseError[],
): SiphonLogParseError[] {
  return errors.map((error) => ({
    ...error,
    code: 'legacy_chest_format',
  }))
}

function signedQuantityForPurpose(
  purpose: string,
  quantity: number,
): number | null {
  const normalized = normalizePurpose(purpose)
  if (DEPOSIT_PURPOSES.has(normalized)) return Math.abs(quantity)
  if (WITHDRAW_PURPOSES.has(normalized)) return -Math.abs(quantity)
  return null
}

function normalizePurpose(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}
