import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
  Target,
  Users,
  X,
} from 'lucide-react'
import {
  DEMO_ALLIANCE_TAG,
  DEMO_EVENT_DETAIL,
  DEMO_EVENTS,
  DEMO_EVENT_STATS,
  DEMO_GUILD_NAME,
  DEMO_GUILD_OBSERVED_WEAPON_USAGE,
  DEMO_GUILD_SLUG,
  DEMO_MEMBERS,
  DEMO_REGEAR_DETAIL,
  DEMO_REGEAR_LIST,
  DEMO_SHOP_REGEAR_STATS,
  DEMO_WEEKLY_STATS,
} from '@/data/demo-seed'
import {
  balancedHeadingClass,
  cx,
  interactiveSurfaceClass,
  pressScaleClass,
  prettyTextClass,
  SectionCard,
  ValueDisplay,
} from '@/components/ui-patterns'
import DemoActionButton from './_components/DemoActionButton'
import DemoCTACard from './_components/DemoCTACard'
import { formatSilver, formatTimeLabel } from './_lib/format'

export const dynamic = 'force-dynamic'

const SCENARIOS = ['events', 'stats', 'regear'] as const

type DemoScenario = (typeof SCENARIOS)[number]
type DemoT = Awaited<ReturnType<typeof getTranslations<'demo'>>>

interface DemoHomePageProps {
  searchParams: Promise<{ scenario?: string | string[] }>
}

const RIVAL_GUILDS = [
  { name: 'Wraith', battles: 18 },
  { name: 'Frostbite', battles: 12 },
  { name: 'Steel Talon', battles: 9 },
] as const

function isDemoScenario(value: string): value is DemoScenario {
  return (SCENARIOS as readonly string[]).includes(value)
}

function resolveScenario(value: string | string[] | undefined): DemoScenario {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && isDemoScenario(raw) ? raw : 'events'
}

function scenarioHref(scenario: DemoScenario): string {
  return scenario === 'events' ? '/demo' : `/demo?scenario=${scenario}`
}

