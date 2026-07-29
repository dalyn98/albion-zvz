import 'server-only'

import {
  ApplicationCommandError,
  executeApplicationCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
  type ApplicationCommandReceipt,
} from '@/lib/application-command'
import { getAppSetting } from '@/lib/app-settings'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { canonicalShopQuality } from '@/lib/shop/quality'
import { getAdminClient } from '@/lib/supabase-admin'

const MEMO_MAX = 500
const MAX_LINES = 50
const QUOTE_CITY_MAX = 40
const QUOTE_NOTE_MAX = 200
const POSTGRES_INT_MAX = 2_147_483_647

export interface ShopOrderCommandInputLine {
  inventoryId: string
  quantity: number
  expectedUnitPoints?: number
  memberQuoteUnitSilver?: number | null
  memberQuoteCity?: string | null
  memberQuoteNote?: string | null
}

export interface ShopOrderCommandInput {
  lines: ShopOrderCommandInputLine[]
  memberNote: string
}

interface NormalizedQuote {
  unitSilver: number
  city: string | null
  note: string | null
}

interface NormalizedInputLine {
  inventoryId: string
  quantity: number
  quote: NormalizedQuote | null
  expectedUnitPoints: number | null
}

export interface ShopOrderCommandLine {
  inventoryId: string
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string
  quantity: number
  unitPoints: number
  subtotalPoints: number
  pricingSource: 'catalog' | 'member_quote'
  catalogUnitSilverSnapshot: number | null
  memberQuoteUnitSilver: number | null
  memberQuoteUnitPoints: number | null
  memberQuoteCity: string | null
  memberQuoteNote: string | null
}

export interface PreparedShopOrderApplicationCommand {
  confirmedInput: ShopOrderCommandInput
  requestPayload: {
    lines: Array<{
      inventoryId: string
      quantity: number
      expectedUnitPoints: number
      memberQuoteUnitSilver: number | null
      memberQuoteCity: string | null
      memberQuoteNote: string | null
    }>
    memberNote: string
  }
  executionPayload: {
    totalPoints: number
    memberNote: string
    priceReviewRequired: boolean
    spendableBefore: number
    lines: Array<Record<string, unknown>>
  }
  orderLines: ShopOrderCommandLine[]
  total: number
  spendableBefore: number
  priceReviewRequired: boolean
}

export interface ShopOrderApplicationCommandResult
  extends Omit<PreparedShopOrderApplicationCommand, 'executionPayload'> {
  orderId: string
  status: string
  spendableAfter: number
  stockAfterByInventoryId: Record<string, number>
  replayed: boolean
}

function trimOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim() || null
}

function sameQuote(a: NormalizedQuote | null, b: NormalizedQuote | null): boolean {
  if (a === null || b === null) return a === b
  return a.unitSilver === b.unitSilver && a.city === b.city && a.note === b.note
}

function normalizeShopOrderInput(input: ShopOrderCommandInput): {
  lines: Map<string, NormalizedInputLine>
  memberNote: string
} {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new ApplicationCommandError('shop_cart_empty')
  }
  if (input.lines.length > MAX_LINES) {
    throw new ApplicationCommandError('shop_line_limit', { max: MAX_LINES })
  }
  const memberNote = typeof input.memberNote === 'string' ? input.memberNote.trim() : ''
  if (memberNote.length > MEMO_MAX) {
    throw new ApplicationCommandError('shop_memo_too_long', { max: MEMO_MAX })
  }

  const lineById = new Map<string, NormalizedInputLine>()
  for (const raw of input.lines) {
    const inventoryId = typeof raw.inventoryId === 'string' ? raw.inventoryId.trim() : ''
    if (!inventoryId) throw new ApplicationCommandError('shop_unknown_item')
    if (
      !Number.isInteger(raw.quantity) ||
      raw.quantity <= 0 ||
      raw.quantity > POSTGRES_INT_MAX
    ) {
      throw new ApplicationCommandError('shop_quantity_invalid')
    }
    const city = trimOptionalString(raw.memberQuoteCity)
    const note = trimOptionalString(raw.memberQuoteNote)
    if ((city?.length ?? 0) > QUOTE_CITY_MAX) {
      throw new ApplicationCommandError('shop_quote_city_too_long', { max: QUOTE_CITY_MAX })
    }
    if ((note?.length ?? 0) > QUOTE_NOTE_MAX) {
      throw new ApplicationCommandError('shop_quote_note_too_long', { max: QUOTE_NOTE_MAX })
    }

    let quote: NormalizedQuote | null = null
    if (raw.memberQuoteUnitSilver !== null && raw.memberQuoteUnitSilver !== undefined) {
      const unitSilver = Number(raw.memberQuoteUnitSilver)
      if (
        !Number.isInteger(unitSilver) ||
        unitSilver <= 0 ||
        unitSilver > POSTGRES_INT_MAX
      ) {
        throw new ApplicationCommandError('shop_quote_price_invalid')
      }
      quote = { unitSilver, city, note }
    } else if (city !== null || note !== null) {
      throw new ApplicationCommandError('shop_quote_price_required')
    }

    let expectedUnitPoints: number | null = null
    if (raw.expectedUnitPoints !== undefined) {
      if (
        !Number.isInteger(raw.expectedUnitPoints) ||
        raw.expectedUnitPoints < 0 ||
        raw.expectedUnitPoints > POSTGRES_INT_MAX
      ) {
        throw new ApplicationCommandError('shop_price_changed')
      }
      expectedUnitPoints = raw.expectedUnitPoints
    }

    const current = lineById.get(inventoryId)
    if (current && !sameQuote(current.quote, quote)) {
      throw new ApplicationCommandError('shop_quote_duplicate_conflict')
    }
    if (current && current.expectedUnitPoints !== expectedUnitPoints) {
      throw new ApplicationCommandError('shop_price_changed')
    }
    const quantity = (current?.quantity ?? 0) + raw.quantity
    if (quantity > POSTGRES_INT_MAX) {
      throw new ApplicationCommandError('shop_quantity_invalid')
    }
    lineById.set(inventoryId, { inventoryId, quantity, quote, expectedUnitPoints })
  }
  return { lines: lineById, memberNote }
}

