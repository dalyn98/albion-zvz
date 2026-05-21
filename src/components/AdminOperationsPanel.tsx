import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { getAdminClient } from '@/lib/supabase-admin'
import type { TenantDiscordConfig } from '@/lib/tenant'

interface Props {
  guildId: string
  tenantConfig: TenantDiscordConfig | null
}

interface OperationsSnapshot {
  pendingTotal: number
  upcomingEvents: number
  draftEvents: number
  activeMembers: number
  unverifiedMembers: number
  requiredMissing: number
  staleSyncCount: number
  autoRegearEnabled: boolean
}

type Tone = 'good' | 'warn' | 'danger' | 'info'

const SYNC_KEYS = [
  'albion_home_guild_id',
  'auto_regear_enabled',
  'last_killboard_sync_at',
  'last_battle_tracker_sync_at',
  'last_member_sync_at',
  'last_auto_regear_at',
] as const

function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor((nowMs - ms) / 60_000))
}

function isFresh(iso: string | null | undefined, nowMs: number, maxAgeMinutes: number): boolean {
  const age = minutesSince(iso, nowMs)
  return age !== null && age <= maxAgeMinutes
}

async function loadSnapshot(
  guildId: string,
  tenantConfig: TenantDiscordConfig | null,
): Promise<OperationsSnapshot> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()

  const [
    badges,
    settingsRes,
    upcomingEventsRes,
    draftEventsRes,
    activeMembersRes,
    unverifiedMembersRes,
  ] = await Promise.all([
    getAdminBadgeCounts(guildId),
    db
      .from('app_settings')
      .select('key, value')
      .eq('guild_id', guildId)
      .in('key', [...SYNC_KEYS]),
    db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'published')
      .gte('gather_at', nowIso),
    db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'draft'),
    db
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .is('withdrawn_at', null),
    db
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .is('albion_verified_at', null),
  ])

  const settingMap = new Map(
    (settingsRes.data ?? []).map((row) => [row.key as string, (row.value as string | null) ?? '']),
  )
  const homeGuildId = settingMap.get('albion_home_guild_id')?.trim() ?? ''
  const autoRegearEnabled = settingMap.get('auto_regear_enabled') === 'true'
  const nowMs = Date.now()
  const staleSyncCount = [
    !homeGuildId || isFresh(settingMap.get('last_killboard_sync_at'), nowMs, 90),
    !homeGuildId || isFresh(settingMap.get('last_battle_tracker_sync_at'), nowMs, 30),
    isFresh(settingMap.get('last_member_sync_at'), nowMs, 30 * 60),
    !autoRegearEnabled || isFresh(settingMap.get('last_auto_regear_at'), nowMs, 90),
  ].filter((ok) => !ok).length

  const pendingTotal =
    badges.regear +
    badges.exchange +
    badges.donation +
    badges.shop +
    badges.eventPayout +
    badges.craft

  const requiredMissing = [
    !tenantConfig?.botInstalled,
    !tenantConfig?.eventChannelId,
    !homeGuildId,
  ].filter(Boolean).length

  return {
    pendingTotal,
    upcomingEvents: upcomingEventsRes.count ?? 0,
    draftEvents: draftEventsRes.count ?? 0,
    activeMembers: activeMembersRes.count ?? 0,
    unverifiedMembers: unverifiedMembersRes.count ?? 0,
    requiredMissing,
    staleSyncCount,
    autoRegearEnabled,
  }
}

