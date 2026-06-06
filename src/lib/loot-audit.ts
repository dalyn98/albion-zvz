import {
  parseChestLog,
  type ChestLogParseErrorCode,
} from '@/lib/shop/parse-chest-log'
import { resolveAlbionItem } from '@/lib/shop/resolve-item'
import { filterByLogOperatingStart } from '@/lib/log-operating-start'
import { compareStrings } from './sort-strings'

export type LootLogParseErrorCode =
  | ChestLogParseErrorCode
  | 'loot_missing_headers'
  | 'loot_timestamp'
  | 'loot_required_fields'
  | 'loot_quantity'
  | 'loot_market_value'

export interface LootLogParseError {
  line: number
  text: string
  reason: string
  code?: LootLogParseErrorCode
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

export type LootAuditCheckStatus =
  | 'complete'
  | 'partial'
  | 'missing'
  | 'death_loss'
  | 'partial_death_loss'
export type LootAuditDepositCheckStatus = 'matched' | 'extra' | 'unresolved'
export type LootAuditFindingScope = 'looter' | 'item_pool'

export const LOOT_AUDIT_ITEM_POOL_MEMBER = '__loot_audit_item_pool__'

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
  scope: LootAuditFindingScope
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
  lootedQuantity: number
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  missingEstimatedValue: number
  deathLostQuantity: number
  deathLostEstimatedValue: number
}

export interface LootAuditRelationCounts {
  guild: number
  alliance: number
  other: number
}

export interface LootAuditItemCheckRow {
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  looterNames: string[]
  lootedQuantity: number
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  unitEstimatedValue: number
  missingEstimatedValue: number
  deathLostQuantity: number
  deathLostEstimatedValue: number
  status: LootAuditCheckStatus
}

export interface LootAuditCheckRow {
  lootedByName: string
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  lootedQuantity: number
  expectedQuantity: number
  depositedQuantity: number
  missingQuantity: number
  unitEstimatedValue: number
  missingEstimatedValue: number
  deathLostQuantity: number
  deathLostEstimatedValue: number
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
  deathLostQuantity: number
  deathLostEstimatedValue: number
  relationCounts: LootAuditRelationCounts
  findings: LootAuditFinding[]
  memberSummaries: LootAuditMemberSummary[]
  itemCheckRows: LootAuditItemCheckRow[]
  checkRows: LootAuditCheckRow[]
  depositCheckRows: LootAuditDepositCheckRow[]
}

export interface LootAuditEntrySelection {
  lootEntries: LootLogEntry[]
  depositEntries: DepositLogEntry[]
  auditStartAt: string | null
  skippedBeforeStart: {
    lootRows: number
    depositRows: number
  }
}

export interface ParseDepositLogOptions {
  resolveItemName?: (itemName: string) => string | null
}

interface LootAccumulator {
  lootedByName: string
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  lootedQuantity: number
  deathLostQuantity: number
  estimatedValue: number
  deathLostEstimatedValue: number
}

interface ItemAccumulator {
  looterRelation: LootAuditLooterRelation
  itemId: string
  itemName: string
  looterNames: string[]
  lootedQuantity: number
  expectedQuantity: number
  deathLostQuantity: number
  estimatedValue: number
  accountableEstimatedValue: number
  deathLostEstimatedValue: number
}

interface DepositAccumulator {
  player: string
  itemId: string
  itemName: string
  depositedQuantity: number
  rowCount: number
}

