import type { MarketingScreenshotKey } from '@/lib/marketing-screenshots'
import { SUPPORTED_LOCALES } from '@/i18n/locales'
import { getLocalizedSeoFeaturePathname } from '@/lib/seo-locale-paths'

export const FEATURE_PAGE_SLUGS = [
  'discord-bot',
  'auto-regear',
  'zvz-killboard',
  'guild-events',
  'guild-shop',
  'guild-stats',
] as const

export type SeoFeaturePageSlug = (typeof FEATURE_PAGE_SLUGS)[number]

export const FEATURE_SITEMAP_ROUTES = [
  '/features',
  ...FEATURE_PAGE_SLUGS.map((slug) => `/features/${slug}`),
] as const

export const FEATURE_LOCALIZED_SITEMAP_ROUTES = SUPPORTED_LOCALES.flatMap(
  (locale) => FEATURE_SITEMAP_ROUTES.map((path) => getLocalizedSeoFeaturePathname(locale, path)),
)

export type SeoFeatureIconKey =
  | 'bot'
  | 'regear'
  | 'killboard'
  | 'events'
  | 'shop'
  | 'stats'

export interface RelatedSeoDoc {
  href: string
  labelKey: string
}

export interface SeoFeaturePage {
  slug: SeoFeaturePageSlug
  messageKey: string
  icon: SeoFeatureIconKey
  screenshotKey: MarketingScreenshotKey
  keywords: readonly string[]
  relatedDocs: readonly RelatedSeoDoc[]
}

const SEO_FEATURE_PAGES: readonly SeoFeaturePage[] = [
  {
    slug: 'discord-bot',
    messageKey: 'discordBot',
    icon: 'bot',
    screenshotKey: 'events',
    keywords: [
      'Albion guild Discord bot',
      'Albion Online guild bot',
      'Discord guild management bot',
      '알비온 디스코드 봇',
    ],
    relatedDocs: [
      { href: '/docs/onboarding/invite', labelKey: 'onboardingInvite' },
      { href: '/docs/onboarding/setup-wizard', labelKey: 'onboardingWizard' },
      { href: '/docs/admin/permissions', labelKey: 'adminPermissions' },
    ],
  },
  {
    slug: 'auto-regear',
    messageKey: 'autoRegear',
    icon: 'regear',
    screenshotKey: 'regear',
    keywords: [
      'Albion auto regear',
      'Albion regear bot',
      'Albion Online regear manager',
      '알비온 리기어',
    ],
    relatedDocs: [
      { href: '/docs/regear/auto', labelKey: 'regearAuto' },
      { href: '/docs/regear/verification', labelKey: 'regearVerification' },
      { href: '/docs/regear/admin-approval', labelKey: 'regearAdminApproval' },
    ],
  },
  {
    slug: 'zvz-killboard',
    messageKey: 'zvzKillboard',
    icon: 'killboard',
    screenshotKey: 'stats',
    keywords: [
      'Albion ZvZ killboard',
      'Albion battle tracker',
      'Albion guild battle records',
      '알비온 ZVZ 통계',
    ],
    relatedDocs: [
      { href: '/docs/killboard', labelKey: 'killboard' },
      { href: '/docs/killboard/sync', labelKey: 'killboardSync' },
      { href: '/docs/battles/list', labelKey: 'battlesList' },
    ],
  },
  {
    slug: 'guild-events',
    messageKey: 'guildEvents',
    icon: 'events',
    screenshotKey: 'events',
    keywords: [
      'Albion event signup',
      'Albion ZvZ build sheet',
      'Albion guild event manager',
      '알비온 이벤트 모집',
    ],
    relatedDocs: [
      { href: '/docs/events/create', labelKey: 'eventsCreate' },
      { href: '/docs/events/build-sheets', labelKey: 'eventsBuildSheets' },
      { href: '/docs/events/publish', labelKey: 'eventsPublish' },
    ],
  },
  {
    slug: 'guild-shop',
    messageKey: 'guildShop',
    icon: 'shop',
    screenshotKey: 'shop',
    keywords: [
      'Albion guild shop',
      'Albion guild points',
      'Albion point exchange',
      '알비온 길드 상점',
    ],
    relatedDocs: [
      { href: '/docs/shop/storefront', labelKey: 'shopStorefront' },
      { href: '/docs/shop/exchange-rate', labelKey: 'shopExchangeRate' },
      { href: '/docs/shop/points', labelKey: 'shopPoints' },
    ],
  },
  {
    slug: 'guild-stats',
    messageKey: 'guildStats',
    icon: 'stats',
    screenshotKey: 'stats',
    keywords: [
      'Albion guild stats',
      'Albion member weapon stats',
      'Albion leaderboard',
      '알비온 길드 통계',
    ],
    relatedDocs: [
      { href: '/docs/leaderboard/weapon-stats', labelKey: 'leaderboardWeaponStats' },
      { href: '/docs/leaderboard/ranking', labelKey: 'leaderboardRanking' },
      { href: '/docs/members/detail', labelKey: 'membersDetail' },
    ],
  },
]

const SEO_FEATURE_PAGE_BY_SLUG = new Map(
  SEO_FEATURE_PAGES.map((page) => [page.slug, page]),
)

export function getSeoFeaturePages(): readonly SeoFeaturePage[] {
  return SEO_FEATURE_PAGES
}

export function isSeoFeaturePageSlug(slug: string): slug is SeoFeaturePageSlug {
  return FEATURE_PAGE_SLUGS.includes(slug as SeoFeaturePageSlug)
}

export function getSeoFeaturePage(slug: SeoFeaturePageSlug): SeoFeaturePage
export function getSeoFeaturePage(slug: string): SeoFeaturePage | null
export function getSeoFeaturePage(slug: string): SeoFeaturePage | null {
  return SEO_FEATURE_PAGE_BY_SLUG.get(slug as SeoFeaturePageSlug) ?? null
}
