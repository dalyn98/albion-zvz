import Link from 'next/link'
import { ArrowLeft, Settings, ShieldAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CAP } from '@/lib/permissions'
import {
  isConfigurableGuildFeatureKey,
  type ConfigurableGuildFeatureKey,
} from '@/lib/guild-features'
import { getGuildFeature } from '@/lib/guild-features-server'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { PageHeader, SituationSurface, cx, pressScaleClass } from '@/components/ui-patterns'

export const dynamic = 'force-dynamic'

interface SearchParams {
  feature?: string
  returnTo?: string
}

export default async function FeatureUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [{ feature: rawFeature, returnTo: rawReturnTo }, session, t] = await Promise.all([
    searchParams,
    getSession(),
    getTranslations('featureUnavailable'),
  ])
  if (!session) redirect('/')
  if (!isConfigurableGuildFeatureKey(rawFeature)) redirect('/')

  const featureKey: ConfigurableGuildFeatureKey = rawFeature
  const guildId = await getSessionGuildId(session)
  const feature = await getGuildFeature(guildId, featureKey)
  const canConfigure = session.isAdmin || sessionHasAny(session, [CAP.SETTINGS_TOGGLES])
  const returnTo = sanitizeInternalReturnTo(rawReturnTo, '/')
  const featureName = t(`feature.${featureKey}`)

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { feature: featureName })}
        description={t(`state.${feature.state}`, { feature: featureName })}
      />

      <SituationSurface className="mt-6 space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]">
            <ShieldAlert size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-balance text-base font-semibold text-foreground">
              {canConfigure ? t('adminNextTitle') : t('memberNextTitle')}
            </h2>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted">
              {canConfigure
                ? t('adminNextDescription')
                : t('memberNextDescription', { feature: featureName })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {canConfigure && (
            <Link
              href={`/admin/dashboard/settings?tab=features&feature=${featureKey}`}
              className={cx(
                'inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-[background-color,transform] hover:bg-accent-hover',
                pressScaleClass,
              )}
            >
              <Settings size={15} aria-hidden="true" />
              {t('openSettings')}
            </Link>
          )}
          <Link
            href="/"
            className={cx(
              'inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition-[border-color,color,transform] hover:border-accent/50 hover:text-foreground',
              pressScaleClass,
            )}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {t('backHome')}
          </Link>
          {returnTo !== '/' && (
            <span className="self-center text-xs text-subtle">
              {t('requestedPath', { path: returnTo })}
            </span>
          )}
        </div>
      </SituationSurface>
    </main>
  )
}
