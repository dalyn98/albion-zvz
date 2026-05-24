import { parseChestLog } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'

export interface LootLogParseError {
  line: number
  text: string
  reason: string
}

export interface LootLogEntry {
  lootedAt: Date
  lootedByAlliance: string
  lootedByGuild: string
  lootedByName: string
  itemId: string
  itemName: string
  quantity: number
  lootedFromAlliance: string
  lootedFromGuild: string
  lootedFromName: string
  died: string
  diedPlayerGuild: string
  killedBy: string
  killedByGuild: string
  estimatedMarketValue: number
  cluster: string
  line: number
  rowHash: string
}

export interface DepositLogEntry {
  depositedAt: Date
  player: string
  itemName: string
  itemId: string | null
  enchant: number
  quality: number
  quantity: number
  line: number
  rowHash: string
}

export interface LootLogParseResult {
  entries: LootLogEntry[]
  errors: LootLogParseError[]
}

export interface DepositLogParseResult {
  entries: DepositLogEntry[]
  errors: LootLogParseError[]
  unresolvedItemNames: string[]
}

export interface LootAuditFinding {
  lootedByName: string
  itemId: string
  itemName: string
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  unitEstimatedValue: number
  missingEstimatedValue: number
}

export interface LootAuditMemberSummary {
  lootedByName: string
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  missingEstimatedValue: number
}

export interface LootAuditSummary {
  totalLootRows: number
  auditedLootRows: number
  ignoredLootRows: number
  totalDepositRows: number
  matchedDepositRows: number
  totalEstimatedValue: number
  missingEstimatedValue: number
  findings: LootAuditFinding[]
  memberSummaries: LootAuditMemberSummary[]
}

export interface ParseDepositLogOptions {
  resolveItemName?: (itemName: string) => string | null
}

interface LootAccumulator {
  lootedByName: string
  itemId: string
  itemName: string
  expectedQuantity: number
  estimatedValue: number
}

interface DepositAccumulator {
  depositedQuantity: number
  rowCount: number
}

const REQUIRED_LOOT_HEADERS = [
  'timestamp_utc',
  'looted_by__name',
  'item_id',
  'item_name',
  'quantity',
] as const

export function parseLootLogCsv(raw: string): LootLogParseResult {
  const text = raw.trim()
  if (!text) return { entries: [], errors: [] }

  const lines = text.split(/\r?\n/)
  const headerLine = lines[0]
  const delimiter = detectDelimiter(headerLine)
  const headers = splitDelimitedLine(headerLine, delimiter).map(normalizeHeader)
  const headerIndex = new Map(headers.map((h, i) => [h, i]))
  const missingHeaders = REQUIRED_LOOT_HEADERS.filter((header) => !headerIndex.has(header))
  if (missingHeaders.length > 0) {
    return {
      entries: [],
      errors: [
        {
          line: 1,
          text: headerLine,
          reason: `missing required headers: ${missingHeaders.join(', ')}`,
        },
      ],
    }
  }

  const entries: LootLogEntry[] = []
  const errors: LootLogParseError[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cells = splitDelimitedLine(line, delimiter)
    const lineNumber = i + 1
    const value = (header: string): string => {
      const idx = headerIndex.get(header)
      return idx === undefined ? '' : (cells[idx] ?? '').trim()
    }

    const timestamp = value('timestamp_utc')
    const lootedAt = new Date(timestamp)
    if (!timestamp || Number.isNaN(lootedAt.getTime())) {
      errors.push({ line: lineNumber, text: line, reason: 'invalid timestamp_utc' })
      continue
    }

    const lootedByName = value('looted_by__name')
    const itemId = value('item_id')
    const itemName = value('item_name')
    if (!lootedByName || !itemId || !itemName) {
      errors.push({ line: lineNumber, text: line, reason: 'missing looted_by__name/item_id/item_name' })
      continue
    }

    const quantity = parseInteger(value('quantity'))
    if (quantity === null || quantity <= 0) {
      errors.push({ line: lineNumber, text: line, reason: 'invalid quantity' })
      continue
    }

    const marketValueRaw = value('average_est_market_value')
    const estimatedMarketValue = marketValueRaw ? parseInteger(marketValueRaw) : 0
    if (estimatedMarketValue === null || estimatedMarketValue < 0) {
      errors.push({ line: lineNumber, text: line, reason: 'invalid average_est_market_value' })
      continue
    }

    const entry: LootLogEntry = {
      lootedAt,
      lootedByAlliance: value('looted_by__alliance'),
      lootedByGuild: value('looted_by__guild'),
      lootedByName,
      itemId,
      itemName,
      quantity,
      lootedFromAlliance: value('looted_from__alliance'),
      lootedFromGuild: value('looted_from__guild'),
      lootedFromName: value('looted_from__name'),
      died: value('died'),
      diedPlayerGuild: value('died_player_guild'),
      killedBy: value('killed_by'),
      killedByGuild: value('killed_by_guild'),
      estimatedMarketValue,
      cluster: value('cluster'),
      line: lineNumber,
      rowHash: '',
    }
    entry.rowHash = lootRowHash(entry)
    entries.push(entry)
  }

  return { entries, errors }
}

