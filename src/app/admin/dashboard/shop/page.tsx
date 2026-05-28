import Link from 'next/link'
import { Shield, ShoppingBag, Info } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import ShopImportForm from '@/components/ShopImportForm'
import ShopImportTierFilterForm from '@/components/ShopImportTierFilterForm'
import ShopBlacklistEditor from '@/components/ShopBlacklistEditor'
import ShopSilverRateForm from '@/components/ShopSilverRateForm'
import ShopInventoryEditor, { type InventoryRow } from '@/components/ShopInventoryEditor'
import NoticeSettingForm, { NOTICE_MAX_LENGTH } from '@/components/NoticeSettingForm'
import AodpSettingsForm from '@/components/AodpSettingsForm'
import ShopAnomalyPanel from '@/components/ShopAnomalyPanel'
import LogOperatingStartSettingsForm from '@/components/LogOperatingStartSettingsForm'
import { parseShopDiscountRate } from '@/lib/shop/price'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { categoryRank } from '@/lib/shop/category-order'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type AodpQuality = 1 | 2 | 3 | 4 | 5
const SHOP_PAGE_CAPS = [
  CAP.INVENTORY_MANAGE,
  CAP.INVENTORY_DELIVER,
  CAP.SHOP_PRICING,
  CAP.CHEST_LOG_PASTE,
] as const

