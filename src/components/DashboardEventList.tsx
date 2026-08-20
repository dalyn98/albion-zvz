'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Eye, Pencil, Swords, Flame, Archive, Activity, ClipboardCheck, Ban } from 'lucide-react'
import DeleteEventButton from './DeleteEventButton'
import DuplicateEventButton from './DuplicateEventButton'
import InlineBattleStartButton from './InlineBattleStartButton'
import CancelEventOperationsButton from './CancelEventOperationsButton'
import NotifyEventButton from './NotifyEventButton'
import SearchBox from './SearchBox'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { formatGatherTimeFor, isEnded, isImminent } from '@/lib/gather-time'
import type { Event } from '@/types'
import type { Locale } from '@/i18n/locales'
import type { EventReadinessSummary } from '@/lib/admin-operations-model'

type TabKey = 'active' | 'ended'

const DEFAULT_TAB: TabKey = 'active'

function isTabKey(value: string | null): value is TabKey {
  return value === 'active' || value === 'ended'
}

function isEventEnded(event: Event): boolean {
  if (event.status === 'cancelled') return true
  if (
    event.battle_started_at &&
    isEnded(event.battle_started_at, event.operational_ended_at)
  ) return true
  return false
}

interface DashboardEventListProps {
  events: Event[]
  timezone: string
  closeoutActionLabel?: string
  detailHrefPrefix?: string
  interactionMode?: 'live' | 'demo'
  readinessByEventId?: Record<string, EventReadinessSummary>
}

