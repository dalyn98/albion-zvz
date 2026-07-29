import type { SupabaseClient } from '@supabase/supabase-js'
import type { TemplateData } from '@/app/actions/templates'
import type { SlotTemplateData } from '@/app/actions/slot-templates'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export const GUILD_RECOVERY_KIND = 'guild-operational-recovery' as const
export const GUILD_RECOVERY_SCHEMA_VERSION = 2 as const
export const GUILD_TEMPLATE_PACKAGE_KIND = 'guild-template-package' as const
export const GUILD_TEMPLATE_PACKAGE_SCHEMA_VERSION = 1 as const
export const GUILD_BACKUP_MAX_BYTES = 10 * 1024 * 1024

export const RECOVERY_STATE_KEYS = [
  'craftOrders',
  'craftTasks',
  'eventPolicySnapshots',
  'eventRefs',
  'exchangeRequests',
  'memberRefs',
  'pointBalances',
  'pointEscrows',
  'regearRequests',
  'regearWindowRefs',
  'shopInventory',
  'shopOrderItems',
  'shopOrders',
  'supplyInventory',
  'tradeEvents',
  'tradeListingItems',
  'tradeListings',
  'tradeOrderItems',
  'tradeOrders',
  'tradePriceOfferItems',
  'tradePriceOffers',
] as const

const ID_STATE_KEYS = [
  'craftOrders',
  'craftTasks',
  'eventPolicySnapshots',
  'eventRefs',
  'exchangeRequests',
  'pointEscrows',
  'regearRequests',
  'regearWindowRefs',
  'shopOrderItems',
  'shopOrders',
  'tradeEvents',
  'tradeListingItems',
  'tradeListings',
  'tradeOrderItems',
  'tradeOrders',
  'tradePriceOfferItems',
  'tradePriceOffers',
] as const satisfies readonly RecoveryStateKey[]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_RE = /^[0-9a-f]{64}$/
const INTEGER_TEXT_RE = /^-?[0-9]{1,19}$/
const POSITIVE_INT_TEXT_RE = /^[1-9][0-9]{0,9}$/
const POSTGRES_INT_MAX = 2147483647
const POSTGRES_INT_MIN = -2147483648
const NAME_MAX_LENGTH = 80
const MAX_ROWS_PER_DOMAIN = 10_000
const MAX_TOTAL_ROWS = 30_000
const FORBIDDEN_TEMPLATE_DATA_KEYS = new Set([
  'assigneddiscordid',
  'assignedusername',
  'balance',
  'discordid',
  'escrow',
  'guildid',
  'inventory',
  'ledger',
  'memberid',
  'points',
  'requesteddiscordid',
  'requestedusername',
  'silver',
  'stock',
  'username',
])

export type RecoveryStateKey = (typeof RECOVERY_STATE_KEYS)[number]
export type RecoveryRow = Record<string, unknown>
export type GuildRecoveryState = Record<RecoveryStateKey, RecoveryRow[]>

export interface GuildRecoverySource {
  workspaceId: string
  albionGuildId: string
  guildName: string | null
}

export interface Sha256Integrity {
  algorithm: 'SHA-256'
  digest: string
}

export interface GuildRecoveryManifest {
  kind: typeof GUILD_RECOVERY_KIND
  schemaVersion: typeof GUILD_RECOVERY_SCHEMA_VERSION
  backupId: string
  createdAt: string
  source: GuildRecoverySource
  state: GuildRecoveryState
  integrity: Sha256Integrity
}

export interface RecoveryStateSummary {
  counts: Record<RecoveryStateKey, number>
  totals: {
    pointBalance: string
    pointEscrow: string
    shopStock: string
    supplyStock: string
  }
}

export interface RecoveryStateDiff {
  domains: Record<
    RecoveryStateKey,
    { before: number; after: number; changed: boolean }
  >
  beforeTotals: RecoveryStateSummary['totals']
  afterTotals: RecoveryStateSummary['totals']
}

export interface GuildRecoveryPreview {
  backupId: string
  createdAt: string
  source: GuildRecoverySource
  summary: RecoveryStateSummary
  currentSummary: RecoveryStateSummary
  diff: RecoveryStateDiff
  manifestSha256: string
}

