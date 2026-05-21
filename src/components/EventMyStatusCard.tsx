import Link from 'next/link'
import { CheckCircle2, Clock3, LogIn, Search, ShieldQuestion, Swords } from 'lucide-react'

export type EventMyStatusTone = 'success' | 'pending' | 'neutral' | 'guest'

interface EventMyStatusAction {
  href: string
  label: string
}

interface EventMyStatusCardProps {
  title: string
  statusTitle: string
  description: string
  tone: EventMyStatusTone
  details: string[]
  primaryAction?: EventMyStatusAction
  secondaryAction?: EventMyStatusAction
}

export default function EventMyStatusCard({
  title,
  statusTitle,
  description,
  tone,
  details,
  primaryAction,
  secondaryAction,
}: EventMyStatusCardProps) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/35 bg-emerald-500/10'
      : tone === 'pending'
        ? 'border-amber-500/35 bg-amber-500/10'
        : tone === 'guest'
          ? 'border-sky-500/35 bg-sky-500/10'
          : 'border-gray-700 bg-gray-900'
  const iconClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'pending'
        ? 'text-amber-300'
        : tone === 'guest'
          ? 'text-sky-300'
          : 'text-gray-300'
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'pending'
        ? Clock3
        : tone === 'guest'
          ? LogIn
          : ShieldQuestion
  const PrimaryActionIcon = tone === 'guest' ? LogIn : Swords

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-black/20 ${iconClass}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
          <h2 className="mt-1 text-base font-bold text-white">{statusTitle}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-300">{description}</p>
          {details.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {details.map((detail) => (
                <span
                  key={detail}
                  className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-gray-200"
                >
                  {detail}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {primaryAction && (
            <Link
              href={primaryAction.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 transition-colors"
            >
              <PrimaryActionIcon size={13} />
              {primaryAction.label}
            </Link>
          )}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-amber-500/50 hover:text-amber-200 transition-colors"
            >
              <Search size={13} />
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
