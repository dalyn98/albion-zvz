import { parseChestLog } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'
import { compareStrings } from './sort-strings'

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

export type LootAuditLooterRelation = 'guild' | 'alliance' | 'other'

export type LootAuditCheckStatus = 'complete' | 'partial' | 'missing'
export type LootAuditDepositCheckStatus = 'matched' | 'extra' | 'unresolved'

export interface LootAuditScopeContext {
  homeGuildName?: string | null
  homeAllianceNames?: readonly (string | null | undefined)[]
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
  looterRelation: LootAuditLooterRelation
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
  looterRelation: LootAuditLooterRelation
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  missingEstimatedValue: number
}

export interface LootAuditRelationCounts {
  guild: number
  alliance: number
  other: number
}

export interface LootAuditCheckRow {
  lootedByName: string
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  unitEstimatedValue: number
  missingEstimatedValue: number
  status: LootAuditCheckStatus
}

export interface LootAuditDepositCheckRow {
  player: string
  looterRelation: LootAuditLooterRelation | null
  itemId: string | null
  itemName: string
  depositedQuantity: number
  expectedQuantity: number
  matchedQuantity: number
  extraQuantity: number
  rowCount: number
  status: LootAuditDepositCheckStatus
}

export interface LootAuditSummary {
  totalLootRows: number
  auditedLootRows: number
  targetLootRows: number
  externalLootRows: number
  ignoredLootRows: number
  totalDepositRows: number
  matchedDepositRows: number
  totalEstimatedValue: number
  externalEstimatedValue: number
  missingEstimatedValue: number
  relationCounts: LootAuditRelationCounts
  findings: LootAuditFinding[]
  memberSummaries: LootAuditMemberSummary[]
  checkRows: LootAuditCheckRow[]
  depositCheckRows: LootAuditDepositCheckRow[]
}

export interface ParseDepositLogOptions {
  resolveItemName?: (itemName: string) => string | null
}

interface LootAccumulator {
  lootedByName: string
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  expectedQuantity: number
  estimatedValue: number
}

interface DepositAccumulator {
  player: string
  itemId: string
  itemName: string
  depositedQuantity: number
  rowCount: number
}

interface UnresolvedDepositAccumulator {
  player: string
  itemName: string
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
    unresolvedItemNames: [...unresolved].sort(compareStrings),
  }
}

