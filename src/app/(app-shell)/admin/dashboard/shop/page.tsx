import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ClipboardList,
  Clock,
  Info,
  Package,
  Settings,
  ShoppingBag,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import {
  AodpSettingsFormLazy as AodpSettingsForm,
  LogOperatingStartSettingsFormLazy as LogOperatingStartSettingsForm,
  NoticeSettingFormLazy as NoticeSettingForm,
  ShopBlacklistEditorLazy as ShopBlacklistEditor,
  ShopImportFormLazy as ShopImportForm,
  ShopImportTierFilterFormLazy as ShopImportTierFilterForm,
  ShopInventoryEditorLazy as ShopInventoryEditor,
  ShopResetPanelLazy as ShopResetPanel,
  ShopSilverRateFormLazy as ShopSilverRateForm,
} from '@/components/AdminShopClientSections'
import type { InventoryRow } from '@/components/ShopInventoryEditor'
import ShopAnomalyPanel from '@/components/ShopAnomalyPanel'
import { parseShopDiscountRate } from '@/lib/shop/price'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { compareShopCatalogOrder } from '@/lib/shop/category-order'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { getTenantTimezone } from '@/lib/timezone-server'
import { loadAdminShopInventoryRows } from '@/lib/shop/inventory-queries'
import { normalizeNoticeImageSize } from '@/lib/notice-image-size'
import ShopBaselineGuideButton from '@/components/ShopBaselineGuideButton'
import { resolveAdminShopView, type AdminShopView } from '@/lib/app-workspaces'

export const dynamic = 'force-dynamic'

type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type AodpQuality = 1 | 2 | 3 | 4 | 5
type ShopPageTranslator = Awaited<
  ReturnType<typeof getTranslations<'adminShopPage'>>
>
type ShopPageDb = Awaited<ReturnType<typeof requireAnyCapability>>

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
const NOTICE_MAX_LENGTH = 500

export default async function AdminShopPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view: rawView } = await searchParams
  const view = resolveAdminShopView(rawView)
  const db = await requireAnyCapability(SHOP_PAGE_CAPS)
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const canResetShop =
    session.isAdmin || sessionHas(session, CAP.INVENTORY_MANAGE)
  const [tNav, tPage] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminShopPage'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag size={22} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">{tNav('shopAdmin')}</h1>
        </div>
        <ShopBaselineGuideButton />
      </div>

      <ShopAdminSectionNav t={tPage} active={view} />

      {view === 'overview' && (
        <ShopOverviewView db={db} guildId={guildId} t={tPage} />
      )}

      {view === 'sync' && (
        <ShopSyncView
          db={db}
          guildId={guildId}
          t={tPage}
          canResetShop={canResetShop}
        />
      )}

      {view === 'catalog' && (
        <ShopCatalogView
          db={db}
          guildId={guildId}
          t={tPage}
          canResetShop={canResetShop}
        />
      )}

      {view === 'settings' && (
        <ShopSettingsView db={db} guildId={guildId} t={tPage} />
      )}
    </div>
  )
}

async function ShopOverviewView({
  db,
  guildId,
  t,
}: {
  db: ShopPageDb
  guildId: string
  t: ShopPageTranslator
}) {
  const [
    inventoryRows,
    importSnapshot,
    { count: pendingOrderCount },
    discountRateSetting,
  ] = await Promise.all([
    loadShopInventory(db, guildId),
    loadShopImportSnapshot(db, guildId),
    db
      .from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'pending'),
    getAppSetting('shop_discount_rate', '1', guildId),
  ])

  const pricedRows = inventoryRows.filter(
    (row) => row.manualPrice !== null || row.autoPriceSilver !== null,
  )
  const visibleRows = inventoryRows.filter(
    (row) =>
      row.stock > 0 &&
      (row.manualPrice !== null || row.autoPriceSilver !== null),
  )
  const missingPriceRows = inventoryRows.filter(
    (row) =>
      row.stock > 0 && row.manualPrice === null && row.autoPriceSilver === null,
  )
  const warningPriceRows = inventoryRows.filter(
    (row) =>
      row.stock > 0 &&
      row.manualPrice === null &&
      row.priceWarningLevel !== null,
  )

  return (
    <>
      <ShopOperationsOverview
        t={t}
        visibleRows={visibleRows.length}
        totalRows={inventoryRows.length}
        missingPriceRows={missingPriceRows.length}
        warningPriceRows={warningPriceRows.length}
        pricedRows={pricedRows.length}
        lastImportAt={importSnapshot.lastImportAt}
        isImportStale={importSnapshot.isImportStale}
        pendingOrders={pendingOrderCount ?? 0}
        discountRate={parseShopDiscountRate(discountRateSetting)}
      />
      <ShopAnomalyPanel />
    </>
  )
}

