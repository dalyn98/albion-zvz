import { CheckCircle2, LockKeyhole, ShieldCheck, ShieldOff } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { EventEffectiveRegearPolicyRow } from '@/lib/regear-effective-policy-server'
import { formatSilver } from '@/lib/silver'

interface Props {
  rows: EventEffectiveRegearPolicyRow[]
  locked: boolean
  variant: 'admin' | 'member'
}

function sourceTranslationKey(
  source: string | null,
):
  | 'sourceNone'
  | 'sourceEvent'
  | 'sourceEventRole'
  | 'sourceDiscordRole'
  | 'sourceDiscordFloor'
  | 'sourceRolePolicy'
  | 'sourceGuild'
  | 'sourceWindow'
  | 'sourceFallback'
  | 'sourceDisabled' {
  if (source === 'event') return 'sourceEvent'
  if (source === 'event_role_override') return 'sourceEventRole'
  if (source === 'discord_role_policy') return 'sourceDiscordRole'
  if (source === 'discord_role_rate_floor') return 'sourceDiscordFloor'
  if (source === 'role_reward') return 'sourceRolePolicy'
  if (source === 'guild_default') return 'sourceGuild'
  if (source === 'regear_window') return 'sourceWindow'
  if (source === 'fallback') return 'sourceFallback'
  if (source === 'disabled') return 'sourceDisabled'
  return 'sourceNone'
}

export default async function EventEffectiveRegearPolicyPanel({
  rows,
  locked,
  variant,
}: Props) {
  const t = await getTranslations('effectiveRegearPolicy')
  const visibleRows = variant === 'member' ? rows.slice(0, 1) : rows

  if (visibleRows.length === 0) {
    if (variant === 'member') return null
    return (
      <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} className="text-amber-300" />
          <h2 className="font-bold text-white">{t('adminTitle')}</h2>
        </div>
        <p className="mt-2 text-sm text-gray-400">{t('adminEmpty')}</p>
      </section>
    )
  }

  return (
    <section
      className={`rounded-xl border p-4 sm:p-5 ${
        variant === 'member'
          ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
          : 'border-gray-700 bg-gray-900'
      }`}
      data-testid="effective-regear-policy"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={17}
              className={variant === 'member' ? 'text-emerald-300' : 'text-amber-300'}
            />
            <h2 className="font-bold text-white">
              {t(variant === 'member' ? 'memberTitle' : 'adminTitle')}
            </h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            {t(variant === 'member' ? 'memberHint' : 'adminHint')}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${
            locked
              ? 'border-sky-500/35 bg-sky-500/10 text-sky-200'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
          }`}
        >
          {locked ? <LockKeyhole size={11} /> : <CheckCircle2 size={11} />}
          {t(locked ? 'lockedBadge' : 'previewBadge')}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {visibleRows.map((row) => {
          const policy = row.manualPolicy
          const enabled = policy.enabled !== false
          return (
            <article
              key={`${row.discordId}:${row.roleName}`}
              className="rounded-lg border border-gray-800 bg-gray-950/55 p-3"
            >
              {variant === 'admin' && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-100">{row.username}</p>
                    <p className="text-[11px] text-gray-500">{row.roleName}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      enabled ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {enabled ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                    {t(enabled ? 'allowed' : 'blocked')}
                  </span>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                {variant === 'member' && (
                  <div className="rounded-md bg-gray-900/75 p-2">
                    <dt className="text-gray-500">{t('allowedLabel')}</dt>
                    <dd className={enabled ? 'mt-1 font-bold text-emerald-300' : 'mt-1 font-bold text-rose-300'}>
                      {t(enabled ? 'allowed' : 'blocked')}
                    </dd>
                  </div>
                )}
                <div className="rounded-md bg-gray-900/75 p-2">
                  <dt className="text-gray-500">{t('capLabel')}</dt>
                  <dd className="mt-1 font-mono font-bold text-gray-100">
                    {formatSilver(policy.baseCapSilver)}s
                  </dd>
                </div>
                <div className="rounded-md bg-gray-900/75 p-2">
                  <dt className="text-gray-500">{t('rateLabel')}</dt>
                  <dd className="mt-1 font-mono font-bold text-gray-100">
                    {policy.basePayoutRatePercent}%
                  </dd>
                </div>
                <div className="rounded-md bg-gray-900/75 p-2">
                  <dt className="text-gray-500">{t('deathsLabel')}</dt>
                  <dd className="mt-1 font-mono font-bold text-gray-100">
                    {t('deathsValue', { count: policy.maxDeathsPerMember })}
                  </dd>
                </div>
                <div className="rounded-md bg-gray-900/75 p-2">
                  <dt className="text-gray-500">{t('videoLabel')}</dt>
                  <dd className="mt-1 font-mono font-bold text-gray-100">
                    {policy.videoEnabled
                      ? t('videoValue', {
                          rate: policy.videoPayoutRatePercent,
                          bonus: formatSilver(policy.videoClaimCeilingBonusSilver),
                        })
                      : t('videoDisabled')}
                  </dd>
                </div>
                {variant === 'admin' && (
                  <div className="rounded-md bg-gray-900/75 p-2">
                    <dt className="text-gray-500">{t('autoLabel')}</dt>
                    <dd className={`mt-1 font-bold ${row.autoPolicy.enabled !== false ? 'text-emerald-300' : 'text-gray-500'}`}>
                      {t(row.autoPolicy.enabled !== false ? 'allowed' : 'blocked')}
                    </dd>
                  </div>
                )}
              </dl>

              {variant === 'admin' && (
                <details className="mt-3 rounded-md border border-gray-800 bg-gray-900/50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-300">
                    {t('sourcesToggle')}
                  </summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">{t('capSourceLabel')}</dt>
                      <dd className="text-right text-gray-300">
                        {t(sourceTranslationKey(policy.sources.cap))}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">{t('rateSourceLabel')}</dt>
                      <dd className="text-right text-gray-300">
                        {t(sourceTranslationKey(policy.sources.payoutRate))}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">{t('videoSourceLabel')}</dt>
                      <dd className="text-right text-gray-300">
                        {t(sourceTranslationKey(policy.sources.video))}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">{t('discordMatchLabel')}</dt>
                      <dd className="text-right text-gray-300">
                        {row.sources.discordRolePolicy.matchedDiscordRoleName ??
                          t('discordMatchNone')}
                      </dd>
                    </div>
                  </dl>
                </details>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