export default function DashboardEventList({
  events,
  timezone,
  closeoutActionLabel,
  detailHrefPrefix = '/admin/dashboard/events',
  interactionMode = 'live',
  readinessByEventId = {},
}: DashboardEventListProps) {
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState('')

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB

  const { activeEvents, endedEvents } = useMemo(() => {
    const active: Event[] = []
    const ended: Event[] = []
    for (const event of events) {
      if (isEventEnded(event)) ended.push(event)
      else active.push(event)
    }
    return { activeEvents: active, endedEvents: ended }
  }, [events])

  const tabEvents = activeTab === 'active' ? activeEvents : endedEvents
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return tabEvents
    // Search across title + gather_at/created_at. Using both dates so admins
    // can find events by either their battle date or creation date.
    return tabEvents.filter(
      (e) =>
        matchesName(e.title, q) ||
        matchesDate(e.gather_at, q) ||
        matchesDate(e.created_at, q),
    )
  }, [tabEvents, search])

  const selectTab = (next: TabKey) => {
    if (next === activeTab) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const tabs: Array<{
    key: TabKey
    labelKey: 'tabActive' | 'tabEnded'
    icon: React.ComponentType<{ size?: number; className?: string }>
    count: number
  }> = [
    { key: 'active', labelKey: 'tabActive', icon: Activity, count: activeEvents.length },
    { key: 'ended', labelKey: 'tabEnded', icon: Archive, count: endedEvents.length },
  ]

  const emptyKey = activeTab === 'active' ? 'noActiveEvents' : 'noEndedEvents'

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {tabs.map(({ key, labelKey, icon: Icon, count }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              id={`event-status-tab-${key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="event-status-panel"
              onClick={() => selectTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(labelKey)}
              <span className="text-[11px] text-gray-500 font-mono">{count}</span>
            </button>
          )
        })}
      </nav>

      <div
        id="event-status-panel"
        role="tabpanel"
        aria-labelledby={`event-status-tab-${activeTab}`}
        className="space-y-3"
      >
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {search ? tCommon('searchNoResults') : t(emptyKey)}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {filtered.map((event) => {
              const isDraft = event.status === 'draft'
              const eventCancelled = event.status === 'cancelled'
              const eventEnded = Boolean(
                event.battle_started_at &&
                isEnded(event.battle_started_at, event.operational_ended_at),
              )
              const draftDisabledReason = isDraft ? t('draftActionsDisabled') : undefined
              const readiness = readinessByEventId[event.id]
              return (
                <div
                  key={event.id}
                  className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-2"
                  style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 112px' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Link
                        href={
                          event.battle_started_at
                            ? `/events/${event.id}`
                            : `${detailHrefPrefix}/${event.id}`
                        }
                        className="font-bold text-white truncate hover:text-amber-300 transition-colors"
                      >
                        {event.title}
                      </Link>
                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/35">
                          {t('badgeDraft')}
                        </span>
                      ) : eventCancelled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-200 border border-red-500/30">
                          <Ban size={10} />
                          {t('badgeCancelled')}
                        </span>
                      ) : eventEnded ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                          <Archive size={10} />
                          {t('badgeEnded')}
                        </span>
                      ) : event.battle_started_at ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          <Swords size={10} />
                          {t('badgeBattleActive')}
                        </span>
                      ) : isImminent(event.gather_at) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
                          <Flame size={10} />
                          {t('badgeImminent')}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-gray-400 text-sm truncate">
                      {event.gather_at
                        ? formatGatherTimeFor(locale, event.gather_at, timezone)
                        : event.gather_time || t('draftScheduleMissing')}
                      {event.gather_location.trim() ? ` · ${event.gather_location}` : ''}
                    </p>
                    {!eventCancelled && (
                      readiness && readiness.status !== 'unconfigured' ? (
                        <div className="mt-2 max-w-md">
                          <div
                            className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted"
                          >
                            <span>
                              {t('readinessAssigned', {
                                assigned: readiness.assignedSlots,
                                total: readiness.totalSlots,
                              })}
                              {' · '}
                              {t('readinessOpen', { count: readiness.openSlots })}
                            </span>
                            <span className="font-semibold tabular-nums text-foreground">
                              {readiness.fillPercent}%
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label={t('readinessAria', {
                              assigned: readiness.assignedSlots,
                              total: readiness.totalSlots,
                              percent: readiness.fillPercent,
                            })}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={readiness.fillPercent}
                            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                          >
                            <div
                              className={`h-full rounded-full ${
                                readiness.status === 'full' ? 'bg-success' : 'bg-accent'
                              }`}
                              style={{ width: `${readiness.fillPercent}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-subtle">{t('readinessUnconfigured')}</p>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                    {interactionMode === 'live' && (
                      <>
                        {eventEnded && !eventCancelled && (
                          <Link
                            href={`/events/${event.id}/report`}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground shadow-card transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-accent-hover active:scale-[0.96]"
                          >
                            <ClipboardCheck size={13} aria-hidden="true" />
                            {closeoutActionLabel ?? t('badgeEnded')}
                          </Link>
                        )}
                        <InlineBattleStartButton
                          eventId={event.id}
                          battleStartedAt={event.battle_started_at}
                          disabledReason={draftDisabledReason}
                        />
                        {event.status === 'published' &&
                          event.battle_started_at &&
                          !eventEnded && (
                            <CancelEventOperationsButton eventId={event.id} compact />
                          )}
                        <NotifyEventButton
                          eventId={event.id}
                          disabled={event.status !== 'published'}
                          disabledTitle={
                            eventCancelled ? t('cancelledActionsDisabled') : draftDisabledReason
                          }
                        />
                      </>
                    )}
                    <Link
                      href={
                        event.battle_started_at
                          ? `/events/${event.id}`
                          : `${detailHrefPrefix}/${event.id}`
                      }
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                      aria-label={
                        event.battle_started_at
                          ? tCommon('view')
                          : tCommon('edit')
                      }
                    >
                      {event.battle_started_at ? <Eye size={15} /> : <Pencil size={15} />}
                    </Link>
                    {interactionMode === 'live' && (
                      <>
                        <DuplicateEventButton eventId={event.id} />
                        {!event.battle_started_at && <DeleteEventButton eventId={event.id} />}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
