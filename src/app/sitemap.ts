import type { MetadataRoute } from 'next'
import { getAdminClient } from '@/lib/supabase-admin'
import { DOCS_NAV } from '@/lib/docs-nav'
import { DEMO_SITEMAP_ROUTES } from '@/lib/demo-routes'
import {
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
import { getLocalizedSeoMarketingPathname } from '@/lib/seo-locale-paths'

const BASE_URL = 'https://albion-guildmanager.com'

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

const STATIC_MARKETING_SITEMAP_ROUTES: Array<{
  path: string
  changeFrequency: 'weekly' | 'hourly' | 'monthly' | 'yearly'
  priority: number
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
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
    const { data: tenants } = await db
      .from('tenants')
      .select('id, slug')
      .eq('status', 'active')
    if (!tenants || tenants.length === 0) return []
    const tenantById = new Map(
      tenants.map((row) => [row.id as string, row.slug as string]),
    )
    // app_settings 에 guild_profile_enabled='true' 인 길드만 필터.
    const tenantIds = Array.from(tenantById.keys())
    const [{ data: enabledRows }, { data: ownershipReviews }] = await Promise.all([
      db
        .from('app_settings')
        .select('guild_id, value')
        .eq('key', 'guild_profile_enabled')
        .in('guild_id', tenantIds),
      db
        .from('guild_home_ownership_disputes')
        .select('incumbent_guild_id')
        .eq('status', 'under_review')
        .in('incumbent_guild_id', tenantIds),
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

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guildSlugs = await listPublicGuildSlugs()
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
      const languages = buildSeoDocsHomeLanguageAlternates(path)
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

  return [...staticEntries, ...guildEntries]
}
