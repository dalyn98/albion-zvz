import type { MetadataRoute } from 'next'
import { getAdminClient } from '@/lib/supabase-admin'
import { DOCS_NAV } from '@/lib/docs-nav'

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
    const { data: enabledRows } = await db
      .from('app_settings')
      .select('guild_id, value')
      .eq('key', 'guild_profile_enabled')
      .in('guild_id', Array.from(tenantById.keys()))
    if (!enabledRows) return []
    return enabledRows
      .filter((row) => (row.value as string) === 'true')
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

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ...expandDocsRoutes().map((path) => ({
      url: `${BASE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
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
