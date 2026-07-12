import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, Calendar, CalendarDays, LayoutTemplate } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import type { Event } from '@/types'
import DashboardEventList from '@/components/DashboardEventList'
import OnboardCompletionBanner from '@/components/OnboardCompletionBanner'
import TemplateList from '@/components/TemplateList'
import CreateTemplateButton from '@/components/CreateTemplateButton'
import AdminOperationsPanel from '@/components/AdminOperationsPanel'
import AdminFirstRunPanel from '@/components/AdminFirstRunPanel'
import AdminOnboardingProgressCard from '@/components/AdminOnboardingProgressCard'
import { balancedHeadingClass, cx, pressScaleClass, prettyTextClass } from '@/components/ui-patterns'
import { listTemplates } from '@/app/actions/templates'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  isTenantLaunchPlanActive,
  loadTenantOnboardingSummary,
  logTenantOnboardingEventOnce,
} from '@/lib/tenant-onboarding-events'
import { EVENT_ROW_SELECT } from '@/lib/event-query-selects'

type Section = 'events' | 'templates'
const DASHBOARD_EVENT_LIMIT = 200

interface SearchParams {
  section?: string
  onboarded?: string
}

function resolveSection(v: string | undefined): Section {
  return v === 'templates' ? 'templates' : 'events'
}

// Never prerender at build — both tabs read DB state that changes as admins
// create/delete events or templates. Serving a build-time snapshot would ship
// links to already-deleted rows.
export const dynamic = 'force-dynamic'

async function getEvents(guildId: string): Promise<Event[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('events')
    .select(EVENT_ROW_SELECT)
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(DASHBOARD_EVENT_LIMIT)
  return data ?? []
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const section = resolveSection(sp.section)
  const showOnboardedBanner = sp.onboarded === '1'

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const [tDashboard, tTemplates, tOnboard] = await Promise.all([
    getTranslations('adminDashboard'),
    getTranslations('adminTemplates'),
    getTranslations('onboard'),
  ])

  return (
    <div className="space-y-6">
      {showOnboardedBanner && (
        <OnboardCompletionBanner
          title={tOnboard('completionBannerTitle')}
          description={tOnboard('completionBannerDescription')}
          linkLabel={tOnboard('completionBannerLink')}
          guideLinkLabel={tOnboard('completionBannerGuideLink')}
          dismissLabel={tOnboard('completionBannerDismiss')}
        />
      )}

      <Suspense fallback={<DashboardReadinessSkeleton />}>
        <DashboardReadinessSection guildId={guildId} actorDiscordId={session.discordId} />
      </Suspense>

      <div className="flex items-center justify-between gap-3">
        <h1 className={cx('text-2xl font-semibold tracking-tight text-foreground', balancedHeadingClass)}>
          {section === 'templates' ? tTemplates('pageTitle') : tDashboard('pageTitle')}
        </h1>
        {section === 'events' && (
          <Link
            href="/admin/dashboard/events/new"
            className={cx(
              'flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-card transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent-hover',
              pressScaleClass,
            )}
          >
            <Plus size={16} />
            {tDashboard('newEvent')}
          </Link>
        )}
      </div>

      <SectionTabs
        active={section}
        tabsLabel={tDashboard('sectionTabsLabel')}
        eventsLabel={tDashboard('sectionEvents')}
        templatesLabel={tDashboard('sectionTemplates')}
      />

      {section === 'events' ? <EventsSection /> : <TemplatesSection />}
    </div>
  )
}

