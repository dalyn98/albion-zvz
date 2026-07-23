import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Home, LogIn } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import LocalGuildAccountForm from '@/components/LocalGuildAccountForm'
import { getAppSetting } from '@/lib/app-settings'
import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import { buildLoginEntryHref } from '@/lib/login-entry'

export const dynamic = 'force-dynamic'

function safeReturnTo(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return sanitizeInternalReturnTo(value)
}

function discordLoginHref(returnTo: string): string {
  return buildLoginEntryHref({ returnTo })
}

interface LoginUnavailableStateProps {
  eyebrow: string
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
}

function LoginUnavailableState({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: LoginUnavailableStateProps) {
  return (
    <main className="min-h-screen bg-[#090b10] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-lg border border-gray-800 bg-gray-950/80 p-6 text-center shadow-2xl shadow-black/30 sm:p-8">
          <p className="text-xs font-semibold uppercase text-amber-300">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-400">{description}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/25"
            >
              <Home size={16} aria-hidden="true" />
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              prefetch={false}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800"
            >
              <LogIn size={16} aria-hidden="true" />
              {secondaryLabel}
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

export default async function GuildLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string | string[] }>
}) {
  const [{ return: rawReturn }, headersList, rawLocale, t] = await Promise.all([
    searchParams,
    headers(),
    getLocale(),
    getTranslations('localGuildAccount'),
  ])
  const safeReturn = safeReturnTo(rawReturn)
  const classified = classifyHost(headersList.get('host'))
  if (classified.kind !== 'tenant') {
    return (
      <LoginUnavailableState
        eyebrow={t('eyebrow')}
        title={t('unavailableTitle')}
        description={t('tenantRequiredDescription')}
        primaryHref="/"
        primaryLabel={t('goToOfficialSite')}
        secondaryHref={discordLoginHref(safeReturn)}
        secondaryLabel={t('continueWithDiscord')}
      />
    )
  }
  const tenant = await resolveTenantBySlug(classified.slug)
  if (!tenant) redirect('/')

  const [enabledRaw, inviteHash, serverRaw] = await Promise.all([
    getAppSetting('local_guild_accounts_enabled', 'false', tenant.tenantId),
    getAppSetting('local_guild_invite_hash', '', tenant.tenantId),
    getAppSetting('albion_server', '', tenant.tenantId),
  ])
  if (enabledRaw !== 'true' || !inviteHash.trim()) {
    return (
      <LoginUnavailableState
        eyebrow={t('eyebrow')}
        title={t('disabledLoginTitle')}
        description={t('disabledLoginDescription')}
        primaryHref="/"
        primaryLabel={t('goToGuildHome')}
        secondaryHref={discordLoginHref(safeReturn)}
        secondaryLabel={t('continueWithDiscord')}
      />
    )
  }

  const initialServer: AlbionServer | null = isAlbionServer(serverRaw) ? serverRaw : null
  const initialLocale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  return (
    <main className="min-h-screen bg-[#090b10] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <LocalGuildAccountForm
          returnTo={safeReturn}
          initialServer={initialServer}
          initialLocale={initialLocale}
        />
      </div>
    </main>
  )
}
