import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ClipboardList,
  Clock,
  Info,
  Package,
  Settings,
  Shield,
  ShoppingBag,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import ShopImportForm from '@/components/ShopImportForm'
import ShopResetPanel from '@/components/ShopResetPanel'
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
import { loadAdminShopInventoryRows } from '@/lib/shop/inventory-queries'

export const dynamic = 'force-dynamic'

type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type AodpQuality = 1 | 2 | 3 | 4 | 5
type ShopPageTranslator = Awaited<ReturnType<typeof getTranslations<'adminShopPage'>>>

interface LastShopChestLog {
  importedAt: string
  loggedAt: string
  player: string
  itemNameRaw: string
  quantity: number
}

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
  const canResetShop = session.isAdmin || sessionHas(session, CAP.INVENTORY_MANAGE)
  const [tNav, tPage] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminShopPage'),
  ])
  const operatingStart = await getLogOperatingStart('shopChest', guildId)
  let lastLogQuery = db
    .from('shop_chest_logs')
    .select('imported_at, logged_at, player, item_name_raw, quantity')
    .eq('guild_id', guildId)
  if (operatingStart) {
    lastLogQuery = lastLogQuery.gte('logged_at', operatingStart.toISOString())
  }
  const [
    { data: blacklist },
    inventoryResult,
    { data: lastLog },
    { count: pendingOrderCount },
    deliveryNotice,
    deliveryNoticeImageUrl,
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
    loadAdminShopInventoryRows(db, guildId),
    lastLogQuery
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'pending'),
    getAppSetting('shop_delivery_notice', '', guildId),
    getAppSetting('shop_delivery_notice_image_url', '', guildId),
    getAppSetting('shop_discount_rate', '1', guildId),
    getAppSetting('aodp_cities', '', guildId),
    getAppSetting('aodp_price_mode', 'spot', guildId),
    getAppSetting('aodp_min_quality', '1', guildId),
    getTenantTimezone(guildId),
    getAppSetting('log_start_shop_chest_at', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_lte', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_gte', '', guildId),
  ])
  if (inventoryResult.error) {
    throw new Error(`Failed to load shop inventory: ${inventoryResult.error}`)
  }

  const lastImportAt = (lastLog?.imported_at as string | null | undefined) ?? null
  const lastChestLog: LastShopChestLog | null = lastLog
    ? {
        importedAt: lastLog.imported_at as string,
        loggedAt: lastLog.logged_at as string,
        player: lastLog.player as string,
        itemNameRaw: lastLog.item_name_raw as string,
        quantity: lastLog.quantity as number,
      }
    : null
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
  const inventoryRows: InventoryRow[] = inventoryResult.rows
    .map((r) => ({
      id: r.id,
      uniqueName: r.unique_name,
      enchant: r.enchant,
      quality: r.quality,
      stock: r.stock,
      nameKo: r.name_ko,
      category: r.category,
      tier: r.tier,
      manualPrice: r.manual_price,
      autoPriceSilver: r.auto_price_silver,
      priceSource: r.price_source,
      priceWarningLevel: (r.price_warning_level as
        | 'quality'
        | 'window'
        | 'bluezone'
        | 'redzone'
        | null
        | undefined) ?? null,
      priceUpdatedAt: r.price_updated_at,
      updatedAt: r.updated_at ?? '',
    }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))

  const pricedRows = inventoryRows.filter(
    (r) => r.manualPrice !== null || r.autoPriceSilver !== null,
  )
  const visibleRows = inventoryRows.filter(
    (r) => r.stock > 0 && (r.manualPrice !== null || r.autoPriceSilver !== null),
  )
  const missingPriceRows = inventoryRows.filter(
    (r) => r.stock > 0 && r.manualPrice === null && r.autoPriceSilver === null,
  )
  const warningPriceRows = inventoryRows.filter(
    (r) => r.stock > 0 && r.manualPrice === null && r.priceWarningLevel !== null,
  )

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

      <ShopOperationsOverview
        t={tPage}
        visibleRows={visibleRows.length}
        totalRows={inventoryRows.length}
        missingPriceRows={missingPriceRows.length}
        warningPriceRows={warningPriceRows.length}
        pricedRows={pricedRows.length}
        lastImportAt={lastImportAt}
        isImportStale={isImportStale}
        pendingOrders={pendingOrderCount ?? 0}
        discountRate={discountRate}
      />

      <ShopAdminSectionNav t={tPage} />

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

      <section id="shop-log-sync" className="scroll-mt-24 space-y-4">
        <SectionHeading
          icon={<ClipboardList size={18} className="text-amber-400" />}
          title={tPage('logSyncSectionTitle')}
          description={tPage('logSyncSectionDescription')}
        />
        <ShopImportForm
          lastImportAt={lastImportAt}
          lastChestLog={lastChestLog}
          timezone={tenantTimezone}
          isImportStale={isImportStale}
        />
        {canResetShop && <ShopResetPanel />}
        <details className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-200">
            {tPage('logAdvancedSummary')}
          </summary>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
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
          </div>
        </details>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section id="shop-items-prices" className="scroll-mt-24 space-y-4">
          <SectionHeading
            icon={<Package size={18} className="text-emerald-400" />}
            title={tPage('itemsSectionTitle')}
            description={tPage('itemsSectionDescription')}
          />
          <ShopInventoryEditor
            rows={inventoryRows}
            discountRate={discountRate}
            canResetShop={canResetShop}
          />
        </section>
        <section id="shop-settings" className="scroll-mt-24 space-y-4">
          <SectionHeading
            icon={<Settings size={18} className="text-sky-300" />}
            title={tPage('settingsSectionTitle')}
            description={tPage('settingsSectionDescription')}
          />
          <NoticeSettingForm
            settingKey="shop_delivery_notice"
            target="shop"
            initialMessage={deliveryNotice}
            initialImageUrl={deliveryNoticeImageUrl}
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
        </section>
      </div>
    </div>
  )
}

