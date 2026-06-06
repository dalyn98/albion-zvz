// 길드 데이터 백업/복원 — 어드민이 포인트 잔액 + 이벤트/슬롯 템플릿 + 길드재고
// 를 단일 JSON 파일로 내려받고 다시 올려 복구할 수 있게 한다.
//
// 적용 정책:
//   - 포인트: 잔액 스냅샷. 복원 시 (백업 잔액 - 현재 잔액) 만큼 admin_adjust ledger
//     entry 를 1건 추가. 기존 history 는 보존.
//   - 템플릿(events/slots): (guild_id, name) 기준 upsert. 백업에 없는 기존 템플릿
//     은 그대로 둔다.
//   - 길드재고: (guild_id, unique_name, enchant) 기준 upsert.
//     stock + manual_price + price_source(='manual') 만 갱신. 자동 시세 컬럼은
//     건드리지 않음. 백업에 없는 행은 그대로 둔다.
//
// guild_id 는 항상 호출자 세션에서 받아 적용한다 — 파일에 들어 있는 sourceGuildId
// 는 참고용일 뿐 신뢰하지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TemplateData } from '@/app/actions/templates'
import type { SlotTemplateData } from '@/app/actions/slot-templates'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import { listGuildPointDeltas } from './point-ledger'
import { canonicalShopQuality } from './shop/quality'

export const BACKUP_VERSION = 1
const POINT_MEMO_PREFIX = 'backup_restore'
const NAME_MAX_LENGTH = 80
const ITEM_UNIQUE_NAME_MAX_LENGTH = 80
const ITEM_UNIQUE_NAME_RE = /^[A-Z0-9_@]+$/i
const POSTGRES_INT_MAX = 2147483647

export interface PointBackupEntry {
  discordId: string
  username: string | null
  balance: number
}

export interface EventTemplateBackupEntry {
  name: string
  data: TemplateData
}

export interface SlotTemplateBackupEntry {
  name: string
  category: EventCategory
  data: SlotTemplateData
}

export interface InventoryBackupEntry {
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string | null
  category: string | null
  tier: number | null
  stock: number
  manualPrice: number | null
}

export interface GuildBackup {
  version: number
  exportedAt: string
  sourceGuildId: string
  sourceGuildName: string | null
  points: { balances: PointBackupEntry[] }
  templates: {
    events: EventTemplateBackupEntry[]
    slots: SlotTemplateBackupEntry[]
  }
  inventory: { items: InventoryBackupEntry[] }
}

export interface BackupImportPlan {
  points: { adjustments: number; skippedNonMembers: number }
  events: { added: number; updated: number; unchanged: number }
  slots: { added: number; updated: number; unchanged: number }
  inventory: { added: number; updated: number; unchanged: number }
}

export interface BackupImportSummary extends BackupImportPlan {
  applied: boolean
}

// Supabase 클라이언트 타입은 프로젝트 곳곳에서 any 로 받아오는 패턴이 굳어져
// 있어 여기서도 동일하게 쓴다 (`requireAdmin` 반환을 그대로 받아쓰기 위함).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export async function exportGuildBackup(
  db: Db,
  guildId: string,
  guildName: string | null,
): Promise<GuildBackup> {
  const [points, events, slots, inventory] = await Promise.all([
    fetchPointBalances(db, guildId),
    fetchEventTemplates(db, guildId),
    fetchSlotTemplates(db, guildId),
    fetchInventory(db, guildId),
  ])
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sourceGuildId: guildId,
    sourceGuildName: guildName,
    points: { balances: points },
    templates: { events, slots },
    inventory: { items: inventory },
  }
}

