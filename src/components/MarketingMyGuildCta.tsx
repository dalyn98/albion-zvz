'use client'

import { useEffect, useState } from 'react'
import { Home, LogIn } from 'lucide-react'
import {
  normalizeMarketingMyGuildHref,
  resolveMarketingGuildCta,
} from '@/lib/marketing-my-guild-cta'

interface MarketingMyGuildCtaProps {
  installHref: string
  installLabel: string
  myGuildLabel: string
  installClassName: string
  myGuildClassName?: string
  iconSize?: number | null
}

let resolvedMyGuildHref: string | null | undefined
let pendingMyGuildHref: Promise<string | null> | null = null

async function loadMarketingMyGuildHref(): Promise<string | null> {
  if (resolvedMyGuildHref !== undefined) return resolvedMyGuildHref
  if (pendingMyGuildHref) return pendingMyGuildHref

  pendingMyGuildHref = fetch('/api/marketing/my-guild', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return null
      const payload = (await response.json()) as { href?: unknown }
      return normalizeMarketingMyGuildHref(payload.href)
    })
    .catch(() => null)
    .then((href) => {
      resolvedMyGuildHref = href
      return href
    })

  return pendingMyGuildHref
}

export default function MarketingMyGuildCta({
  installHref,
  installLabel,
  myGuildLabel,
  installClassName,
  myGuildClassName,
  iconSize = 12,
}: MarketingMyGuildCtaProps) {
  const [myGuildHref, setMyGuildHref] = useState<string | null>(
    () => resolvedMyGuildHref ?? null,
  )

  useEffect(() => {
    if (resolvedMyGuildHref !== undefined) return
    let cancelled = false

    void loadMarketingMyGuildHref().then((href) => {
      if (!cancelled) setMyGuildHref(href)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const cta = resolveMarketingGuildCta({
    installHref,
    installLabel,
    myGuildLabel,
    myGuildHref,
  })
  const Icon = cta.kind === 'my-guild' ? Home : LogIn

  return (
    <a
      href={cta.href}
      data-seo-event={cta.kind === 'install' ? 'cta_bot_install_click' : undefined}
      data-seo-target={cta.kind === 'install' ? '/login' : undefined}
      className={cta.kind === 'my-guild' ? (myGuildClassName ?? installClassName) : installClassName}
    >
      {iconSize ? <Icon size={iconSize} /> : null}
      {cta.label}
    </a>
  )
}
