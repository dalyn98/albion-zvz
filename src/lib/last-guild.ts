import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { isValidTenantSlug, resolveTenantBySlug, tenantUrl } from '@/lib/tenant-resolver'
import { LAST_GUILD_COOKIE } from '@/lib/last-guild-cookie'

const MY_GUILD_ENTRY_PATH = '/api/auth/my-guild'

export const getMarketingMyGuildHref = cache(
  async (session: SessionPayload | null): Promise<string | null> => {
    if (session && !session.isGuest) {
      try {
        const tenantId = await getSessionGuildId(session)
        const config = await getTenantDiscordConfig(tenantId)
        if (config?.slug) return tenantUrl(config.slug, MY_GUILD_ENTRY_PATH)
      } catch {
        // Fall back to the cross-domain last-guild pointer below.
      }
    }

    const store = await cookies()
    const slug = store.get(LAST_GUILD_COOKIE)?.value ?? null
    if (!slug || !isValidTenantSlug(slug)) return null

    const tenant = await resolveTenantBySlug(slug)
    if (!tenant) return null
    return tenantUrl(tenant.slug, MY_GUILD_ENTRY_PATH)
  },
)
