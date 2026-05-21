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
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : tone === 'pending'
        ? 'border-amber-500/30 bg-amber-500/10'
        : tone === 'guest'
          ? 'border-sky-500/30 bg-sky-500/10'
          : 'border-gray-800 bg-gray-950/40'
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
    <section className={`rounded-xl border px-3 py-2.5 sm:px-4 ${toneClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-black/20 ${iconClass}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>
              <h2 className="text-sm font-bold text-white">{statusTitle}</h2>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400 sm:line-clamp-1">{description}</p>
            {details.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {details.map((detail) => (
                  <span
                    key={detail}
                    className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-gray-200"
                  >
                    {detail}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end">
            {primaryAction && (
              <Link
                href={primaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-amber-400 transition-colors"
              >
                <PrimaryActionIcon size={13} />
                {primaryAction.label}
              </Link>
            )}
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-amber-500/50 hover:text-amber-200 transition-colors"
              >
                <Search size={13} />
                {secondaryAction.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
