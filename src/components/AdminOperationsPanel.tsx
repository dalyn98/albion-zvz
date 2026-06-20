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
import {
  EmptyState,
  SectionCard,
  ValueDisplay,
  cx,
  getDesignToneClasses,
  type DesignTone,
} from '@/components/ui-patterns'
import {
  isRecognizedAlbionIdentity,
  normalizeAlbionIdentityRelation,
  normalizeAlbionIdentityTrustStatus,
} from '@/lib/albion-verification-status'

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
  setupHref: string
  staleSyncCount: number
  autoRegearEnabled: boolean
}

type Tone = 'good' | 'warn' | 'danger' | 'info'

interface OperationCard {
  key: string
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  tone: Tone
  title: string
  value: string
  detail: string
}

const SYNC_KEYS = [
  'albion_home_guild_id',
  'auto_regear_enabled',
  'last_killboard_sync_at',
  'last_battle_tracker_sync_at',
  'last_member_sync_at',
  'last_auto_regear_at',
] as const

const PAGE_SIZE = 1000

interface ActiveMemberIdentityRow {
  discord_id: string
  albion_verified_at: string | null
}

interface TenantLinkIdentityRow {
  discord_id: string
  relation: string | null
  trust_status: string | null
}

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

function hasRecognizedAlbionIdentity(
  member: ActiveMemberIdentityRow,
  link: TenantLinkIdentityRow | undefined,
): boolean {
  if (link) {
    return isRecognizedAlbionIdentity({
      relation: normalizeAlbionIdentityRelation(link.relation),
      trustStatus: normalizeAlbionIdentityTrustStatus(link.trust_status),
    })
  }
  return Boolean(member.albion_verified_at)
}

async function listActiveMemberIdentityRows(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
): Promise<ActiveMemberIdentityRow[]> {
  const rows: ActiveMemberIdentityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('guild_avatars')
      .select('discord_id, albion_verified_at')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .order('discord_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return rows
    const page = (data ?? []) as ActiveMemberIdentityRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function listTenantLinkIdentityRows(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
): Promise<TenantLinkIdentityRow[]> {
  const rows: TenantLinkIdentityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('account_albion_tenant_links')
      .select('discord_id, relation, trust_status')
      .eq('guild_id', guildId)
      .order('discord_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return rows
    const page = (data ?? []) as TenantLinkIdentityRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
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
    activeMembers,
    identityLinks,
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
    listActiveMemberIdentityRows(db, guildId),
    listTenantLinkIdentityRows(db, guildId),
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
  const identityLinkMap = new Map(identityLinks.map((link) => [link.discord_id, link]))
  const unverifiedMembers = activeMembers.filter(
    (member) => !hasRecognizedAlbionIdentity(member, identityLinkMap.get(member.discord_id)),
  ).length

  const botMissing = !tenantConfig?.botInstalled
  const eventChannelMissing = !tenantConfig?.eventChannelId
  const homeGuildMissing = !homeGuildId
  const requiredMissing = [
    botMissing,
    eventChannelMissing,
    homeGuildMissing,
  ].filter(Boolean).length
  const setupHref = botMissing
    ? '/onboard'
    : eventChannelMissing && !homeGuildMissing
      ? '/admin/dashboard/settings?tab=events'
      : '/admin/dashboard/settings'

  return {
    pendingTotal,
    upcomingEvents: upcomingEventsRes.count ?? 0,
    draftEvents: draftEventsRes.count ?? 0,
    activeMembers: activeMembers.length,
    unverifiedMembers,
    requiredMissing,
    setupHref,
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
      href: snapshot.setupHref,
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
  ] satisfies OperationCard[]

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
      href: snapshot.setupHref,
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

  const priorityCard = cards.find((card) => card.tone !== 'good') ?? cards[0]
  const supportingCards = cards.filter((card) => card.key !== priorityCard.key)
  const priorityTone = toneToDesignTone(priorityCard.tone)
  const priorityClasses = getDesignToneClasses(priorityTone)

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
          {t('eyebrow')}
        </p>
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted leading-relaxed max-w-3xl">{t('description')}</p>
      </div>

      <Link
        href={priorityCard.href}
        className={cx(
          'group block rounded-xl border p-4 shadow-card transition-colors hover:border-accent/50 sm:p-5',
          priorityClasses.border,
          priorityClasses.background,
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <ValueDisplay
            icon={priorityCard.icon}
            tone={priorityTone}
            size="lg"
            label={priorityCard.title}
            value={priorityCard.value}
            detail={priorityCard.detail}
          />
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-soft-foreground group-hover:text-accent">
            {t('openCard')}
            <ArrowRight size={11} />
          </span>
        </div>
      </Link>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {supportingCards.map(({ key, ...card }) => (
          <StatusCard key={key} {...card} openLabel={t('openCard')} />
        ))}
      </div>

      <SectionCard
        icon={Clock3}
        tone={actionItems.length === 0 ? 'success' : toneToDesignTone(actionItems[0].tone)}
        title={t('actionsTitle')}
      >
        {actionItems.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="success"
            title={t('actionEmptyTitle')}
            description={t('actionEmptyBody')}
          />
        ) : (
          <ul className="space-y-2">
            {actionItems.map(({ key, ...item }) => (
              <ActionRow key={key} {...item} />
            ))}
          </ul>
        )}
      </SectionCard>
    </section>
  )
}

function toneToDesignTone(tone: Tone): DesignTone {
  switch (tone) {
    case 'danger':
      return 'danger'
    case 'warn':
      return 'warning'
    case 'info':
      return 'info'
    default:
      return 'success'
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
  const designTone = toneToDesignTone(tone)
  const cls = getDesignToneClasses(designTone)
  return (
    <Link
      href={href}
      className={cx(
        'group rounded-xl border p-4 shadow-card transition-colors hover:border-accent/50',
        cls.border,
        cls.background,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ValueDisplay
          icon={Icon}
          tone={designTone}
          size="sm"
          label={title}
          value={value}
          detail={detail}
        />
      </div>
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
  const cls = getDesignToneClasses(toneToDesignTone(tone))
  return (
    <li className={cx('rounded-lg border px-3 py-3', cls.border, cls.background)}>
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
