import items from '@/data/albion-items.json'
import type { Locale } from '@/i18n/locales'

interface BundledItem {
  u: string
  c: string
  e: string
  k: string
  j: string
  z: string
  d: string
  dj: string
  de: string
  dz: string
}

const ITEMS = items as BundledItem[]

// Single-pass index build amortizes lookup cost across many calls per render.
// Kept at module level so the Map is reused for the life of the process.
const BY_ID = new Map<string, BundledItem>()
for (const item of ITEMS) BY_ID.set(item.u, item)

const KO_TIER_PREFIXES: readonly string[] = [
  '장인의 ',
  '숙련된 ',
  '숙련자의 ',
  '전문 ',
  '전문가의 ',
  '명인의 ',
  '마스터 ',
  '마스터의 ',
  '그랜드 마스터의 ',
  '그랜드마스터의 ',
  '장로 ',
  '장로의 ',
]

const EN_TIER_PREFIXES: readonly string[] = [
  "journeyman's ",
  "adept's ",
  "expert's ",
  "master's ",
  "grandmaster's ",
  "elder's ",
]

const JA_TIER_SUFFIX_RE = /（(?:熟練|名人|達人|マスター|グランドマスター|老熟)）$/
const JA_TIER_PREFIXES: readonly string[] = [
  '熟練の',
  '名人の',
  '達人の',
  'マスターの',
  'グランドマスターの',
  '老熟の',
]

const ZH_TIER_PREFIXES: readonly string[] = [
  '学徒级',
  '老手级',
  '专家级',
  '大师级',
  '宗师级',
  '禅师级',
]

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
  if (locale === 'zh') return bundled.dz
  return bundled.d
}

export function stripLocalizedTierName(
  name: string | null | undefined,
  locale: Locale,
): string {
  if (!name) return ''
  if (locale === 'ja') {
    const withoutSuffix = name.replace(JA_TIER_SUFFIX_RE, '')
    if (withoutSuffix !== name) return withoutSuffix
    for (const prefix of JA_TIER_PREFIXES) {
      if (name.startsWith(prefix)) return name.slice(prefix.length)
    }
    return name
  }
  const prefixes = locale === 'en'
    ? EN_TIER_PREFIXES
    : locale === 'zh'
      ? ZH_TIER_PREFIXES
      : KO_TIER_PREFIXES
  const lower = name.toLowerCase()
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return name.slice(prefix.length)
    }
  }
  return name
}

export function getLocalizedBaseItemName(
  uniqueName: string | null | undefined,
  locale: Locale,
  fallback: string | null | undefined,
): string | null {
  const localized = getLocalizedItemName(uniqueName, locale, fallback)
  if (!localized) return fallback ?? null
  return stripLocalizedTierName(localized, locale) || localized
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