export interface GuildRecoveryReceipt {
  runId: string
  backupId: string
  completedAt: string
  source: GuildRecoverySource
  beforeSummary: RecoveryStateSummary
  afterSummary: RecoveryStateSummary
  diff: RecoveryStateDiff
  safetySnapshotStored: boolean
  replayed: boolean
}

export interface GuildRecoveryReceiptListItem {
  runId: string
  completedAt: string
  sourceGuildName: string | null
  sourceAlbionGuildId: string
}

export interface EventTemplatePackageEntry {
  name: string
  data: TemplateData
}

export interface SlotTemplatePackageEntry {
  name: string
  category: EventCategory
  data: SlotTemplateData
}

export interface GuildTemplatePackage {
  kind: typeof GUILD_TEMPLATE_PACKAGE_KIND
  schemaVersion: typeof GUILD_TEMPLATE_PACKAGE_SCHEMA_VERSION
  packageId: string
  createdAt: string
  source: { guildName: string | null }
  templates: {
    events: EventTemplatePackageEntry[]
    slots: SlotTemplatePackageEntry[]
  }
  integrity: Sha256Integrity
}

export interface GuildTemplateImportPlan {
  events: { added: number; updated: number }
  slots: { added: number; updated: number }
}

export type BackupParseError =
  | 'invalidFile'
  | 'invalidVersion'
  | 'unsupportedVersion'
  | 'invalidIntegrity'
  | 'invalidState'

// requireAdmin() returns the project-wide untyped service-role client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export async function exportGuildRecovery(
  db: Db,
  guildId: string,
): Promise<GuildRecoveryManifest> {
  const { data, error } = await db.rpc('export_guild_recovery_state', {
    p_guild_id: guildId,
  })
  if (error) throw new Error(error.message)
  if (!isPlainObject(data) || !isPlainObject(data.state)) {
    throw new Error('GUILD_RECOVERY_EXPORT_INVALID')
  }

  const unsigned = {
    kind: GUILD_RECOVERY_KIND,
    schemaVersion: GUILD_RECOVERY_SCHEMA_VERSION,
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: {
      workspaceId: requiredString(data.sourceWorkspaceId),
      albionGuildId: requiredString(data.sourceAlbionGuildId),
      guildName: nullableString(data.sourceGuildName),
    },
    state: data.state as GuildRecoveryState,
  }
  const manifest: GuildRecoveryManifest = {
    ...unsigned,
    integrity: {
      algorithm: 'SHA-256',
      digest: await sha256Hex(unsigned),
    },
  }
  const { error: registrationError } = await db.rpc(
    'register_guild_recovery_manifest',
    {
      p_guild_id: guildId,
      p_manifest: manifest,
      p_verified_sha256: manifest.integrity.digest,
    },
  )
  if (registrationError) throw new Error(registrationError.message)
  return manifest
}

export async function parseGuildRecoveryManifest(
  input: unknown,
): Promise<{ manifest?: GuildRecoveryManifest; error?: BackupParseError }> {
  if (!isPlainObject(input)) return { error: 'invalidFile' }
  if (!Object.hasOwn(input, 'schemaVersion')) return { error: 'invalidVersion' }
  if (input.schemaVersion !== GUILD_RECOVERY_SCHEMA_VERSION) {
    return { error: 'unsupportedVersion' }
  }
  if (
    !hasExactKeys(input, [
      'backupId',
      'createdAt',
      'integrity',
      'kind',
      'schemaVersion',
      'source',
      'state',
    ]) ||
    input.kind !== GUILD_RECOVERY_KIND ||
    !UUID_RE.test(stringValue(input.backupId)) ||
    !isIsoDate(input.createdAt) ||
    !isPlainObject(input.source) ||
    !hasExactKeys(input.source, ['albionGuildId', 'guildName', 'workspaceId']) ||
    !UUID_RE.test(stringValue(input.source.workspaceId)) ||
    !nonEmptyBoundedString(input.source.albionGuildId, 200) ||
    !(input.source.guildName === null || boundedString(input.source.guildName, 200)) ||
    !isPlainObject(input.integrity) ||
    !hasExactKeys(input.integrity, ['algorithm', 'digest']) ||
    input.integrity.algorithm !== 'SHA-256' ||
    !SHA256_RE.test(stringValue(input.integrity.digest))
  ) {
    return { error: 'invalidFile' }
  }

  const state = validateRecoveryState(input.state)
  if (!state) return { error: 'invalidState' }

  const unsigned = {
    kind: input.kind,
    schemaVersion: input.schemaVersion,
    backupId: input.backupId as string,
    createdAt: input.createdAt,
    source: input.source,
    state,
  }
  const digest = await sha256Hex(unsigned)
  if (digest !== input.integrity.digest) return { error: 'invalidIntegrity' }

  return {
    manifest: {
      ...unsigned,
      source: {
        workspaceId: input.source.workspaceId as string,
        albionGuildId: input.source.albionGuildId as string,
        guildName: input.source.guildName as string | null,
      },
      integrity: {
        algorithm: 'SHA-256',
        digest,
      },
    },
  }
}

