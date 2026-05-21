import Link from 'next/link'
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, ListChecks, ShieldAlert } from 'lucide-react'
import type { MyDashboardNextEventKind } from '@/app/actions/me-dashboard'

interface NextEvent {
  id: string
  title: string
  subtitle: string
  kind: MyDashboardNextEventKind
}

interface Labels {
  title: string
  description: string
  verifyTitle: string
  verifyBody: string
  requestsTitle: string
  requestsBody: string
  nextEventTitle: string
  pendingEventTitle: string
  tentativeEventTitle: string
  availableEventTitle: string
  noItemsTitle: string
  noItemsBody: string
  open: string
}

interface Props {
  albionVerified: boolean
  pendingTotal: number
  nextEvent: NextEvent | null
  labels: Labels
  verifyHref?: string
  requestsHref?: string
  eventHrefPrefix?: string
}

export default function MemberNextActionsPanel({
  albionVerified,
  pendingTotal,
  nextEvent,
  labels,
  verifyHref = '/onboarding/albion?return=%2Fme',
  requestsHref = '/me/requests',
  eventHrefPrefix = '/events',
}: Props) {
  const actions: React.ReactNode[] = []

  if (!albionVerified) {
    actions.push(
      <ActionLink
        key="verify"
        href={verifyHref}
        icon={<ShieldAlert size={18} />}
        title={labels.verifyTitle}
        body={labels.verifyBody}
        tone="warning"
        openLabel={labels.open}
      />,
    )
  }

  if (pendingTotal > 0) {
    actions.push(
      <ActionLink
        key="requests"
        href={requestsHref}
        icon={<ListChecks size={18} />}
        title={labels.requestsTitle}
        body={labels.requestsBody}
        tone="accent"
        openLabel={labels.open}
      />,
    )
  }

  if (nextEvent) {
    const isWaiting = nextEvent.kind === 'pending' || nextEvent.kind === 'tentative'
    actions.push(
      <ActionLink
        key="next-event"
        href={`${eventHrefPrefix}/${nextEvent.id}`}
        icon={isWaiting ? <Clock3 size={18} /> : <CalendarDays size={18} />}
        title={eventActionTitle(nextEvent.kind, labels)}
        body={`${nextEvent.title} · ${nextEvent.subtitle}`}
        tone={nextEvent.kind === 'available' ? 'accent' : 'neutral'}
        openLabel={labels.open}
      />,
    )
  }

  const hasActions = actions.length > 0

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white text-base font-bold">{labels.title}</h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">{labels.description}</p>
        </div>
        {!hasActions && (
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        )}
      </div>

      {!hasActions ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-200">{labels.noItemsTitle}</p>
          <p className="text-xs text-emerald-100/75 leading-relaxed mt-1">{labels.noItemsBody}</p>
        </div>
      ) : (
        <div className="grid gap-2">{actions}</div>
      )}
    </section>
  )
}

function eventActionTitle(kind: MyDashboardNextEventKind, labels: Labels): string {
  switch (kind) {
    case 'pending':
      return labels.pendingEventTitle
    case 'tentative':
      return labels.tentativeEventTitle
    case 'available':
      return labels.availableEventTitle
    default:
      return labels.nextEventTitle
  }
}

function ActionLink({
  href,
  icon,
  title,
  body,
  tone,
  openLabel,
}: {
  href: string
  icon: React.ReactNode
  title: string
  body: string
  tone: 'warning' | 'accent' | 'neutral'
  openLabel: string
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-200'
      : tone === 'accent'
        ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
        : 'border-gray-800 bg-gray-950/40 text-gray-300'

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors hover:border-amber-500/45 ${toneClass}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/20 flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs leading-relaxed opacity-75 line-clamp-2">{body}</span>
      </span>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 group-hover:text-amber-300 flex-shrink-0">
        <span className="hidden sm:inline">{openLabel}</span>
        <ChevronRight size={16} />
      </span>
    </Link>
  )
}
