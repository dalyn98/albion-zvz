import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  loadAdminOperationsSnapshot,
  type AdminEventReadinessSnapshot,
} from '@/lib/admin-operations-data'
import type {
  OperationsQueueKey,
  OperationsQueueRow,
  OperationsQueueUrgency,
} from '@/lib/admin-operations-model'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  EmptyState,
  balancedHeadingClass,
  cx,
  pressScaleClass,
  prettyTextClass,
} from '@/components/ui-patterns'

interface Props {
  guildId: string
}

const QUEUE_HREFS: Record<OperationsQueueKey, string> = {
  regear: '/admin/dashboard/approvals',
  exchange: '/admin/dashboard/approvals?tab=exchange',
  donation: '/admin/dashboard/approvals?tab=donation',
  shop: '/admin/dashboard/approvals?tab=shop',
  memberTrade: '/admin/dashboard/approvals?tab=member_trade',
  eventPayout: '/admin/dashboard/approvals?tab=event_payout',
  craft: '/admin/dashboard/approvals?tab=craft',
}

export default async function AdminOperationsPanel({ guildId }: Props) {
  const [t, snapshot, locale, tenantTimezone] = await Promise.all([
    getTranslations('adminOperations'),
    loadAdminOperationsSnapshot(guildId),
    getLocale(),
    getTenantTimezone(guildId),
  ])

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
            {t('eyebrow')}
          </p>
          <h2
            className={cx(
              'mt-1 text-xl font-semibold text-foreground',
              balancedHeadingClass,
            )}
          >
            {t('title')}
          </h2>
          <p
            className={cx(
              'mt-1 max-w-3xl text-sm leading-relaxed text-muted',
              prettyTextClass,
            )}
          >
            {t('description')}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="font-mono text-3xl font-black tabular-nums text-foreground">
            {snapshot.pendingTotal}
          </span>
          <span className="text-xs font-semibold text-muted">
            {t('queueTotal')}
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <OperationsQueue
          rows={snapshot.queueRows}
          title={t('queueTitle')}
          description={t('queueDescription')}
          emptyTitle={t('queueEmptyTitle')}
          emptyBody={t('queueEmptyBody')}
          countLabel={t('queueCountColumn')}
          ageLabel={t('queueAgeColumn')}
          openLabel={t('openQueue')}
          labelFor={(key) => t(`queueType.${key}`)}
          ageFor={(row) =>
            formatQueueAge(row, {
              unknown: t('queueAgeUnknown'),
              now: t('queueAgeNow'),
              hours: (count) => t('queueAgeHours', { count }),
              days: (count) => t('queueAgeDays', { count }),
            })
          }
          urgencyFor={(urgency) => t(`urgency.${urgency}`)}
        />

        <UpcomingEvents
          events={snapshot.upcomingEvents}
          drafts={snapshot.draftEvents}
          locale={locale}
          tenantTimezone={tenantTimezone}
          labels={{
            title: t('eventsTitle'),
            description: t('eventsDescription'),
            drafts: t('eventDrafts', { count: snapshot.draftEvents }),
            emptyTitle: t('eventsEmptyTitle'),
            emptyBody: t('eventsEmptyBody'),
            create: t('eventsCreate'),
            open: t('openEvent'),
            slots: (assigned, total) =>
              t('eventSlots', { assigned, total }),
            openSlots: (count) => t('eventOpenSlots', { count }),
            full: t('eventFull'),
            unconfigured: t('eventUnconfigured'),
          }}
        />
      </div>

      <OperationsHealth
        staleSyncCount={snapshot.staleSyncCount}
        autoRegearEnabled={snapshot.autoRegearEnabled}
        activeMembers={snapshot.activeMembers}
        unverifiedMembers={snapshot.unverifiedMembers}
        labels={{
          title: t('healthTitle'),
          syncTitle: t('syncTitle'),
          syncValue:
            snapshot.staleSyncCount > 0
              ? t('syncDelayed', { count: snapshot.staleSyncCount })
              : t('syncReady'),
          syncDetail: snapshot.autoRegearEnabled
            ? t('syncDetailAutoOn')
            : t('syncDetailAutoOff'),
          membersTitle: t('membersTitle'),
          membersValue:
            snapshot.unverifiedMembers > 0
              ? t('membersUnverified', {
                  count: snapshot.unverifiedMembers,
                })
              : t('membersReady'),
          membersDetail: t('membersDetail', {
            count: snapshot.activeMembers,
          }),
          open: t('openHealth'),
        }}
      />
    </section>
  )
}

