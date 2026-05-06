import type { DemoEventStatus, DemoRegearStatus, DemoRegearOrigin } from '@/data/demo-seed'

type Translator = (key: string) => string

const EVENT_STYLES: Record<DemoEventStatus, string> = {
  scheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  live: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  ended: 'bg-gray-700/40 text-gray-400 border-gray-700',
}

const REGEAR_STYLES: Record<DemoRegearStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-gray-700/40 text-gray-400 border-gray-700',
}

const ORIGIN_STYLES: Record<DemoRegearOrigin, string> = {
  auto: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  manual: 'bg-gray-800 text-gray-400 border-gray-700',
}

const EVENT_KEY: Record<DemoEventStatus, string> = {
  scheduled: 'status.eventScheduled',
  live: 'status.eventLive',
  ended: 'status.eventEnded',
}

const REGEAR_KEY: Record<DemoRegearStatus, string> = {
  pending: 'status.regearPending',
  approved: 'status.regearApproved',
  rejected: 'status.regearRejected',
}

const ORIGIN_KEY: Record<DemoRegearOrigin, string> = {
  auto: 'origin.auto',
  manual: 'origin.manual',
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${className}`}
    >
      {children}
    </span>
  )
}

export function EventStatusPill({ status, t }: { status: DemoEventStatus; t: Translator }) {
  return <Pill className={EVENT_STYLES[status]}>{t(EVENT_KEY[status])}</Pill>
}

export function RegearStatusPill({ status, t }: { status: DemoRegearStatus; t: Translator }) {
  return <Pill className={REGEAR_STYLES[status]}>{t(REGEAR_KEY[status])}</Pill>
}

export function RegearOriginPill({ origin, t }: { origin: DemoRegearOrigin; t: Translator }) {
  return <Pill className={ORIGIN_STYLES[origin]}>{t(ORIGIN_KEY[origin])}</Pill>
}