async function fetchPointBalances(db: Db, guildId: string): Promise<PointBackupEntry[]> {
  const { rows, error } = await listGuildPointDeltas(db, guildId)
  if (error) throw new Error(error)
  const balances = new Map<string, { balance: number; username: string | null }>()
  for (const row of rows) {
    const prev = balances.get(row.discordId)
    const sum = (prev?.balance ?? 0) + row.delta
    balances.set(row.discordId, { balance: sum, username: prev?.username ?? null })
  }
  // 닉네임은 guild_avatars.username 에서 가져와 채워준다 — 백업 보고용 표시 필드.
  const { data: avatars, error: avatarErr } = await db
    .from('guild_avatars')
    .select('discord_id, username')
    .eq('guild_id', guildId)
  if (avatarErr) throw new Error(avatarErr.message)
  for (const a of (avatars ?? []) as Array<{ discord_id: string; username: string | null }>) {
    const entry = balances.get(a.discord_id)
    if (entry) entry.username = a.username ?? entry.username
  }
  return Array.from(balances.entries())
    .filter(([, v]) => v.balance !== 0)
    .map(([discordId, v]) => ({ discordId, username: v.username, balance: v.balance }))
    .sort((a, b) => b.balance - a.balance)
}

async function fetchEventTemplates(db: Db, guildId: string): Promise<EventTemplateBackupEntry[]> {
  const { data, error } = await db
    .from('event_templates')
    .select('name, data')
    .eq('guild_id', guildId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ name: string; data: TemplateData }>).map((r) => ({
    name: r.name,
    data: r.data,
  }))
}

async function fetchSlotTemplates(db: Db, guildId: string): Promise<SlotTemplateBackupEntry[]> {
  const { data, error } = await db
    .from('slot_templates')
    .select('name, category, data')
    .eq('guild_id', guildId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ name: string; category: string | null; data: SlotTemplateData }>)
    .map((r) => ({
      name: r.name,
      category: (EVENT_CATEGORIES as readonly string[]).includes(r.category ?? '')
        ? (r.category as EventCategory)
        : '전투',
      data: r.data,
    }))
}

async function fetchInventory(db: Db, guildId: string): Promise<InventoryBackupEntry[]> {
  const { data, error } = await db
    .from('shop_inventory')
    .select('unique_name, enchant, quality, name_ko, category, tier, stock, manual_price')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{
    unique_name: string
    enchant: number
    quality: number
    name_ko: string | null
    category: string | null
    tier: number | null
    stock: number
    manual_price: number | null
  }>)
    .filter((r) => r.stock > 0 || r.manual_price !== null)
    .map((r) => ({
      uniqueName: r.unique_name,
      enchant: r.enchant,
      quality: r.quality,
      nameKo: r.name_ko,
      category: r.category,
      tier: r.tier,
      stock: r.stock,
      manualPrice: r.manual_price,
    }))
    .sort((a, b) =>
      a.uniqueName === b.uniqueName
        ? a.enchant - b.enchant || a.quality - b.quality
        : a.uniqueName.localeCompare(b.uniqueName),
    )
}

// JSON.parse 결과를 받아 GuildBackup 형태로 검증·정규화. 잘못된 항목은 무시하고
// 통과한 것만 모은다 (전체를 거부하지 않음 — 부분 복원 가능성 확보).
export function parseGuildBackup(input: unknown): { backup?: GuildBackup; error?: string } {
  if (!isPlainObject(input)) return { error: 'invalidFile' }
  const version = input.version
  if (typeof version !== 'number') return { error: 'invalidVersion' }
  if (version !== BACKUP_VERSION) return { error: 'unsupportedVersion' }

  const points = isPlainObject(input.points) && Array.isArray(input.points.balances)
    ? dedupeByLast(
        input.points.balances.flatMap(normalizePointEntry),
        (entry) => entry.discordId,
      )
    : []
  const events =
    isPlainObject(input.templates) && Array.isArray(input.templates.events)
      ? dedupeByLast(
          input.templates.events.flatMap(normalizeEventTemplate),
          (entry) => entry.name,
        )
      : []
  const slots =
    isPlainObject(input.templates) && Array.isArray(input.templates.slots)
      ? dedupeByLast(
          input.templates.slots.flatMap(normalizeSlotTemplate),
          (entry) => entry.name,
        )
      : []
  const inventory =
    isPlainObject(input.inventory) && Array.isArray(input.inventory.items)
      ? dedupeByLast(
          input.inventory.items.flatMap(normalizeInventoryEntry),
          (entry) => inventoryKey(entry.uniqueName, entry.enchant),
        )
      : []

  return {
    backup: {
      version: BACKUP_VERSION,
      exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : '',
      sourceGuildId: typeof input.sourceGuildId === 'string' ? input.sourceGuildId : '',
      sourceGuildName: typeof input.sourceGuildName === 'string' ? input.sourceGuildName : null,
      points: { balances: points },
      templates: { events, slots },
      inventory: { items: inventory },
    },
  }
}