function OperationsQueue({
  rows,
  title,
  description,
  emptyTitle,
  emptyBody,
  countLabel,
  ageLabel,
  openLabel,
  labelFor,
  ageFor,
  urgencyFor,
}: {
  rows: OperationsQueueRow[]
  title: string
  description: string
  emptyTitle: string
  emptyBody: string
  countLabel: string
  ageLabel: string
  openLabel: string
  labelFor: (key: OperationsQueueKey) => string
  ageFor: (row: OperationsQueueRow) => string
  urgencyFor: (urgency: OperationsQueueUrgency) => string
}) {
  return (
    <section
      aria-labelledby="operations-queue-title"
      className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-white/[0.06]"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-soft-foreground shadow-card">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3
              id="operations-queue-title"
              className={cx(
                'text-base font-semibold text-foreground',
                balancedHeadingClass,
              )}
            >
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {description}
            </p>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            icon={CheckCircle2}
            tone="success"
            title={emptyTitle}
            description={emptyBody}
          />
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_1.5rem] gap-3 border-b border-border bg-surface-2/55 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle sm:grid">
            <span>{title}</span>
            <span className="text-right">{countLabel}</span>
            <span className="text-right">{ageLabel}</span>
            <span className="sr-only">{openLabel}</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.key}>
                <Link
                  href={QUEUE_HREFS[row.key]}
                  className={cx(
                    'group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-surface-2/75 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_1.5rem] sm:px-5',
                    pressScaleClass,
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {labelFor(row.key)}
                      </span>
                      <QueueUrgency
                        urgency={row.urgency}
                        label={urgencyFor(row.urgency)}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted sm:hidden">
                      {ageFor(row)}
                    </p>
                  </div>
                  <span className="font-mono text-base font-black tabular-nums text-foreground sm:text-right">
                    {row.count}
                  </span>
                  <span className="hidden text-right text-xs font-medium tabular-nums text-muted sm:block">
                    {ageFor(row)}
                  </span>
                  <ArrowRight
                    size={15}
                    aria-label={openLabel}
                    className="hidden text-subtle transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent sm:block"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function QueueUrgency({
  urgency,
  label,
}: {
  urgency: OperationsQueueUrgency
  label: string
}) {
  if (urgency === 'normal') return null
  return (
    <span
      className={cx(
        'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
        urgency === 'overdue'
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      {label}
    </span>
  )
}

function formatQueueAge(
  row: OperationsQueueRow,
  labels: {
    unknown: string
    now: string
    hours: (count: number) => string
    days: (count: number) => string
  },
): string {
  if (row.oldestAgeHours === null) return labels.unknown
  if (row.oldestAgeHours < 1) return labels.now
  if (row.oldestAgeHours < 24) {
    return labels.hours(row.oldestAgeHours)
  }
  return labels.days(Math.floor(row.oldestAgeHours / 24))
}

function UpcomingEvents({
  events,
  drafts,
  locale,
  tenantTimezone,
  labels,
}: {
  events: AdminEventReadinessSnapshot[]
  drafts: number
  locale: string
  tenantTimezone: string
  labels: {
    title: string
    description: string
    drafts: string
    emptyTitle: string
    emptyBody: string
    create: string
    open: string
    slots: (assigned: number, total: number) => string
    openSlots: (count: number) => string
    full: string
    unconfigured: string
  }
}) {
  return (
    <section
      aria-labelledby="upcoming-events-title"
      className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-white/[0.06]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground shadow-card">
            <CalendarDays size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3
              id="upcoming-events-title"
              className={cx(
                'text-base font-semibold text-foreground',
                balancedHeadingClass,
              )}
            >
              {labels.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {labels.description}
            </p>
          </div>
        </div>
        {drafts > 0 && (
          <Link
            href="/admin/dashboard/events"
            className="shrink-0 rounded-md bg-info-soft px-2 py-1 text-[10px] font-semibold text-info-soft-foreground"
          >
            {labels.drafts}
          </Link>
        )}
      </header>

      {events.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            icon={CalendarDays}
            tone="info"
            title={labels.emptyTitle}
            description={labels.emptyBody}
            action={
              <Link
                href="/admin/dashboard/events/new"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
              >
                {labels.create}
                <ArrowRight size={12} />
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/dashboard/events/${event.id}`}
                className={cx(
                  'group block min-h-20 px-4 py-3 transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-surface-2/75 sm:px-5',
                  pressScaleClass,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {event.title}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted">
                      {formatEventDate(
                        event.gatherAt,
                        locale,
                        tenantTimezone,
                      )}
                    </p>
                  </div>
                  <ArrowRight
                    size={14}
                    aria-label={labels.open}
                    className="mt-0.5 shrink-0 text-subtle transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={event.readiness.fillPercent}
                  >
                    <div
                      className={cx(
                        'h-full rounded-full',
                        event.readiness.status === 'full'
                          ? 'bg-success'
                          : 'bg-accent',
                      )}
                      style={{ width: `${event.readiness.fillPercent}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                    {labels.slots(
                      event.readiness.assignedSlots,
                      event.readiness.totalSlots,
                    )}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {event.readiness.status === 'unconfigured'
                    ? labels.unconfigured
                    : event.readiness.status === 'full'
                      ? labels.full
                      : labels.openSlots(event.readiness.openSlots)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatEventDate(
  gatherAt: string | null,
  locale: string,
  tenantTimezone: string,
): string {
  if (!gatherAt) return '—'
  const parsed = new Date(gatherAt)
  if (!Number.isFinite(parsed.getTime())) return '—'

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tenantTimezone,
    timeZoneName: 'short',
  }).format(parsed)
}

function OperationsHealth({
  staleSyncCount,
  autoRegearEnabled,
  activeMembers,
  unverifiedMembers,
  labels,
}: {
  staleSyncCount: number
  autoRegearEnabled: boolean
  activeMembers: number
  unverifiedMembers: number
  labels: {
    title: string
    syncTitle: string
    syncValue: string
    syncDetail: string
    membersTitle: string
    membersValue: string
    membersDetail: string
    open: string
  }
}) {
  return (
    <section aria-labelledby="operations-health-title">
      <h3
        id="operations-health-title"
        className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle"
      >
        {labels.title}
      </h3>
      <div className="mt-2 grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <HealthRow
          href="/admin/dashboard/settings"
          icon={Activity}
          title={labels.syncTitle}
          value={labels.syncValue}
          detail={labels.syncDetail}
          isHealthy={staleSyncCount === 0}
          meta={autoRegearEnabled ? 'AUTO ON' : 'AUTO OFF'}
          openLabel={labels.open}
        />
        <HealthRow
          href="/admin/dashboard/stats"
          icon={Users}
          title={labels.membersTitle}
          value={labels.membersValue}
          detail={labels.membersDetail}
          isHealthy={unverifiedMembers === 0}
          meta={String(activeMembers)}
          openLabel={labels.open}
        />
      </div>
    </section>
  )
}

function HealthRow({
  href,
  icon: Icon,
  title,
  value,
  detail,
  isHealthy,
  meta,
  openLabel,
}: {
  href: string
  icon: typeof Activity
  title: string
  value: string
  detail: string
  isHealthy: boolean
  meta: string
  openLabel: string
}) {
  return (
    <Link
      href={href}
      className={cx(
        'group flex min-h-24 items-start gap-3 px-1 py-4 transition-[background-color,transform] duration-150 ease-out hover:bg-surface/50 sm:px-4',
        pressScaleClass,
      )}
    >
      <Icon
        size={17}
        className={cx(
          'mt-0.5 shrink-0',
          isHealthy ? 'text-success' : 'text-warning',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted">{title}</p>
          <span className="font-mono text-[10px] tabular-nums text-subtle">
            {meta}
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      <ArrowRight
        size={14}
        aria-label={openLabel}
        className="mt-0.5 shrink-0 text-subtle transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
      />
    </Link>
  )
}
