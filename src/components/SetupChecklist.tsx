import Link from 'next/link'
import { ListChecks, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAppSetting } from '@/lib/app-settings'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'

interface Props {
  guildId: string
}

type RequiredKey = 'eventChannel' | 'albionHomeGuildId'
type RecommendedKey =
  | 'guildProfileEnabled'
  | 'buildTemplatesReady'
  | 'localGuildAccountsReady'
  | 'autoRegearEnabled'
  | 'craftRegearEnabled'
  | 'memberDashboardEnabled'

interface ChecklistItem<K extends string> {
  key: K
  done: boolean
  href: string
  label: string
  description: string
  hint: string
  configureLabel: string
}

export default async function SetupChecklist({ guildId }: Props) {
  const [
    t,
    tenantConfig,
    albionHomeGuildId,
    guildProfileEnabled,
    localGuildAccountsEnabled,
    localGuildInviteHash,
    autoRegearEnabled,
    craftRegearEnabled,
    memberDashboardEnabled,
    buildTemplateCount,
  ] = await Promise.all([
    getTranslations('setupChecklist'),
    getTenantDiscordConfig(guildId),
    getAppSetting('albion_home_guild_id', '', guildId),
    getAppSetting('guild_profile_enabled', 'false', guildId),
    getAppSetting('local_guild_accounts_enabled', 'false', guildId),
    getAppSetting('local_guild_invite_hash', '', guildId),
    getAppSetting('auto_regear_enabled', 'false', guildId),
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('member_dashboard_enabled', 'false', guildId),
    getAdminClient()
      .from('slot_templates')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .then(({ count }) => count ?? 0),
  ])

  const required: ChecklistItem<RequiredKey>[] = [
    {
      key: 'eventChannel',
      done: !!tenantConfig?.eventChannelId,
      href: '/admin/dashboard/settings',
      label: t('eventChannelLabel'),
      description: t('eventChannelDescription'),
      hint: t('eventChannelHint'),
      configureLabel: t('configureEventChannel'),
    },
    {
      key: 'albionHomeGuildId',
      done: !!albionHomeGuildId.trim(),
      href: '/admin/dashboard/settings',
      label: t('albionHomeGuildIdLabel'),
      description: t('albionHomeGuildIdDescription'),
      hint: t('albionHomeGuildIdHint'),
      configureLabel: t('configureHomeGuild'),
    },
  ]

  const recommended: ChecklistItem<RecommendedKey>[] = [
    {
      key: 'guildProfileEnabled',
      done: guildProfileEnabled === 'true',
      href: '/admin/dashboard/guild-profile',
      label: t('guildProfileEnabledLabel'),
      description: t('guildProfileEnabledDescription'),
      hint: t('guildProfileEnabledHint'),
      configureLabel: t('configureGuildProfile'),
    },
    {
      key: 'buildTemplatesReady',
      done: buildTemplateCount > 0,
      href: '/admin/dashboard/builds',
      label: t('buildTemplatesReadyLabel'),
      description: t('buildTemplatesReadyDescription'),
      hint: t('buildTemplatesReadyHint'),
      configureLabel: t('configureBuildTemplates'),
    },
    {
      key: 'localGuildAccountsReady',
      done: localGuildAccountsEnabled === 'true' && localGuildInviteHash.trim().length > 0,
      href: '/admin/dashboard/settings?tab=guild',
      label: t('localGuildAccountsReadyLabel'),
      description: t('localGuildAccountsReadyDescription'),
      hint: t('localGuildAccountsReadyHint'),
      configureLabel: t('configureLocalGuildAccounts'),
    },
    {
      key: 'autoRegearEnabled',
      done: autoRegearEnabled === 'true',
      href: '/admin/dashboard/regear',
      label: t('autoRegearEnabledLabel'),
      description: t('autoRegearEnabledDescription'),
      hint: t('autoRegearEnabledHint'),
      configureLabel: t('configureAutoRegear'),
    },
    {
      key: 'craftRegearEnabled',
      done: craftRegearEnabled === 'true',
      href: '/admin/dashboard/craft',
      label: t('craftRegearEnabledLabel'),
      description: t('craftRegearEnabledDescription'),
      hint: t('craftRegearEnabledHint'),
      configureLabel: t('configureCraftRegear'),
    },
    {
      key: 'memberDashboardEnabled',
      done: memberDashboardEnabled === 'true',
      href: '/admin/dashboard/guild-profile',
      label: t('memberDashboardEnabledLabel'),
      description: t('memberDashboardEnabledDescription'),
      hint: t('memberDashboardEnabledHint'),
      configureLabel: t('configureMemberDashboard'),
    },
  ]

  const requiredPending = required.filter((it) => !it.done)
  const recommendedPending = recommended.filter((it) => !it.done)
  if (requiredPending.length === 0 && recommendedPending.length === 0) return null

  return (
    <div className="space-y-3">
      {requiredPending.length > 0 && (
        <Section
          tone="required"
          icon={<ListChecks size={18} className="text-amber-300 mt-0.5 flex-shrink-0" />}
          title={t('requiredTitle', { count: requiredPending.length })}
          description={t('requiredDescription')}
          items={requiredPending}
        />
      )}
      {recommendedPending.length > 0 && (
        <Section
          tone="recommended"
          icon={<Sparkles size={18} className="text-emerald-300 mt-0.5 flex-shrink-0" />}
          title={t('recommendedTitle', { count: recommendedPending.length })}
          description={t('recommendedDescription')}
          items={recommendedPending}
        />
      )}
    </div>
  )
}

interface SectionProps<K extends string> {
  tone: 'required' | 'recommended'
  icon: React.ReactNode
  title: string
  description: string
  items: ChecklistItem<K>[]
}

function Section<K extends string>({ tone, icon, title, description, items }: SectionProps<K>) {
  const isRequired = tone === 'required'
  const containerClass = isRequired
    ? 'rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 sm:p-5 space-y-3'
    : 'rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 sm:p-5 space-y-3'
  const titleClass = isRequired ? 'text-sm font-semibold text-amber-100' : 'text-sm font-semibold text-emerald-100'
  const descClass = isRequired ? 'text-xs text-amber-100/70 mt-1 leading-relaxed' : 'text-xs text-emerald-100/70 mt-1 leading-relaxed'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <h2 className={titleClass}>{title}</h2>
          <p className={descClass}>{description}</p>
        </div>
      </div>

      <ul className="space-y-3 pl-1">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-2.5 text-xs">
            <span
              className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full flex-shrink-0 ${
                isRequired
                  ? 'bg-gray-800 text-amber-300 border border-amber-400/40'
                  : 'bg-gray-800 text-emerald-300 border border-emerald-400/40'
              }`}
              aria-hidden
            >
              <AlertCircle size={10} />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className={isRequired ? 'font-semibold text-amber-100' : 'font-semibold text-emerald-100'}>
                {it.label}
              </p>
              <p className={isRequired ? 'text-amber-100/70 leading-relaxed' : 'text-emerald-100/70 leading-relaxed'}>
                {it.description}
              </p>
              <p className={isRequired ? 'text-amber-200/50 italic' : 'text-emerald-200/50 italic'}>{it.hint}</p>
              <Link
                href={it.href}
                className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 hover:underline underline-offset-4 ${
                  isRequired ? 'text-amber-100 hover:text-white' : 'text-emerald-100 hover:text-white'
                }`}
              >
                {it.configureLabel}
                <ArrowRight size={11} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
