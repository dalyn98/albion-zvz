import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle2, ShieldCheck, Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireLiveSession } from '@/lib/auth'
import { listAccessibleGuildMemberships } from '@/lib/guild-member-directory'
import { getSessionGuildId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

const ERROR_KEYS = new Set([
  'invalid_request',
  'invalid_target',
  'unauthorized',
  'membership_required',
  'target_unavailable',
])

export default async function MyGuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [session, params, t] = await Promise.all([
    requireLiveSession().catch(() => null),
    searchParams,
    getTranslations('guildSwitcher'),
  ])
  if (!session) redirect('/login?returnTo=%2Fme%2Fguilds')
  if (
    session.isGuest ||
    session.isLocalGuildAccount ||
    !session.isMember
  ) {
    redirect('/me')
  }

  const currentGuildId = await getSessionGuildId(session)
  const memberships = await listAccessibleGuildMemberships(
    session.discordId,
    currentGuildId,
  )
  const errorKey =
    params.error && ERROR_KEYS.has(params.error)
      ? params.error
      : null

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <Users size={14} aria-hidden="true" />
          {t('eyebrow')}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {t('description')}
        </p>
      </header>

      {errorKey && (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground"
        >
          {t(`error.${errorKey}`)}
        </div>
      )}

      <section className="space-y-3" aria-label={t('listLabel')}>
        {memberships.map((membership) => (
          <article
            key={membership.guildMemberId}
            className={`rounded-xl border p-4 shadow-card ${
              membership.current
                ? 'border-accent/40 bg-accent-soft'
                : 'border-border bg-surface'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-bold text-foreground">
                    {membership.name}
                  </h2>
                  {membership.current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[11px] font-bold text-success-soft-foreground">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      {t('current')}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted">
                  {t('memberAs', {
                    name:
                      membership.albionPlayerName ||
                      membership.displayName,
                  })}
                </p>
              </div>

              {membership.current ? (
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted">
                  <ShieldCheck size={14} aria-hidden="true" />
                  {t('activeSession')}
                </span>
              ) : (
                <form action="/api/auth/switch-guild" method="post">
                  <input
                    type="hidden"
                    name="guildId"
                    value={membership.guildId}
                  />
                  <input type="hidden" name="returnTo" value="/" />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
                  >
                    {t('switch')}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </form>
              )}
            </div>
          </article>
        ))}
      </section>

      {memberships.length <= 1 && (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
          {t('singleGuild')}
        </p>
      )}
    </main>
  )
}
