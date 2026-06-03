import type { SupabaseClient } from '@supabase/supabase-js'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'

type ShopInventoryDb = Pick<SupabaseClient, 'from'>

export interface ShopInventoryPriceKeyRow {
  unique_name: string
  enchant: number
  quality: number
}

export async function loadShopInventoryPriceKeyRows(
  db: ShopInventoryDb,
  guildId: string,
): Promise<{ rows: ShopInventoryPriceKeyRow[]; error?: string }> {
  return selectPagedRows<ShopInventoryPriceKeyRow>({
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
        .select(
          'id, unique_name, enchant, quality, stock, name_ko, category, tier, manual_price, auto_price_silver, price_warning_level',
        )
        .eq('guild_id', guildId)
        .gt('stock', 0)
        .order('name_ko', { ascending: true })
        .order('id', { ascending: true }) as unknown as SupabasePagedQuery<PublicShopCatalogRow>,
  })
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
        .order('name_ko', { ascending: true })
        .order('id', { ascending: true }) as unknown as SupabasePagedQuery<AdminShopInventoryRow>,
  })
}