function requestPayloadFromNormalized(
  normalized: ReturnType<typeof normalizeShopOrderInput>,
  unitPointsByInventoryId?: ReadonlyMap<string, number>,
): PreparedShopOrderApplicationCommand['requestPayload'] {
  const lines = [...normalized.lines.values()]
    .map((line) => ({
      inventoryId: line.inventoryId,
      quantity: line.quantity,
      expectedUnitPoints:
        line.expectedUnitPoints ?? unitPointsByInventoryId?.get(line.inventoryId) ?? -1,
      memberQuoteUnitSilver: line.quote?.unitSilver ?? null,
      memberQuoteCity: line.quote?.city ?? null,
      memberQuoteNote: line.quote?.note ?? null,
    }))
    .sort((a, b) => a.inventoryId.localeCompare(b.inventoryId))
  return { lines, memberNote: normalized.memberNote }
}

function executionLine(line: ShopOrderCommandLine): Record<string, unknown> {
  return {
    unique_name: line.uniqueName,
    enchant: line.enchant,
    quality: line.quality,
    name_ko: line.nameKo,
    quantity: line.quantity,
    unit_points: line.unitPoints,
    subtotal_points: line.subtotalPoints,
    pricing_source: line.pricingSource,
    catalog_unit_silver_snapshot: line.catalogUnitSilverSnapshot,
    member_quote_unit_silver: line.memberQuoteUnitSilver,
    member_quote_unit_points: line.memberQuoteUnitPoints,
    member_quote_city: line.memberQuoteCity,
    member_quote_note: line.memberQuoteNote,
    member_quote_evidence_url: null,
  }
}