export default async function DemoHomePage({ searchParams }: DemoHomePageProps) {
  const [{ scenario }, tDemo, tCta] = await Promise.all([
    searchParams,
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])
  const activeScenario = resolveScenario(scenario)
  const weeklyKd =
    DEMO_WEEKLY_STATS.deaths > 0
      ? (DEMO_WEEKLY_STATS.kills / DEMO_WEEKLY_STATS.deaths).toFixed(2)
      : '∞'
  const pendingRegearCount = DEMO_REGEAR_LIST.filter((request) => request.status === 'pending').length

  return (
    <div className="space-y-6">
      <section className={cx('overflow-hidden rounded-xl border border-border bg-surface shadow-card', interactiveSurfaceClass)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="p-5 sm:p-7 lg:p-8 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
                <ShieldCheck size={13} />
                {tDemo('home.heroAlliance')} [{DEMO_ALLIANCE_TAG}]
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {tDemo('home.heroRecruitmentOpen')}
              </span>
            </div>
            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gray-500">
                /g/{DEMO_GUILD_SLUG}
              </p>
              <h1 className={cx('break-words text-4xl font-black tracking-normal text-white sm:text-5xl', balancedHeadingClass)}>
                {DEMO_GUILD_NAME}
              </h1>
              <p className={cx('max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base', prettyTextClass)}>
                {tDemo('home.heroDescription')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiTile
                label={tDemo('home.weeklyEvents')}
                value={DEMO_WEEKLY_STATS.events}
                tone="accent"
              />
              <KpiTile
                label={tDemo('home.weeklyKills')}
                value={DEMO_WEEKLY_STATS.kills}
                tone="success"
              />
              <KpiTile
                label={tDemo('home.weeklyDeaths')}
                value={DEMO_WEEKLY_STATS.deaths}
                tone="danger"
              />
              <KpiTile label={tDemo('home.weeklyKd')} value={weeklyKd} tone="info" />
            </div>
          </div>
          <div className="border-t border-border bg-surface-2/45 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div className="space-y-4">
              <SectionHeading icon={<Sparkles size={14} />} label={tDemo('home.demoBadge')} />
              <ul className="space-y-3">
                <HeroSummaryItem
                  icon={<CalendarDays size={15} />}
                  label={tDemo('events.title')}
                  value={tDemo('events.filledFraction', {
                    filled: DEMO_EVENT_DETAIL.filledCount,
                    total: DEMO_EVENT_DETAIL.totalCount,
                  })}
                />
                <HeroSummaryItem
                  icon={<BarChart3 size={15} />}
                  label={tDemo('home.statBattles')}
                  value={DEMO_EVENT_STATS.totalEvents.toLocaleString()}
                />
                <HeroSummaryItem
                  icon={<ShieldAlert size={15} />}
                  label={tDemo('regear.title')}
                  value={pendingRegearCount.toLocaleString()}
                />
              </ul>
              <p className={cx('rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100', prettyTextClass)}>
                {tDemo('home.demoNote')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <ScenarioTabs active={activeScenario} tDemo={tDemo} />

      {activeScenario === 'events' && <EventsScenario tDemo={tDemo} />}
      {activeScenario === 'stats' && <StatsScenario tDemo={tDemo} weeklyKd={weeklyKd} />}
      {activeScenario === 'regear' && <RegearScenario tDemo={tDemo} />}

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta(`${activeScenario}.title`)}
        description={tCta(`${activeScenario}.description`)}
        buttonLabel={tCta('buttonLabel')}
        variant={activeScenario === 'stats' ? 'emerald' : 'amber'}
      />
    </div>
  )
}

function ScenarioTabs({ active, tDemo }: { active: DemoScenario; tDemo: DemoT }) {
  const tabs = [
    {
      key: 'events' as const,
      label: tDemo('events.title'),
      description: tDemo('events.subtitle'),
      icon: CalendarDays,
      accent: 'text-amber-200',
    },
    {
      key: 'stats' as const,
      label: tDemo('stats.title'),
      description: tDemo('stats.subtitle'),
      icon: BarChart3,
      accent: 'text-sky-200',
    },
    {
      key: 'regear' as const,
      label: tDemo('regear.title'),
      description: tDemo('regear.subtitle'),
      icon: ShieldCheck,
      accent: 'text-emerald-200',
    },
  ]

  return (
    <nav
      aria-label={tDemo('brand.label')}
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {tabs.map(({ key, label, description, icon: Icon, accent }) => {
        const isActive = active === key
        return (
          <Link
            key={key}
            href={scenarioHref(key)}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'rounded-lg border px-4 py-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
              pressScaleClass,
              isActive
                ? 'border-accent/60 bg-accent-soft shadow-card'
                : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2 hover:shadow-card',
            )}
          >
            <span className={`inline-flex items-center gap-2 text-sm font-bold ${accent}`}>
              <Icon size={15} />
              {label}
            </span>
            <span className={cx('mt-1 block text-xs leading-relaxed text-gray-400', prettyTextClass)}>
              {description}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function EventsScenario({ tDemo }: { tDemo: DemoT }) {
  const primaryParty = DEMO_EVENT_DETAIL.parties[0]

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        <SectionHeading icon={<CalendarDays size={14} />} label={tDemo('events.title')} />
        <div className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800 bg-gray-900/65">
          {DEMO_EVENTS.slice(0, 4).map((event) => (
            <article key={event.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-white">{event.name}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatTimeLabel(tDemo, event.scheduledAt)} · {event.zone}
                  </p>
                </div>
                <StatusPill label={tDemo(`status.event${capitalize(event.status)}`)} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${Math.round((event.filledCount / event.totalCount) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-amber-200">
                  {tDemo('events.filledFraction', {
                    filled: event.filledCount,
                    total: event.totalCount,
                  })}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeading icon={<Users size={14} />} label={tDemo('events.partyMain')} />
        <div className="rounded-lg border border-gray-800 bg-gray-900/65 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white">{DEMO_EVENT_DETAIL.name}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {formatTimeLabel(tDemo, DEMO_EVENT_DETAIL.scheduledAt)} · {DEMO_EVENT_DETAIL.zone}
              </p>
            </div>
            <span className="rounded-md border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-100">
              {DEMO_EVENT_DETAIL.templateLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(primaryParty?.slots ?? []).map((slot, index) => {
              const isOpen = !slot.assigned
              return (
                <DemoActionButton
                  key={`${slot.role}-${index}`}
                  asDiv
                  disabled={!isOpen}
                  ariaLabel={`${slot.buildLabel} ${slot.assigned ?? tDemo('events.slotEmpty')}`}
                  className={`rounded-lg border p-3 text-left ${
                    isOpen
                      ? 'cursor-pointer border-amber-400/35 bg-amber-400/10 hover:bg-amber-400/15'
                      : 'border-gray-800 bg-gray-950/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-200">
                        {tDemo(`slotRoles.${slot.role}`)}
                      </p>
                      <p className="mt-1 truncate text-sm text-white">{slot.buildLabel}</p>
                    </div>
                    {slot.isCaller && (
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-black">
                        {tDemo('events.callerBadge')}
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 text-xs ${isOpen ? 'text-amber-200' : 'text-gray-500'}`}>
                    {slot.assigned ?? tDemo('events.slotEmpty')}
                  </p>
                </DemoActionButton>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">{tDemo('events.demoOnlyDetail')}</p>
        </div>
      </div>
    </section>
  )
}

function StatsScenario({ tDemo, weeklyKd }: { tDemo: DemoT; weeklyKd: string }) {
  const topParticipation = [...DEMO_MEMBERS]
    .sort(
      (a, b) =>
        b.weeklyAttendance.attended - a.weeklyAttendance.attended ||
        a.ign.localeCompare(b.ign),
    )
    .slice(0, 5)

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<Swords size={16} />} label={tDemo('home.weeklyKills')} value={DEMO_WEEKLY_STATS.kills} />
        <MetricCard icon={<Skull size={16} />} label={tDemo('home.weeklyDeaths')} value={DEMO_WEEKLY_STATS.deaths} />
        <MetricCard icon={<Target size={16} />} label={tDemo('home.weeklyKd')} value={weeklyKd} />
        <MetricCard
          icon={<ShieldCheck size={16} />}
          label={tDemo('home.statRegear')}
          value={DEMO_SHOP_REGEAR_STATS.regearApproved}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-3">
          <div>
            <SectionHeading
              icon={<CalendarDays size={14} />}
              label={tDemo('home.topContributorsHeading')}
            />
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {tDemo('home.topContributorsHint')}
            </p>
          </div>
          <ol className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800 bg-gray-900/65">
            {topParticipation.map((member, index) => (
              <li key={member.discordId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-7 text-right font-mono text-xs text-amber-200">
                  #{index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                  {member.ign}
                </p>
                <span className="font-mono text-xs text-sky-200">
                  {member.weeklyAttendance.attended}/{member.weeklyAttendance.total}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          <div>
            <SectionHeading
              icon={<BarChart3 size={14} />}
              label={tDemo('home.weaponsHeading')}
            />
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {tDemo('home.weaponsHint', {
                count: DEMO_GUILD_OBSERVED_WEAPON_USAGE.sampleCount,
              })}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/65 p-4">
            <div className="space-y-3">
              {DEMO_GUILD_OBSERVED_WEAPON_USAGE.categories.map(
                ({ weapon, observationCount }) => (
                <RatioBar
                  key={weapon}
                  label={tDemo(`weapons.${weapon}`)}
                  count={observationCount}
                  total={DEMO_GUILD_OBSERVED_WEAPON_USAGE.sampleCount}
                />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {RIVAL_GUILDS.map((guild) => (
          <div key={guild.name} className="rounded-lg border border-gray-800 bg-gray-900/65 p-4">
            <p className="text-xs font-semibold text-gray-500">{tDemo('home.rivalsHeading')}</p>
            <p className="mt-1 text-lg font-bold text-white">{guild.name}</p>
            <p className="mt-2 font-mono text-sm text-amber-200">
              {guild.battles} {tDemo('home.statBattlesUnit')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function RegearScenario({ tDemo }: { tDemo: DemoT }) {
  const pendingRequests = DEMO_REGEAR_LIST.filter((request) => request.status === 'pending').slice(0, 4)
  const totalPendingSilver = pendingRequests.reduce((sum, request) => sum + request.totalSilver, 0)

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        <SectionHeading icon={<ShieldAlert size={14} />} label={tDemo('approvals.tabPending')} />
        <div className="rounded-lg border border-gray-800 bg-gray-900/65 p-4">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Clock size={16} />}
              label={tDemo('approvals.tabPending')}
              value={pendingRequests.length}
            />
            <MetricCard
              icon={<Activity size={16} />}
              label={tDemo('regear.totalLabel')}
              value={formatSilver(totalPendingSilver)}
            />
          </div>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <article key={request.id} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-white">{request.victim}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {request.battleLabel} · {formatTimeLabel(tDemo, request.diedAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                    {tDemo(`origin.${request.origin}`)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-bold text-white">
                    {formatSilver(request.totalSilver)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <DemoActionButton className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-emerald-400">
                      <Check size={12} />
                      {tDemo('approvals.actionApprove')}
                    </DemoActionButton>
                    <DemoActionButton className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 px-2.5 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-400/10">
                      <X size={12} />
                      {tDemo('approvals.actionReject')}
                    </DemoActionButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{tDemo('approvals.actionsDemoNote')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeading icon={<ShieldCheck size={14} />} label={tDemo('regear.detailTitle')} />
        <div className="rounded-lg border border-gray-800 bg-gray-900/65 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">{DEMO_REGEAR_DETAIL.victim}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {DEMO_REGEAR_DETAIL.battleLabel} · {DEMO_REGEAR_DETAIL.killerName}
              </p>
            </div>
            <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-100">
              {tDemo('status.regearPending')}
            </span>
          </div>
          <div className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800">
            {DEMO_REGEAR_DETAIL.pieces.map((piece) => (
              <div key={`${piece.slot}-${piece.itemLabel}`} className="grid grid-cols-[80px_1fr_auto] gap-3 px-3 py-2.5 text-sm">
                <span className="text-xs font-semibold text-gray-500">
                  {tDemo(`regear.slot${capitalize(piece.slot)}`)}
                </span>
                <span className="min-w-0 truncate text-gray-200">{piece.itemLabel}</span>
                <span className="font-mono text-xs text-amber-200">
                  {formatSilver(piece.estimatedSilver)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
            <span className="text-sm font-bold text-amber-100">{tDemo('regear.totalLabel')}</span>
            <span className="font-mono text-sm font-black text-white">
              {formatSilver(DEMO_REGEAR_DETAIL.totalSilver)}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500">{tDemo('regear.demoOnlyDetail')}</p>
        </div>
      </div>
    </section>
  )
}

function KpiTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'info'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/70 px-3 py-3">
      <ValueDisplay label={label} value={value} tone={tone} size="sm" />
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
}) {
  return (
    <SectionCard className="p-4 sm:p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className="text-amber-300">{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-mono text-2xl font-black tabular-nums text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </SectionCard>
  )
}

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-accent-soft-foreground">
      <span className="text-accent">{icon}</span>
      {label}
    </div>
  )
}

function HeroSummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 px-3 py-2.5">
      <span className="text-accent">{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{label}</span>
      <span className="font-mono text-sm font-bold tabular-nums text-foreground">{value}</span>
    </li>
  )
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
      {label}
    </span>
  )
}

function RatioBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="grid grid-cols-[72px_1fr_46px] items-center gap-3">
      <span className="truncate text-xs font-semibold text-muted">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-sky-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right font-mono text-xs text-subtle">{pct}%</span>
    </div>
  )
}

function capitalize(value: string): Capitalize<string> {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}` as Capitalize<string>
}
