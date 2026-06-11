import { headers } from 'next/headers'
import { isLocale } from '@/i18n/locales'
import {
  getMarketingPathsForHost,
  type MarketingPaths,
} from '@/lib/marketing-paths'

export async function getMarketingPaths(): Promise<MarketingPaths> {
  const headersList = await headers()
  const headerLocale = headersList.get('x-seo-locale')
  return getMarketingPathsForHost(
    headersList.get('host'),
    isLocale(headerLocale) ? headerLocale : null,
  )
}
