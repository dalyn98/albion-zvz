import type { SupabaseClient } from '@supabase/supabase-js'
import items from '@/data/albion-items.json'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import { canonicalShopQuality } from '@/lib/shop/quality'
import {
  compareShopCatalogOrder,
  normalizeShopCatalogSortMode,
  type ShopCatalogSortMode,
} from '@/lib/shop/category-order'

type ShopInventoryDb = Pick<SupabaseClient, 'from'>
type PublicShopCatalogTier = 3 | 4 | 5 | 6 | 7 | 8

interface BundledShopCatalogItem {
  u: string
  c: string
  e: string
  k: string
  j: string
  z: string
  d: string
  dj: string
  de: string
  dz: string
}

interface PublicShopCatalogQuery<T> {
  select: (columns: string) => PublicShopCatalogQuery<T>
  eq: (column: string, value: unknown) => PublicShopCatalogQuery<T>
  gt: (column: string, value: unknown) => PublicShopCatalogQuery<T>
  or: (filter: string) => PublicShopCatalogQuery<T>
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ) => PublicShopCatalogQuery<T>
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
}

const BUNDLED_SHOP_CATALOG_ITEMS = items as BundledShopCatalogItem[]
const MAX_PUBLIC_SHOP_CATALOG_QUERY_LENGTH = 80
const MAX_PUBLIC_SHOP_CATALOG_SEARCH_UNIQUE_NAMES = 250
export const PUBLIC_SHOP_CATALOG_PAGE_SIZE = 80
const PUBLIC_SHOP_CATALOG_SELECT =
  'id, unique_name, enchant, quality, stock, name_ko, category, tier, manual_price, auto_price_silver, price_warning_level'

export interface ShopInventoryPriceKeyRow {
  unique_name: string
  enchant: number
  quality: number
}

