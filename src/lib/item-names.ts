import items from '@/data/albion-items.json'
import type { Locale } from '@/i18n/locales'

interface BundledItem {
  u: string
  c: string
  e: string
  k: string
  j: string
  d: string
  dj: string
  de: string
}

const ITEMS = items as BundledItem[]

// Single-pass index build amortizes lookup cost across many calls per render.
// Kept at module level so the Map is reused for the life of the process.
const BY_ID = new Map<string, BundledItem>()
for (const item of ITEMS) BY_ID.set(item.u, item)

export function getLocalizedItemName(
  uniqueName: string | null | undefined,
  locale: Locale,
  fallback: string | null | undefined,
): string | null {
  if (!uniqueName) return fallback ?? null
  const bundled = BY_ID.get(uniqueName)
  if (!bundled) return fallback ?? null
  if (locale === 'ja') return bundled.dj
  if (locale === 'en') return bundled.de
  return bundled.d
}