export async function previewGuildRecovery(
  db: Db,
  guildId: string,
  manifest: GuildRecoveryManifest,
): Promise<GuildRecoveryPreview> {
  const { data, error } = await db.rpc('preview_guild_recovery_manifest', {
    p_guild_id: guildId,
    p_manifest: manifest,
    p_verified_sha256: manifest.integrity.digest,
  })
  if (error) throw new Error(error.message)
  return normalizeRecoveryPreview(data)
}

export async function applyGuildRecovery(
  db: Db,
  input: {
    guildId: string
    manifest: GuildRecoveryManifest
    idempotencyKey: string
    actorDiscordId: string
    actorUsername: string | null
  },
): Promise<GuildRecoveryReceipt> {
  if (!UUID_RE.test(input.idempotencyKey)) {
    throw new Error('GUILD_RECOVERY_COMMAND_INVALID')
  }
  const { data, error } = await db.rpc('restore_guild_recovery_manifest', {
    p_guild_id: input.guildId,
    p_manifest: input.manifest,
    p_verified_sha256: input.manifest.integrity.digest,
    p_idempotency_key: input.idempotencyKey,
    p_actor_discord_id: input.actorDiscordId,
    p_actor_username: input.actorUsername,
  })
  if (error) throw new Error(error.message)
  return normalizeRecoveryReceipt(data)
}

export async function listGuildRecoveryReceipts(
  db: Db,
  guildId: string,
  limit = 10,
): Promise<GuildRecoveryReceiptListItem[]> {
  const { data, error } = await db
    .from('guild_recovery_runs')
    .select(
      'id, completed_at, source_guild_name, source_albion_guild_id',
    )
    .eq('guild_id', guildId)
    .order('completed_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.trunc(limit))))
  if (error) {
    // Before migrations 301/302 are applied locally, the page should remain
    // usable for implementation review instead of failing at render time.
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error(error.message)
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    runId: requiredString(row.id),
    completedAt: requiredString(row.completed_at),
    sourceGuildName: nullableString(row.source_guild_name),
    sourceAlbionGuildId: requiredString(row.source_albion_guild_id),
  }))
}

export async function exportGuildTemplatePackage(
  db: Db,
  guildId: string,
  guildName: string | null,
): Promise<GuildTemplatePackage> {
  const [eventsResult, slotsResult] = await Promise.all([
    db
      .from('event_templates')
      .select('name, data')
      .eq('guild_id', guildId)
      .order('name', { ascending: true }),
    db
      .from('slot_templates')
      .select('name, category, data')
      .eq('guild_id', guildId)
      .order('name', { ascending: true }),
  ])
  if (eventsResult.error) throw new Error(eventsResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)

  const eventRows = (eventsResult.data ?? []) as Array<{
    name: string
    data: TemplateData
  }>
  const slotRows = (slotsResult.data ?? []) as Array<{
    name: string
    category: EventCategory
    data: SlotTemplateData
  }>
  if (
    eventRows.some((entry) => containsForbiddenTemplateData(entry.data)) ||
    slotRows.some((entry) => containsForbiddenTemplateData(entry.data))
  ) {
    throw new Error('GUILD_TEMPLATE_PACKAGE_SENSITIVE_DATA')
  }

  const unsigned = {
    kind: GUILD_TEMPLATE_PACKAGE_KIND,
    schemaVersion: GUILD_TEMPLATE_PACKAGE_SCHEMA_VERSION,
    packageId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: { guildName },
    templates: {
      events: eventRows.map((entry) => ({ name: entry.name, data: entry.data })),
      slots: slotRows.map((entry) => ({
        name: entry.name,
        category: entry.category,
        data: entry.data,
      })),
    },
  }
  return {
    ...unsigned,
    integrity: {
      algorithm: 'SHA-256',
      digest: await sha256Hex(unsigned),
    },
  }
}

