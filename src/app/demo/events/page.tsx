import Link from 'next/link'
import { Plus, Calendar, CalendarDays, LayoutTemplate } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MemberInviteCard from '@/components/MemberInviteCard'
import DemoDashboardEventList from '../_components/DemoDashboardEventList'
import DemoTemplateList from '../_components/DemoTemplateList'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import { DEMO_EVENTS, DEMO_TEMPLATES } from '@/data/demo-seed'

const EVENTS_TOUR_STEPS = [
  { id: 'events-header' },
  { id: 'events-tabs' },
  { id: 'events-content' },
] as const

type Section = 'events' | 'templates'

interface SearchParams {
  section?: string
}

function resolveSection(v: string | undefined): Section {
  return v === 'templates' ? 'templates' : 'events'
}

const DEMO_INVITE_URL = 'https://demo.albion-guildmanager.com/onboarding/albion'
const DEMO_GUILD_NAME = 'Demo Guild'

export default async function DemoEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const section = resolveSection(sp.section)

  const [tDashboard, tTemplates, tCta] = await Promise.all([
    getTranslations('adminDashboard'),
    getTranslations('adminTemplates'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={EVENTS_TOUR_STEPS} namespace="events" />
      <MemberInviteCard inviteUrl={DEMO_INVITE_URL} guildName={DEMO_GUILD_NAME} />

      <div data-tour-id="events-header" className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">
          {section === 'templates' ? tTemplates('pageTitle') : tDashboard('pageTitle')}
        </h1>
        {section === 'events' && (
          <DemoActionButton className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm">
            <Plus size={16} />
            {tDashboard('newEvent')}
          </DemoActionButton>
        )}
      </div>

      <div data-tour-id="events-tabs">
        <SectionTabs
          active={section}
          tabsLabel={tDashboard('sectionTabsLabel')}
          eventsLabel={tDashboard('sectionEvents')}
          templatesLabel={tDashboard('sectionTemplates')}
        />
      </div>

      <div data-tour-id="events-content">
        {section === 'events' ? (
          <EventsSection tDashboard={tDashboard} />
        ) : (
          <TemplatesSection tTemplates={tTemplates} />
        )}
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('events.title')}
        description={tCta('events.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function EventsSection({
  tDashboard,
}: {
  tDashboard: Awaited<ReturnType<typeof getTranslations<'adminDashboard'>>>
}) {
  if (DEMO_EVENTS.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
        <Calendar size={32} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">{tDashboard('noEvents')}</p>
      </div>
    )
  }
  return <DemoDashboardEventList events={DEMO_EVENTS} />
}

function TemplatesSection({
  tTemplates,
}: {
  tTemplates: Awaited<ReturnType<typeof getTranslations<'adminTemplates'>>>
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <p className="text-gray-400 text-xs sm:text-sm flex-1">{tTemplates('pageDescription')}</p>
        <DemoActionButton className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors">
          <Plus size={14} />
          {tTemplates('createTemplateButton')}
        </DemoActionButton>
      </div>
      {DEMO_TEMPLATES.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">{tTemplates('noTemplates')}</p>
      ) : (
        <DemoTemplateList templates={DEMO_TEMPLATES} />
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
    { key: 'events', label: eventsLabel, href: '/demo/events', icon: CalendarDays },
    { key: 'templates', label: templatesLabel, href: '/demo/events?section=templates', icon: LayoutTemplate },
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