export function buildLootAuditSummary(
  lootEntries: readonly LootLogEntry[],
  depositEntries: readonly DepositLogEntry[],
  context: LootAuditScopeContext = {},
): LootAuditSummary {
  const lootByMemberItem = new Map<string, LootAccumulator>()
  let auditedLootRows = 0
  let targetLootRows = 0
  let externalLootRows = 0
  let ignoredLootRows = 0
  let totalEstimatedValue = 0
  let externalEstimatedValue = 0
  const relationCounts: LootAuditRelationCounts = { guild: 0, alliance: 0, other: 0 }

  for (const entry of lootEntries) {
    if (shouldIgnoreLootEntry(entry)) {
      ignoredLootRows += 1
      continue
    }
    const looterRelation = classifyLootEntry(entry, context)
    const estimatedValue = entry.quantity * entry.estimatedMarketValue
    auditedLootRows += 1
    relationCounts[looterRelation] += 1
    if (isLootAuditTargetRelation(looterRelation)) {
      targetLootRows += 1
      totalEstimatedValue += estimatedValue
    } else {
      externalLootRows += 1
      externalEstimatedValue += estimatedValue
    }
    const key = memberItemKey(entry.lootedByName, entry.itemId)
    const existing = lootByMemberItem.get(key)
    if (existing) {
      existing.expectedQuantity += entry.quantity
      existing.estimatedValue += estimatedValue
      existing.looterRelation = mergeLooterRelation(existing.looterRelation, looterRelation)
      continue
    }
    lootByMemberItem.set(key, {
      lootedByName: entry.lootedByName,
      looterRelation,
      itemId: entry.itemId,
      itemName: entry.itemName,
      expectedQuantity: entry.quantity,
      estimatedValue,
    })
  }

  const depositByMemberItem = new Map<string, DepositAccumulator>()
  const unresolvedDepositByMemberItem = new Map<string, UnresolvedDepositAccumulator>()
  for (const entry of depositEntries) {
    if (!entry.itemId) {
      const key = unresolvedDepositKey(entry.player, entry.itemName)
      const existing = unresolvedDepositByMemberItem.get(key) ?? {
        player: entry.player,
        itemName: entry.itemName,
        depositedQuantity: 0,
        rowCount: 0,
      }
      existing.depositedQuantity += entry.quantity
      existing.rowCount += 1
      unresolvedDepositByMemberItem.set(key, existing)
      continue
    }
    const key = memberItemKey(entry.player, entry.itemId)
    const existing = depositByMemberItem.get(key) ?? {
      player: entry.player,
      itemId: entry.itemId,
      itemName: entry.itemName,
      depositedQuantity: 0,
      rowCount: 0,
    }
    existing.depositedQuantity += entry.quantity
    existing.rowCount += 1
    depositByMemberItem.set(key, existing)
  }

  const findings: LootAuditFinding[] = []
  const checkRows: LootAuditCheckRow[] = []
  const depositCheckRows: LootAuditDepositCheckRow[] = []
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
    const isTargetExpected = isLootAuditTargetRelation(expected.looterRelation)
    if (isTargetExpected) {
      missingEstimatedValue += missingValue
    }
    const status: LootAuditCheckStatus =
      missingQuantity <= 0 ? 'complete' : depositedQuantity > 0 ? 'partial' : 'missing'
    checkRows.push({
      lootedByName: expected.lootedByName,
      looterRelation: expected.looterRelation,
      itemId: expected.itemId,
      itemName: expected.itemName,
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      missingQuantity,
      unitEstimatedValue,
      missingEstimatedValue: missingValue,
      status,
    })

    if (isTargetExpected) {
      const memberSummary = memberSummaryMap.get(expected.lootedByName) ?? {
        lootedByName: expected.lootedByName,
        looterRelation: expected.looterRelation,
        expectedQuantity: 0,
        depositedQuantity: 0,
        missingQuantity: 0,
        missingEstimatedValue: 0,
      }
      memberSummary.looterRelation = mergeLooterRelation(
        memberSummary.looterRelation,
        expected.looterRelation,
      )
      memberSummary.expectedQuantity += expected.expectedQuantity
      memberSummary.depositedQuantity += Math.min(expected.expectedQuantity, depositedQuantity)
      memberSummary.missingQuantity += missingQuantity
      memberSummary.missingEstimatedValue += missingValue
      memberSummaryMap.set(expected.lootedByName, memberSummary)
    }

    if (!isTargetExpected || missingQuantity <= 0) continue
    findings.push({
      lootedByName: expected.lootedByName,
      looterRelation: expected.looterRelation,
      itemId: expected.itemId,
      itemName: expected.itemName,
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      missingQuantity,
      unitEstimatedValue,
      missingEstimatedValue: missingValue,
    })
  }

  for (const [key, deposit] of depositByMemberItem) {
    const expected = lootByMemberItem.get(key)
    const expectedQuantity = expected?.expectedQuantity ?? 0
    const matchedQuantity = Math.min(deposit.depositedQuantity, expectedQuantity)
    const extraQuantity = Math.max(0, deposit.depositedQuantity - expectedQuantity)
    depositCheckRows.push({
      player: deposit.player,
      looterRelation: expected?.looterRelation ?? null,
      itemId: deposit.itemId,
      itemName: expected?.itemName ?? deposit.itemName,
      depositedQuantity: deposit.depositedQuantity,
      expectedQuantity,
      matchedQuantity,
      extraQuantity,
      rowCount: deposit.rowCount,
      status: extraQuantity > 0 ? 'extra' : 'matched',
    })
  }

  for (const deposit of unresolvedDepositByMemberItem.values()) {
    depositCheckRows.push({
      player: deposit.player,
      looterRelation: null,
      itemId: null,
      itemName: deposit.itemName,
      depositedQuantity: deposit.depositedQuantity,
      expectedQuantity: 0,
      matchedQuantity: 0,
      extraQuantity: deposit.depositedQuantity,
      rowCount: deposit.rowCount,
      status: 'unresolved',
    })
  }

  findings.sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    return compareStrings(a.lootedByName, b.lootedByName) || compareStrings(a.itemId, b.itemId)
  })

  checkRows.sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    if (b.missingQuantity !== a.missingQuantity) {
      return b.missingQuantity - a.missingQuantity
    }
    return compareStrings(a.lootedByName, b.lootedByName) || compareStrings(a.itemId, b.itemId)
  })

  const memberSummaries = [...memberSummaryMap.values()].sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    return compareStrings(a.lootedByName, b.lootedByName)
  })

  depositCheckRows.sort((a, b) => {
    const statusOrder =
      depositCheckStatusRank(a.status) - depositCheckStatusRank(b.status)
    if (statusOrder !== 0) return statusOrder
    if (b.extraQuantity !== a.extraQuantity) return b.extraQuantity - a.extraQuantity
    if (b.depositedQuantity !== a.depositedQuantity) {
      return b.depositedQuantity - a.depositedQuantity
    }
    return compareStrings(a.player, b.player) || compareStrings(a.itemName, b.itemName)
  })

  return {
    totalLootRows: lootEntries.length,
    auditedLootRows,
    targetLootRows,
    externalLootRows,
    ignoredLootRows,
    totalDepositRows: depositEntries.length,
    matchedDepositRows,
    totalEstimatedValue,
    externalEstimatedValue,
    missingEstimatedValue,
    relationCounts,
    findings,
    memberSummaries,
    checkRows,
    depositCheckRows,
  }
}

export function isLootAuditTargetRelation(
  relation: LootAuditLooterRelation | null | undefined,
): relation is 'guild' | 'alliance' {
  return relation === 'guild' || relation === 'alliance'
}

export function classifyLootEntry(
  entry: Pick<LootLogEntry, 'lootedByGuild' | 'lootedByAlliance'>,
  context: LootAuditScopeContext = {},
): LootAuditLooterRelation {
  const homeGuild = normalizeRelationText(context.homeGuildName)
  if (homeGuild && normalizeRelationText(entry.lootedByGuild) === homeGuild) {
    return 'guild'
  }

  const allianceNames = new Set(
    (context.homeAllianceNames ?? [])
      .map(normalizeRelationText)
      .filter((v): v is string => !!v),
  )
  if (allianceNames.size > 0 && allianceNames.has(normalizeRelationText(entry.lootedByAlliance))) {
    return 'alliance'
  }

  return 'other'
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

function unresolvedDepositKey(memberName: string, itemName: string): string {
  return `${normalizeMemberName(memberName)}|${itemName.trim().toLowerCase()}`
}

function normalizeMemberName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeRelationText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function mergeLooterRelation(
  a: LootAuditLooterRelation,
  b: LootAuditLooterRelation,
): LootAuditLooterRelation {
  if (a === 'guild' || b === 'guild') return 'guild'
  if (a === 'alliance' || b === 'alliance') return 'alliance'
  return 'other'
}

function depositCheckStatusRank(status: LootAuditDepositCheckStatus): number {
  if (status === 'unresolved') return 0
  if (status === 'extra') return 1
  return 2
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
