export type MarketingGuildCtaKind = 'install' | 'my-guild'

interface ResolveMarketingGuildCtaInput {
  installHref: string
  installLabel: string
  myGuildLabel: string
  myGuildHref: string | null
}

export interface MarketingGuildCtaState {
  href: string
  kind: MarketingGuildCtaKind
  label: string
}

const UNSAFE_RELATIVE_HREF_PATTERN = /[\u0000-\u001F\u007F\\]/
const ALLOWED_MY_GUILD_ROOT_DOMAIN = 'albion-guildmanager.com'

function isAllowedMyGuildHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === ALLOWED_MY_GUILD_ROOT_DOMAIN ||
    normalized.endsWith(`.${ALLOWED_MY_GUILD_ROOT_DOMAIN}`)
  )
}

export function normalizeMarketingMyGuildHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!href) return null

  if (href.startsWith('/')) {
    if (href.startsWith('//') || UNSAFE_RELATIVE_HREF_PATTERN.test(href)) return null
    return href
  }

  try {
    const url = new URL(href)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (!isAllowedMyGuildHostname(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function resolveMarketingGuildCta(
  input: ResolveMarketingGuildCtaInput,
): MarketingGuildCtaState {
  const myGuildHref = normalizeMarketingMyGuildHref(input.myGuildHref)
  if (myGuildHref) {
    return {
      href: myGuildHref,
      kind: 'my-guild',
      label: input.myGuildLabel,
    }
  }

  return {
    href: input.installHref,
    kind: 'install',
    label: input.installLabel,
  }
}