function ShopOperationsOverview({
  t,
  visibleRows,
  totalRows,
  missingPriceRows,
  warningPriceRows,
  pricedRows,
  lastImportAt,
  isImportStale,
  pendingOrders,
  discountRate,
}: {
  t: ShopPageTranslator
  visibleRows: number
  totalRows: number
  missingPriceRows: number
  warningPriceRows: number
  pricedRows: number
  lastImportAt: string | null
  isImportStale: boolean
  pendingOrders: number
  discountRate: number
}) {
  const importState = !lastImportAt
    ? t('overviewImportNever')
    : isImportStale
      ? t('overviewImportStale')
      : t('overviewImportOk')
  const priceState =
    missingPriceRows > 0
      ? t('overviewPriceMissing', { count: missingPriceRows })
      : warningPriceRows > 0
        ? t('overviewPriceWarning', { count: warningPriceRows })
        : t('overviewPriceOk')
  const orderState =
    pendingOrders > 0
      ? t('overviewOrdersPending', { count: pendingOrders })
      : t('overviewOrdersEmpty')

  return (
    <section id="shop-overview" className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">{t('overviewTitle')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('overviewDescription')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          icon={<ShoppingBag size={16} className="text-emerald-300" />}
          label={t('overviewCatalogLabel')}
          value={visibleRows.toLocaleString()}
          hint={t('overviewCatalogHint', { total: totalRows, priced: pricedRows })}
          tone={visibleRows > 0 ? 'ok' : 'warn'}
        />
        <OverviewMetric
          icon={<Clock size={16} className="text-amber-300" />}
          label={t('overviewImportLabel')}
          value={importState}
          hint={t('overviewImportHint')}
          tone={!lastImportAt || isImportStale ? 'warn' : 'ok'}
        />
        <OverviewMetric
          icon={<Package size={16} className="text-sky-300" />}
          label={t('overviewPriceLabel')}
          value={priceState}
          hint={t('overviewPriceHint')}
          tone={missingPriceRows > 0 ? 'danger' : warningPriceRows > 0 ? 'warn' : 'ok'}
        />
        <OverviewMetric
          icon={<ClipboardList size={16} className="text-violet-300" />}
          label={t('overviewOrdersLabel')}
          value={orderState}
          hint={t('overviewOrdersHint')}
          tone={pendingOrders > 0 ? 'warn' : 'ok'}
          href="/admin/dashboard/approvals?tab=shop"
        />
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
        <h3 className="text-sm font-semibold text-white">{t('overviewNextTitle')}</h3>
        <ol className="mt-3 grid gap-2 text-xs text-gray-300 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowStep
            step="1"
            title={t('workflowSettingsTitle')}
            body={t('workflowSettingsBody')}
          />
          <WorkflowStep
            step="2"
            title={t('workflowLogTitle')}
            body={t('workflowLogBody')}
          />
          <WorkflowStep
            step="3"
            title={t('workflowPriceTitle')}
            body={t('workflowPriceBody', { rate: discountRate })}
          />
          <WorkflowStep
            step="4"
            title={t('workflowOrdersTitle')}
            body={t('workflowOrdersBody')}
          />
        </ol>
      </div>
    </section>
  )
}

function OverviewMetric({
  icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone: 'ok' | 'warn' | 'danger'
  href?: string
}) {
  const border =
    tone === 'ok'
      ? 'border-emerald-500/25'
      : tone === 'danger'
        ? 'border-rose-500/35'
        : 'border-amber-500/30'
  const content = (
    <div className={`h-full rounded-lg border ${border} bg-gray-900 p-4`}>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{hint}</p>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function WorkflowStep({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <li className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-black">
          {step}
        </span>
        <span className="font-semibold text-white">{title}</span>
      </div>
      <p className="mt-2 leading-relaxed text-gray-400">{body}</p>
    </li>
  )
}

function ShopAdminSectionNav({ t }: { t: ShopPageTranslator }) {
  const links = [
    ['#shop-overview', t('navOverview')],
    ['#shop-log-sync', t('navLogSync')],
    ['#shop-items-prices', t('navItemsPrices')],
    ['/admin/dashboard/approvals?tab=shop', t('navOrders')],
    ['#shop-settings', t('navSettings')],
  ] as const
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('sectionNavAria')}>
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-amber-500/60 hover:text-amber-200"
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>
    </div>
  )
}