function dedupeByLast<T>(entries: T[], keyOf: (entry: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const entry of entries) {
    byKey.set(keyOf(entry), entry)
  }
  return Array.from(byKey.values())
}

function normalizePointEntry(raw: unknown): PointBackupEntry[] {
  if (!isPlainObject(raw)) return []
  const discordId = typeof raw.discordId === 'string' ? raw.discordId.trim() : ''
  const balance = typeof raw.balance === 'number' && Number.isFinite(raw.balance)
    ? Math.trunc(raw.balance)
    : Number.NaN
  if (!discordId || Number.isNaN(balance)) return []
  return [{
    discordId,
    username: typeof raw.username === 'string' ? raw.username : null,
    balance,
  }]
}

function normalizeEventTemplate(raw: unknown): EventTemplateBackupEntry[] {
  if (!isPlainObject(raw)) return []
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, NAME_MAX_LENGTH) : ''
  if (!name || !isPlainObject(raw.data)) return []
  if (!Array.isArray(raw.data.parties)) return []
  return [{ name, data: raw.data as unknown as TemplateData }]
}

function normalizeSlotTemplate(raw: unknown): SlotTemplateBackupEntry[] {
  if (!isPlainObject(raw)) return []
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, NAME_MAX_LENGTH) : ''
  if (!name || !isPlainObject(raw.data)) return []
  const category = (EVENT_CATEGORIES as readonly string[]).includes(
    typeof raw.category === 'string' ? raw.category : '',
  )
    ? (raw.category as EventCategory)
    : '전투'
  return [{ name, category, data: raw.data as unknown as SlotTemplateData }]
}

function normalizeInventoryEntry(raw: unknown): InventoryBackupEntry[] {
  if (!isPlainObject(raw)) return []
  const uniqueName = typeof raw.uniqueName === 'string' ? raw.uniqueName.trim() : ''
  const enchant = toIntInRange(raw.enchant, 0, 4)
  const quality = toIntInRange(raw.quality, 1, 5)
  const stock = toIntInRange(raw.stock, 0, POSTGRES_INT_MAX)
  if (
    !uniqueName ||
    uniqueName.length > ITEM_UNIQUE_NAME_MAX_LENGTH ||
    !ITEM_UNIQUE_NAME_RE.test(uniqueName) ||
    enchant === null ||
    quality === null ||
    stock === null
  ) return []
  return [{
    uniqueName,
    enchant,
    quality,
    nameKo: typeof raw.nameKo === 'string' ? raw.nameKo : null,
    category: typeof raw.category === 'string' ? raw.category : null,
    tier: typeof raw.tier === 'number' && Number.isFinite(raw.tier) ? Math.trunc(raw.tier) : null,
    stock,
    manualPrice:
      toIntInRange(raw.manualPrice, 0, POSTGRES_INT_MAX) ??
      null,
  }]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toIntInRange(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const n = Math.trunc(v)
  return n >= min && n <= max ? n : null
}

interface ImportContext {
  guildId: string
  handledBy: string
  handledByUsername: string | null
}

export async function previewBackupImport(
  db: Db,
  guildId: string,
  backup: GuildBackup,
): Promise<BackupImportPlan> {
  return computePlan(db, guildId, backup)
}

export async function applyBackupImport(
  db: Db,
  ctx: ImportContext,
  backup: GuildBackup,
): Promise<BackupImportSummary> {
  const plan = await computePlan(db, ctx.guildId, backup)

  await applyPointAdjustments(db, ctx, backup.points.balances)
  await applyEventTemplates(db, ctx.guildId, backup.templates.events)
  await applySlotTemplates(db, ctx.guildId, backup.templates.slots)
  await applyInventory(db, ctx.guildId, backup.inventory.items)

  return { ...plan, applied: true }
}

async function computePlan(
  db: Db,
  guildId: string,
  backup: GuildBackup,
): Promise<BackupImportPlan> {
  const [pointPlan, eventPlan, slotPlan, inventoryPlan] = await Promise.all([
    planPoints(db, guildId, backup.points.balances),
    planEventTemplates(db, guildId, backup.templates.events),
    planSlotTemplates(db, guildId, backup.templates.slots),
    planInventory(db, guildId, backup.inventory.items),
  ])
  return {
    points: pointPlan,
    events: eventPlan,
    slots: slotPlan,
    inventory: inventoryPlan,
  }
}

async function planPoints(
  db: Db,
  guildId: string,
  entries: PointBackupEntry[],
): Promise<BackupImportPlan['points']> {
  if (entries.length === 0) return { adjustments: 0, skippedNonMembers: 0 }
  const memberSet = await fetchGuildMemberDiscordIds(db, guildId)
  const currentBalances = await fetchCurrentBalances(db, guildId)
  let adjustments = 0
  let skipped = 0
  for (const e of entries) {
    if (!memberSet.has(e.discordId)) {
      skipped += 1
      continue
    }
    const current = currentBalances.get(e.discordId) ?? 0
    if (e.balance - current !== 0) adjustments += 1
  }
  return { adjustments, skippedNonMembers: skipped }
}

async function fetchGuildMemberDiscordIds(db: Db, guildId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as Array<{ discord_id: string }>).map((r) => r.discord_id))
}

