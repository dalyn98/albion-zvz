import type { MetadataRoute } from 'next'
import { getAdminClient } from '@/lib/supabase-admin'
import { DOCS_NAV } from '@/lib/docs-nav'
import { DEMO_SITEMAP_ROUTES } from '@/lib/demo-routes'
import {
  getHreflangLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from '@/i18n/locales'
import {
  FEATURE_LOCALIZED_SITEMAP_ROUTES,
  FEATURE_SITEMAP_ROUTES,
} from '@/lib/seo-feature-pages'
import {
  buildSeoDocsHomeLanguageAlternates,
  buildSeoFeatureLanguageAlternates,
  buildSeoMarketingLanguageAlternates,
} from '@/lib/seo-metadata'
import { PUBLIC_AGM_BATTLES_AVAILABLE } from '@/lib/public-agm-battles-visibility'
import {
  getLocalizedSeoDocsPathname,
  getLocalizedSeoMarketingPathname,
} from '@/lib/seo-locale-paths'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'

const BASE_URL = 'https://albion-guildmanager.com'
const SITEMAP_QUERY_TIMEOUT_MS = 2_500

function createSitemapQueryAbortSignal(): AbortSignal | null {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(SITEMAP_QUERY_TIMEOUT_MS)
    : null
}

// /docs/* 의 모든 정적 path 를 DOCS_NAV 에서 풀어 sitemap 에 포함시킨다.
// 새 docs 페이지가 추가되면 DOCS_NAV 만 업데이트하면 sitemap 도 자동 반영.
function expandDocsRoutes(): string[] {
  const out: string[] = ['/docs']
  for (const section of DOCS_NAV) {
    for (const item of section.items) {
      if (item.slug.length > 0) out.push(`/docs/${item.slug}`)
      if (item.subItems) {
        for (const sub of item.subItems) {
          if (sub.slug.length > 0) out.push(`/docs/${sub.slug}`)
        }
      }
    }
  }
  return Array.from(new Set(out))
}

function localizedDocsHomeRoute(locale: Locale): string {
  return `/${locale}/docs`
}

function buildCurrentContractLanguageAlternates(): Record<string, string> {
  const pathname = '/docs/current-contract'
  return {
    'x-default': `${BASE_URL}${pathname}`,
    ...Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [
      getHreflangLocale(locale),
      `${BASE_URL}${getLocalizedSeoDocsPathname(locale, pathname)}`,
    ])),
  }
}