export default async function AdminShopPage() {
  const db = await requireAnyCapability(SHOP_PAGE_CAPS)
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [tNav, tPage] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminShopPage'),
  ])
  const operatingStart = await getLogOperatingStart('shopChest', guildId)
  let lastLogQuery = db
    .from('shop_chest_logs')
    .select('imported_at')
    .eq('guild_id', guildId)
  if (operatingStart) {
    lastLogQuery = lastLogQuery.gte('logged_at', operatingStart.toISOString())
  }
  const [
    { data: blacklist },
    { data: inventory },
    { data: lastLog },
    deliveryNotice,
    discountRateSetting,
    aodpCitiesRaw,
    aodpPriceModeRaw,
    aodpMinQualityRaw,
    tenantTimezone,
    logStartShopChestAt,
    importExcludeTierEnchantLte,
    importExcludeTierEnchantGte,
  ] = await Promise.all([
    db
      .from('shop_blacklist')
      .select('item_name_raw')
      .eq('guild_id', guildId)
      .order('added_at', { ascending: false }),
    db
      .from('shop_inventory')
      .select(
        'id, unique_name, enchant, quality, stock, name_ko, category, tier, manual_price, auto_price_silver, price_source, price_warning_level, price_updated_at, updated_at',
      )
      .eq('guild_id', guildId)
      .order('name_ko', { ascending: true }),
    lastLogQuery
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getAppSetting('shop_delivery_notice', '', guildId),
    getAppSetting('shop_discount_rate', '1', guildId),
    getAppSetting('aodp_cities', '', guildId),
    getAppSetting('aodp_price_mode', 'spot', guildId),
    getAppSetting('aodp_min_quality', '1', guildId),
    getTenantTimezone(guildId),
    getAppSetting('log_start_shop_chest_at', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_lte', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_gte', '', guildId),
  ])

  const lastImportAt = (lastLog?.imported_at as string | null | undefined) ?? null
  // 6 시간 이상 경과 시 stale. 서버 컴포넌트 요청 타임에 한 번만 평가되므로
  // Date.now() 가 idempotent 아닌 건 맞지만 의도된 동작 — purity 룰은 클라
  // render 전제라 서버에선 false positive.
  const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000
  const isImportStale = lastImportAt
    // eslint-disable-next-line react-hooks/purity
    ? Date.now() - new Date(lastImportAt).getTime() > STALE_THRESHOLD_MS
    : false

  const aodpAllowedSet: ReadonlySet<string> = new Set(AODP_ALLOWED_CITIES)
  let aodpCities: string[] = [...AODP_ALLOWED_CITIES]
  if (aodpCitiesRaw) {
    try {
      const parsed = JSON.parse(aodpCitiesRaw)
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (v): v is string => typeof v === 'string' && aodpAllowedSet.has(v),
        )
        if (filtered.length > 0) aodpCities = filtered
      }
    } catch {
      // 손상된 값 — 전체 도시로 fallback.
    }
  }

  const aodpPriceMode: AodpPriceMode =
    aodpPriceModeRaw === 'spot' ||
    aodpPriceModeRaw === 'avg_1d' ||
    aodpPriceModeRaw === 'avg_3d' ||
    aodpPriceModeRaw === 'avg_7d' ||
    aodpPriceModeRaw === 'avg_14d'
      ? aodpPriceModeRaw
      : 'spot'

  const aodpMinQualityParsed = Number(aodpMinQualityRaw)
  const aodpMinQuality: AodpQuality =
    aodpMinQualityParsed === 1 ||
    aodpMinQualityParsed === 2 ||
    aodpMinQualityParsed === 3 ||
    aodpMinQualityParsed === 4 ||
    aodpMinQualityParsed === 5
      ? aodpMinQualityParsed
      : 1

  const discountRate = parseShopDiscountRate(discountRateSetting)
  // DB 가 name_ko asc 로 반환 → stable sort 로 카테고리만 재정렬하면
  // (카테고리 랭크, 이름) 순이 된다.
  const inventoryRows: InventoryRow[] = (inventory ?? [])
    .map((r) => ({
      id: r.id as string,
      uniqueName: r.unique_name as string,
      enchant: r.enchant as number,
      quality: r.quality as number,
      stock: r.stock as number,
      nameKo: r.name_ko as string,
      category: (r.category as string | null) ?? null,
      tier: (r.tier as number | null) ?? null,
      manualPrice: (r.manual_price as number | null) ?? null,
      autoPriceSilver: (r.auto_price_silver as number | null) ?? null,
      priceSource: (r.price_source as string | null) ?? null,
      priceWarningLevel: (r.price_warning_level as
        | 'quality'
        | 'window'
        | 'bluezone'
        | 'redzone'
        | null
        | undefined) ?? null,
      priceUpdatedAt: (r.price_updated_at as string | null) ?? null,
      updatedAt: r.updated_at as string,
    }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag size={22} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">{tNav('shopAdmin')}</h1>
        </div>
        <Link
          href="/admin/dashboard/shop/baseline"
          className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/20"
        >
          <Shield size={14} />
          {tPage('baselineLink')}
        </Link>
      </div>

      <div className="rounded-xl border border-sky-400/30 bg-sky-500/5 p-4 sm:p-5 flex items-start gap-3">
        <Info size={16} className="text-sky-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-sm font-semibold text-sky-100">{tPage('aodpInfoTitle')}</h2>
          <p className="text-xs text-sky-100/80 leading-relaxed">{tPage('aodpInfoBody')}</p>
          <ul className="text-xs text-sky-100/70 list-disc pl-5 space-y-0.5 mt-1">
            <li>{tPage('aodpInfoCityHint')}</li>
            <li>{tPage('aodpInfoModeHint')}</li>
          </ul>
        </div>
      </div>

      <ShopAnomalyPanel />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ShopImportForm
            lastImportAt={lastImportAt}
            timezone={tenantTimezone}
            isImportStale={isImportStale}
          />
          <ShopImportTierFilterForm
            initialExcludeAtOrBelow={importExcludeTierEnchantLte}
            initialExcludeAtOrAbove={importExcludeTierEnchantGte}
          />
          <LogOperatingStartSettingsForm
            domains={['shopChest']}
            timezone={tenantTimezone}
            initialShopChestStartAt={logStartShopChestAt}
            initialSiphonStartAt=""
          />
          <ShopInventoryEditor rows={inventoryRows} discountRate={discountRate} />
        </div>
        <div className="space-y-4">
          <NoticeSettingForm
            settingKey="shop_delivery_notice"
            initialMessage={deliveryNotice}
            title={tPage('deliveryNoticeTitle')}
            description={tPage('deliveryNoticeDescription')}
            label={tPage('deliveryNoticeLabel')}
            placeholder={tPage('deliveryNoticePlaceholder')}
            clearLabel={tPage('deliveryNoticeClearLabel')}
            clearTooltip={tPage('deliveryNoticeClearTooltip')}
            tooLongMessage={tPage('deliveryNoticeTooLong', { max: NOTICE_MAX_LENGTH })}
          />
          <ShopSilverRateForm initial={discountRateSetting} />
          <AodpSettingsForm
            initialCities={aodpCities}
            initialMode={aodpPriceMode}
            initialMinQuality={aodpMinQuality}
          />
          <ShopBlacklistEditor
            initial={(blacklist ?? []).map((r) => r.item_name_raw as string)}
          />
        </div>
      </div>
    </div>
  )
}