async function fetchCurrentBalances(db: Db, guildId: string): Promise<Map<string, number>> {
  const { rows, error } = await listGuildPointDeltas(db, guildId)
  if (error) throw new Error(error)
  const balances = new Map<string, number>()
  for (const r of rows) {
    balances.set(r.discordId, (balances.get(r.discordId) ?? 0) + r.delta)
  }
  return balances
}

async function applyPointAdjustments(
  db: Db,
  ctx: ImportContext,
  entries: PointBackupEntry[],
): Promise<void> {
  if (entries.length === 0) return
  const memberSet = await fetchGuildMemberDiscordIds(db, ctx.guildId)
  const currentBalances = await fetchCurrentBalances(db, ctx.guildId)
  const rows: Array<{
    guild_id: string
    discord_id: string
    delta: number
    reason: string
    memo: string
    handled_by: string
    handled_by_username: string | null
  }> = []
  for (const e of entries) {
    if (!memberSet.has(e.discordId)) continue
    const current = currentBalances.get(e.discordId) ?? 0
    const delta = e.balance - current
    if (delta === 0) continue
    rows.push({
      guild_id: ctx.guildId,
      discord_id: e.discordId,
      delta,
      reason: 'admin_adjust',
      memo: POINT_MEMO_PREFIX,
      handled_by: ctx.handledBy,
      handled_by_username: ctx.handledByUsername,
    })
  }
  if (rows.length === 0) return
  const { error } = await db.from('point_ledger').insert(rows)
  if (error) throw new Error(error.message)
}

async function planEventTemplates(
  db: Db,
  guildId: string,
  entries: EventTemplateBackupEntry[],
): Promise<BackupImportPlan['events']> {
  if (entries.length === 0) return { added: 0, updated: 0, unchanged: 0 }
  const existingNames = await fetchExistingNames(db, 'event_templates', guildId)
  let added = 0
  let updated = 0
  for (const e of entries) {
    if (existingNames.has(e.name)) updated += 1
    else added += 1
  }
  return { added, updated, unchanged: 0 }
}

async function planSlotTemplates(
  db: Db,
  guildId: string,
  entries: SlotTemplateBackupEntry[],
): Promise<BackupImportPlan['slots']> {
  if (entries.length === 0) return { added: 0, updated: 0, unchanged: 0 }
  const existingNames = await fetchExistingNames(db, 'slot_templates', guildId)
  let added = 0
  let updated = 0
  for (const e of entries) {
    if (existingNames.has(e.name)) updated += 1
    else added += 1
  }
  return { added, updated, unchanged: 0 }
}