export async function parseGuildTemplatePackage(
  input: unknown,
): Promise<{ package?: GuildTemplatePackage; error?: BackupParseError }> {
  if (!isPlainObject(input)) return { error: 'invalidFile' }
  if (!Object.hasOwn(input, 'schemaVersion')) return { error: 'invalidVersion' }
  if (input.schemaVersion !== GUILD_TEMPLATE_PACKAGE_SCHEMA_VERSION) {
    return { error: 'unsupportedVersion' }
  }
  if (
    !hasExactKeys(input, [
      'createdAt',
      'integrity',
      'kind',
      'packageId',
      'schemaVersion',
      'source',
      'templates',
    ]) ||
    input.kind !== GUILD_TEMPLATE_PACKAGE_KIND ||
    !UUID_RE.test(stringValue(input.packageId)) ||
    !isIsoDate(input.createdAt) ||
    !isPlainObject(input.source) ||
    !hasExactKeys(input.source, ['guildName']) ||
    !(input.source.guildName === null || boundedString(input.source.guildName, 200)) ||
    !isPlainObject(input.templates) ||
    !hasExactKeys(input.templates, ['events', 'slots']) ||
    !Array.isArray(input.templates.events) ||
    !Array.isArray(input.templates.slots) ||
    input.templates.events.length > 1000 ||
    input.templates.slots.length > 1000 ||
    !isPlainObject(input.integrity) ||
    !hasExactKeys(input.integrity, ['algorithm', 'digest']) ||
    input.integrity.algorithm !== 'SHA-256' ||
    !SHA256_RE.test(stringValue(input.integrity.digest))
  ) {
    return { error: 'invalidFile' }
  }

  const eventNames = new Set<string>()
  const events: EventTemplatePackageEntry[] = []
  for (const raw of input.templates.events) {
    if (
      !isPlainObject(raw) ||
      !hasExactKeys(raw, ['data', 'name']) ||
      !nonEmptyBoundedString(raw.name, NAME_MAX_LENGTH) ||
      eventNames.has(raw.name.trim()) ||
      !isPlainObject(raw.data) ||
      !Array.isArray(raw.data.parties) ||
      containsForbiddenTemplateData(raw.data)
    ) {
      return { error: 'invalidState' }
    }
    eventNames.add(raw.name.trim())
    events.push({ name: raw.name.trim(), data: raw.data as unknown as TemplateData })
  }

  const slotNames = new Set<string>()
  const slots: SlotTemplatePackageEntry[] = []
  for (const raw of input.templates.slots) {
    if (
      !isPlainObject(raw) ||
      !hasExactKeys(raw, ['category', 'data', 'name']) ||
      !nonEmptyBoundedString(raw.name, NAME_MAX_LENGTH) ||
      slotNames.has(raw.name.trim()) ||
      !isPlainObject(raw.data) ||
      containsForbiddenTemplateData(raw.data) ||
      !(EVENT_CATEGORIES as readonly unknown[]).includes(raw.category)
    ) {
      return { error: 'invalidState' }
    }
    slotNames.add(raw.name.trim())
    slots.push({
      name: raw.name.trim(),
      category: raw.category as EventCategory,
      data: raw.data as unknown as SlotTemplateData,
    })
  }

  const unsigned = {
    kind: input.kind,
    schemaVersion: input.schemaVersion,
    packageId: input.packageId as string,
    createdAt: input.createdAt,
    source: input.source,
    templates: { events, slots },
  }
  const digest = await sha256Hex(unsigned)
  if (digest !== input.integrity.digest) return { error: 'invalidIntegrity' }

  return {
    package: {
      ...unsigned,
      source: { guildName: input.source.guildName as string | null },
      integrity: { algorithm: 'SHA-256', digest },
    },
  }
}