export function parseDepositLog(
  raw: string,
  options: ParseDepositLogOptions = {},
): DepositLogParseResult {
  const parsed = parseChestLog(raw)
  const resolver = options.resolveItemName ?? defaultResolveItemName
  const entries: DepositLogEntry[] = []
  const unresolved = new Set<string>()

  let entryLine = 1
  for (const chestEntry of parsed.entries) {
    const line = entryLine++
    if (chestEntry.quantity <= 0) continue
    const resolvedBase = resolver(chestEntry.itemName)
    const itemId = resolvedBase ? applyEnchant(resolvedBase, chestEntry.enchant) : null
    if (!itemId) unresolved.add(chestEntry.itemName)

    const entry: DepositLogEntry = {
      depositedAt: chestEntry.loggedAt,
      player: chestEntry.player,
      itemName: chestEntry.itemName,
      itemId,
      enchant: chestEntry.enchant,
      quality: chestEntry.quality,
      quantity: chestEntry.quantity,
      line,
      rowHash: '',
    }
    entry.rowHash = depositRowHash(entry)
    entries.push(entry)
  }

  return {
    entries,
    errors: parsed.errors,
    unresolvedItemNames: [...unresolved].sort((a, b) => a.localeCompare(b)),
  }
}

export function buildLootAuditSummary(
  lootEntries: readonly LootLogEntry[],
  depositEntries: readonly DepositLogEntry[],
): LootAuditSummary {
  const lootByMemberItem = new Map<string, LootAccumulator>()
  let auditedLootRows = 0
  let ignoredLootRows = 0
  let totalEstimatedValue = 0

  for (const entry of lootEntries) {
    if (shouldIgnoreLootEntry(entry)) {
      ignoredLootRows += 1
      continue
    }
    auditedLootRows += 1
    totalEstimatedValue += entry.quantity * entry.estimatedMarketValue
    const key = memberItemKey(entry.lootedByName, entry.itemId)
    const existing = lootByMemberItem.get(key)
    if (existing) {
      existing.expectedQuantity += entry.quantity
      existing.estimatedValue += entry.quantity * entry.estimatedMarketValue
      continue
    }
    lootByMemberItem.set(key, {
      lootedByName: entry.lootedByName,
      itemId: entry.itemId,
      itemName: entry.itemName,
      expectedQuantity: entry.quantity,
      estimatedValue: entry.quantity * entry.estimatedMarketValue,
    })
  }

  const depositByMemberItem = new Map<string, DepositAccumulator>()
  for (const entry of depositEntries) {
    if (!entry.itemId) continue
    const key = memberItemKey(entry.player, entry.itemId)
    const existing = depositByMemberItem.get(key) ?? { depositedQuantity: 0, rowCount: 0 }
    existing.depositedQuantity += entry.quantity
    existing.rowCount += 1
    depositByMemberItem.set(key, existing)
  }

  const findings: LootAuditFinding[] = []
  const memberSummaryMap = new Map<string, LootAuditMemberSummary>()
  let matchedDepositRows = 0
  let missingEstimatedValue = 0

  for (const [key, expected] of lootByMemberItem) {
    const deposited = depositByMemberItem.get(key)
    const depositedQuantity = deposited?.depositedQuantity ?? 0
    if (deposited) matchedDepositRows += deposited.rowCount

    const missingQuantity = Math.max(0, expected.expectedQuantity - depositedQuantity)
    const unitEstimatedValue = expected.expectedQuantity > 0
      ? Math.round(expected.estimatedValue / expected.expectedQuantity)
      : 0
    const missingValue = missingQuantity * unitEstimatedValue
    missingEstimatedValue += missingValue

    const memberSummary = memberSummaryMap.get(expected.lootedByName) ?? {
      lootedByName: expected.lootedByName,
      expectedQuantity: 0,
      depositedQuantity: 0,
      missingQuantity: 0,
      missingEstimatedValue: 0,
    }
    memberSummary.expectedQuantity += expected.expectedQuantity
    memberSummary.depositedQuantity += Math.min(expected.expectedQuantity, depositedQuantity)
    memberSummary.missingQuantity += missingQuantity
    memberSummary.missingEstimatedValue += missingValue
    memberSummaryMap.set(expected.lootedByName, memberSummary)

    if (missingQuantity <= 0) continue
    findings.push({
      lootedByName: expected.lootedByName,
      itemId: expected.itemId,
      itemName: expected.itemName,
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      missingQuantity,
      unitEstimatedValue,
      missingEstimatedValue: missingValue,
    })
  }

  findings.sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    return a.lootedByName.localeCompare(b.lootedByName) || a.itemId.localeCompare(b.itemId)
  })

  const memberSummaries = [...memberSummaryMap.values()].sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    return a.lootedByName.localeCompare(b.lootedByName)
  })

  return {
    totalLootRows: lootEntries.length,
    auditedLootRows,
    ignoredLootRows,
    totalDepositRows: depositEntries.length,
    matchedDepositRows,
    totalEstimatedValue,
    missingEstimatedValue,
    findings,
    memberSummaries,
  }
}