export async function prepareShopOrderApplicationCommand(
  context: Pick<ApplicationCommandContext, 'guildId' | 'actorDiscordId'>,
  input: ShopOrderCommandInput,
): Promise<PreparedShopOrderApplicationCommand> {
  const normalized = normalizeShopOrderInput(input)
  const db = getAdminClient()
  const discountRate = parseShopDiscountRate(
    await getAppSetting('shop_discount_rate', '1', context.guildId),
  )
  const ids = [...normalized.lines.keys()]
  const { data, error } = await db
    .from('shop_inventory')
    .select('id, unique_name, enchant, stock, name_ko, manual_price, auto_price_silver')
    .eq('guild_id', context.guildId)
    .in('id', ids)
  if (error) {
    throw new ApplicationCommandError('application_command_db_error', { cause: error.message })
  }
  const inventoryById = new Map((data ?? []).map((row) => [row.id as string, row]))
  const orderLines: ShopOrderCommandLine[] = []
  let total = 0
  let priceReviewRequired = false
  for (const line of normalized.lines.values()) {
    const inventory = inventoryById.get(line.inventoryId)
    if (!inventory) throw new ApplicationCommandError('shop_unknown_item')
    if (Number(inventory.stock) < line.quantity) {
      throw new ApplicationCommandError('shop_stock_short', {
        name: inventory.name_ko,
        stock: Number(inventory.stock),
      })
    }
    const catalogUnitSilver =
      typeof inventory.manual_price === 'number' && inventory.manual_price >= 0
        ? inventory.manual_price
        : typeof inventory.auto_price_silver === 'number' && inventory.auto_price_silver > 0
          ? inventory.auto_price_silver
          : null
    const catalogUnitPoints = computePointPrice({
      manualPrice: inventory.manual_price as number | null,
      autoPriceSilver: inventory.auto_price_silver as number | null,
      discountRate,
    })
    const memberQuoteUnitPoints = line.quote
      ? computePointPrice({
          manualPrice: line.quote.unitSilver,
          autoPriceSilver: null,
          discountRate,
        })
      : null
    const unitPoints = memberQuoteUnitPoints ?? catalogUnitPoints
    if (unitPoints === null) {
      throw new ApplicationCommandError('shop_quote_required', { name: inventory.name_ko })
    }
    if (line.expectedUnitPoints !== null && line.expectedUnitPoints !== unitPoints) {
      throw new ApplicationCommandError('shop_price_changed')
    }
    if (line.quote) priceReviewRequired = true
    const subtotalPoints = unitPoints * line.quantity
    if (
      !Number.isSafeInteger(subtotalPoints) ||
      subtotalPoints > POSTGRES_INT_MAX ||
      total + subtotalPoints > POSTGRES_INT_MAX
    ) {
      throw new ApplicationCommandError('shop_invalid_amount')
    }
    total += subtotalPoints
    orderLines.push({
      inventoryId: line.inventoryId,
      uniqueName: inventory.unique_name as string,
      enchant: Number(inventory.enchant),
      quality: canonicalShopQuality(),
      nameKo: inventory.name_ko as string,
      quantity: line.quantity,
      unitPoints,
      subtotalPoints,
      pricingSource: memberQuoteUnitPoints !== null ? 'member_quote' : 'catalog',
      catalogUnitSilverSnapshot: catalogUnitSilver,
      memberQuoteUnitSilver: line.quote?.unitSilver ?? null,
      memberQuoteUnitPoints,
      memberQuoteCity: line.quote?.city ?? null,
      memberQuoteNote: line.quote?.note ?? null,
    })
  }
  if (total <= 0) throw new ApplicationCommandError('shop_total_not_positive')
  orderLines.sort((a, b) => a.inventoryId.localeCompare(b.inventoryId))

  const balance = await getMemberSpendablePointBalance(
    db,
    context.guildId,
    context.actorDiscordId,
  )
  if (balance.error) {
    throw new ApplicationCommandError('application_command_db_error', { cause: balance.error })
  }
  if (balance.spendable < total) {
    throw new ApplicationCommandError('shop_insufficient_balance', {
      balance: balance.spendable,
      total,
    })
  }
  const unitPointsByInventoryId = new Map(
    orderLines.map((line) => [line.inventoryId, line.unitPoints]),
  )
  const requestPayload = requestPayloadFromNormalized(normalized, unitPointsByInventoryId)
  const confirmedInput: ShopOrderCommandInput = {
    memberNote: normalized.memberNote,
    lines: requestPayload.lines.map((line) => ({
      inventoryId: line.inventoryId,
      quantity: line.quantity,
      expectedUnitPoints: line.expectedUnitPoints,
      memberQuoteUnitSilver: line.memberQuoteUnitSilver,
      memberQuoteCity: line.memberQuoteCity,
      memberQuoteNote: line.memberQuoteNote,
    })),
  }
  return {
    confirmedInput,
    requestPayload,
    executionPayload: {
      totalPoints: total,
      memberNote: normalized.memberNote,
      priceReviewRequired,
      spendableBefore: balance.spendable,
      lines: orderLines.map(executionLine),
    },
    orderLines,
    total,
    spendableBefore: balance.spendable,
    priceReviewRequired,
  }
}