async function ShopSyncView({
  db,
  guildId,
  t,
  canResetShop,
}: {
  db: ShopPageDb
  guildId: string
  t: ShopPageTranslator
  canResetShop: boolean
}) {
  const [
    importSnapshot,
    tenantTimezone,
    logStartShopChestAt,
    importExcludeTierEnchantLte,
    importExcludeTierEnchantGte,
  ] = await Promise.all([
    loadShopImportSnapshot(db, guildId),
    getTenantTimezone(guildId),
    getAppSetting('log_start_shop_chest_at', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_lte', '', guildId),
    getAppSetting('shop_import_exclude_tier_enchant_sum_gte', '', guildId),
  ])

  return (
    <section className="space-y-4">
      <SectionHeading
        icon={<ClipboardList size={18} className="text-amber-400" />}
        title={t('logSyncSectionTitle')}
        description={t('logSyncSectionDescription')}
      />
      <ShopImportForm
        lastImportAt={importSnapshot.lastImportAt}
        lastChestLog={importSnapshot.lastChestLog}
        timezone={tenantTimezone}
        isImportStale={importSnapshot.isImportStale}
      />
      {canResetShop && <ShopResetPanel />}
      <details className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-200">
          {t('logAdvancedSummary')}
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
  )
}

async function ShopCatalogView({
  db,
  guildId,
  t,
  canResetShop,
}: {
  db: ShopPageDb
  guildId: string
  t: ShopPageTranslator
  canResetShop: boolean
}) {
  const [inventoryRows, discountRateSetting] = await Promise.all([
    loadShopInventory(db, guildId),
    getAppSetting('shop_discount_rate', '1', guildId),
  ])

  return (
    <section className="space-y-4">
      <SectionHeading
        icon={<Package size={18} className="text-emerald-400" />}
        title={t('itemsSectionTitle')}
        description={t('itemsSectionDescription')}
      />
      <ShopInventoryEditor
        rows={inventoryRows}
        discountRate={parseShopDiscountRate(discountRateSetting)}
        canResetShop={canResetShop}
      />
      <ShopAnomalyPanel />
    </section>
  )
}

async function ShopSettingsView({
  db,
  guildId,
  t,
}: {
  db: ShopPageDb
  guildId: string
  t: ShopPageTranslator
}) {
  const [
    { data: blacklist },
    deliveryNotice,
    deliveryNoticeImageUrl,
    deliveryNoticeImageSizeRaw,
    discountRateSetting,
    aodpCitiesRaw,
    aodpPriceModeRaw,
    aodpMinQualityRaw,
  ] = await Promise.all([
    db
      .from('shop_blacklist')
      .select('item_name_raw')
      .eq('guild_id', guildId)
      .order('added_at', { ascending: false }),
    getAppSetting('shop_delivery_notice', '', guildId),
    getAppSetting('shop_delivery_notice_image_url', '', guildId),
    getAppSetting('shop_delivery_notice_image_size', 'full', guildId),
    getAppSetting('shop_discount_rate', '1', guildId),
    getAppSetting('aodp_cities', '', guildId),
    getAppSetting('aodp_price_mode', 'spot', guildId),
    getAppSetting('aodp_min_quality', '1', guildId),
  ])
  const aodpCities = parseAodpCities(aodpCitiesRaw)
  const aodpPriceMode = parseAodpPriceMode(aodpPriceModeRaw)
  const aodpMinQuality = parseAodpMinQuality(aodpMinQualityRaw)

  return (
    <section className="space-y-4">
      <SectionHeading
        icon={<Settings size={18} className="text-sky-300" />}
        title={t('settingsSectionTitle')}
        description={t('settingsSectionDescription')}
      />
      <div className="rounded-xl border border-sky-400/30 bg-sky-500/5 p-4 sm:p-5 flex items-start gap-3">
        <Info size={16} className="text-sky-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-sm font-semibold text-sky-100">
            {t('aodpInfoTitle')}
          </h2>
          <p className="text-xs text-sky-100/80 leading-relaxed">
            {t('aodpInfoBody')}
          </p>
          <ul className="text-xs text-sky-100/70 list-disc pl-5 space-y-0.5 mt-1">
            <li>{t('aodpInfoCityHint')}</li>
            <li>{t('aodpInfoModeHint')}</li>
          </ul>
        </div>
      </div>
      <NoticeSettingForm
        settingKey="shop_delivery_notice"
        target="shop"
        imageSizeSettingKey="shop_delivery_notice_image_size"
        initialMessage={deliveryNotice}
        initialImageUrl={deliveryNoticeImageUrl}
        initialImageSize={normalizeNoticeImageSize(deliveryNoticeImageSizeRaw)}
        title={t('deliveryNoticeTitle')}
        description={t('deliveryNoticeDescription')}
        label={t('deliveryNoticeLabel')}
        placeholder={t('deliveryNoticePlaceholder')}
        clearLabel={t('deliveryNoticeClearLabel')}
        clearTooltip={t('deliveryNoticeClearTooltip')}
        tooLongMessage={t('deliveryNoticeTooLong', { max: NOTICE_MAX_LENGTH })}
      />
      <ShopSilverRateForm initial={discountRateSetting} />
      <AodpSettingsForm
        initialCities={aodpCities}
        initialMode={aodpPriceMode}
        initialMinQuality={aodpMinQuality}
      />
      <ShopBlacklistEditor
        initial={(blacklist ?? []).map((row) => row.item_name_raw as string)}
      />
    </section>
  )
}

async function loadShopInventory(
  db: ShopPageDb,
  guildId: string,
): Promise<InventoryRow[]> {
  const result = await loadAdminShopInventoryRows(db, guildId)
  if (result.error) {
    throw new Error(`Failed to load shop inventory: ${result.error}`)
  }

  // 공개 상점과 같은 순서로 관리자 재고도 정렬한다.
  return result.rows
    .map((row) => ({
      id: row.id,
      uniqueName: row.unique_name,
      enchant: row.enchant,
      quality: row.quality,
      stock: row.stock,
      nameKo: row.name_ko,
      category: row.category,
      tier: row.tier,
      manualPrice: row.manual_price,
      autoPriceSilver: row.auto_price_silver,
      priceSource: row.price_source,
      priceWarningLevel:
        (row.price_warning_level as
          'quality' | 'window' | 'bluezone' | 'redzone' | null | undefined) ??
        null,
      priceUpdatedAt: row.price_updated_at,
      updatedAt: row.updated_at ?? '',
    }))
    .sort(compareShopCatalogOrder)
}

async function loadShopImportSnapshot(db: ShopPageDb, guildId: string) {
  const operatingStart = await getLogOperatingStart('shopChest', guildId)
  let query = db
    .from('shop_chest_logs')
    .select('imported_at, logged_at, player, item_name_raw, quantity')
    .eq('guild_id', guildId)
  if (operatingStart) {
    query = query.gte('logged_at', operatingStart.toISOString())
  }
  const { data: lastLog } = await query
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastImportAt =
    (lastLog?.imported_at as string | null | undefined) ?? null
  const lastChestLog: LastShopChestLog | null = lastLog
    ? {
        importedAt: lastLog.imported_at as string,
        loggedAt: lastLog.logged_at as string,
        player: lastLog.player as string,
        itemNameRaw: lastLog.item_name_raw as string,
        quantity: lastLog.quantity as number,
      }
    : null
  const staleThresholdMs = 6 * 60 * 60 * 1000
  // 요청 시점 기준 상태라 서버 컴포넌트에서만 계산한다.
  const isImportStale = lastImportAt
    ? Date.now() - new Date(lastImportAt).getTime() > staleThresholdMs
    : false
  return { lastImportAt, lastChestLog, isImportStale }
}

function parseAodpCities(value: string): string[] {
  if (!value) return [...AODP_ALLOWED_CITIES]
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return [...AODP_ALLOWED_CITIES]
    const allowed: ReadonlySet<string> = new Set(AODP_ALLOWED_CITIES)
    const filtered = parsed.filter(
      (city): city is string => typeof city === 'string' && allowed.has(city),
    )
    return filtered.length > 0 ? filtered : [...AODP_ALLOWED_CITIES]
  } catch {
    return [...AODP_ALLOWED_CITIES]
  }
}