export function shouldIgnoreLootEntry(entry: LootLogEntry): boolean {
  return entry.estimatedMarketValue <= 0 || /_TRASH(?:@|$)/.test(entry.itemId)
}

function detectDelimiter(headerLine: string): string {
  const candidates = [';', '\t', ',']
  let best = ';'
  let bestCount = -1
  for (const delimiter of candidates) {
    const count = splitDelimitedLine(headerLine, delimiter).length
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/^\uFEFF/, '')
}

function parseInteger(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, '')
  if (!/^-?\d+$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isSafeInteger(n) ? n : null
}

function defaultResolveItemName(itemName: string): string | null {
  return resolveKoItem(itemName)?.uniqueName ?? null
}

function applyEnchant(uniqueName: string, enchant: number): string {
  const base = uniqueName.split('@', 1)[0]
  return enchant > 0 ? `${base}@${enchant}` : base
}

function memberItemKey(memberName: string, itemId: string): string {
  return `${normalizeMemberName(memberName)}|${itemId}`
}

function normalizeMemberName(name: string): string {
  return name.trim().toLowerCase()
}

function lootRowHash(entry: LootLogEntry): string {
  return [
    entry.lootedAt.toISOString(),
    entry.lootedByName,
    entry.itemId,
    entry.quantity,
    entry.lootedFromName,
    entry.cluster,
    entry.line,
  ].join('|')
}

function depositRowHash(entry: DepositLogEntry): string {
  return [
    entry.depositedAt.toISOString(),
    entry.player,
    entry.itemName,
    entry.enchant,
    entry.quality,
    entry.quantity,
    entry.line,
  ].join('|')
}
