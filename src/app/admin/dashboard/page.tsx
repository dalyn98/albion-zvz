import Link from 'next/link'
import { Plus, Calendar, CalendarDays, LayoutTemplate } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import type { Event } from '@/types'
import DashboardEventList from '@/components/DashboardEventList'
import OnboardCompletionBanner from '@/components/OnboardCompletionBanner'
import SetupChecklist from '@/components/SetupChecklist'
import TemplateList from '@/components/TemplateList'
import CreateTemplateButton from '@/components/CreateTemplateButton'
import AdminOperationsPanel from '@/components/AdminOperationsPanel'
import AdminFirstRunPanel from '@/components/AdminFirstRunPanel'
import { listTemplates } from '@/app/actions/templates'
import { getTenantTimezone } from '@/lib/timezone-server'

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
    .select(
      'id, title, gather_time, gather_at, gather_location, special_notes, is_active, battle_started_at, notify_role_id, notify_channel_id, notify_everyone, created_by, status, category, recruitment_mode, regear_policy, regear_silver_cap, regear_max_deaths_per_member, created_at',
    )
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

  const [tDashboard, tTemplates, tOnboard, tenantConfig] = await Promise.all([
    getTranslations('adminDashboard'),
    getTranslations('adminTemplates'),
    getTranslations('onboard'),
    getTenantDiscordConfig(guildId),
  ])

  // 초대 링크는 /onboarding/albion 으로 보낸다 — 신규 길드원이 Discord 로그인
  // + 알비온 닉네임 인증을 한 번에 끝낼 수 있도록. 이미 인증된 사람이 다시 눌러도
  // 위저드가 'done' 단계로 진입해 짧게 확인 후 /me 로 빠져나간다.
  const inviteUrl = tenantConfig
    ? buildTenantHostUrl(tenantConfig.slug, '/onboarding/albion')
    : null
  const inviteGuildName = tenantConfig?.name ?? ''

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

      <SetupChecklist guildId={guildId} />

      <AdminOperationsPanel guildId={guildId} tenantConfig={tenantConfig} />

      <AdminFirstRunPanel
        inviteUrl={inviteUrl}
        guildName={inviteGuildName}
        canSendDiscordTest={tenantConfig?.botInstalled === true && !!tenantConfig.eventChannelId}
        newEventHref="/admin/dashboard/events/new"
        guideHref="/admin/dashboard/guide"
        settingsHref="/admin/dashboard/settings?tab=events"
      />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {section === 'templates' ? tTemplates('pageTitle') : tDashboard('pageTitle')}
        </h1>
        {section === 'events' && (
          <Link
            href="/admin/dashboard/events/new"
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-accent-foreground font-semibold px-4 py-2 rounded-lg transition-colors text-sm shadow-card"
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
        <p className="text-muted">{t('noEvents')}</p>
        <Link
          href="/admin/dashboard/events/new"
          className="text-accent-soft-foreground hover:text-accent text-sm mt-2 inline-block transition-colors"
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
        <p className="text-muted text-xs sm:text-sm flex-1">{t('pageDescription')}</p>
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
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
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
