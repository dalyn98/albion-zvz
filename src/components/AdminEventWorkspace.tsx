import Link from 'next/link'
import { Calendar, CalendarDays, LayoutTemplate, Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import type { Event } from '@/types'
import DashboardEventList from '@/components/DashboardEventList'
import TemplateList from '@/components/TemplateList'
import CreateTemplateButton from '@/components/CreateTemplateButton'
import {
  PageHeader,
  cx,
  pressScaleClass,
  prettyTextClass,
} from '@/components/ui-patterns'
import { listTemplates } from '@/app/actions/templates'
import { getTenantTimezone } from '@/lib/timezone-server'
import { EVENT_ROW_SELECT } from '@/lib/event-query-selects'
import {
  resolveAdminEventWorkspaceSection,
  type AdminEventWorkspaceSection,
} from '@/lib/app-workspaces'
import { loadAdminEventReadinessMap } from '@/lib/admin-operations-data'

const DASHBOARD_EVENT_LIMIT = 200

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

export default async function AdminEventWorkspace({
  section: rawSection,
}: {
  section?: string
}) {
  const section = resolveAdminEventWorkspaceSection(rawSection)
  const [tDashboard, tTemplates] = await Promise.all([
    getTranslations('adminDashboard'),
    getTranslations('adminTemplates'),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tDashboard('eventWorkspaceEyebrow')}
        title={
          section === 'templates'
            ? tTemplates('pageTitle')
            : tDashboard('eventWorkspaceTitle')
        }
        description={
          section === 'templates'
            ? tTemplates('pageDescription')
            : tDashboard('eventWorkspaceDescription')
        }
        actions={
          section === 'events' ? (
            <Link
              href="/admin/dashboard/events/new"
              className={cx(
                'inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-card transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent-hover',
                pressScaleClass,
              )}
            >
              <Plus size={16} />
              {tDashboard('newEvent')}
            </Link>
          ) : undefined
        }
      />

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
  const [events, t, tEvent, tenantTimezone] = await Promise.all([
    getEvents(guildId),
    getTranslations('adminDashboard'),
    getTranslations('event'),
    getTenantTimezone(guildId),
  ])
  const readinessByEventId = await loadAdminEventReadinessMap(
    guildId,
    events.map((event) => event.id),
  )
  if (events.length === 0) {
    return (
      <div className="border-y border-border py-12 text-center">
        <Calendar size={32} className="mx-auto mb-3 text-faint" />
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
  return (
    <DashboardEventList
      events={events}
      timezone={tenantTimezone}
      closeoutActionLabel={tEvent('viewReport')}
      readinessByEventId={readinessByEventId}
    />
  )
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
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p
          className={cx(
            'flex-1 text-xs text-muted sm:text-sm',
            prettyTextClass,
          )}
        >
          {t('pageDescription')}
        </p>
        <CreateTemplateButton />
      </div>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2">
          <p className="text-sm text-danger-soft-foreground">{error}</p>
        </div>
      )}
      {templates.length === 0 && !error ? (
        <p className="py-8 text-center text-sm text-subtle">
          {t('noTemplates')}
        </p>
      ) : (
        <TemplateList templates={templates} timezone={tenantTimezone} />
      )}
    </div>
  )
}

function SectionTabs({
  active,
  tabsLabel,
  eventsLabel,
  templatesLabel,
}: {
  active: AdminEventWorkspaceSection
  tabsLabel: string
  eventsLabel: string
  templatesLabel: string
}) {
  const tabs: Array<{
    key: AdminEventWorkspaceSection
    label: string
    href: string
    icon: React.ComponentType<{ size?: number; className?: string }>
  }> = [
    {
      key: 'events',
      label: eventsLabel,
      href: '/admin/dashboard/events',
      icon: CalendarDays,
    },
    {
      key: 'templates',
      label: templatesLabel,
      href: '/admin/dashboard/events?section=templates',
      icon: LayoutTemplate,
    },
  ]

  return (
    <nav
      aria-label={tabsLabel}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map(({ key, label, href, icon: Icon }) => {
        const isActive = active === key
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-[border-color,color] duration-150 ease-out ${
              isActive
                ? 'border-accent text-accent-soft-foreground'
                : 'border-transparent text-muted hover:text-foreground'
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
