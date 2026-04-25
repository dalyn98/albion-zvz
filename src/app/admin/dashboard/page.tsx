import Link from 'next/link'
import { Plus, Calendar, CalendarDays, LayoutTemplate } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import type { Event } from '@/types'
import DashboardEventList from '@/components/DashboardEventList'
import OnboardCompletionBanner from '@/components/OnboardCompletionBanner'
import SetupChecklist from '@/components/SetupChecklist'
import TemplateList from '@/components/TemplateList'
import { listTemplates } from '@/app/actions/templates'

type Section = 'events' | 'templates'

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
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
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
          dismissLabel={tOnboard('completionBannerDismiss')}
        />
      )}

      <SetupChecklist guildId={guildId} />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">
          {section === 'templates' ? tTemplates('pageTitle') : tDashboard('pageTitle')}
        </h1>
        {section === 'events' && (
          <Link
            href="/admin/dashboard/events/new"
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
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
  const [events, t] = await Promise.all([getEvents(guildId), getTranslations('adminDashboard')])
  if (events.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
        <Calendar size={32} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">{t('noEvents')}</p>
        <Link
          href="/admin/dashboard/events/new"
          className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block"
        >
          {t('createFirstEvent')}
        </Link>
      </div>
    )
  }
  return <DashboardEventList events={events} />
}

async function TemplatesSection() {
  const [{ templates, error }, t] = await Promise.all([
    listTemplates(),
    getTranslations('adminTemplates'),
  ])

  return (
    <div className="space-y-3">
      <p className="text-gray-400 text-xs sm:text-sm">{t('pageDescription')}</p>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {templates.length === 0 && !error ? (
        <p className="text-gray-500 text-sm py-8 text-center">{t('noTemplates')}</p>
      ) : (
        <TemplateList templates={templates} />
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
      className="flex gap-1 border-b border-gray-800 overflow-x-auto"
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
                ? 'text-amber-300 border-amber-400'
                : 'text-gray-400 border-transparent hover:text-white'
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