function linesFromReceipt(receipt: ApplicationCommandReceipt): ShopOrderCommandLine[] {
  if (!Array.isArray(receipt.lines)) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return receipt.lines.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    if (
      typeof row.inventory_id !== 'string' ||
      typeof row.unique_name !== 'string' ||
      typeof row.name_ko !== 'string' ||
      typeof row.quantity !== 'number' ||
      typeof row.unit_points !== 'number' ||
      typeof row.subtotal_points !== 'number'
    ) return []
    return [{
      inventoryId: row.inventory_id,
      uniqueName: row.unique_name,
      enchant: Number(row.enchant),
      quality: Number(row.quality),
      nameKo: row.name_ko,
      quantity: row.quantity,
      unitPoints: row.unit_points,
      subtotalPoints: row.subtotal_points,
      pricingSource: row.pricing_source === 'member_quote' ? 'member_quote' as const : 'catalog' as const,
      catalogUnitSilverSnapshot:
        typeof row.catalog_unit_silver_snapshot === 'number'
          ? row.catalog_unit_silver_snapshot
          : null,
      memberQuoteUnitSilver:
        typeof row.member_quote_unit_silver === 'number' ? row.member_quote_unit_silver : null,
      memberQuoteUnitPoints:
        typeof row.member_quote_unit_points === 'number' ? row.member_quote_unit_points : null,
      memberQuoteCity: typeof row.member_quote_city === 'string' ? row.member_quote_city : null,
      memberQuoteNote: typeof row.member_quote_note === 'string' ? row.member_quote_note : null,
    }]
  })
}

async function latestShopState(
  context: ApplicationCommandContext,
  lines: readonly ShopOrderCommandLine[],
): Promise<{
  spendableAfter: number
  stockAfterByInventoryId: Record<string, number>
}> {
  const db = getAdminClient()
  const [balance, inventory] = await Promise.all([
    getMemberSpendablePointBalance(db, context.guildId, context.actorDiscordId),
    db
      .from('shop_inventory')
      .select('id, stock')
      .eq('guild_id', context.guildId)
      .in('id', lines.map((line) => line.inventoryId)),
  ])
  if (balance.error || inventory.error) {
    throw new ApplicationCommandError('application_command_db_error', {
      cause: balance.error ?? inventory.error?.message,
    })
  }
  return {
    spendableAfter: balance.spendable,
    stockAfterByInventoryId: Object.fromEntries(
      (inventory.data ?? []).map((row) => [row.id as string, Number(row.stock)]),
    ),
  }
}

export async function executeShopOrderApplicationCommand(
  context: ApplicationCommandContext,
  input: ShopOrderCommandInput,
): Promise<ShopOrderApplicationCommandResult> {
  const normalized = normalizeShopOrderInput(input)
  const earlyPayload = requestPayloadFromNormalized(normalized)
  const hasStablePrices = earlyPayload.lines.every((line) => line.expectedUnitPoints >= 0)
  const earlyReceipt = hasStablePrices
    ? await loadApplicationCommandReceipt('shop.order', context, earlyPayload)
    : null

  let prepared: PreparedShopOrderApplicationCommand
  let receipt: ApplicationCommandReceipt
  if (earlyReceipt) {
    const orderLines = linesFromReceipt(earlyReceipt)
    if (orderLines.length !== earlyPayload.lines.length) {
      throw new ApplicationCommandError('application_command_result_invalid')
    }
    prepared = {
      confirmedInput: {
        memberNote: earlyPayload.memberNote,
        lines: earlyPayload.lines,
      },
      requestPayload: earlyPayload,
      executionPayload: {
        totalPoints: Number(earlyReceipt.total ?? 0),
        memberNote: earlyPayload.memberNote,
        priceReviewRequired: Boolean(earlyReceipt.priceReviewRequired),
        spendableBefore: Number(earlyReceipt.spendableBefore ?? 0),
        lines: [],
      },
      orderLines,
      total: Number(earlyReceipt.total ?? 0),
      spendableBefore: Number(earlyReceipt.spendableBefore ?? 0),
      priceReviewRequired: Boolean(earlyReceipt.priceReviewRequired),
    }
    receipt = earlyReceipt
  } else {
    prepared = await prepareShopOrderApplicationCommand(context, input)
    const existing = await loadApplicationCommandReceipt(
      'shop.order',
      context,
      prepared.requestPayload,
    )
    receipt = existing ?? await executeApplicationCommand({
      commandName: 'shop.order',
      context,
      requestPayload: prepared.requestPayload,
      executionPayload: prepared.executionPayload,
    })
  }
  const orderId = typeof receipt.orderId === 'string' ? receipt.orderId : ''
  if (!orderId) throw new ApplicationCommandError('application_command_result_invalid')
  const latest = await latestShopState(context, prepared.orderLines)
  return {
    confirmedInput: prepared.confirmedInput,
    requestPayload: prepared.requestPayload,
    orderLines: prepared.orderLines,
    total: prepared.total,
    spendableBefore: prepared.spendableBefore,
    priceReviewRequired: prepared.priceReviewRequired,
    orderId,
    status: typeof receipt.status === 'string' ? receipt.status : 'pending',
    ...latest,
    replayed: receipt.replayed === true,
  }
}