export async function loadShopInventoryPriceKeyRows(
  db: ShopInventoryDb,
  guildId: string,
): Promise<{ rows: ShopInventoryPriceKeyRow[]; error?: string }> {
  const result = await selectPagedRows<ShopInventoryPriceKeyRow>({
    label: 'shop inventory price keys',
    buildQuery: () =>
      db
        .from('shop_inventory')
        .select('unique_name, enchant, quality')
        .eq('guild_id', guildId)
        .order('unique_name', { ascending: true })
        .order('enchant', { ascending: true })
        .order('quality', { ascending: true }) as unknown as SupabasePagedQuery<ShopInventoryPriceKeyRow>,
  })
  if (result.error) return result
  const byKey = new Map<string, ShopInventoryPriceKeyRow>()
  for (const row of result.rows) {
    const key = `${row.unique_name}|${row.enchant}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        unique_name: row.unique_name,
        enchant: row.enchant,
        quality: canonicalShopQuality(),
      })
    }
  }
  return { rows: [...byKey.values()] }
}

export interface PublicShopCatalogRow {
  id: string
  unique_name: string
  enchant: number
  quality: number
  stock: number
  name_ko: string
  category: string | null
  tier: number | null
  manual_price: number | null
  auto_price_silver: number | null
  price_warning_level: string | null
}

export async function loadPublicShopCatalogRows(
  db: ShopInventoryDb,
  guildId: string,
): Promise<{ rows: PublicShopCatalogRow[]; error?: string }> {
  return selectPagedRows<PublicShopCatalogRow>({
    label: 'public shop catalog',
    buildQuery: () =>
      db
        .from('shop_inventory')
        .select(PUBLIC_SHOP_CATALOG_SELECT)
        .eq('guild_id', guildId)
        .gt('stock', 0)
        .order('tier', { ascending: false, nullsFirst: false })
        .order('enchant', { ascending: false })
        .order('category', { ascending: true, nullsFirst: false })
        .order('name_ko', { ascending: true })
        .order('id', { ascending: true }) as unknown as SupabasePagedQuery<PublicShopCatalogRow>,
  })
}

export interface PublicShopCatalogPageInput {
  guildId: string
  page?: number | string | string[] | null
  pageSize?: number
  query?: string | string[] | null
  tier?: number | string | string[] | null
  sort?: ShopCatalogSortMode | string | string[] | null
}

export interface PublicShopCatalogPageResult {
  rows: PublicShopCatalogRow[]
  error?: string
  page: number
  pageSize: number
  query: string
  tier: PublicShopCatalogTier | null
  sort: ShopCatalogSortMode
  total: number
  isTotalApproximate: boolean
  hasMore: boolean
}

function firstParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalizePublicShopCatalogQuery(value: string | string[] | null | undefined): string {
  const raw = firstParam(value)
  if (!raw) return ''
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_PUBLIC_SHOP_CATALOG_QUERY_LENGTH)
}

function normalizePublicShopCatalogPage(value: number | string | string[] | null | undefined): number {
  const raw = typeof value === 'number' ? value : Number(firstParam(value))
  if (!Number.isInteger(raw) || raw < 1) return 1
  return raw
}

function normalizePublicShopCatalogPageSize(value: number | undefined): number {
  const raw = value ?? PUBLIC_SHOP_CATALOG_PAGE_SIZE
  if (!Number.isInteger(raw) || raw < 1) return PUBLIC_SHOP_CATALOG_PAGE_SIZE
  return Math.min(raw, 200)
}

function normalizePublicShopCatalogTier(
  value: number | string | string[] | null | undefined,
): PublicShopCatalogTier | null {
  const raw = typeof value === 'number' ? value : Number(firstParam(value))
  return raw === 3 || raw === 4 || raw === 5 || raw === 6 || raw === 7 || raw === 8
    ? raw
    : null
}

function normalizeCompactSearchKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s'·.,()（）-]/g, '')
}

function matchesBundledShopCatalogItem(item: BundledShopCatalogItem, query: string): boolean {
  const compactQuery = normalizeCompactSearchKey(query)
  const fields = [
    item.u,
    item.c,
    item.e,
    item.k,
    item.j,
    item.z,
    item.d,
    item.dj,
    item.de,
    item.dz,
  ]
  return fields.some((field) => {
    const normalized = field.normalize('NFKC').toLowerCase()
    return (
      normalized.includes(query) ||
      (compactQuery.length > 0 && normalizeCompactSearchKey(normalized).includes(compactQuery))
    )
  })
}

export function findPublicShopCatalogSearchUniqueNames(
  query: string,
  limit = MAX_PUBLIC_SHOP_CATALOG_SEARCH_UNIQUE_NAMES,
): string[] {
  const normalized = normalizePublicShopCatalogQuery(query)
  if (!normalized) return []

  const matches: string[] = []
  for (const item of BUNDLED_SHOP_CATALOG_ITEMS) {
    if (!matchesBundledShopCatalogItem(item, normalized)) continue
    matches.push(item.u)
    if (matches.length >= limit) break
  }
  return matches
}

function toPostgrestIlikePattern(query: string): string | null {
  const safe = query
    .replace(/[,*()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!safe) return null
  return `*${safe}*`
}

function toUniqueNameInCondition(uniqueNames: readonly string[]): string | null {
  const safe = uniqueNames.filter((value) => /^[A-Z0-9_@-]+$/.test(value))
  if (safe.length === 0) return null
  return `unique_name.in.(${safe.join(',')})`
}

function parseTierEnchantSearchToken(query: string): {
  tier: PublicShopCatalogTier | null
  enchant: number | null
  remainingQuery: string
} {
  const match = query.match(/(^|\s)t?([3-8])\s*[.-]\s*([0-4])(?=\s|$|[^\d])/i)
  if (!match || match.index === undefined) {
    return { tier: null, enchant: null, remainingQuery: query }
  }

  const tokenStart = match.index + match[1].length
  const tokenEnd = match.index + match[0].length
  const remainingQuery = `${query.slice(0, tokenStart)} ${query.slice(tokenEnd)}`
    .replace(/\s+/g, ' ')
    .trim()

  return {
    tier: Number(match[2]) as PublicShopCatalogTier,
    enchant: Number(match[3]),
    remainingQuery,
  }
}

function buildPublicShopCatalogSearchFilter(query: string): string | null {
  if (!query) return null

  const filters: string[] = []
  const pattern = toPostgrestIlikePattern(query)
  if (pattern) {
    filters.push(
      `name_ko.ilike.${pattern}`,
      `unique_name.ilike.${pattern}`,
      `category.ilike.${pattern}`,
    )
  }

  const uniqueNameFilter = toUniqueNameInCondition(
    findPublicShopCatalogSearchUniqueNames(query),
  )
  if (uniqueNameFilter) filters.push(uniqueNameFilter)

  return filters.length > 0 ? filters.join(',') : null
}

function applyPublicShopCatalogOrder(
  query: PublicShopCatalogQuery<PublicShopCatalogRow>,
  sort: ShopCatalogSortMode,
): PublicShopCatalogQuery<PublicShopCatalogRow> {
  if (sort === 'type') {
    return query
      .order('category', { ascending: true, nullsFirst: false })
      .order('tier', { ascending: false, nullsFirst: false })
      .order('enchant', { ascending: false })
      .order('name_ko', { ascending: true })
      .order('id', { ascending: true })
  }

  if (sort === 'name') {
    return query
      .order('name_ko', { ascending: true })
      .order('tier', { ascending: false, nullsFirst: false })
      .order('enchant', { ascending: false })
      .order('category', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
  }

  return query
    .order('tier', { ascending: false, nullsFirst: false })
    .order('enchant', { ascending: false })
    .order('category', { ascending: true, nullsFirst: false })
    .order('name_ko', { ascending: true })
    .order('id', { ascending: true })
}

export async function loadPublicShopCatalogPageRows(
  db: ShopInventoryDb,
  input: PublicShopCatalogPageInput,
): Promise<PublicShopCatalogPageResult> {
  const page = normalizePublicShopCatalogPage(input.page)
  const pageSize = normalizePublicShopCatalogPageSize(input.pageSize)
  const queryText = normalizePublicShopCatalogQuery(input.query)
  const tierEnchantSearch = parseTierEnchantSearchToken(queryText)
  const tier = normalizePublicShopCatalogTier(input.tier)
  const sort = normalizeShopCatalogSortMode(input.sort)
  const from = 0
  const visibleLimit = page * pageSize
  const to = visibleLimit

  let query = db
    .from('shop_inventory')
    .select(PUBLIC_SHOP_CATALOG_SELECT)
    .eq('guild_id', input.guildId)
    .gt('stock', 0) as unknown as PublicShopCatalogQuery<PublicShopCatalogRow>

  if (tier !== null) {
    query = query.eq('tier', tier)
  }

  if (tierEnchantSearch.tier !== null && tierEnchantSearch.tier !== tier) {
    query = query.eq('tier', tierEnchantSearch.tier)
  }
  if (tierEnchantSearch.enchant !== null) {
    query = query.eq('enchant', tierEnchantSearch.enchant)
  }

  const searchFilter = buildPublicShopCatalogSearchFilter(tierEnchantSearch.remainingQuery)
  if (searchFilter) {
    query = query.or(searchFilter)
  }

  const { data, error } = await applyPublicShopCatalogOrder(query, sort).range(from, to)

  const fetchedRows = data ?? []
  const hasMore = fetchedRows.length > visibleLimit
  const rows = (hasMore ? fetchedRows.slice(0, visibleLimit) : fetchedRows).sort(
    (a, b) => compareShopCatalogOrder(a, b, sort),
  )
  return {
    rows,
    error: error ? `public shop catalog page: ${error.message}` : undefined,
    page,
    pageSize,
    query: queryText,
    tier,
    sort,
    total: rows.length,
    isTotalApproximate: hasMore,
    hasMore,
  }
}

export interface AdminShopInventoryRow extends PublicShopCatalogRow {
  price_source: string | null
  price_updated_at: string | null
  updated_at: string | null
}

export async function loadAdminShopInventoryRows(
  db: ShopInventoryDb,
  guildId: string,
): Promise<{ rows: AdminShopInventoryRow[]; error?: string }> {
  return selectPagedRows<AdminShopInventoryRow>({
    label: 'admin shop inventory',
    buildQuery: () =>
      db
        .from('shop_inventory')
        .select(
          'id, unique_name, enchant, quality, stock, name_ko, category, tier, manual_price, auto_price_silver, price_source, price_warning_level, price_updated_at, updated_at',
        )
        .eq('guild_id', guildId)
        .order('tier', { ascending: false, nullsFirst: false })
        .order('enchant', { ascending: false })
        .order('category', { ascending: true, nullsFirst: false })
        .order('name_ko', { ascending: true })
        .order('id', { ascending: true }) as unknown as SupabasePagedQuery<AdminShopInventoryRow>,
  })
}