interface DepositItemAccumulator {
  itemId: string
  itemName: string
  depositedQuantity: number
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

const LOOT_HEADER_ALIASES: Record<string, readonly string[]> = {
  timestamp_utc: [
    'timestamp_utc',
    'timestamp utc',
    'timestamp',
    'datetime',
    'date',
    'time',
    '시간',
    '일시',
    '날짜',
    '日時',
    '日付',
    '時間',
    '日期',
    '时间',
  ],
  looted_by__alliance: [
    'looted_by__alliance',
    'looted_by_alliance',
    'looter_alliance',
    'looted by alliance',
    'looter alliance',
    '획득자 연합',
    '루터 연합',
    'ルーター同盟',
    '獲得者同盟',
    '拾取者联盟',
  ],
  looted_by__guild: [
    'looted_by__guild',
    'looted_by_guild',
    'looter_guild',
    'looted by guild',
    'looter guild',
    '획득자 길드',
    '루터 길드',
    'ルーターギルド',
    '獲得者ギルド',
    '拾取者公会',
  ],
  looted_by__name: [
    'looted_by__name',
    'looted_by_name',
    'looter',
    'looter_name',
    'looted by',
    'looted by name',
    'player',
    'player name',
    '획득자',
    '루터',
    '루팅한 사람',
    'プレイヤー',
    '獲得者',
    '拾取者',
    '玩家',
  ],
  item_id: [
    'item_id',
    'item id',
    'unique_name',
    'unique name',
    'item unique name',
    '아이템 id',
    '아이템 코드',
    'アイテムid',
    'アイテムコード',
    '物品id',
    '物品代码',
  ],
  item_name: [
    'item_name',
    'item name',
    'item',
    '아이템명',
    '아이템',
    'アイテム名',
    'アイテム',
    '物品名称',
    '物品',
  ],
  quantity: ['quantity', 'qty', '수량', '数量', '數量'],
  looted_from__alliance: [
    'looted_from__alliance',
    'looted_from_alliance',
    'looted from alliance',
    'victim alliance',
    '피해자 연합',
    '被害者同盟',
    '被拾取者联盟',
  ],
  looted_from__guild: [
    'looted_from__guild',
    'looted_from_guild',
    'looted from guild',
    'victim guild',
    '피해자 길드',
    '被害者ギルド',
    '被拾取者公会',
  ],
  looted_from__name: [
    'looted_from__name',
    'looted_from_name',
    'looted from',
    'victim',
    'victim name',
    '피해자',
    '被害者',
    '被拾取者',
  ],
  died: ['died', 'dead', 'death', '사망', '死亡'],
  died_player_guild: [
    'died_player_guild',
    'died player guild',
    'dead player guild',
    '사망자 길드',
    '死亡者ギルド',
    '死亡玩家公会',
  ],
  killed_by: ['killed_by', 'killed by', 'killer', '처치자', '킬러', 'キラー', '击杀者'],
  killed_by_guild: [
    'killed_by_guild',
    'killed by guild',
    'killer guild',
    '처치자 길드',
    'キラーギルド',
    '击杀者公会',
  ],
  average_est_market_value: [
    'average_est_market_value',
    'average est market value',
    'estimated_market_value',
    'estimated market value',
    'market value',
    'value',
    '평균 추정가',
    '추정가',
    '推定価格',
    '平均推定市場価値',
    '估价',
    '平均估计市场价值',
  ],
  cluster: ['cluster', 'map', 'location', 'zone', '지역', '맵', 'クラスター', '場所', '区域', '地图'],
}

const LOOT_HEADER_ALIAS_TO_CANONICAL = buildLootHeaderAliasMap()

export function parseLootLogCsv(raw: string): LootLogParseResult {
  const text = raw.trim()
  if (!text) return { entries: [], errors: [] }

  const lines = text.split(/\r?\n/)
  const headerLine = lines[0]
  const delimiter = detectDelimiter(headerLine)
  const headers = splitDelimitedLine(headerLine, delimiter).map(canonicalLootHeader)
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
          code: 'loot_missing_headers',
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
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'invalid timestamp_utc',
        code: 'loot_timestamp',
      })
      continue
    }

    const lootedByName = value('looted_by__name')
    const itemId = value('item_id')
    const itemName = value('item_name')
    if (!lootedByName || !itemId || !itemName) {
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'missing looted_by__name/item_id/item_name',
        code: 'loot_required_fields',
      })
      continue
    }

    const quantity = parseInteger(value('quantity'))
    if (quantity === null || quantity <= 0) {
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'invalid quantity',
        code: 'loot_quantity',
      })
      continue
    }

    const marketValueRaw = value('average_est_market_value')
    const estimatedMarketValue = marketValueRaw ? parseInteger(marketValueRaw) : 0
    if (estimatedMarketValue === null || estimatedMarketValue < 0) {
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'invalid average_est_market_value',
        code: 'loot_market_value',
      })
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