function parseAodpPriceMode(value: string): AodpPriceMode {
  return value === 'spot' ||
    value === 'avg_1d' ||
    value === 'avg_3d' ||
    value === 'avg_7d' ||
    value === 'avg_14d'
    ? value
    : 'spot'
}

function parseAodpMinQuality(value: string): AodpQuality {
  const parsed = Number(value)
  return parsed === 1 ||
    parsed === 2 ||
    parsed === 3 ||
    parsed === 4 ||
    parsed === 5
    ? parsed
    : 1
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
  const nextAction =
    visibleRows === 0
      ? {
          title: t('workflowSettingsTitle'),
          body: t('workflowSettingsBody'),
          href: '/admin/dashboard/shop?view=settings',
        }
      : !lastImportAt || isImportStale
        ? {
            title: t('workflowLogTitle'),
            body: t('workflowLogBody'),
            href: '/admin/dashboard/shop?view=sync',
          }
        : missingPriceRows > 0 || warningPriceRows > 0
          ? {
              title: t('workflowPriceTitle'),
              body: t('workflowPriceBody', { rate: discountRate }),
              href: '/admin/dashboard/shop?view=catalog',
            }
          : pendingOrders > 0
            ? {
                title: t('workflowOrdersTitle'),
                body: t('workflowOrdersBody'),
                href: '/admin/dashboard/approvals?tab=shop',
              }
            : null

  return (
    <section id="shop-overview" className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">{t('overviewTitle')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('overviewDescription')}</p>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        <ShopHealthRow
          icon={<ShoppingBag size={16} className="text-emerald-300" />}
          label={t('overviewCatalogLabel')}
          value={visibleRows.toLocaleString()}
          hint={t('overviewCatalogHint', {
            total: totalRows,
            priced: pricedRows,
          })}
          tone={visibleRows > 0 ? 'ok' : 'warn'}
          href="/admin/dashboard/shop?view=catalog"
        />
        <ShopHealthRow
          icon={<Clock size={16} className="text-amber-300" />}
          label={t('overviewImportLabel')}
          value={importState}
          hint={t('overviewImportHint')}
          tone={!lastImportAt || isImportStale ? 'warn' : 'ok'}
          href="/admin/dashboard/shop?view=sync"
        />
        <ShopHealthRow
          icon={<Package size={16} className="text-sky-300" />}
          label={t('overviewPriceLabel')}
          value={priceState}
          hint={t('overviewPriceHint')}
          tone={
            missingPriceRows > 0
              ? 'danger'
              : warningPriceRows > 0
                ? 'warn'
                : 'ok'
          }
          href="/admin/dashboard/shop?view=catalog"
        />
        <ShopHealthRow
          icon={<ClipboardList size={16} className="text-violet-300" />}
          label={t('overviewOrdersLabel')}
          value={orderState}
          hint={t('overviewOrdersHint')}
          tone={pendingOrders > 0 ? 'warn' : 'ok'}
          href="/admin/dashboard/approvals?tab=shop"
        />
      </div>
      {nextAction && (
        <Link
          href={nextAction.href}
          className="group flex min-h-16 items-center justify-between gap-4 rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30 transition-[background-color,transform] hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.995]"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              {t('overviewNextTitle')}
            </p>
            <p className="mt-0.5 font-semibold text-foreground">{nextAction.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{nextAction.body}</p>
          </div>
          <span aria-hidden="true" className="text-xl text-amber-300 transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      )}
    </section>
  )
}

function ShopHealthRow({
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
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : 'text-amber-300'
  const content = (
    <div className="flex min-h-20 items-center gap-3 px-4 py-3 sm:px-5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${toneClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(8rem,0.7fr)_minmax(10rem,1fr)_minmax(12rem,1.3fr)] sm:items-center sm:gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 font-bold tabular-nums sm:mt-0 ${toneClass}`}>{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:mt-0">{hint}</p>
      </div>
      {href && <span aria-hidden="true" className="shrink-0 text-muted-foreground">→</span>}
    </div>
  )
  return href ? (
    <Link
      href={href}
      className="group block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:bg-muted/60"
    >
      {content}
    </Link>
  ) : (
    content
  )
}

function ShopAdminSectionNav({
  t,
  active,
}: {
  t: ShopPageTranslator
  active: AdminShopView
}) {
  const links = [
    ['/admin/dashboard/shop', t('navOverview'), 'overview'],
    ['/admin/dashboard/shop?view=sync', t('navLogSync'), 'sync'],
    ['/admin/dashboard/shop?view=catalog', t('navItemsPrices'), 'catalog'],
    ['/admin/dashboard/approvals?tab=shop', t('navOrders'), 'orders'],
    ['/admin/dashboard/shop?view=settings', t('navSettings'), 'settings'],
  ] as const
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('sectionNavAria')}>
      {links.map(([href, label, key]) => (
        <Link
          key={href}
          href={href}
          aria-current={key === active ? 'page' : undefined}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            key === active
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
              : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-amber-500/60 hover:text-amber-200'
          }`}
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