export async function previewGuildTemplatePackage(
  db: Db,
  guildId: string,
  templatePackage: GuildTemplatePackage,
): Promise<GuildTemplateImportPlan> {
  const [eventNames, slotNames] = await Promise.all([
    fetchTemplateNames(db, 'event_templates', guildId),
    fetchTemplateNames(db, 'slot_templates', guildId),
  ])
  return {
    events: countTemplateChanges(
      templatePackage.templates.events.map((entry) => entry.name),
      eventNames,
    ),
    slots: countTemplateChanges(
      templatePackage.templates.slots.map((entry) => entry.name),
      slotNames,
    ),
  }
}

export async function applyGuildTemplatePackage(
  db: Db,
  guildId: string,
  templatePackage: GuildTemplatePackage,
): Promise<GuildTemplateImportPlan> {
  const { data, error } = await db.rpc('import_guild_template_package', {
    p_guild_id: guildId,
    p_package: templatePackage,
  })
  if (error) throw new Error(error.message)
  if (!isPlainObject(data)) throw new Error('GUILD_TEMPLATE_PACKAGE_RESULT_INVALID')
  return {
    events: normalizeTemplateCount(data.events),
    slots: normalizeTemplateCount(data.slots),
  }
}

function validateRecoveryState(input: unknown): GuildRecoveryState | null {
  if (
    !isPlainObject(input) ||
    !hasExactKeys(input, [...RECOVERY_STATE_KEYS])
  ) return null

  const state = {} as GuildRecoveryState
  let totalRows = 0
  for (const key of RECOVERY_STATE_KEYS) {
    const rows = input[key]
    if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_DOMAIN) return null
    totalRows += rows.length
    if (
      totalRows > MAX_TOTAL_ROWS ||
      rows.some((row) => !isPlainObject(row) || Object.hasOwn(row, 'guild_id'))
    ) return null
    state[key] = rows as RecoveryRow[]
  }

  for (const key of ID_STATE_KEYS) {
    const ids = new Set<string>()
    for (const row of state[key]) {
      const id = stringValue(row.id)
      if (!UUID_RE.test(id) || ids.has(id)) return null
      ids.add(id)
    }
  }

  const memberIds = new Set<string>()
  for (const row of state.memberRefs) {
    if (
      !hasExactKeys(row, ['avatar', 'discordId', 'username', 'withdrawnAt']) ||
      !nonEmptyBoundedString(row.discordId, 128) ||
      !nonEmptyBoundedString(row.username, 128) ||
      !(row.avatar === null || boundedString(row.avatar, 512)) ||
      !(row.withdrawnAt === null || isIsoDate(row.withdrawnAt)) ||
      memberIds.has(row.discordId as string)
    ) return null
    memberIds.add(row.discordId as string)
  }

  const balanceIds = new Set<string>()
  for (const row of state.pointBalances) {
    const discordId = stringValue(row.discordId)
    const balance = stringValue(row.balance)
    if (
      !hasExactKeys(row, ['balance', 'discordId']) ||
      !memberIds.has(discordId) ||
      !INTEGER_TEXT_RE.test(balance) ||
      !isPostgresPointBalance(balance) ||
      BigInt(balance) === 0n ||
      balanceIds.has(discordId)
    ) return null
    balanceIds.add(discordId)
  }

  const shopKeys = new Set<string>()
  for (const row of state.shopInventory) {
    const uniqueName = stringValue(row.unique_name)
    const enchant = stringValue(row.enchant)
    const stock = stringValue(row.stock)
    const key = `${uniqueName}|${enchant}`
    if (
      !nonEmptyBoundedString(uniqueName, 200) ||
      !/^[0-4]$/.test(enchant) ||
      !POSITIVE_INT_TEXT_RE.test(stock) ||
      Number(stock) > POSTGRES_INT_MAX ||
      !nonEmptyBoundedString(row.name_ko, 300) ||
      shopKeys.has(key)
    ) return null
    shopKeys.add(key)
  }

  const supplyKeys = new Set<string>()
  for (const row of state.supplyInventory) {
    const itemId = stringValue(row.item_id)
    const quantity = stringValue(row.quantity)
    if (
      !nonEmptyBoundedString(itemId, 300) ||
      !POSITIVE_INT_TEXT_RE.test(quantity) ||
      Number(quantity) > POSTGRES_INT_MAX ||
      supplyKeys.has(itemId)
    ) return null
    supplyKeys.add(itemId)
  }

  if (
    state.exchangeRequests.some((row) => row.status !== 'pending') ||
    state.shopOrders.some(
      (row) => row.status !== 'pending' || typeof row.stock_reserved_at !== 'string',
    ) ||
    state.pointEscrows.some(
      (row) =>
        row.status !== 'held' ||
        row.source_kind !== 'member_trade_order' ||
        !POSITIVE_INT_TEXT_RE.test(stringValue(row.amount)) ||
        Number(row.amount) > POSTGRES_INT_MAX,
    ) ||
    state.regearRequests.some(
      (row) => row.status !== 'pending' && row.status !== 'approved',
    ) ||
    state.craftOrders.some((row) => row.status !== 'open') ||
    state.craftTasks.some(
      (row) =>
        !['queued', 'claimed', 'delivered', 'collected', 'expired', 'approved'].includes(
          stringValue(row.status),
        ) ||
        !['regear', 'guild_order'].includes(stringValue(row.task_kind)) ||
        (['collected', 'expired'].includes(stringValue(row.status)) &&
          row.reimbursement_status !== 'pending'),
    ) ||
    state.tradeListings.some(
      (row) => !['active', 'paused', 'sold_out'].includes(stringValue(row.status)),
    ) ||
    state.tradeOrders.some(
      (row) =>
        !['awaiting_delivery', 'delivered', 'disputed'].includes(
          stringValue(row.status),
        ),
    ) ||
    state.tradePriceOffers.some((row) => row.status !== 'pending')
  ) return null

  if (
    !allChildrenReference(state.shopOrderItems, 'order_id', state.shopOrders) ||
    !allChildrenReference(state.tradeListingItems, 'listing_id', state.tradeListings) ||
    !allChildrenReference(state.tradeOrderItems, 'order_id', state.tradeOrders) ||
    !allChildrenReference(state.tradeEvents, 'order_id', state.tradeOrders) ||
    !allChildrenReference(
      state.tradePriceOfferItems,
      'offer_id',
      state.tradePriceOffers,
    )
  ) return null

  const orderById = mapById(state.tradeOrders)
  if (
    state.pointEscrows.some((escrow) => {
      const order = orderById.get(stringValue(escrow.source_id))
      return !order ||
        order.escrow_id !== escrow.id ||
        stringValue(order.total_points) !== stringValue(escrow.amount)
    })
  ) return null

  const balances = new Map(
    state.pointBalances.map((row) => [
      stringValue(row.discordId),
      BigInt(stringValue(row.balance)),
    ]),
  )
  const escrowTotals = new Map<string, bigint>()
  for (const escrow of state.pointEscrows) {
    const discordId = stringValue(escrow.discord_id)
    escrowTotals.set(
      discordId,
      (escrowTotals.get(discordId) ?? 0n) + BigInt(stringValue(escrow.amount)),
    )
  }
  if (
    [...escrowTotals].some(
      ([discordId, amount]) => (balances.get(discordId) ?? 0n) < amount,
    )
  ) return null

  const regearIds = idSet(state.regearRequests)
  const craftOrderIds = idSet(state.craftOrders)
  if (
    state.craftTasks.some((task) =>
      task.task_kind === 'regear'
        ? !regearIds.has(stringValue(task.regear_request_id))
        : !craftOrderIds.has(stringValue(task.craft_order_id)),
    )
  ) return null

  const eventIds = idSet(state.eventRefs)
  const windowIds = idSet(state.regearWindowRefs)
  const policyIds = idSet(state.eventPolicySnapshots)
  if (
    state.regearRequests.some(
      (request) =>
        (request.event_id !== null && !eventIds.has(stringValue(request.event_id))) ||
        (request.regear_window_id !== null &&
          !windowIds.has(stringValue(request.regear_window_id))) ||
        (request.event_regear_policy_snapshot_id !== null &&
          !policyIds.has(stringValue(request.event_regear_policy_snapshot_id))),
    )
  ) return null
  if (
    state.eventRefs.some(
      (event) =>
        !state.regearRequests.some(
          (request) => request.event_id === event.id,
        ),
    ) ||
    state.regearWindowRefs.some(
      (window) =>
        !state.regearRequests.some(
          (request) => request.regear_window_id === window.id,
        ),
    ) ||
    state.eventPolicySnapshots.some(
      (policy) =>
        !state.regearRequests.some(
          (request) => request.event_regear_policy_snapshot_id === policy.id,
        ),
    )
  ) return null

  const referencedMembers = collectReferencedMembers(state)
  if (
    [...referencedMembers].some((discordId) => !memberIds.has(discordId)) ||
    [...memberIds].some((discordId) => !referencedMembers.has(discordId))
  ) {
    return null
  }
  return state
}