async function DashboardReadinessSection({
  guildId,
  actorDiscordId,
}: {
  guildId: string
  actorDiscordId: string
}) {
  await logTenantOnboardingEventOnce({
    guildId,
    actorDiscordId,
    eventType: 'admin_dashboard_viewed',
    details: { path: '/admin/dashboard' },
  })

  const [tenantConfig, onboardingSummary] = await Promise.all([
    getTenantDiscordConfig(guildId),
    loadTenantOnboardingSummary(guildId),
  ])

  // 초대 링크는 /onboarding/albion 으로 보낸다 — 신규 길드원이 Discord 로그인
  // + 알비온 닉네임 인증을 한 번에 끝낼 수 있도록. 이미 인증된 사람이 다시 눌러도
  // 위저드가 'done' 단계로 진입해 짧게 확인 후 /me 로 빠져나간다.
  const inviteUrl = tenantConfig
    ? buildTenantHostUrl(tenantConfig.slug, '/onboarding/albion')
    : null
  const inviteGuildName = tenantConfig?.name ?? ''
  const launchPlanActive = isTenantLaunchPlanActive(onboardingSummary)

  return (
    <>
      {launchPlanActive && (
        <AdminOnboardingProgressCard summary={onboardingSummary}>
          <AdminFirstRunPanel
            embedded
            inviteUrl={inviteUrl}
            guildName={inviteGuildName}
            canSendDiscordTest={tenantConfig?.botInstalled === true && !!tenantConfig.eventChannelId}
            newEventHref="/admin/dashboard/events/new"
            guideHref="/admin/dashboard/guide"
            settingsHref="/admin/dashboard/settings?tab=events"
          />
        </AdminOnboardingProgressCard>
      )}

      <AdminOperationsPanel guildId={guildId} />
    </>
  )
}

function DashboardReadinessSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-24 rounded-xl border border-border bg-surface/70 shadow-card" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
      </div>
    </div>
  )
}

async function EventsSection() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [events, t, tenantTimezone] = await Promise.all([
    getEvents(guildId),
    getTranslations('adminDashboard'),
    getTenantTimezone(guildId),
  ])
  if (events.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center shadow-card">
        <Calendar size={32} className="text-faint mx-auto mb-3" />
        <p className={cx('text-muted', prettyTextClass)}>{t('noEvents')}</p>
        <Link
          href="/admin/dashboard/events/new"
          className="mt-2 inline-block text-sm text-accent-soft-foreground transition-colors hover:text-accent"
        >
          {t('createFirstEvent')}
        </Link>
      </div>
    )
  }
  return <DashboardEventList events={events} timezone={tenantTimezone} />
}

async function TemplatesSection() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [{ templates, error }, t, tenantTimezone] = await Promise.all([
    listTemplates(),
    getTranslations('adminTemplates'),
    getTenantTimezone(guildId),
  ])

  return (
    <div className="space-y-3">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <p className={cx('flex-1 text-xs text-muted sm:text-sm', prettyTextClass)}>{t('pageDescription')}</p>
        <CreateTemplateButton />
      </div>
      {error && (
        <div className="bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
          <p className="text-danger-soft-foreground text-sm">{error}</p>
        </div>
      )}
      {templates.length === 0 && !error ? (
        <p className="text-subtle text-sm py-8 text-center">{t('noTemplates')}</p>
      ) : (
        <TemplateList templates={templates} timezone={tenantTimezone} />
      )}
    </div>
  )
}

interface SectionTabsProps {
  active: Section
  tabsLabel: string
  eventsLabel: string
  templatesLabel: string
}

function SectionTabs({ active, tabsLabel, eventsLabel, templatesLabel }: SectionTabsProps) {
  const tabs: Array<{
    key: Section
    label: string
    href: string
    icon: React.ComponentType<{ size?: number; className?: string }>
  }> = [
    { key: 'events', label: eventsLabel, href: '/admin/dashboard', icon: CalendarDays },
    {
      key: 'templates',
      label: templatesLabel,
      href: '/admin/dashboard?section=templates',
      icon: LayoutTemplate,
    },
  ]

  return (
    <nav
      role="tablist"
      aria-label={tabsLabel}
      className="flex gap-1 border-b border-border overflow-x-auto"
    >
      {tabs.map(({ key, label, href, icon: Icon }) => {
        const isActive = active === key
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-[border-color,color] duration-150 ease-out ${
              isActive
                ? 'text-accent-soft-foreground border-accent'
                : 'text-muted border-transparent hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