async function fetchExistingNames(
  db: Db,
  table: 'event_templates' | 'slot_templates',
  guildId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from(table)
    .select('name')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as Array<{ name: string }>).map((r) => r.name))
}

async function applyEventTemplates(
  db: Db,
  guildId: string,
  entries: EventTemplateBackupEntry[],
): Promise<void> {
  if (entries.length === 0) return
  const existingNames = await fetchExistingNames(db, 'event_templates', guildId)
  for (const e of entries) {
    if (existingNames.has(e.name)) {
      const { error } = await db
        .from('event_templates')
        .update({ data: e.data })
        .eq('guild_id', guildId)
        .eq('name', e.name)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db
        .from('event_templates')
        .insert({ guild_id: guildId, name: e.name, data: e.data })
      if (error) throw new Error(error.message)
    }
  }
}

async function applySlotTemplates(
  db: Db,
  guildId: string,
  entries: SlotTemplateBackupEntry[],
): Promise<void> {
  if (entries.length === 0) return
  const existingNames = await fetchExistingNames(db, 'slot_templates', guildId)
  for (const e of entries) {
    if (existingNames.has(e.name)) {
      const { error } = await db
        .from('slot_templates')
        .update({ data: e.data, category: e.category })
        .eq('guild_id', guildId)
        .eq('name', e.name)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db
        .from('slot_templates')
        .insert({ guild_id: guildId, name: e.name, data: e.data, category: e.category })
      if (error) throw new Error(error.message)
    }
  }
}

async function planInventory(
  db: Db,
  guildId: string,
  entries: InventoryBackupEntry[],
): Promise<BackupImportPlan['inventory']> {
  if (entries.length === 0) return { added: 0, updated: 0, unchanged: 0 }
  const existing = await fetchInventoryKeySet(db, guildId)
  let added = 0
  let updated = 0
  for (const e of entries) {
    const key = inventoryKey(e.uniqueName, e.enchant)
    if (existing.has(key)) updated += 1
    else added += 1
  }
  return { added, updated, unchanged: 0 }
}

async function fetchInventoryKeySet(db: Db, guildId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('shop_inventory')
    .select('unique_name, enchant, quality')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return new Set(
    ((data ?? []) as Array<{ unique_name: string; enchant: number; quality: number }>).map((r) =>
      inventoryKey(r.unique_name, r.enchant),
    ),
  )
}

function inventoryKey(uniqueName: string, enchant: number): string {
  return `${uniqueName}|${enchant}`
}

async function applyInventory(
  db: Db,
  guildId: string,
  entries: InventoryBackupEntry[],
): Promise<void> {
  if (entries.length === 0) return
  const now = new Date().toISOString()
  for (const e of entries) {
    const update: Record<string, unknown> = {
      stock: e.stock,
      updated_at: now,
    }
    if (e.manualPrice !== null) {
      update.manual_price = e.manualPrice
      update.price_source = 'manual'
      update.price_warning_level = null
      update.price_updated_at = now
    } else {
      update.manual_price = null
    }
    const { data: existing, error: lookupErr } = await db
      .from('shop_inventory')
      .select('id')
      .eq('guild_id', guildId)
      .eq('unique_name', e.uniqueName)
      .eq('enchant', e.enchant)
      .maybeSingle()
    if (lookupErr) throw new Error(lookupErr.message)
    if (existing) {
      const { error } = await db
        .from('shop_inventory')
        .update(update)
        .eq('guild_id', guildId)
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.from('shop_inventory').insert({
        guild_id: guildId,
        unique_name: e.uniqueName,
        enchant: e.enchant,
        quality: canonicalShopQuality(),
        stock: e.stock,
        name_ko: e.nameKo ?? e.uniqueName,
        category: e.category,
        tier: e.tier,
        manual_price: e.manualPrice,
        price_source: e.manualPrice !== null ? 'manual' : null,
        price_updated_at: e.manualPrice !== null ? now : null,
      })
      if (error) throw new Error(error.message)
    }
  }
}