function collectReferencedMembers(state: GuildRecoveryState): Set<string> {
  const result = new Set<string>()
  const add = (rows: RecoveryRow[], ...keys: string[]) => {
    for (const row of rows) {
      for (const key of keys) {
        const value = stringValue(row[key]).trim()
        if (value) result.add(value)
      }
    }
  }
  add(state.pointBalances, 'discordId')
  add(state.pointEscrows, 'discord_id')
  add(state.exchangeRequests, 'discord_id')
  add(state.shopOrders, 'discord_id')
  add(state.regearRequests, 'discord_id')
  add(state.craftTasks, 'crafter_discord_id')
  add(state.craftOrders, 'posted_by_discord_id')
  add(state.tradeListings, 'seller_discord_id')
  add(state.tradeOrders, 'buyer_discord_id', 'seller_discord_id')
  add(state.tradePriceOffers, 'buyer_discord_id', 'seller_discord_id')
  return result
}

function allChildrenReference(
  children: RecoveryRow[],
  parentKey: string,
  parents: RecoveryRow[],
): boolean {
  const parentsById = idSet(parents)
  return children.every((child) => parentsById.has(stringValue(child[parentKey])))
}

function idSet(rows: RecoveryRow[]): Set<string> {
  return new Set(rows.map((row) => stringValue(row.id)))
}