export function selectLootAuditEntries(
  lootEntries: readonly LootLogEntry[],
  depositEntries: readonly DepositLogEntry[],
): LootAuditEntrySelection {
  const auditStart = getEarliestLootedAt(lootEntries)
  const selectedDeposits = filterByLogOperatingStart(
    depositEntries,
    (entry) => entry.depositedAt,
    auditStart,
  )

  return {
    lootEntries: [...lootEntries],
    depositEntries: selectedDeposits.entries,
    auditStartAt: auditStart?.toISOString() ?? null,
    skippedBeforeStart: {
      lootRows: 0,
      depositRows: selectedDeposits.skippedBeforeStart,
    },
  }
}

export function buildLootAuditSummary(
  lootEntries: readonly LootLogEntry[],
  depositEntries: readonly DepositLogEntry[],
  context: LootAuditScopeContext = {},
): LootAuditSummary {
  const lootByMemberItem = new Map<string, LootAccumulator>()
  const expectedByItem = new Map<string, ItemAccumulator>()
  const targetExpectedByItem = new Map<string, ItemAccumulator>()
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
    const isDeathLoss = isDeathLossEntry(entry)
    const deathLostEntryQuantity = isDeathLoss ? entry.quantity : 0
    const accountableEntryQuantity = entry.quantity - deathLostEntryQuantity
    const deathLostEntryValue = isDeathLoss ? estimatedValue : 0
    const accountableEntryValue = estimatedValue - deathLostEntryValue
    auditedLootRows += 1
    relationCounts[looterRelation] += 1
    if (isLootAuditTargetRelation(looterRelation)) {
      targetLootRows += 1
      totalEstimatedValue += estimatedValue
    } else {
      externalLootRows += 1
      externalEstimatedValue += estimatedValue
    }
    accumulateExpectedItem(expectedByItem, {
      entry,
      looterRelation,
      estimatedValue,
      accountableQuantity: accountableEntryQuantity,
      accountableEstimatedValue: accountableEntryValue,
      deathLostQuantity: deathLostEntryQuantity,
      deathLostEstimatedValue: deathLostEntryValue,
    })
    if (isLootAuditTargetRelation(looterRelation)) {
      accumulateExpectedItem(targetExpectedByItem, {
        entry,
        looterRelation,
        estimatedValue,
        accountableQuantity: accountableEntryQuantity,
        accountableEstimatedValue: accountableEntryValue,
        deathLostQuantity: deathLostEntryQuantity,
        deathLostEstimatedValue: deathLostEntryValue,
      })
    }
    const key = memberItemKey(entry.lootedByName, entry.itemId)
    const existing = lootByMemberItem.get(key)
    if (existing) {
      existing.lootedQuantity += entry.quantity
      existing.estimatedValue += estimatedValue
      if (isDeathLoss) {
        existing.deathLostQuantity += entry.quantity
        existing.deathLostEstimatedValue += estimatedValue
      }
      existing.looterRelation = mergeLooterRelation(existing.looterRelation, looterRelation)
      continue
    }
    lootByMemberItem.set(key, {
      lootedByName: entry.lootedByName,
      looterRelation,
      itemId: entry.itemId,
      itemName: entry.itemName,
      lootedQuantity: entry.quantity,
      deathLostQuantity: isDeathLoss ? entry.quantity : 0,
      estimatedValue,
      deathLostEstimatedValue: isDeathLoss ? estimatedValue : 0,
    })
  }

  const depositByMemberItem = new Map<string, DepositAccumulator>()
  const depositByItem = new Map<string, DepositItemAccumulator>()
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

    const itemDeposit = depositByItem.get(entry.itemId) ?? {
      itemId: entry.itemId,
      itemName: entry.itemName,
      depositedQuantity: 0,
    }
    itemDeposit.depositedQuantity += entry.quantity
    depositByItem.set(entry.itemId, itemDeposit)
  }

  const findings: LootAuditFinding[] = []
  const itemCheckRows: LootAuditItemCheckRow[] = []
  const checkRows: LootAuditCheckRow[] = []
  const depositCheckRows: LootAuditDepositCheckRow[] = []
  const memberSummaryMap = new Map<string, LootAuditMemberSummary>()
  let matchedDepositRows = 0
  let missingEstimatedValue = 0
  let deathLostQuantity = 0
  let deathLostEstimatedValue = 0

  for (const [key, expected] of lootByMemberItem) {
    const deposited = depositByMemberItem.get(key)
    const depositedQuantity = deposited?.depositedQuantity ?? 0

    const accountableQuantity = expected.lootedQuantity - expected.deathLostQuantity
    const accountableEstimatedValue = expected.estimatedValue - expected.deathLostEstimatedValue
    const deathLossCoveredByDeposit = Math.max(0, depositedQuantity - accountableQuantity)
    const remainingDeathLostQuantity = Math.max(
      0,
      expected.deathLostQuantity - deathLossCoveredByDeposit,
    )
    const unitEstimatedValue = accountableQuantity > 0
      ? Math.round(accountableEstimatedValue / accountableQuantity)
      : 0
    const unitDeathLostEstimatedValue = expected.deathLostQuantity > 0
      ? Math.round(expected.deathLostEstimatedValue / expected.deathLostQuantity)
      : 0
    const remainingDeathLostValue = remainingDeathLostQuantity * unitDeathLostEstimatedValue
    const missingQuantity = Math.max(0, accountableQuantity - depositedQuantity)
    const missingValue = missingQuantity * unitEstimatedValue
    const isTargetExpected = isLootAuditTargetRelation(expected.looterRelation)
    const status = getLootAuditCheckStatus({
      missingQuantity,
      depositedQuantity,
      deathLostQuantity: remainingDeathLostQuantity,
    })
    checkRows.push({
      lootedByName: expected.lootedByName,
      looterRelation: expected.looterRelation,
      itemId: expected.itemId,
      itemName: expected.itemName,
      lootedQuantity: expected.lootedQuantity,
      expectedQuantity: accountableQuantity,
      depositedQuantity,
      missingQuantity,
      unitEstimatedValue,
      missingEstimatedValue: missingValue,
      deathLostQuantity: remainingDeathLostQuantity,
      deathLostEstimatedValue: remainingDeathLostValue,
      status,
    })

    if (isTargetExpected) {
      const memberSummary = memberSummaryMap.get(expected.lootedByName) ?? {
        lootedByName: expected.lootedByName,
        looterRelation: expected.looterRelation,
        lootedQuantity: 0,
        expectedQuantity: 0,
        depositedQuantity: 0,
        missingQuantity: 0,
        missingEstimatedValue: 0,
        deathLostQuantity: 0,
        deathLostEstimatedValue: 0,
      }
      memberSummary.looterRelation = mergeLooterRelation(
        memberSummary.looterRelation,
        expected.looterRelation,
      )
      memberSummary.lootedQuantity += expected.lootedQuantity
      memberSummary.expectedQuantity += accountableQuantity
      memberSummary.depositedQuantity += Math.min(accountableQuantity, depositedQuantity)
      memberSummary.missingQuantity += missingQuantity
      memberSummary.missingEstimatedValue += missingValue
      memberSummary.deathLostQuantity += remainingDeathLostQuantity
      memberSummary.deathLostEstimatedValue += remainingDeathLostValue
      memberSummaryMap.set(expected.lootedByName, memberSummary)
    }
  }

  for (const expected of targetExpectedByItem.values()) {
    const depositedQuantity = depositByItem.get(expected.itemId)?.depositedQuantity ?? 0
    const result = calculateAuditQuantities({
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      deathLostQuantity: expected.deathLostQuantity,
      accountableEstimatedValue: expected.accountableEstimatedValue,
      deathLostEstimatedValue: expected.deathLostEstimatedValue,
    })
    missingEstimatedValue += result.missingEstimatedValue
    deathLostQuantity += result.remainingDeathLostQuantity
    deathLostEstimatedValue += result.remainingDeathLostEstimatedValue
    itemCheckRows.push({
      looterRelation: expected.looterRelation,
      itemId: expected.itemId,
      itemName: expected.itemName,
      looterNames: expected.looterNames,
      lootedQuantity: expected.lootedQuantity,
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      missingQuantity: result.missingQuantity,
      unitEstimatedValue: result.unitEstimatedValue,
      missingEstimatedValue: result.missingEstimatedValue,
      deathLostQuantity: result.remainingDeathLostQuantity,
      deathLostEstimatedValue: result.remainingDeathLostEstimatedValue,
      status: result.status,
    })
    if (result.missingQuantity <= 0) continue
    findings.push({
      scope: 'item_pool',
      lootedByName: LOOT_AUDIT_ITEM_POOL_MEMBER,
      looterRelation: expected.looterRelation,
      itemId: expected.itemId,
      itemName: expected.itemName,
      expectedQuantity: expected.expectedQuantity,
      depositedQuantity,
      missingQuantity: result.missingQuantity,
      unitEstimatedValue: result.unitEstimatedValue,
      missingEstimatedValue: result.missingEstimatedValue,
    })
  }

  const remainingExpectedByItem = new Map(
    [...expectedByItem.values()].map((expected) => [expected.itemId, expected.expectedQuantity]),
  )

  for (const deposit of depositByMemberItem.values()) {
    const expected = expectedByItem.get(deposit.itemId)
    const remainingExpected = remainingExpectedByItem.get(deposit.itemId) ?? 0
    const matchedQuantity = Math.min(deposit.depositedQuantity, remainingExpected)
    const extraQuantity = Math.max(0, deposit.depositedQuantity - matchedQuantity)
    remainingExpectedByItem.set(deposit.itemId, Math.max(0, remainingExpected - matchedQuantity))
    if (matchedQuantity > 0) matchedDepositRows += deposit.rowCount
    depositCheckRows.push({
      player: deposit.player,
      looterRelation: expected?.looterRelation ?? null,
      itemId: deposit.itemId,
      itemName: expected?.itemName ?? deposit.itemName,
      depositedQuantity: deposit.depositedQuantity,
      expectedQuantity: expected?.expectedQuantity ?? 0,
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

  itemCheckRows.sort((a, b) => {
    if (b.missingEstimatedValue !== a.missingEstimatedValue) {
      return b.missingEstimatedValue - a.missingEstimatedValue
    }
    if (b.missingQuantity !== a.missingQuantity) {
      return b.missingQuantity - a.missingQuantity
    }
    return compareStrings(a.itemName, b.itemName) || compareStrings(a.itemId, b.itemId)
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
    deathLostQuantity,
    deathLostEstimatedValue,
    relationCounts,
    findings,
    memberSummaries,
    itemCheckRows,
    checkRows,
    depositCheckRows,
  }
}

export function isDeathLossEntry(entry: Pick<LootLogEntry, 'died'>): boolean {
  const normalized = entry.died.trim().toLowerCase()
  if (!normalized) return false
  return ![
    '0',
    'false',
    'no',
    'n',
    'alive',
    'survived',
    '아니오',
    '아님',
    '생존',
    'いいえ',
    '生存',
    '否',
    '没有',
    '無',
    '无',
    '未死亡',
  ].includes(normalized)
}

export function isLootAuditTargetRelation(
  relation: LootAuditLooterRelation | null | undefined,
): relation is 'guild' | 'alliance' {
  return relation === 'guild' || relation === 'alliance'
}

export function isLootAuditItemPoolMember(memberName: string): boolean {
  return memberName === LOOT_AUDIT_ITEM_POOL_MEMBER
}

function getEarliestLootedAt(entries: readonly LootLogEntry[]): Date | null {
  let earliestMs: number | null = null
  for (const entry of entries) {
    const ms = entry.lootedAt.getTime()
    if (!Number.isFinite(ms)) continue
    earliestMs = earliestMs === null ? ms : Math.min(earliestMs, ms)
  }
  return earliestMs === null ? null : new Date(earliestMs)
}

function accumulateExpectedItem(
  map: Map<string, ItemAccumulator>,
  input: {
    entry: LootLogEntry
    looterRelation: LootAuditLooterRelation
    estimatedValue: number
    accountableQuantity: number
    accountableEstimatedValue: number
    deathLostQuantity: number
    deathLostEstimatedValue: number
  },
): void {
  const existing = map.get(input.entry.itemId)
  if (existing) {
    existing.looterRelation = mergeLooterRelation(existing.looterRelation, input.looterRelation)
    if (!existing.looterNames.includes(input.entry.lootedByName)) {
      existing.looterNames = [...existing.looterNames, input.entry.lootedByName]
    }
    existing.lootedQuantity += input.entry.quantity
    existing.expectedQuantity += input.accountableQuantity
    existing.deathLostQuantity += input.deathLostQuantity
    existing.estimatedValue += input.estimatedValue
    existing.accountableEstimatedValue += input.accountableEstimatedValue
    existing.deathLostEstimatedValue += input.deathLostEstimatedValue
    return
  }
  map.set(input.entry.itemId, {
    looterRelation: input.looterRelation,
    itemId: input.entry.itemId,
    itemName: input.entry.itemName,
    looterNames: [input.entry.lootedByName],
    lootedQuantity: input.entry.quantity,
    expectedQuantity: input.accountableQuantity,
    deathLostQuantity: input.deathLostQuantity,
    estimatedValue: input.estimatedValue,
    accountableEstimatedValue: input.accountableEstimatedValue,
    deathLostEstimatedValue: input.deathLostEstimatedValue,
  })
}

function calculateAuditQuantities(input: {
  expectedQuantity: number
  depositedQuantity: number
  deathLostQuantity: number
  accountableEstimatedValue: number
  deathLostEstimatedValue: number
}): {
  missingQuantity: number
  unitEstimatedValue: number
  missingEstimatedValue: number
  remainingDeathLostQuantity: number
  remainingDeathLostEstimatedValue: number
  status: LootAuditCheckStatus
} {
  const deathLossCoveredByDeposit = Math.max(
    0,
    input.depositedQuantity - input.expectedQuantity,
  )
  const remainingDeathLostQuantity = Math.max(
    0,
    input.deathLostQuantity - deathLossCoveredByDeposit,
  )
  const unitEstimatedValue = input.expectedQuantity > 0
    ? Math.round(input.accountableEstimatedValue / input.expectedQuantity)
    : 0
  const unitDeathLostEstimatedValue = input.deathLostQuantity > 0
    ? Math.round(input.deathLostEstimatedValue / input.deathLostQuantity)
    : 0
  const missingQuantity = Math.max(0, input.expectedQuantity - input.depositedQuantity)
  const missingEstimatedValue = missingQuantity * unitEstimatedValue
  const remainingDeathLostEstimatedValue =
    remainingDeathLostQuantity * unitDeathLostEstimatedValue
  return {
    missingQuantity,
    unitEstimatedValue,
    missingEstimatedValue,
    remainingDeathLostQuantity,
    remainingDeathLostEstimatedValue,
    status: getLootAuditCheckStatus({
      missingQuantity,
      depositedQuantity: input.depositedQuantity,
      deathLostQuantity: remainingDeathLostQuantity,
    }),
  }
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
  return header
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[.\-\/]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
}

function canonicalLootHeader(header: string): string {
  const normalized = normalizeHeader(header)
  return LOOT_HEADER_ALIAS_TO_CANONICAL.get(normalized) ?? normalized
}

function buildLootHeaderAliasMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(LOOT_HEADER_ALIASES)) {
    map.set(normalizeHeader(canonical), canonical)
    for (const alias of aliases) {
      map.set(normalizeHeader(alias), canonical)
    }
  }
  return map
}

function parseInteger(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, '')
  if (!/^-?\d+$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isSafeInteger(n) ? n : null
}

function defaultResolveItemName(itemName: string): string | null {
  return resolveAlbionItem(itemName)?.uniqueName ?? null
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

function getLootAuditCheckStatus({
  missingQuantity,
  depositedQuantity,
  deathLostQuantity,
}: {
  missingQuantity: number
  depositedQuantity: number
  deathLostQuantity: number
}): LootAuditCheckStatus {
  if (deathLostQuantity > 0) {
    if (missingQuantity > 0 || depositedQuantity > 0) return 'partial_death_loss'
    return 'death_loss'
  }
  if (missingQuantity <= 0) return 'complete'
  return depositedQuantity > 0 ? 'partial' : 'missing'
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