export default async function AdminOperationsPanel({ guildId, tenantConfig }: Props) {
  const [t, snapshot] = await Promise.all([
    getTranslations('adminOperations'),
    loadSnapshot(guildId, tenantConfig),
  ])

  const cards = [
    {
      key: 'pending',
      href: '/admin/dashboard/approvals',
      icon: ShieldCheck,
      tone: snapshot.pendingTotal > 0 ? 'warn' : 'good',
      title: t('pendingTitle'),
      value:
        snapshot.pendingTotal > 0
          ? t('pendingValue', { count: snapshot.pendingTotal })
          : t('pendingEmpty'),
      detail: t('pendingDetail'),
    },
    {
      key: 'setup',
      href: '/admin/dashboard/settings',
      icon: Settings,
      tone: snapshot.requiredMissing > 0 ? 'danger' : 'good',
      title: t('setupTitle'),
      value:
        snapshot.requiredMissing > 0
          ? t('setupMissing', { count: snapshot.requiredMissing })
          : t('setupReady'),
      detail: t('setupDetail'),
    },
    {
      key: 'sync',
      href: '/admin/dashboard/settings',
      icon: Activity,
      tone: snapshot.staleSyncCount > 0 ? 'warn' : 'good',
      title: t('syncTitle'),
      value:
        snapshot.staleSyncCount > 0
          ? t('syncDelayed', { count: snapshot.staleSyncCount })
          : t('syncReady'),
      detail: snapshot.autoRegearEnabled ? t('syncDetailAutoOn') : t('syncDetailAutoOff'),
    },
    {
      key: 'members',
      href: '/admin/dashboard/stats',
      icon: Users,
      tone: snapshot.unverifiedMembers > 0 ? 'info' : 'good',
      title: t('membersTitle'),
      value:
        snapshot.unverifiedMembers > 0
          ? t('membersUnverified', { count: snapshot.unverifiedMembers })
          : t('membersReady'),
      detail: t('membersDetail', { count: snapshot.activeMembers }),
    },
  ] satisfies Array<{
    key: string
    href: string
    icon: ComponentType<{ size?: number; className?: string }>
    tone: Tone
    title: string
    value: string
    detail: string
  }>

  const actionItems: Array<{
    key: string
    tone: Tone
    title: string
    body: string
    href: string
    link: string
  }> = []

  if (snapshot.requiredMissing > 0) {
    actionItems.push({
      key: 'setup',
      tone: 'danger',
      title: t('actionSetupTitle'),
      body: t('actionSetupBody'),
      href: '/admin/dashboard/settings',
      link: t('actionSetupLink'),
    })
  }
  if (snapshot.pendingTotal > 0) {
    actionItems.push({
      key: 'pending',
      tone: 'warn',
      title: t('actionPendingTitle', { count: snapshot.pendingTotal }),
      body: t('actionPendingBody'),
      href: '/admin/dashboard/approvals',
      link: t('actionPendingLink'),
    })
  }
  if (snapshot.staleSyncCount > 0) {
    actionItems.push({
      key: 'sync',
      tone: 'warn',
      title: t('actionSyncTitle'),
      body: t('actionSyncBody'),
      href: '/admin/dashboard/settings',
      link: t('actionSyncLink'),
    })
  }
  if (snapshot.draftEvents > 0) {
    actionItems.push({
      key: 'drafts',
      tone: 'info',
      title: t('actionDraftTitle', { count: snapshot.draftEvents }),
      body: t('actionDraftBody'),
      href: '/admin/dashboard',
      link: t('actionDraftLink'),
    })
  }
  if (snapshot.upcomingEvents === 0 && snapshot.draftEvents === 0) {
    actionItems.push({
      key: 'events',
      tone: 'info',
      title: t('actionNoEventsTitle'),
      body: t('actionNoEventsBody'),
      href: '/admin/dashboard/events/new',
      link: t('actionNoEventsLink'),
    })
  }
  if (snapshot.unverifiedMembers > 0) {
    actionItems.push({
      key: 'members',
      tone: 'info',
      title: t('actionMembersTitle', { count: snapshot.unverifiedMembers }),
      body: t('actionMembersBody'),
      href: '/admin/dashboard/stats',
      link: t('actionMembersLink'),
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
          {t('eyebrow')}
        </p>
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted leading-relaxed max-w-3xl">{t('description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(({ key, ...card }) => (
          <StatusCard key={key} {...card} openLabel={t('openCard')} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Clock3 size={17} className="text-accent-soft-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('actionsTitle')}</h3>
        </div>
        {actionItems.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-3">
            <CheckCircle2 size={18} className="text-emerald-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">{t('actionEmptyTitle')}</p>
              <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
                {t('actionEmptyBody')}
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {actionItems.map(({ key, ...item }) => (
              <ActionRow key={key} {...item} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function toneClasses(tone: Tone): {
  border: string
  bg: string
  icon: string
  value: string
} {
  switch (tone) {
    case 'danger':
      return {
        border: 'border-rose-400/30',
        bg: 'bg-rose-500/5',
        icon: 'text-rose-300',
        value: 'text-rose-100',
      }
    case 'warn':
      return {
        border: 'border-amber-400/30',
        bg: 'bg-amber-500/5',
        icon: 'text-amber-300',
        value: 'text-amber-100',
      }
    case 'info':
      return {
        border: 'border-sky-400/30',
        bg: 'bg-sky-500/5',
        icon: 'text-sky-300',
        value: 'text-sky-100',
      }
    default:
      return {
        border: 'border-emerald-400/25',
        bg: 'bg-emerald-500/5',
        icon: 'text-emerald-300',
        value: 'text-emerald-100',
      }
  }
}

function StatusCard({
  href,
  icon: Icon,
  tone,
  title,
  value,
  detail,
  openLabel,
}: {
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  tone: Tone
  title: string
  value: string
  detail: string
  openLabel: string
}) {
  const cls = toneClasses(tone)
  return (
    <Link
      href={href}
      className={`group rounded-xl border ${cls.border} ${cls.bg} p-4 shadow-card transition-colors hover:border-accent/50`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-subtle">{title}</p>
          <p className={`mt-2 text-lg font-semibold ${cls.value}`}>{value}</p>
        </div>
        <Icon size={19} className={`${cls.icon} flex-shrink-0`} />
      </div>
      <p className="mt-2 text-xs text-muted leading-relaxed">{detail}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-soft-foreground group-hover:text-accent">
        {openLabel}
        <ArrowRight size={11} />
      </span>
    </Link>
  )
}

function ActionRow({
  tone,
  title,
  body,
  href,
  link,
}: {
  tone: Tone
  title: string
  body: string
  href: string
  link: string
}) {
  const cls = toneClasses(tone)
  return (
    <li className={`rounded-lg border ${cls.border} ${cls.bg} px-3 py-3`}>
      <div className="flex items-start gap-2.5">
        {tone === 'danger' || tone === 'warn' ? (
          <AlertTriangle size={16} className={`${cls.icon} mt-0.5 flex-shrink-0`} />
        ) : (
          <CheckCircle2 size={16} className={`${cls.icon} mt-0.5 flex-shrink-0`} />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${cls.value}`}>{title}</p>
          <p className="text-xs text-muted leading-relaxed mt-1">{body}</p>
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-soft-foreground hover:text-accent"
          >
            {link}
            <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </li>
  )
}