function mapById(rows: RecoveryRow[]): Map<string, RecoveryRow> {
  return new Map(rows.map((row) => [stringValue(row.id), row]))
}

function normalizeRecoveryPreview(input: unknown): GuildRecoveryPreview {
  if (!isPlainObject(input) || !isPlainObject(input.source)) {
    throw new Error('GUILD_RECOVERY_PREVIEW_INVALID')
  }
  return {
    backupId: requiredString(input.backupId),
    createdAt: requiredString(input.createdAt),
    source: normalizeRecoverySource(input.source),
    summary: normalizeRecoverySummary(input.summary),
    currentSummary: normalizeRecoverySummary(input.currentSummary),
    diff: normalizeRecoveryDiff(input.diff),
    manifestSha256: requiredString(input.manifestSha256),
  }
}

function normalizeRecoveryReceipt(input: unknown): GuildRecoveryReceipt {
  if (!isPlainObject(input) || !isPlainObject(input.source)) {
    throw new Error('GUILD_RECOVERY_RECEIPT_INVALID')
  }
  return {
    runId: requiredString(input.runId),
    backupId: requiredString(input.backupId),
    completedAt: requiredString(input.completedAt),
    source: normalizeRecoverySource(input.source),
    beforeSummary: normalizeRecoverySummary(input.beforeSummary),
    afterSummary: normalizeRecoverySummary(input.afterSummary),
    diff: normalizeRecoveryDiff(input.diff),
    safetySnapshotStored: input.safetySnapshotStored === true,
    replayed: input.replayed === true,
  }
}

