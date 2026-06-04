import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import LocalGuildAccountForm from '@/components/LocalGuildAccountForm'
import { getAppSetting } from '@/lib/app-settings'
import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

export const dynamic = 'force-dynamic'

function safeReturnTo(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return sanitizeInternalReturnTo(value)
}

export default async function GuildLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string | string[] }>
}) {
  const [{ return: rawReturn }, headersList, rawLocale] = await Promise.all([
    searchParams,
    headers(),
    getLocale(),
  ])
  const classified = classifyHost(headersList.get('host'))
  if (classified.kind !== 'tenant') redirect('/')
  const tenant = await resolveTenantBySlug(classified.slug)
  if (!tenant) redirect('/')

  const [enabledRaw, inviteHash, serverRaw] = await Promise.all([
    getAppSetting('local_guild_accounts_enabled', 'false', tenant.tenantId),
    getAppSetting('local_guild_invite_hash', '', tenant.tenantId),
    getAppSetting('albion_server', '', tenant.tenantId),
  ])
  if (enabledRaw !== 'true' || !inviteHash.trim()) redirect('/')

  const initialServer: AlbionServer | null = isAlbionServer(serverRaw) ? serverRaw : null
  const initialLocale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  return (
    <main className="min-h-screen bg-[#090b10] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <LocalGuildAccountForm
          returnTo={safeReturnTo(rawReturn)}
          initialServer={initialServer}
          initialLocale={initialLocale}
        />
      </div>
    </main>
  )
}