const STATIC_MARKETING_SITEMAP_ROUTES: Array<{
  path: string
  changeFrequency: 'weekly' | 'hourly' | 'monthly' | 'yearly'
  priority: number
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/guilds', changeFrequency: 'weekly', priority: 0.85 },
  { path: '/zvz-battles', changeFrequency: 'hourly', priority: 0.85 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
]

// 공개 길드 프로필 (/g/<slug>) — 활성+공개 토글 ON 인 길드만 인덱싱.
// pending 이거나 enabled=false 면 generateMetadata 에서 noindex 처리되므로
// sitemap 에서도 제외해 크롤러가 dead link 를 줍지 않게 한다.
// Supabase env 가 없는 빌드 환경 (preview 등) 에서는 빈 배열로 회복 — sitemap
// 정적 부분은 계속 서빙되고, 실 production runtime 의 ISR 재생성 때 채워진다.
async function listPublicGuildSlugs(): Promise<string[]> {
  try {
    const db = getAdminClient()
    const signal = createSitemapQueryAbortSignal()
    const tenantsQuery = db
      .from('tenants')
      .select('id, slug')
      .eq('status', 'active')
    const { data: tenants } = await (signal
      ? tenantsQuery.abortSignal(signal)
      : tenantsQuery)
    if (!tenants || tenants.length === 0) return []
    const tenantById = new Map(
      tenants.map((row) => [row.id as string, row.slug as string]),
    )
    // app_settings 에 guild_profile_enabled='true' 인 길드만 필터.
    const tenantIds = Array.from(tenantById.keys())
    const enabledQuery = db
      .from('app_settings')
      .select('guild_id, value')
      .eq('key', 'guild_profile_enabled')
      .in('guild_id', tenantIds)
    const ownershipQuery = db
      .from('guild_home_ownership_disputes')
      .select('incumbent_guild_id')
      .eq('status', 'under_review')
      .in('incumbent_guild_id', tenantIds)
    const [{ data: enabledRows }, { data: ownershipReviews }] = await Promise.all([
      signal ? enabledQuery.abortSignal(signal) : enabledQuery,
      signal ? ownershipQuery.abortSignal(signal) : ownershipQuery,
    ])
    if (!enabledRows) return []
    const hiddenGuildIds = new Set(
      (ownershipReviews ?? []).map((row) => row.incumbent_guild_id as string),
    )
    return enabledRows
      .filter((row) => (
        (row.value as string) === 'true'
        && !hiddenGuildIds.has(row.guild_id as string)
      ))
      .map((row) => tenantById.get(row.guild_id as string))
      .filter((slug): slug is string => Boolean(slug))
      .sort()
  } catch {
    return []
  }
}

async function listPublicZvzSitemapPaths(): Promise<string[]> {
  if (!PUBLIC_AGM_BATTLES_AVAILABLE) return []
  try {
    const db = getAdminClient()
    const signal = createSitemapQueryAbortSignal()
    const seasonsQuery = db.from('zvz_seasons').select('id, albion_server')
    const snapshotsQuery = db
      .from('public_zvz_v2_season_snapshots')
      .select('season_id, snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(30)
    const engagementsQuery = db
      .from('public_zvz_engagements')
      .select('battle_record_id')
      .eq('status', 'final')
      .order('started_at', { ascending: false })
      .limit(60)
    const [{ data: seasons }, { data: snapshots }, { data: finalEngagements }] = await Promise.all([
      signal ? seasonsQuery.abortSignal(signal) : seasonsQuery,
      signal ? snapshotsQuery.abortSignal(signal) : snapshotsQuery,
      signal ? engagementsQuery.abortSignal(signal) : engagementsQuery,
    ])
    const serverBySeason = new Map((seasons ?? []).map((row) => [String(row.id), String(row.albion_server)]))
    const latestSnapshotByServer = new Map<string, { seasonId: string; snapshotDate: string }>()
    for (const row of snapshots ?? []) {
      const server = serverBySeason.get(String(row.season_id))
      if (server && !latestSnapshotByServer.has(server)) {
        latestSnapshotByServer.set(server, {
          seasonId: String(row.season_id),
          snapshotDate: String(row.snapshot_date),
        })
      }
    }

    const rankingPaths: string[] = []
    for (const [server, snapshot] of latestSnapshotByServer) {
      const rollupsQuery = db
        .from('public_zvz_v2_season_rollups')
        .select('entity_kind, entity_albion_id, rank')
        .eq('season_id', snapshot.seasonId)
        .eq('snapshot_date', snapshot.snapshotDate)
        .eq('scope', 'overall')
        .eq('sample_status', 'ranked')
        .order('rank', { ascending: true })
        .limit(40)
      const { data: rollups } = await (signal
        ? rollupsQuery.abortSignal(signal)
        : rollupsQuery)
      for (const row of rollups ?? []) {
        if (row.entity_kind !== 'guild' && row.entity_kind !== 'alliance') continue
        rankingPaths.push(
          `/zvz-battles/${row.entity_kind}/${server}/${encodeURIComponent(String(row.entity_albion_id))}`,
        )
      }
    }

    const battleRecordIds = Array.from(new Set((finalEngagements ?? []).map((row) => String(row.battle_record_id))))
    const battlePaths: string[] = []
    if (battleRecordIds.length > 0) {
      const battlesQuery = db
        .from('battle_records')
        .select('albion_server, albion_battle_id')
        .in('id', battleRecordIds)
      const { data: battles } = await (signal
        ? battlesQuery.abortSignal(signal)
        : battlesQuery)
      for (const battle of battles ?? []) {
        const battleId = Number(battle.albion_battle_id)
        if (!Number.isSafeInteger(battleId) || battleId <= 0) continue
        battlePaths.push(`/zvz-battles/battle/${battle.albion_server}/${battleId}`)
      }
    }

    const currentWeek = getUtcWeekStartDateString(new Date())
    const previous = new Date(`${currentWeek}T00:00:00.000Z`)
    previous.setUTCDate(previous.getUTCDate() - 7)
    const previousWeek = previous.toISOString().slice(0, 10)
    const weeklyPaths = ['west', 'europe', 'east'].flatMap((server) => [
      `/zvz-battles/weekly/${server}/${currentWeek}`,
      `/zvz-battles/weekly/${server}/${previousWeek}`,
    ])
    return Array.from(new Set([
      '/zvz-battles/methodology',
      ...rankingPaths,
      ...battlePaths,
      ...weeklyPaths,
    ])).slice(0, 180)
  } catch {
    return ['/zvz-battles/methodology']
  }
}

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [guildSlugs, zvzPaths] = await Promise.all([
    listPublicGuildSlugs(),
    listPublicZvzSitemapPaths(),
  ])
  const now = new Date()
  const featureRoutes = [
    ...FEATURE_SITEMAP_ROUTES,
    ...FEATURE_LOCALIZED_SITEMAP_ROUTES,
  ]

  const staticMarketingEntries = STATIC_MARKETING_SITEMAP_ROUTES
    .filter((route) => PUBLIC_AGM_BATTLES_AVAILABLE || route.path !== '/zvz-battles')
    .flatMap((route) => {
      const languages = buildSeoMarketingLanguageAlternates(route.path)
      const shared = {
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        ...(languages ? { alternates: { languages } } : {}),
      }
      return [
        { url: `${BASE_URL}${route.path}`, ...shared },
        ...SUPPORTED_LOCALES.map((locale) => ({
          url: `${BASE_URL}${getLocalizedSeoMarketingPathname(locale, route.path)}`,
          ...shared,
        })),
      ]
    })

  const staticEntries: MetadataRoute.Sitemap = [
    ...staticMarketingEntries,
    ...featureRoutes.map((path) => {
      const languages = buildSeoFeatureLanguageAlternates(path)
      return {
        url: `${BASE_URL}${path}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: path.endsWith('/features') ? 0.85 : 0.75,
        ...(languages ? { alternates: { languages } } : {}),
      }
    }),
    ...expandDocsRoutes().map((path) => {
      const languages = path === '/docs/current-contract'
        ? buildCurrentContractLanguageAlternates()
        : buildSeoDocsHomeLanguageAlternates(path)
      return {
        url: `${BASE_URL}${path}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        ...(languages ? { alternates: { languages } } : {}),
      }
    }),
    ...SUPPORTED_LOCALES.map(localizedDocsHomeRoute).map((path) => ({
      url: `${BASE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      alternates: { languages: buildSeoDocsHomeLanguageAlternates(path) ?? {} },
    })),
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${BASE_URL}${getLocalizedSeoDocsPathname(locale, '/docs/current-contract')}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
      alternates: { languages: buildCurrentContractLanguageAlternates() },
    })),
    ...DEMO_SITEMAP_ROUTES.map((path) => ({
      url: `${BASE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: path === '/demo' ? 0.85 : 0.65,
    })),
  ]
  const guildEntries: MetadataRoute.Sitemap = guildSlugs.map((slug) => ({
    url: `${BASE_URL}/g/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const zvzEntries: MetadataRoute.Sitemap = zvzPaths.flatMap((path) => {
    const languages = {
      'x-default': `${BASE_URL}${path}`,
      ...Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [
        getHreflangLocale(locale),
        `${BASE_URL}/${locale}${path}`,
      ])),
    }
    const shared = {
      lastModified: now,
      changeFrequency: path.includes('/battle/') ? 'weekly' as const : 'daily' as const,
      priority: path.includes('/battle/') ? 0.72 : 0.75,
      alternates: { languages },
    }
    return [
      { url: `${BASE_URL}${path}`, ...shared },
      ...SUPPORTED_LOCALES.map((locale) => ({
        url: `${BASE_URL}/${locale}${path}`,
        ...shared,
      })),
    ]
  })

  return [...staticEntries, ...guildEntries, ...zvzEntries]
}
