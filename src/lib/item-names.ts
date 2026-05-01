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
  // zh users see English item names — Albion has no Chinese item bundle and
  // English is the lingua franca in international Albion communities.
  if (locale === 'en' || locale === 'zh') return bundled.de
  return bundled.d
}

// 인챈트가 붙은 itemId (예: T5_2H_ICECRYSTAL_UNDEAD@3) 를 base 로 lookup 후
// 표시명 끝에 ".N" 을 붙여서 반환. base 만 있는 경우 그대로 표시명 반환.
// 일반 재료처럼 @ 가 없는 ID 도 안전하게 통과한다.
export function getLocalizedItemNameWithEnchant(
  uniqueName: string | null | undefined,
  locale: Locale,
  fallback: string | null | undefined,
): string | null {
  if (!uniqueName) return fallback ?? null
  const at = uniqueName.lastIndexOf('@')
  if (at === -1) return getLocalizedItemName(uniqueName, locale, fallback)
  const base = uniqueName.slice(0, at)
  const level = Number(uniqueName.slice(at + 1))
  const baseName = getLocalizedItemName(base, locale, fallback)
  if (!baseName) return fallback ?? null
  if (!Number.isFinite(level) || level <= 0) return baseName
  return `${baseName}.${level}`
}