function normalizeRecoverySource(input: Record<string, unknown>): GuildRecoverySource {
  return {
    workspaceId: requiredString(input.workspaceId),
    albionGuildId: requiredString(input.albionGuildId),
    guildName: nullableString(input.guildName),
  }
}

function normalizeRecoverySummary(input: unknown): RecoveryStateSummary {
  if (!isPlainObject(input) || !isPlainObject(input.counts) || !isPlainObject(input.totals)) {
    throw new Error('GUILD_RECOVERY_SUMMARY_INVALID')
  }
  const counts = {} as Record<RecoveryStateKey, number>
  for (const key of RECOVERY_STATE_KEYS) {
    const count = input.counts[key]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error('GUILD_RECOVERY_SUMMARY_INVALID')
    }
    counts[key] = count
  }
  return {
    counts,
    totals: {
      pointBalance: requiredString(input.totals.pointBalance),
      pointEscrow: requiredString(input.totals.pointEscrow),
      shopStock: requiredString(input.totals.shopStock),
      supplyStock: requiredString(input.totals.supplyStock),
    },
  }
}

function normalizeRecoveryDiff(input: unknown): RecoveryStateDiff {
  if (
    !isPlainObject(input) ||
    !isPlainObject(input.domains) ||
    !isPlainObject(input.beforeTotals) ||
    !isPlainObject(input.afterTotals)
  ) throw new Error('GUILD_RECOVERY_DIFF_INVALID')
  const domains = {} as RecoveryStateDiff['domains']
  for (const key of RECOVERY_STATE_KEYS) {
    const value = input.domains[key]
    if (
      !isPlainObject(value) ||
      typeof value.before !== 'number' ||
      typeof value.after !== 'number' ||
      typeof value.changed !== 'boolean'
    ) throw new Error('GUILD_RECOVERY_DIFF_INVALID')
    domains[key] = {
      before: value.before,
      after: value.after,
      changed: value.changed,
    }
  }
  const totals = (value: Record<string, unknown>) => ({
    pointBalance: requiredString(value.pointBalance),
    pointEscrow: requiredString(value.pointEscrow),
    shopStock: requiredString(value.shopStock),
    supplyStock: requiredString(value.supplyStock),
  })
  return {
    domains,
    beforeTotals: totals(input.beforeTotals),
    afterTotals: totals(input.afterTotals),
  }
}

function normalizeTemplateCount(input: unknown): { added: number; updated: number } {
  if (
    !isPlainObject(input) ||
    typeof input.added !== 'number' ||
    typeof input.updated !== 'number'
  ) throw new Error('GUILD_TEMPLATE_PACKAGE_RESULT_INVALID')
  return { added: input.added, updated: input.updated }
}

async function fetchTemplateNames(
  db: Db,
  table: 'event_templates' | 'slot_templates',
  guildId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from(table)
    .select('name')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as Array<{ name: string }>).map((row) => row.name))
}

function countTemplateChanges(
  names: string[],
  existing: Set<string>,
): { added: number; updated: number } {
  let added = 0
  let updated = 0
  for (const name of names) {
    if (existing.has(name)) updated += 1
    else added += 1
  }
  return { added, updated }
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  )
}

function containsForbiddenTemplateData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenTemplateData)
  if (!isPlainObject(value)) return false
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (FORBIDDEN_TEMPLATE_DATA_KEYS.has(normalizedKey)) return true
    if (containsForbiddenTemplateData(child)) return true
  }
  return false
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
}

function isPostgresPointBalance(value: string): boolean {
  try {
    const integer = BigInt(value)
    return integer >= BigInt(POSTGRES_INT_MIN) &&
      integer <= BigInt(POSTGRES_INT_MAX)
  } catch {
    return false
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('GUILD_RECOVERY_RESULT_INVALID')
  }
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function nonEmptyBoundedString(value: unknown, max: number): value is string {
  return boundedString(value, max) && value.trim().length > 0
}
